import { Controller, Post, Body, HttpCode, HttpStatus, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from '../ai.service';
import { AssistantsService } from '../services/assistants.service';
import { AiResponse, AiMessage } from '../interfaces/ai.interface';
import { GenerateResponseDto } from '../dto/ai.dto';
import type { Request } from 'express';
import { profileJohn } from '../modelProfile';
import { buildAllowedTools, buildSystemPrompt, buildUserContextFromRequest } from '../context/builder';
import { getOrCreateConversation, incrementMessageCount } from '../context/store';

@ApiTags('ai')
@Controller('ai/generate')
export class GenerationController {
  constructor(
    private readonly aiService: AiService,
    private readonly assistantsService: AssistantsService,
  ) {}

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
    
    console.log(`🔍 [GENERATION] conversationId reçu: ${conversationId}`);
    console.log(`🔍 [GENERATION] Sources: header=${headerConversationId || 'null'}, body.conversationId=${request.conversationId || 'null'}, body.sessionId=${request.sessionId || 'null'}`);
    
    const conv = getOrCreateConversation(conversationId, 'chat');
    incrementMessageCount(conversationId);

    // Vérifier si on doit utiliser Assistants API (flag X-Use-Assistants)
    const useAssistants = useAssistantsHeader === 'true' || process.env.USE_ASSISTANTS_API === 'true';
    console.log(`🔍 [GENERATION] useAssistants: ${useAssistants} (header=${useAssistantsHeader}, env=${process.env.USE_ASSISTANTS_API})`);

    if (useAssistants) {
      // Utiliser Assistants API avec threads (comme ChatGPT : toujours upsert + écrire user + run + réponse déjà dans thread)
      const tenantId = (req as any).headers['tenant-id'] || request.tenantId || 'global';
      
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
          console.log(`📝 [GENERATION] Message utilisateur à traiter: "${userText.substring(0, 50)}..."`);
          console.log(`📝 [GENERATION] Thread ID utilisé: ${threadId}`);
          
          // Toujours écrire le message user dans le thread (comme ChatGPT)
          await this.assistantsService.addMessage(threadId, 'user', userText);

          // Run et poll (la réponse assistant est automatiquement ajoutée au thread par OpenAI)
          const startTime = Date.now();
          try {
            console.log(`🚀 [GENERATION] Lancement run pour thread ${threadId}`);
            const answer = await this.assistantsService.runAndPoll(
              threadId,
              assistantId,
              request.userId || user.userId
            );
            console.log(`✅ [GENERATION] Réponse obtenue (${answer.length} chars)`);

            const duration = Date.now() - startTime;

            // Retourner dans le format AiResponse (usage approximatif)
            return {
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
          } catch (runError: any) {
            // Si le run Assistants échoue, fallback vers Chat Completions mais on garde la journalisation
            console.warn(`⚠️ Run Assistants échoué, fallback Chat Completions: ${runError.message}`);
            // Continuer avec le fallback Chat Completions ci-dessous
          }
        }
      } catch (assistantsError: any) {
        // Si erreur lors de la création du thread/assistant, fallback Chat Completions
        console.warn(`⚠️ Erreur Assistants, fallback Chat Completions: ${assistantsError.message}`);
        // Continuer avec le fallback Chat Completions ci-dessous
      }
    }

    // Fallback: utiliser l'ancien flux Chat Completions
    // IMPORTANT: Même avec Chat Completions, on journalise dans le thread pour mémoire unifiée
    const systemInstructions = buildSystemPrompt(profileJohn, user, conv);
    const allowedTools = buildAllowedTools(profileJohn, user);
    const tools = allowedTools.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));

    const defaultModel = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';
    const defaultTemp = profileJohn.temperature;

    const tenantId = (req as any).headers['tenant-id'] || request.tenantId || 'global';
    
    // Récupérer ou créer le thread même en Chat Completions (pour mémoire unifiée)
    let threadId: string | null = null;
    const shouldJournalize = process.env.JOURNALIZE_CHAT_COMPLETIONS !== 'false'; // Par défaut: true
    console.log(`📝 [GENERATION] Journalisation Chat Completions: ${shouldJournalize} (env=${process.env.JOURNALIZE_CHAT_COMPLETIONS})`);
    
    // Messages à utiliser : soit depuis le thread (si existe), soit depuis request.messages
    let messagesToUse: AiMessage[] = request.messages;
    
    if (shouldJournalize) {
      try {
        console.log(`🔍 [GENERATION] Upsert thread pour conversationId: ${conversationId}, tenantId: ${tenantId}`);
        const assistantId = await this.assistantsService.getOrCreateAssistant();
        threadId = await this.assistantsService.upsertThread(conversationId, tenantId, assistantId);
        console.log(`✅ [GENERATION] Thread ID obtenu: ${threadId}`);
        
        // RÉCUPÉRER l'historique du thread pour alimenter le contexte Chat Completions
        try {
          const threadMessages = await this.assistantsService.getThreadMessages(threadId, 20); // Récupérer les 20 derniers messages
          console.log(`📚 [GENERATION] Récupéré ${threadMessages.length} messages du thread ${threadId} pour contexte`);
          
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
            console.log(`✅ [GENERATION] Utilisation de ${messagesToUse.length} messages du thread + nouveau message user`);
          }
        } catch (error: any) {
          console.warn(`⚠️ [GENERATION] Impossible de récupérer l'historique du thread, utilisation des messages de la requête: ${error.message}`);
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
            console.log(`📝 [GENERATION] Journalisation message user dans thread ${threadId}`);
            await this.assistantsService.addMessage(threadId, 'user', lastUserMessage.content);
          } else {
            console.log(`⏭️ [GENERATION] Message user déjà dans le thread, skip journalisation`);
          }
        }
      } catch (error: any) {
        console.warn(`⚠️ [GENERATION] Erreur journalisation thread (Chat Completions): ${error.message}`);
      }
    }

    console.log(`📤 [GENERATION] Envoi ${messagesToUse.length} messages à Chat Completions`);
    const response = await this.aiService.generateResponse(messagesToUse, {
      model: request.model || defaultModel,
      temperature: (request.temperature ?? defaultTemp),
      maxTokens: request.maxTokens,
      provider: request.provider,
      systemInstructions,
      tools,
      userId: request.userId || user.userId,
    });

    // Journaliser la réponse assistant dans le thread (CRITIQUE pour mémoire unifiée)
    if (shouldJournalize && threadId && response.content) {
      try {
        console.log(`📝 [GENERATION] Journalisation réponse assistant dans thread ${threadId} (${response.content.length} chars)`);
        await this.assistantsService.addMessage(threadId, 'assistant', response.content);
        console.log(`✅ [GENERATION] Réponse assistant journalisée avec succès`);
      } catch (error: any) {
        console.warn(`⚠️ [GENERATION] Erreur journalisation réponse assistant: ${error.message}`);
      }
    } else {
      if (!shouldJournalize) {
        console.warn(`⚠️ [GENERATION] Journalisation désactivée (JOURNALIZE_CHAT_COMPLETIONS=false)`);
      }
      if (!threadId) {
        console.warn(`⚠️ [GENERATION] Pas de threadId pour journalisation`);
      }
      if (!response.content) {
        console.warn(`⚠️ [GENERATION] Pas de contenu dans la réponse pour journalisation`);
      }
    }

    return response;
  }

}

