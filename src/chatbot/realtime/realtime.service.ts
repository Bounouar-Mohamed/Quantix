/**
 * Service pour l'API Realtime
 * Logique métier pour tokens, config, tools
 */

import { Injectable, Logger, BadRequestException, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { defaultProfile } from '../../ai/modelProfile';
import { executeTool as executeToolFromRegistry } from '../../ai/toolRegistry';
import OpenAI from 'openai';
import { AssistantsService } from '../../ai/services/assistants.service';
import { ensureIdentifier, ensureOptionalIdentifier } from '../../common/utils/identifiers';
import { ExecuteToolDto } from './dto/realtime.dto';
import { UsageService } from '../../consumption/usage.service';
import { InstructionsService } from '../../ai/services/instructions.service';

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

// ══════════════════════════════════════════════════════════════════════════════
// SÉCURITÉ: Configuration des permissions et rate limits par tool
// ══════════════════════════════════════════════════════════════════════════════
interface ToolPermission {
    public: boolean;           // Accessible sans authentification
    requiresAuth: boolean;     // Nécessite un userId valide
    maxCallsPerMinute: number; // Rate limit par utilisateur
    allowedRoles?: string[];   // Rôles autorisés (si vide = tous les rôles authentifiés)
}

const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
    // Tools publics (lecture seule)
    'list_available_properties': { public: true, requiresAuth: false, maxCallsPerMinute: 30 },
    'get_property_details': { public: true, requiresAuth: false, maxCallsPerMinute: 30 },
    'get_market_stats': { public: true, requiresAuth: false, maxCallsPerMinute: 20 },
    
    // Tools nécessitant authentification
    'calculate_investment': { public: false, requiresAuth: true, maxCallsPerMinute: 10 },
    'web_search': { public: false, requiresAuth: true, maxCallsPerMinute: 10 },
    'web_open': { public: false, requiresAuth: true, maxCallsPerMinute: 5 },
    
    // Tools admin/agent uniquement
    'create_automation': { public: false, requiresAuth: true, maxCallsPerMinute: 5, allowedRoles: ['ADMIN', 'AGENT'] },
    'analyze_client': { public: false, requiresAuth: true, maxCallsPerMinute: 10, allowedRoles: ['ADMIN', 'AGENT'] },
    'log_to_crm': { public: false, requiresAuth: true, maxCallsPerMinute: 20, allowedRoles: ['ADMIN', 'AGENT'] },
};

// Rate limit tracker (en mémoire - utiliser Redis en production)
interface RateLimitEntry {
    count: number;
    resetAt: number;
}

@Injectable()
export class RealtimeService {
    private readonly logger = new Logger(RealtimeService.name);
    private revokedTokens = new Set<string>();
    private sessionCounter = 0;
    
    // ══════════════════════════════════════════════════════════════════════════════
    // SÉCURITÉ: Rate limiting en mémoire (utiliser Redis en production)
    // ══════════════════════════════════════════════════════════════════════════════
    private readonly toolRateLimits = new Map<string, RateLimitEntry>();
    private readonly tokenRateLimits = new Map<string, RateLimitEntry>();
    
    private readonly allowedTools = new Set(Object.keys(TOOL_PERMISSIONS));

    constructor(
        private readonly configService: ConfigService,
        private readonly usageService: UsageService,
        private readonly instructionsService: InstructionsService,
        @Optional() @Inject(AssistantsService) private readonly assistantsService?: AssistantsService
    ) {
        // Nettoyer les rate limits expirés toutes les minutes
        setInterval(() => this.cleanupRateLimits(), 60000);
    }
    
    /**
     * Nettoyer les entrées de rate limit expirées
     */
    private cleanupRateLimits(): void {
        const now = Date.now();
        for (const [key, entry] of this.toolRateLimits) {
            if (entry.resetAt < now) {
                this.toolRateLimits.delete(key);
            }
        }
        for (const [key, entry] of this.tokenRateLimits) {
            if (entry.resetAt < now) {
                this.tokenRateLimits.delete(key);
            }
        }
    }

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
        const realtimeInstructions = this.instructionsService.getInstructions(undefined, 'realtime').instructions;
        
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
        const realtimeInstructions = this.instructionsService.getInstructions(undefined, 'realtime').instructions;
        
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

