/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ASSISTANTS SERVICE - Gestion des threads OpenAI Assistants
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce service gère la persistance des conversations via OpenAI Assistants API :
 * - Création/récupération de threads
 * - Exécution de runs avec tool calling
 * - Synchronisation multi-tenant
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { prisma } from '../../db/prisma';
import { executeTool } from '../toolRegistry';
import { defaultProfile, getRealtimeInstructionsForLang } from '../modelProfile';
import { cleanResponse, stripGenericFirstQuestion } from '../utils/response-filters';

@Injectable()
export class AssistantsService {
    private readonly logger = new Logger(AssistantsService.name);
    private openai: OpenAI;

    constructor(private readonly configService: ConfigService) {
        const apiKey = process.env.OPENAI_API_KEY || this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY manquante');
        }
        this.openai = new OpenAI({ apiKey });
    }

    /**
     * Créer ou récupérer un thread pour une conversation (multi-tenant)
     */
    async upsertThread(
        conversationId: string,
        tenantId?: string,
        assistantId?: string
    ): Promise<string> {
        // Prisma n'accepte pas null dans les contraintes uniques composites
        // Utiliser 'global' comme valeur par défaut si tenantId est absent
        const normalizedTenantId = tenantId || 'global';

        this.logger.log(`🔍 [THREAD] Recherche thread pour conversationId: ${conversationId}, tenantId: ${normalizedTenantId}`);

        // Chercher un thread existant avec contrainte multi-tenant
        const existing = await prisma.conversationThread.findUnique({
            where: {
                tenantId_conversationId: {
                    tenantId: normalizedTenantId,
                    conversationId,
                },
            },
        });

        if (existing) {
            this.logger.log(
                `✅ [THREAD] Thread EXISTANT trouvé: ${existing.assistantThreadId} pour conversationId: ${conversationId}, tenantId: ${normalizedTenantId}`
            );
            
            // Vérifier combien de messages sont dans ce thread
            try {
                const messages = await this.openai.beta.threads.messages.list(existing.assistantThreadId, { limit: 10 });
                this.logger.log(`📊 [THREAD] Thread ${existing.assistantThreadId} contient ${messages.data.length} messages`);
            } catch (err: any) {
                this.logger.warn(`⚠️ [THREAD] Impossible de vérifier les messages du thread: ${err.message}`);
            }
            
            return existing.assistantThreadId;
        }

        // Créer un nouveau thread OpenAI
        this.logger.log(
            `🆕 [THREAD] CRÉATION nouveau thread pour conversationId: ${conversationId}, tenantId: ${normalizedTenantId}`
        );
        const thread = await this.openai.beta.threads.create();

        // Stocker le mapping avec tenantId (utiliser 'global' si absent)
        await prisma.conversationThread.create({
            data: {
                conversationId,
                tenantId: normalizedTenantId,
                assistantThreadId: thread.id,
                assistantId: assistantId || undefined,
            },
        });

        this.logger.log(`✅ [THREAD] Thread créé: ${thread.id} pour conversationId: ${conversationId}, tenantId: ${normalizedTenantId}`);
        return thread.id;
    }

    /**
     * Ajouter un message au thread (avec déduplication optionnelle par eventId)
     */
    async addMessage(
        threadId: string,
        role: 'user' | 'assistant',
        content: string,
        options?: { eventId?: string; meta?: any }
    ): Promise<void> {
        try {
            // Déduplication : vérifier si eventId existe déjà (via table EventUsage ou cache)
            if (options?.eventId) {
                // TODO: Implémenter déduplication via EventUsage ou cache Redis
                // Pour l'instant, on log seulement
                this.logger.debug(`Message avec eventId: ${options.eventId}`);
            }

            const contentPreview = content.length > 100 ? content.substring(0, 100) + '...' : content;
            this.logger.log(`📝 [MESSAGE] Ajout message ${role} au thread ${threadId}: "${contentPreview}"`);

            await this.openai.beta.threads.messages.create(threadId, {
                role,
                content,
            });
            
            this.logger.log(`✅ [MESSAGE] Message ${role} ajouté avec succès au thread ${threadId}${options?.eventId ? ` (eventId: ${options.eventId})` : ''}`);
            
            // Vérifier que le message est bien dans le thread
            try {
                const messages = await this.openai.beta.threads.messages.list(threadId, { limit: 5 });
                const messageCount = messages.data.length;
                this.logger.log(`📊 [MESSAGE] Thread ${threadId} contient maintenant ${messageCount} messages au total`);
            } catch (err: any) {
                this.logger.warn(`⚠️ [MESSAGE] Impossible de vérifier le nombre de messages: ${err.message}`);
            }
        } catch (error: any) {
            this.logger.error(`❌ [MESSAGE] Erreur ajout message au thread ${threadId}:`, error);
            throw new BadRequestException(`Impossible d'ajouter le message: ${error.message}`);
        }
    }

    /**
     * Exécuter un run et attendre la réponse
     */
    async runAndPoll(
        threadId: string,
        assistantId: string,
        userId?: string
    ): Promise<string> {
        // Vérifier les messages existants dans le thread avant de lancer le run
        try {
            const messagesBefore = await this.openai.beta.threads.messages.list(threadId, { limit: 20 });
            this.logger.log(`📋 [RUN] Thread ${threadId} contient ${messagesBefore.data.length} messages avant le run`);
            if (messagesBefore.data.length > 0) {
                // Afficher les 5 derniers messages pour voir le contexte complet
                const lastMessages = messagesBefore.data.slice(0, 5).map((m, idx) => {
                    const content = m.content[0];
                    const text = content.type === 'text' ? content.text.value : content.type;
                    const preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
                    return `  ${idx + 1}. [${m.role}] ${preview}`;
                });
                this.logger.log(`📋 [RUN] Contexte conversationnel (5 derniers messages):\n${lastMessages.join('\n')}`);
                
                // Compter user vs assistant pour vérifier la structure
                const userCount = messagesBefore.data.filter(m => m.role === 'user').length;
                const assistantCount = messagesBefore.data.filter(m => m.role === 'assistant').length;
                this.logger.log(`📊 [RUN] Répartition: ${userCount} messages user, ${assistantCount} messages assistant`);
            }
        } catch (err: any) {
            this.logger.warn(`⚠️ [RUN] Impossible de lire les messages avant run: ${err.message}`);
        }

        // Créer le run
        this.logger.log(`🚀 [RUN] Création run pour thread ${threadId} avec assistant ${assistantId}`);
        let run = await this.openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
        });

        this.logger.log(`✅ [RUN] Run créé: ${run.id} pour thread ${threadId}`);

        // Polling jusqu'à completion
        while (true) {
            run = await this.openai.beta.threads.runs.retrieve(threadId, run.id);

            if (run.status === 'completed') {
                this.logger.log(`✅ [RUN] Run ${run.id} TERMINÉ avec succès`);
                
                // Vérifier les messages après completion
                try {
                    const messagesAfter = await this.openai.beta.threads.messages.list(threadId, { limit: 10 });
                    this.logger.log(`📊 [RUN] Thread ${threadId} contient maintenant ${messagesAfter.data.length} messages après run`);
                } catch (err: any) {
                    this.logger.warn(`⚠️ [RUN] Impossible de vérifier messages après completion: ${err.message}`);
                }
                
                break;
            }

            if (run.status === 'requires_action') {
                // Exécuter les tool calls
                const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
                const toolOutputs: Array<{ tool_call_id: string; output: string }> = [];

                for (const toolCall of toolCalls) {
                    try {
                        const functionName = toolCall.function.name;
                        const argsStr = toolCall.function.arguments || '{}';
                        const args = JSON.parse(argsStr);

                        this.logger.log(`🔧 [TOOL] Exécution tool: ${functionName}`);
                        
                        let output: any;
                        
                        // Vérifier si la function existe dans le toolRegistry
                        try {
                            output = await executeTool(functionName, args, {
                                userId: userId || 'anonymous',
                            });
                            this.logger.log(`✅ [TOOL] Tool ${functionName} exécuté avec succès`);
                        } catch (toolError: any) {
                            // Si la function n'existe pas dans toolRegistry
                            if (toolError.message?.includes('not found')) {
                                this.logger.warn(`⚠️ [TOOL] Tool ${functionName} non trouvé dans toolRegistry`);
                                this.logger.warn(`⚠️ [TOOL] Si c'est une serverless function OpenAI, elle devrait s'exécuter automatiquement`);
                                this.logger.warn(`⚠️ [TOOL] Sinon, vous devez l'ajouter dans toolRegistry.ts ou créer un endpoint personnalisé`);
                                
                                // Retourner une erreur claire
                                throw new Error(`Function ${functionName} n'est pas implémentée dans le backend. Ajoutez-la dans toolRegistry.ts ou configurez-la comme serverless function sur OpenAI.`);
                            }
                            throw toolError;
                        }

                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(output),
                        });
                    } catch (error: any) {
                        this.logger.error(`❌ [TOOL] Erreur tool ${toolCall.id}:`, error);
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify({ error: error.message || 'tool_error' }),
                        });
                    }
                }

                // Soumettre les outputs
                await this.openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                    tool_outputs: toolOutputs,
                });

                this.logger.log(`Tool outputs soumis pour run ${run.id}`);
                // Continuer le polling
                await new Promise((resolve) => setTimeout(resolve, 800));
                continue;
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                const error = (run as any).last_error;
                const errorMsg = error?.message || run.status;
                const errorCode = error?.code || 'unknown';
                const errorType = error?.type || 'unknown';
                
                this.logger.error(`Run ${run.id} échoué: ${errorMsg} (code: ${errorCode}, type: ${errorType})`);
                
                // Log détaillé pour debug
                this.logger.error(`Détails erreur run: ${JSON.stringify(error, null, 2)}`);
                
                // Si c'est une erreur récupérable, on peut throw avec plus de contexte
                throw new BadRequestException(`Run échoué: ${errorMsg}`);
            }

            // Attendre avant de re-poll
            await new Promise((resolve) => setTimeout(resolve, 800));
        }

        // Récupérer le dernier message assistant
        this.logger.log(`📥 [RUN] Récupération dernier message assistant du thread ${threadId}`);
        const messages = await this.openai.beta.threads.messages.list(threadId, {
            order: 'desc',
            limit: 1,
        });

        this.logger.log(`📊 [RUN] Total messages dans thread: ${messages.data.length}`);

        const lastMessage = messages.data[0];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            this.logger.error(`❌ [RUN] Aucun message assistant trouvé. Dernier message: ${lastMessage ? lastMessage.role : 'null'}`);
            throw new BadRequestException('Aucun message assistant trouvé');
        }

        const content = lastMessage.content[0];
        if (content.type === 'text') {
            let answerText = content.text.value;
            
            // ============================================
            // FILTRES DE RÉPONSE
            // ============================================
            try {
                const allMessages = await this.openai.beta.threads.messages.list(threadId, {
                    order: 'desc',
                    limit: 10,
                });
                
                const lastUserMessage = allMessages.data.find(m => m.role === 'user');
                if (lastUserMessage) {
                    const userContent = lastUserMessage.content[0];
                    if (userContent.type === 'text') {
                        const userText = userContent.text.value;
                        
                        // 1. Filtre anti-duplication (blocs UI)
                        const originalLength = answerText.length;
                        answerText = cleanResponse(answerText, userText);
                        
                        if (answerText.length !== originalLength) {
                            this.logger.log(`🧹 [FILTER] Blocs UI supprimés (${originalLength - answerText.length} chars)`);
                        }
                    }
                }
                
                // 2. Filtre anti-questions génériques
                const beforeStrip = answerText.length;
                answerText = stripGenericFirstQuestion(answerText);
                if (answerText.length !== beforeStrip) {
                    this.logger.log(`🧹 [FILTER] Question générique supprimée`);
                }
                
            } catch (filterError: any) {
                this.logger.warn(`⚠️ [FILTER] Erreur lors du filtrage: ${filterError.message}`);
            }
            
            const preview = answerText.length > 100 ? answerText.substring(0, 100) + '...' : answerText;
            this.logger.log(`✅ [RUN] Réponse récupérée (${answerText.length} chars): "${preview}"`);
            return answerText;
        }

        this.logger.error(`❌ [RUN] Format de réponse non supporté: ${content.type}`);
        throw new BadRequestException('Format de réponse non supporté');
    }

    /**
     * Récupérer les messages d'un thread (pour alimenter Chat Completions avec l'historique)
     */
    async getThreadMessages(threadId: string, limit: number = 20): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
        try {
            this.logger.log(`📚 [THREAD] Récupération messages du thread ${threadId} (limit: ${limit})`);
            const messages = await this.openai.beta.threads.messages.list(threadId, {
                order: 'asc', // Ordre chronologique
                limit,
            });

            const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
            
            for (const msg of messages.data) {
                const content = msg.content[0];
                if (content.type === 'text') {
                    formattedMessages.push({
                        role: msg.role as 'user' | 'assistant' | 'system',
                        content: content.text.value,
                    });
                }
            }

            this.logger.log(`✅ [THREAD] ${formattedMessages.length} messages récupérés du thread ${threadId}`);
            return formattedMessages;
        } catch (error: any) {
            this.logger.error(`❌ [THREAD] Erreur récupération messages du thread ${threadId}:`, error);
            throw new BadRequestException(`Impossible de récupérer les messages du thread: ${error.message}`);
        }
    }

    /**
     * Récupérer les instructions et tools d'un assistant
     * @param assistantId - ID de l'assistant (optionnel)
     * @param opts.mode - 'chat' pour instructions longues FR, 'realtime' pour instructions courtes multilingues
     */
    async getAssistantConfig(
        assistantId?: string, 
        opts?: { mode?: 'chat' | 'realtime' }
    ): Promise<{ instructions: string; tools?: any[] }> {
        const id = assistantId || process.env.OPENAI_ASSISTANT_ID;
        const mode = opts?.mode ?? 'chat';
        
        // ═══════════════════════════════════════════════════════════════════════════
        // INSTRUCTIONS SELON LE MODE
        // - chat: instructions longues (defaultProfile.instructions) - peut être FR
        // - realtime: instructions courtes multilingues (getRealtimeInstructionsForLang())
        // ═══════════════════════════════════════════════════════════════════════════
        const getInstructions = () => {
            if (mode === 'realtime') {
                const realtimeInstructions = getRealtimeInstructionsForLang();
                this.logger.log(`🌍 [ASSISTANT] Mode REALTIME: instructions multilingues (${realtimeInstructions.length} chars)`);
                return realtimeInstructions;
            }
            return defaultProfile.instructions;
        };
        
        if (!id) {
            // Fallback sur defaultProfile si pas d'assistant configuré
            this.logger.log(`⚠️ [ASSISTANT] Pas d'assistant configuré, utilisation defaultProfile (mode: ${mode})`);
            return {
                instructions: getInstructions(),
                tools: defaultProfile.tools.map(t => ({
                    type: 'function' as const,
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })),
            };
        }

        try {
            this.logger.log(`📥 [ASSISTANT] Récupération config assistant: ${id} (mode: ${mode})`);
            const assistant = await this.openai.beta.assistants.retrieve(id);
            
            this.logger.log(`✅ [ASSISTANT] Assistant récupéré: ${assistant.name || 'sans nom'} (${id})`);
            this.logger.log(`🔧 [ASSISTANT] Tools: ${assistant.tools?.length || 0} tools configurés`);
            
            // En mode realtime, TOUJOURS utiliser les instructions realtime (pas celles de l'assistant)
            const instructions = mode === 'realtime' 
                ? getRealtimeInstructionsForLang() 
                : (assistant.instructions || defaultProfile.instructions);
            
            this.logger.log(`📝 [ASSISTANT] Instructions (${mode}): ${instructions.substring(0, 100)}...`);
            
            return {
                instructions,
                tools: assistant.tools || [],
            };
        } catch (error: any) {
            this.logger.error(`❌ [ASSISTANT] Erreur récupération assistant ${id}: ${error.message}`);
            this.logger.warn(`⚠️ [ASSISTANT] Fallback sur defaultProfile (mode: ${mode})`);
            
            // Fallback sur defaultProfile en cas d'erreur
            return {
                instructions: getInstructions(),
                tools: defaultProfile.tools.map(t => ({
                    type: 'function' as const,
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })),
            };
        }
    }

    /**
     * Obtenir l'assistant_id depuis le profil (ou créer un assistant si nécessaire)
     * Synchronise automatiquement les tools avec le profil
     */
    async getOrCreateAssistant(): Promise<string> {
        // Pour l'instant, on utilise un assistant_id configuré ou on en crée un
        const assistantId = process.env.OPENAI_ASSISTANT_ID;
        
        // Définir les tools une seule fois
        const profileTools = defaultProfile.tools.map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
        
        if (assistantId) {
            this.logger.log(`✅ [ASSISTANT] Utilisation assistant configuré: ${assistantId}`);
            
            // IMPORTANT: Vérifier et synchroniser les tools avec le profil
            try {
                const assistant = await this.openai.beta.assistants.retrieve(assistantId);
                const existingToolNames = (assistant.tools || [])
                    .filter((t: any) => t.type === 'function')
                    .map((t: any) => t.function?.name);
                const requiredToolNames = profileTools.map(t => t.function.name);
                
                // Vérifier si tous les tools requis sont présents
                const missingTools = requiredToolNames.filter(name => !existingToolNames.includes(name));
                
                if (missingTools.length > 0) {
                    this.logger.warn(`⚠️ [ASSISTANT] Tools manquants sur l'assistant: ${missingTools.join(', ')}`);
                    this.logger.log(`🔧 [ASSISTANT] Mise à jour de l'assistant avec ${profileTools.length} tools...`);
                    
                    // Mettre à jour l'assistant avec tous les tools du profil
                    await this.openai.beta.assistants.update(assistantId, {
                        tools: profileTools,
                        instructions: defaultProfile.instructions, // Aussi mettre à jour les instructions
                    });
                    
                    this.logger.log(`✅ [ASSISTANT] Assistant mis à jour avec les tools: ${requiredToolNames.join(', ')}`);
                } else {
                    this.logger.log(`✅ [ASSISTANT] Tous les tools sont déjà configurés (${existingToolNames.length} tools)`);
                }
            } catch (error: any) {
                this.logger.error(`❌ [ASSISTANT] Erreur vérification/mise à jour tools: ${error.message}`);
                // Continuer avec l'assistant existant même si la mise à jour échoue
            }
            
            return assistantId;
        }

        // Si pas d'assistant_id configuré, créer un assistant depuis le profil
        this.logger.log('Création assistant depuis defaultProfile');
        
        // IMPORTANT: Les tools sont définis comme "function" dans Assistants API
        // Ils seront exécutés via requires_action → executeTool() dans runAndPoll()
        // Le code gère déjà requires_action, donc on peut activer les tools
        const tools = defaultProfile.tools.map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
        
        this.logger.log(`🔧 [ASSISTANT] Activation de ${tools.length} tools: ${tools.map(t => t.function.name).join(', ')}`);
        
        try {
            const assistantName = process.env.AI_ASSISTANT_NAME || 'Noor';
            const assistant = await this.openai.beta.assistants.create({
                name: assistantName,
                instructions: defaultProfile.instructions,
                model: process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
                tools, // Tools activés - seront exécutés via requires_action
                temperature: defaultProfile.temperature,
            });

            this.logger.log(`✅ [ASSISTANT] Assistant créé: ${assistant.id} (à configurer dans OPENAI_ASSISTANT_ID)`);
            this.logger.log(`✅ [ASSISTANT] Tools activés: ${tools.length} functions disponibles`);
            return assistant.id;
        } catch (error: any) {
            this.logger.error(`Erreur création assistant: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupérer le thread_id depuis conversationId (multi-tenant)
     */
    async getThreadId(conversationId: string, tenantId?: string): Promise<string | null> {
        // Prisma n'accepte pas null dans les contraintes uniques composites
        const normalizedTenantId = tenantId || 'global';
        
        const thread = await prisma.conversationThread.findUnique({
            where: {
                tenantId_conversationId: {
                    tenantId: normalizedTenantId,
                    conversationId,
                },
            },
        });
        return thread?.assistantThreadId || null;
    }
}

