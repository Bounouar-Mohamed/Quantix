import { Controller, Post, Body, HttpCode, HttpStatus, Req, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from '../ai.service';
import { AssistantsService } from '../services/assistants.service';
import { AiResponse, AiMessage } from '../interfaces/ai.interface';
import { GenerateResponseDto } from '../dto/ai.dto';
import type { Request } from 'express';
import { defaultProfile } from '../modelProfile';
import { buildAllowedTools, buildSystemPrompt, buildUserContextFromRequest } from '../context/builder';
import { getOrCreateConversation, incrementMessageCount } from '../context/store';
import { describeLength, isVerboseLoggingEnabled, maskIdentifier } from '../../common/utils/logging';
import { ConversationSyncService } from '../services/conversation-sync.service';
import { UsageService } from '../../consumption/usage.service';

@ApiTags('ai')
@Controller('ai/generate')
export class GenerationController {
  private readonly logger = new Logger(GenerationController.name);
  private readonly verbose = isVerboseLoggingEnabled();

  constructor(
    private readonly aiService: AiService,
    private readonly assistantsService: AssistantsService,
    private readonly usageService: UsageService,
    private readonly conversationSyncService: ConversationSyncService,
  ) {}

  private debug(message: string): void {
    if (this.verbose) {
      this.logger.debug(message);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Générer une réponse IA',
    description: 'Génère une réponse en utilisant les APIs IA configurées'
  })
  @ApiResponse({
    status: 200,
    description: 'Réponse générée avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Requête invalide',
  })
  @ApiResponse({
    status: 503,
    description: 'Service IA indisponible',
  })
  async generateResponse(
    @Body() request: GenerateResponseDto,
    @Req() req: Request,
    @Headers('conversation-id') headerConversationId?: string,
    @Headers('x-use-assistants') useAssistantsHeader?: string,
  ): Promise<AiResponse> {
    // Contexte unifié avec Realtime
    const user = buildUserContextFromRequest(req);
    // Accepter conversationId depuis header, body, ou sessionId (priorité dans cet ordre)
    const conversationId = headerConversationId || request.conversationId || request.sessionId || `conv_${Date.now()}`;
    
    this.debug(`conversationId reçu (${maskIdentifier(conversationId, 'conv')})`);
    this.debug(
      `Sources conversationId: header=${maskIdentifier(headerConversationId, 'header')} body=${maskIdentifier(request.conversationId, 'body')} session=${maskIdentifier(request.sessionId, 'session')}`,
    );
    
    const conv = getOrCreateConversation(conversationId, 'chat');
    incrementMessageCount(conversationId);

    const tenantId = (req as any).headers['tenant-id'] || request.tenantId || 'global';
    const actorUserId = request.userId || user.userId;
    const requestStart = Date.now();
    const defaultModel = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';
    const defaultTemp = defaultProfile.temperature;
    const lastUserMessageContent = request.messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user')?.content;

    try {
      // Vérifier si on doit utiliser Assistants API (flag X-Use-Assistants)
      const useAssistants = useAssistantsHeader === 'true' || process.env.USE_ASSISTANTS_API === 'true';
      this.debug(`useAssistants=${useAssistants}`);

      if (useAssistants) {
      // Utiliser Assistants API avec threads (comme ChatGPT : toujours upsert + écrire user + run + réponse déjà dans thread)
      try {
        const assistantId = await this.assistantsService.getOrCreateAssistant();
        const threadId = await this.assistantsService.upsertThread(conversationId, tenantId, assistantId);

        // Extraire le dernier message utilisateur
        const lastUserMessage = request.messages
          .slice()
          .reverse()
          .find((m) => m.role === 'user');
        const userText = lastUserMessage?.content || '';

        if (userText) {
          this.debug(`Message utilisateur reçu (${describeLength(userText)})`);
          this.debug(`Thread utilisé ${maskIdentifier(threadId, 'thread')}`);
          
          // Toujours écrire le message user dans le thread (comme ChatGPT)
          await this.assistantsService.addMessage(threadId, 'user', userText);

          // Run et poll (la réponse assistant est automatiquement ajoutée au thread par OpenAI)
          const startTime = Date.now();
          try {
            this.debug(`Lancement run pour ${maskIdentifier(threadId, 'thread')}`);
            const answer = await this.assistantsService.runAndPoll(
              threadId,
              assistantId,
              actorUserId
            );
            this.debug(`Réponse obtenue (${describeLength(answer)})`);

            const duration = Date.now() - startTime;

            // Retourner dans le format AiResponse (usage approximatif)
            const assistantResponse: AiResponse = {
              content: answer,
              provider: 'openai' as any,
              model: request.model || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
              usage: {
                promptTokens: 0, // TODO: Récupérer depuis run si disponible
                completionTokens: 0,
                totalTokens: 0,
              },
              duration,
              timestamp: new Date(),
            };
            await this.syncConversationSnapshot({
              conversationId,
              tenantId,
              userId: actorUserId,
              assistantThreadId: threadId,
              userMessage: userText,
              assistantMessage: {
                content: assistantResponse.content,
                model: assistantResponse.model,
                usage: assistantResponse.usage,
                duration: assistantResponse.duration,
              },
            });
            await this.usageService.recordChatUsage({
              userId: actorUserId,
              tenantId,
              model: assistantResponse.model,
              promptTokens: assistantResponse.usage.promptTokens,
              completionTokens: assistantResponse.usage.completionTokens,
              durationMs: Date.now() - requestStart,
              endpoint: 'ai/generate',
              success: true,
            });
            return assistantResponse;
          } catch (runError: any) {
            // Si le run Assistants échoue, fallback vers Chat Completions mais on garde la journalisation
            this.logger.warn(`Run Assistants échoué, fallback Chat Completions: ${runError.message}`);
            // Continuer avec le fallback Chat Completions ci-dessous
          }
        }
      } catch (assistantsError: any) {
        // Si erreur lors de la création du thread/assistant, fallback Chat Completions
        this.logger.warn(`Erreur Assistants, fallback Chat Completions: ${assistantsError.message}`);
        // Continuer avec le fallback Chat Completions ci-dessous
      }
      }

      // Fallback: utiliser l'ancien flux Chat Completions
      // IMPORTANT: Même avec Chat Completions, on journalise dans le thread pour mémoire unifiée
      const systemInstructions = buildSystemPrompt(defaultProfile, user, conv);
      const allowedTools = buildAllowedTools(defaultProfile, user);
      const tools = allowedTools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }));
    
    // Récupérer ou créer le thread même en Chat Completions (pour mémoire unifiée)
    let threadId: string | null = null;
    const shouldJournalize = process.env.JOURNALIZE_CHAT_COMPLETIONS !== 'false'; // Par défaut: true
    this.debug(`Journalisation Chat Completions activée=${shouldJournalize}`);
    
    // Messages à utiliser : soit depuis le thread (si existe), soit depuis request.messages
    let messagesToUse: AiMessage[] = request.messages;
    
    if (shouldJournalize) {
      try {
        this.debug(
          `[THREAD] Upsert ${maskIdentifier(conversationId, 'conv')} tenant=${maskIdentifier(tenantId, 'tenant')}`,
        );
        const assistantId = await this.assistantsService.getOrCreateAssistant();
        threadId = await this.assistantsService.upsertThread(conversationId, tenantId, assistantId);
        this.debug(`[THREAD] Obtenu ${maskIdentifier(threadId, 'thread')}`);
        
        // RÉCUPÉRER l'historique du thread pour alimenter le contexte Chat Completions
        try {
          const threadMessages = await this.assistantsService.getThreadMessages(threadId, 20); // Récupérer les 20 derniers messages
          this.debug(`[THREAD] ${threadMessages.length} messages récupérés pour ${maskIdentifier(threadId, 'thread')}`);
          
          // Convertir les messages du thread en format AiMessage
          const threadAiMessages: AiMessage[] = threadMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
          }));
          
          // Si on a des messages du thread, on les utilise comme contexte
          // On ajoute le dernier message user de la requête actuelle
          const lastUserMessage = request.messages
            .slice()
            .reverse()
            .find((m) => m.role === 'user');
          
          if (threadAiMessages.length > 0 && lastUserMessage) {
            // Utiliser l'historique du thread + le nouveau message
            messagesToUse = [...threadAiMessages, lastUserMessage];
            this.debug(`[CONTEXT] ${messagesToUse.length} messages utilisés depuis thread`);
          }
        } catch (error: any) {
          this.logger.warn(`Impossible de récupérer l'historique du thread: ${error.message}`);
        }
        
        // Journaliser le message user dans le thread (mais on l'a peut-être déjà dans l'historique)
        const lastUserMessage = request.messages
          .slice()
          .reverse()
          .find((m) => m.role === 'user');
        if (lastUserMessage?.content) {
          // Vérifier si le message n'est pas déjà dans le thread (éviter doublons)
          const isAlreadyInThread = messagesToUse.some(m => 
            m.role === 'user' && m.content === lastUserMessage.content
          );
          if (!isAlreadyInThread) {
            this.debug(`[THREAD] Journalisation message user dans ${maskIdentifier(threadId, 'thread')}`);
            await this.assistantsService.addMessage(threadId, 'user', lastUserMessage.content);
          } else {
            this.debug('[THREAD] Message user déjà présent, skip');
          }
        }
      } catch (error: any) {
        this.logger.warn(`Erreur journalisation thread (Chat Completions): ${error.message}`);
      }
    }

    this.debug(`[GENERATION] Envoi ${messagesToUse.length} messages à Chat Completions`);
      const response = await this.aiService.generateResponse(messagesToUse, {
        model: request.model || defaultModel,
        temperature: (request.temperature ?? defaultTemp),
        maxTokens: request.maxTokens,
        provider: request.provider,
        systemInstructions,
        tools,
        userId: actorUserId,
      });

      // Journaliser la réponse assistant dans le thread (CRITIQUE pour mémoire unifiée)
      if (shouldJournalize && threadId && response.content) {
        try {
          this.debug(
            `[THREAD] Journalisation réponse assistant (${describeLength(response.content)}) dans ${maskIdentifier(threadId, 'thread')}`,
          );
          await this.assistantsService.addMessage(threadId, 'assistant', response.content);
          this.debug('[THREAD] Réponse assistant journalisée');
        } catch (error: any) {
          this.logger.warn(`Erreur journalisation réponse assistant: ${error.message}`);
        }
      } else {
        if (!shouldJournalize) {
          this.logger.warn('Journalisation désactivée (JOURNALIZE_CHAT_COMPLETIONS=false)');
        }
        if (!threadId) {
          this.logger.warn('Pas de threadId pour journalisation');
        }
        if (!response.content) {
          this.logger.warn('Pas de contenu dans la réponse pour journalisation');
        }
      }

      await this.usageService.recordChatUsage({
        userId: actorUserId,
        tenantId,
        model: response.model || defaultModel,
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        durationMs: Date.now() - requestStart,
        endpoint: 'ai/generate',
        success: true,
      });
      await this.syncConversationSnapshot({
        conversationId,
        tenantId,
        userId: actorUserId,
        assistantThreadId: threadId,
        userMessage: lastUserMessageContent,
        assistantMessage: {
          content: response.content,
          model: response.model,
          usage: response.usage,
          duration: Date.now() - requestStart,
        },
      });

      return response;
    } catch (error: any) {
      await this.usageService.recordChatUsage({
        userId: actorUserId,
        tenantId,
        model: request.model || defaultModel,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: Date.now() - requestStart,
        endpoint: 'ai/generate',
        success: false,
        error: error?.message || 'unknown_error',
      });
      throw error;
    }
  }

  private async syncConversationSnapshot(params: {
    conversationId: string;
    tenantId: string;
    userId: string;
    assistantThreadId?: string | null;
    userMessage?: string;
    assistantMessage?: {
      content: string;
      model?: string;
      usage?: AiResponse['usage'];
      duration?: number;
    };
  }): Promise<void> {
    const messages = [];
    if (params.userMessage) {
      messages.push({
        role: 'user' as const,
        content: params.userMessage,
      });
    }
    if (params.assistantMessage) {
      const usage = params.assistantMessage.usage;
      messages.push({
        role: 'assistant' as const,
        content: params.assistantMessage.content,
        model: params.assistantMessage.model,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        durationMs: params.assistantMessage.duration,
      });
    }

    if (messages.length === 0) {
      return;
    }

    await this.conversationSyncService.sync({
      conversationId: params.conversationId,
      userId: params.userId,
      tenantId: params.tenantId,
      assistantThreadId: params.assistantThreadId ?? undefined,
      metadata: {
        model: params.assistantMessage?.model,
        usage: params.assistantMessage?.usage,
        durationMs: params.assistantMessage?.duration,
      },
      messages,
    });
  }
}