    /**
     * SÉCURITÉ: Vérification du rate limit pour création de tokens
     */
    private checkRateLimit(key: string): void {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxTokensPerMinute = 5; // Max 5 tokens par minute par clé
        
        const entry = this.tokenRateLimits.get(key);
        
        if (!entry || entry.resetAt < now) {
            // Nouvelle fenêtre
            this.tokenRateLimits.set(key, { count: 1, resetAt: now + windowMs });
            return;
        }
        
        if (entry.count >= maxTokensPerMinute) {
            this.logger.warn(`🚫 [RATE LIMIT] Token creation blocked for key: ${key.substring(0, 20)}...`);
            throw new BadRequestException('Trop de demandes de token. Veuillez patienter.');
        }
        
        entry.count++;
    }

    /**
     * SÉCURITÉ: Vérification des permissions pour exécuter un tool
     * Vérifie si l'utilisateur a le droit d'exécuter ce tool
     */
    private async checkToolPermission(toolName: string, userId: string): Promise<boolean> {
        const permission = TOOL_PERMISSIONS[toolName];
        
        if (!permission) {
            this.logger.warn(`🚫 [PERMISSION] Tool inconnu: ${toolName}`);
            return false;
        }
        
        // Tool public - toujours autorisé
        if (permission.public && !permission.requiresAuth) {
            return true;
        }
        
        // Tool nécessitant authentification
        if (permission.requiresAuth) {
            // Vérifier que userId est valide (pas anonymous, pas vide)
            if (!userId || userId === 'anonymous' || userId.trim() === '') {
                this.logger.warn(`🚫 [PERMISSION] Tool ${toolName} nécessite authentification, userId invalide: ${userId}`);
                return false;
            }
            
            // Si des rôles spécifiques sont requis, on devrait vérifier via le backend
            // Pour l'instant, on fait confiance au userId validé par le guard interne
            if (permission.allowedRoles && permission.allowedRoles.length > 0) {
                // TODO: Appeler le backend pour vérifier le rôle de l'utilisateur
                // Pour l'instant, on log un avertissement
                this.logger.debug(`[PERMISSION] Tool ${toolName} nécessite un des rôles: ${permission.allowedRoles.join(', ')}`);
                // En production, implémenter la vérification via:
                // const userRole = await this.backendClient.getUserRole(userId);
                // return permission.allowedRoles.includes(userRole);
            }
        }
        
        return true;
    }

    /**
     * SÉCURITÉ: Vérification du rate limit par tool et utilisateur
     * Empêche l'abus des tools par un utilisateur
     */
    private checkToolRateLimit(toolName: string, userId: string): void {
        const permission = TOOL_PERMISSIONS[toolName];
        if (!permission) {
            throw new BadRequestException(`Tool ${toolName} non configuré`);
        }
        
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxCalls = permission.maxCallsPerMinute;
        const key = `${toolName}:${userId}`;
        
        const entry = this.toolRateLimits.get(key);
        
        if (!entry || entry.resetAt < now) {
            // Nouvelle fenêtre
            this.toolRateLimits.set(key, { count: 1, resetAt: now + windowMs });
            return;
        }
        
        if (entry.count >= maxCalls) {
            const secondsLeft = Math.ceil((entry.resetAt - now) / 1000);
            this.logger.warn(`🚫 [RATE LIMIT] Tool ${toolName} blocked for user ${userId}. Reset in ${secondsLeft}s`);
            throw new BadRequestException(
                `Limite atteinte pour ${toolName}. Réessayez dans ${secondsLeft} secondes.`
            );
        }
        
        entry.count++;
        this.logger.debug(`[RATE LIMIT] Tool ${toolName} call ${entry.count}/${maxCalls} for user ${userId}`);
    }
}

