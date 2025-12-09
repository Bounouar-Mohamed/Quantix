/**
 * Service pour l'API Realtime
 * Logique métier pour tokens, config, tools
 */

import { Injectable, Logger, BadRequestException, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { profileJohn } from '../../ai/modelProfile';
import { executeTool as executeToolFromRegistry } from '../../ai/toolRegistry';
import OpenAI from 'openai';
import { AssistantsService } from '../../ai/services/assistants.service';

interface CreateTokenRequest {
    userId: string;
    tenantId: string;
    conversationId?: string;
    locale?: string;
    appVersion?: string;
    ip: string;
    userAgent?: string;
    rateLimitKey: string;
}

interface EphemeralTokenResponse {
    token: string;
    expiresIn: number;
    sessionId: string;
    assistant_thread_id?: string;
}

@Injectable()
export class RealtimeService {
    private readonly logger = new Logger(RealtimeService.name);
    private revokedTokens = new Set<string>(); // In-memory pour POC, utilise Redis en prod
    private sessionCounter = 0;

    constructor(
        private readonly configService: ConfigService,
        @Optional() @Inject(AssistantsService) private readonly assistantsService?: AssistantsService
    ) {}

    /**
     * Créer un token éphémère pour WebRTC via OpenAI (clé ek_)
     */
    async createEphemeralToken(request: CreateTokenRequest): Promise<EphemeralTokenResponse> {
        const { userId, tenantId, conversationId, locale, ip, rateLimitKey } = request;

        // Rate-limiting (à implémenter avec Redis/throttler en prod)
        this.checkRateLimit(rateLimitKey);

        // Générer sessionId unique
        const sessionId = `sess_${Date.now()}_${++this.sessionCounter}`;

        // Préparer instructions et paramètres de session
        const model = process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview';
        const voice = process.env.OPENAI_REALTIME_VOICE || 'alloy';
        const apiKey = process.env.OPENAI_API_KEY || this.configService.get<string>('OPENAI_API_KEY');

        if (!apiKey) {
            throw new BadRequestException('OPENAI_API_KEY manquante');
        }

        // Récupérer les instructions depuis Prompt (recommandé) ou Assistant (legacy)
        // Priorité: Prompt > Assistant > profileJohn
        let instructions = profileJohn.instructions;
        
        // TODO: Ajouter support Prompts quand disponible
        // const promptId = process.env.OPENAI_PROMPT_ID;
        // if (promptId && this.promptsService) {
        //     const promptConfig = await this.promptsService.usePromptInRealtime(promptId, {...});
        //     instructions = promptConfig.instructions;
        //     this.logger.log(`✅ [REALTIME] Utilisation instructions depuis Prompt ${promptId}`);
        // } else 
        
        if (this.assistantsService) {
            try {
                const assistantConfig = await this.assistantsService.getAssistantConfig();
                instructions = assistantConfig.instructions;
                this.logger.log(`✅ [REALTIME] Utilisation instructions de l'assistant configuré (${instructions.length} chars)`);
            } catch (error: any) {
                this.logger.warn(`⚠️ [REALTIME] Erreur récupération config assistant, utilisation profileJohn: ${error.message}`);
            }
        }

        try {
            const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'realtime=v1'
                },
                body: JSON.stringify({
                    model,
                    voice,
                    instructions, // Utilise l'assistant configuré au lieu de profileJohn
                })
            });

            if (!response.ok) {
                const text = await response.text();
                this.logger.error(`OpenAI Realtime error: ${response.status} - ${text}`);
                throw new BadRequestException('Impossible de créer un token éphémère OpenAI');
            }

            const data: any = await response.json();

            let ephemeralKey: unknown =
                (data && data.client_secret && (data.client_secret.value || data.client_secret)) ||
                data.client_key ||
                data.key ||
                data.token;

            if (!ephemeralKey || typeof ephemeralKey !== 'string') {
                this.logger.error('Réponse OpenAI invalide: pas de token éphémère');
                throw new BadRequestException('Token éphémère manquant dans la réponse OpenAI');
            }

            // Calculer expires_in si fourni par OpenAI
            let expiresInSec = 900;
            const clientSecret = (data && (data.client_secret || data.clientSecret)) as any;
            const expiresAt = clientSecret && (clientSecret.expires_at || clientSecret.expiresAt);
            if (typeof expiresAt === 'number') {
                const nowSec = Math.floor(Date.now() / 1000);
                expiresInSec = Math.max(1, Math.floor(expiresAt - nowSec));
            }

            this.logger.log(`Ephemeral token créé pour ${userId} (${tenantId}), exp=${expiresInSec}s`);

            // Récupérer ou créer le thread si conversationId fourni (multi-tenant)
            let assistantThreadId: string | undefined;
            if (conversationId && this.assistantsService) {
                try {
                    // Passer tenantId pour isolation multi-tenant
                    assistantThreadId = await this.assistantsService.upsertThread(conversationId, tenantId);
                    this.logger.log(`Thread associé: ${assistantThreadId} pour conversationId: ${conversationId}, tenantId: ${tenantId}`);
                } catch (error) {
                    this.logger.warn(`Erreur lors de la récupération du thread: ${error.message}`);
                }
            }

            return {
                token: ephemeralKey,
                expiresIn: expiresInSec,
                sessionId,
                assistant_thread_id: assistantThreadId,
            };
        } catch (e: any) {
            this.logger.error('Erreur création token éphémère:', e?.message || e);
            throw new BadRequestException('Erreur lors de la création du token éphémère');
        }
    }

    /**
     * Révoquer un token
     */
    async revokeToken(sessionId: string, userId: string): Promise<{ success: boolean }> {
        this.revokedTokens.add(sessionId);
        this.logger.log(`Session revoked: ${sessionId} by user: ${userId}`);
        
        // TODO: Notifier le Front via canal de contrôle (WebSocket/SSE)
        
        return { success: true };
    }

    /**
     * Obtenir la configuration Realtime
     */
    async getConfig(userId?: string, tenantId?: string) {
        // Récupérer les instructions et tools de l'assistant configuré (si disponible)
        let systemInstructions = profileJohn.instructions;
        let tools = profileJohn.tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));

        if (this.assistantsService) {
            try {
                const assistantConfig = await this.assistantsService.getAssistantConfig();
                systemInstructions = assistantConfig.instructions;
                
                // Convertir les tools de l'assistant en format attendu
                if (assistantConfig.tools && assistantConfig.tools.length > 0) {
                    tools = assistantConfig.tools
                        .filter((t: any) => t.type === 'function')
                        .map((t: any) => ({
                            name: t.function.name,
                            description: t.function.description,
                            parameters: t.function.parameters
                        }));
                }
                
                this.logger.log(`✅ [REALTIME] Config récupérée depuis assistant configuré`);
            } catch (error: any) {
                this.logger.warn(`⚠️ [REALTIME] Erreur récupération config assistant, utilisation profileJohn: ${error.message}`);
            }
        }

        // Centraliser la vérité produit ici
        return {
            model: process.env.OPENAI_MODEL_REALTIME || 'gpt-realtime-mini',
            voice: process.env.OPENAI_REALTIME_VOICE || 'alloy',
            systemInstructions,
            features: {
                bargeInEnabled: true,
                vadThreshold: 0.6,
                supportedLocales: ['en', 'fr']
            },
            tools,
            userId,
            tenantId
        };
    }

    /**
     * Exécuter un tool appelé par le modèle
     */
    async executeTool(dto: any) {
        const { name, arguments: args, sessionId, userId, correlationId } = dto;

        this.logger.log(`Tool execution: ${name} (session: ${sessionId}, user: ${userId})`);

        // AuthZ/Quota/Policies
        const canExecute = await this.checkToolPermission(name, userId);
        if (!canExecute) {
            throw new BadRequestException(`Tool ${name} not allowed for user ${userId}`);
        }

        // Rate-limit par tool
        this.checkToolRateLimit(name, userId);

        // Logger tool_call_start
        const startTime = Date.now();

        try {
            // Exécuter via le registre de tools
            const output = await executeToolFromRegistry(name, args, { userId });

            const latency = Date.now() - startTime;

            // Logger tool_call_end
            this.logger.log(`Tool completed: ${name} in ${latency}ms`);

            return {
                success: true,
                output,
                latency,
                sessionId,
                correlationId
            };
        } catch (error) {
            const latency = Date.now() - startTime;
            this.logger.error(`Tool failed: ${name} in ${latency}ms - ${error.message}`);

            return {
                success: false,
                error: error.message,
                latency,
                sessionId,
                correlationId
            };
        }
    }

    /**
     * Heartbeat
     */
    getHeartbeat() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.APP_VERSION || '1.0.0',
            service: 'realtime-control'
        };
    }

    /**
     * Helpers privés
     */
    private generateEphemeralToken(payload: any, secret: string): string {
        // Encoder en base64 (en prod: utiliser JWT lib)
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = createHash('sha256')
            .update(encoded + secret)
            .digest('hex')
            .substring(0, 32);
        
        return `ek_${encoded}.${signature}`;
    }

    private checkRateLimit(key: string) {
        // Implémentation basique (à remplacer par Redis/throttler)
        // Pour POC: pas de rate-limit stricts
    }

    private async checkToolPermission(toolName: string, userId: string): Promise<boolean> {
        // TODO: Implémenter la logique de permissions
        // Vérifier si le user/tenant a accès à ce tool
        return true;
    }

    private checkToolRateLimit(toolName: string, userId: string) {
        // TODO: Implémenter rate-limit par tool
    }
}

