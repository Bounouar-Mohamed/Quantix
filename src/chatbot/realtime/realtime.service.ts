/**
 * Service pour l'API Realtime
 * Logique métier pour tokens, config, tools
 */

import { Injectable, Logger, BadRequestException, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { defaultProfile, getRealtimeInstructionsForLang } from '../../ai/modelProfile';
import { executeTool as executeToolFromRegistry } from '../../ai/toolRegistry';
import OpenAI from 'openai';
import { AssistantsService } from '../../ai/services/assistants.service';
import { ensureIdentifier, ensureOptionalIdentifier } from '../../common/utils/identifiers';
import { ExecuteToolDto } from './dto/realtime.dto';
import { UsageService } from '../../consumption/usage.service';

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
    private readonly allowedTools = new Set([
        // Legacy tools
        'create_automation', 'analyze_client', 'log_to_crm',
        // Reccos tools
        'list_available_properties', 'get_property_details', 'calculate_investment', 'get_market_stats',
        // Web tools
        'web_search', 'web_open'
    ]);

    constructor(
        private readonly configService: ConfigService,
        private readonly usageService: UsageService,
        @Optional() @Inject(AssistantsService) private readonly assistantsService?: AssistantsService
    ) {}

    /**
     * Créer un token éphémère pour WebRTC via OpenAI (clé ek_)
     */
    async createEphemeralToken(request: CreateTokenRequest): Promise<EphemeralTokenResponse> {
        const {
            userId,
            tenantId,
            conversationId,
            locale,
            ip,
            rateLimitKey,
        } = request;

        const startTime = Date.now();
        const normalizedUserId = ensureIdentifier(userId, 'userId');
        const normalizedTenantId = ensureIdentifier(tenantId, 'tenantId');
        const normalizedConversationId = ensureOptionalIdentifier(conversationId, 'conversationId');

        // Rate-limiting (à implémenter avec Redis/throttler en prod)
        this.checkRateLimit(rateLimitKey);

        // Générer sessionId unique
        const sessionId = `sess_${Date.now()}_${++this.sessionCounter}`;

        // Préparer instructions et paramètres de session
        const model = process.env.OPENAI_MODEL_REALTIME || 'gpt-realtime-mini';
        const voice = process.env.OPENAI_REALTIME_VOICE || 'alloy';
        const apiKey = process.env.OPENAI_API_KEY || this.configService.get<string>('OPENAI_API_KEY');

        if (!apiKey) {
            throw new BadRequestException('OPENAI_API_KEY manquante');
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // REALTIME: Ne JAMAIS utiliser profileNoor.instructions (trop long, en FR)
        // On utilise uniquement les instructions realtime multilingues
        // Le modèle OpenAI Realtime détecte automatiquement la langue de l'utilisateur
        // ═══════════════════════════════════════════════════════════════════════════
        const realtimeInstructions = getRealtimeInstructionsForLang();
        
        this.logger.log(`✅ [REALTIME] Instructions multilingues générées (${realtimeInstructions.length} chars) - détection automatique par le modèle`);
        
        // L'API Realtime Sessions n'accepte que: model, voice, instructions, temperature
        // Temperature doit être entre 0.6 et 1.2 pour les modèles audio
        const rawTemp = defaultProfile.temperature ?? 0.8;
        const realtimeTemperature = Math.max(0.6, Math.min(1.2, rawTemp));

        try {
            // Configuration MINIMALE de la session
            // Utilisation du modèle mini (plus rapide et moins cher)
            const useModel = 'gpt-realtime-mini';
            
            const sessionConfig: Record<string, unknown> = {
                model: useModel,
                voice,
                instructions: realtimeInstructions,
                modalities: ['audio', 'text'],
                temperature: realtimeTemperature,
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                    create_response: true,
                    interrupt_response: true,
                },
            };
            
            this.logger.log(`🎯 [REALTIME] Session config: model=${useModel}, voice=${voice}`);
            
            const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'realtime=v1'
                },
                body: JSON.stringify(sessionConfig)
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

            this.logger.log(`Ephemeral token créé pour ${normalizedUserId} (${normalizedTenantId}), exp=${expiresInSec}s`);

            // Récupérer ou créer le thread si conversationId fourni (multi-tenant)
            let assistantThreadId: string | undefined;
            if (normalizedConversationId && this.assistantsService) {
                try {
                    // Passer tenantId pour isolation multi-tenant
                    assistantThreadId = await this.assistantsService.upsertThread(
                        normalizedConversationId,
                        normalizedTenantId,
                    );
                    this.logger.log(
                        `Thread associé: ${assistantThreadId} pour conversationId: ${normalizedConversationId}, tenantId: ${normalizedTenantId}`,
                    );
                } catch (error) {
                    this.logger.warn(`Erreur lors de la récupération du thread: ${error.message}`);
                }
            }

            const result = {
                token: ephemeralKey,
                expiresIn: expiresInSec,
                sessionId,
                assistant_thread_id: assistantThreadId,
            };
            await this.usageService.recordRealtimeUsage({
                userId: normalizedUserId,
                tenantId: normalizedTenantId,
                model,
                durationMs: Date.now() - startTime,
                endpoint: 'chatbot/realtime/ephemeral-token',
                success: true,
            });
            return result;
        } catch (e: any) {
            this.logger.error('Erreur création token éphémère:', e?.message || e);
            await this.usageService.recordRealtimeUsage({
                userId: normalizedUserId,
                tenantId: normalizedTenantId,
                model,
                durationMs: Date.now() - startTime,
                endpoint: 'chatbot/realtime/ephemeral-token',
                success: false,
                error: e?.message || 'unknown_error',
            });
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
     * @param userId - ID utilisateur (optionnel)
     * @param tenantId - ID tenant (optionnel)
     * @param locale - Locale de l'utilisateur (optionnel, non utilisé - détection automatique)
     */
    async getConfig(userId?: string, tenantId?: string, locale?: string) {
        // ═══════════════════════════════════════════════════════════════════════════
        // REALTIME: Ne JAMAIS utiliser profileNoor.instructions
        // On génère des instructions realtime multilingues
        // Le modèle détecte automatiquement la langue de l'utilisateur
        // ═══════════════════════════════════════════════════════════════════════════
        const realtimeInstructions = getRealtimeInstructionsForLang();
        
        // Récupérer les tools depuis l'assistant configuré (si disponible)
        let tools = defaultProfile.tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));

        if (this.assistantsService) {
            try {
                // ✅ IMPORTANT: Passer mode: 'realtime' pour obtenir les instructions multilingues
                const assistantConfig = await this.assistantsService.getAssistantConfig(undefined, { mode: 'realtime' });
                
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
                
                this.logger.log(`✅ [REALTIME] Tools récupérés depuis assistant configuré (mode: realtime)`);
            } catch (error: any) {
                this.logger.warn(`⚠️ [REALTIME] Erreur récupération tools assistant, utilisation defaultProfile: ${error.message}`);
            }
        }
        
        this.logger.log(`✅ [REALTIME] Config multilingue générée - détection automatique par le modèle`);
        
        // Temperature Realtime doit être entre 0.6 et 1.2
        const rawTemp = defaultProfile.temperature ?? 0.8;
        const realtimeTemperature = Math.max(0.6, Math.min(1.2, rawTemp));
        
        // Note: frequencyPenalty/presencePenalty ne sont PAS supportés par l'API Realtime
        // On les expose quand même pour référence/usage futur Chat API
        const samplingConfig = {
            temperature: realtimeTemperature,
            frequencyPenalty: defaultProfile.frequencyPenalty ?? 0,
            presencePenalty: defaultProfile.presencePenalty ?? 0,
        };

        // Centraliser la vérité produit ici
        return {
            model: process.env.OPENAI_MODEL_REALTIME || 'gpt-realtime-mini',
            voice: process.env.OPENAI_REALTIME_VOICE || 'alloy',
            systemInstructions: realtimeInstructions,
            sampling: samplingConfig,
            features: {
                bargeInEnabled: true,
                vadThreshold: 0.8,
                silenceDurationMs: 700,
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
    async executeTool(dto: ExecuteToolDto) {
        const { name, arguments: args, sessionId, userId, correlationId } = dto;
        const execStart = Date.now();
        const realtimeModel = process.env.OPENAI_MODEL_REALTIME || 'gpt-realtime-mini';

        if (!this.allowedTools.has(name)) {
            throw new BadRequestException(`Tool ${name} non autorisé`);
        }

        this.logger.log(`Tool execution: ${name} (session: ${sessionId}, user: ${userId})`);

        // AuthZ/Quota/Policies
        const canExecute = await this.checkToolPermission(name, userId);
        if (!canExecute) {
            throw new BadRequestException(`Tool ${name} not allowed for user ${userId}`);
        }

        // Rate-limit par tool
        this.checkToolRateLimit(name, userId);

        // Logger tool_call_start
        try {
            // Exécuter via le registre de tools
            if (typeof args !== 'object' || args === null) {
                throw new BadRequestException('Arguments tool invalides');
            }

            const output = await executeToolFromRegistry(name, args, { userId });

            const latency = Date.now() - execStart;

            // Logger tool_call_end
            this.logger.log(`Tool completed: ${name} in ${latency}ms`);
            await this.usageService.recordRealtimeUsage({
                userId,
                model: realtimeModel,
                durationMs: Date.now() - execStart,
                endpoint: 'chatbot/tools/execute',
                success: true,
            });

            return {
                success: true,
                output,
                latency,
                sessionId,
                correlationId
            };
        } catch (error: any) {
            const latency = Date.now() - execStart;
            this.logger.error(`Tool failed: ${name} in ${latency}ms - ${error.message}`);
            await this.usageService.recordRealtimeUsage({
                userId,
                model: realtimeModel,
                durationMs: Date.now() - execStart,
                endpoint: 'chatbot/tools/execute',
                success: false,
                error: error?.message || 'tool_execution_failed',
            });

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

