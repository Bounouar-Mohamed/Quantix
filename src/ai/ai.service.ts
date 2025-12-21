/**
 * ══════════════════════════════════════════════════════════════════════════════
 * AI SERVICE - Service OpenAI simplifié
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce service gère toutes les interactions avec OpenAI :
 * - Chat Completions (gpt-4o-mini, gpt-4o, etc.)
 * - Realtime API (gpt-4o-realtime-preview)
 * - Function Calling / Tools
 * 
 * La logique métier (propriétés, compliance) est déléguée aux middlewares.
 */

import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { AiMessage, AiResponse, AiUsage } from './interfaces/ai.interface';
import { AiProvider } from './interfaces/ai.interface';
import { executeTool } from './toolRegistry';
import { sanitizeMessages } from './utils/prompt-sanitizer';
import { applyBusinessMiddleware, BusinessMiddlewareResult } from './middleware/business-logic';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private readonly config: {
    chatModel: string;
    realtimeModel: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };

  constructor(private readonly configService: ConfigService) {
    const aiConfig = this.configService.get('ai.openai');
    
    // Configuration par défaut
    this.config = {
      chatModel: aiConfig?.chatModel || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
      realtimeModel: aiConfig?.realtimeModel || process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview',
      maxTokens: aiConfig?.maxTokens || 2000,
      temperature: aiConfig?.temperature || 0.7,
      timeout: aiConfig?.timeout || 30000,
    };

    this.initializeClient();
  }

  /**
   * Initialise le client OpenAI
   */
  private initializeClient(): void {
    const apiKey = process.env.OPENAI_API_KEY || this.configService.get('ai.openai.apiKey');
    
    if (!apiKey) {
      this.logger.warn('⚠️ OPENAI_API_KEY manquante');
      return;
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: this.config.timeout,
    });

    this.logger.log(`✅ OpenAI initialisé (chat: ${this.config.chatModel}, realtime: ${this.config.realtimeModel})`);
  }

  /**
   * Génère une réponse IA
   */
  async generateResponse(
    messages: AiMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemInstructions?: string;
      tools?: Array<{ type: 'function'; function: { name: string; description?: string; parameters: any } }>;
      userId?: string;
      skipBusinessLogic?: boolean; // Pour bypasser les middlewares métier
    }
  ): Promise<AiResponse> {
    if (!this.openai) {
      throw new ServiceUnavailableException('Client OpenAI non initialisé');
    }

    const startTime = Date.now();
    const model = options?.model || this.config.chatModel;

    // 1. Sécurité : Sanitiser les messages
    const sanitizedMessages = sanitizeMessages(messages, this.logger);
    const lastUserMessage = sanitizedMessages.slice().reverse().find(m => m.role === 'user')?.content || '';

    // 2. Middleware métier (propriétés, compliance, etc.)
    if (!options?.skipBusinessLogic) {
      const middlewareResult = await applyBusinessMiddleware(lastUserMessage, sanitizedMessages, {
        userId: options?.userId,
        model,
        logger: this.logger,
      });

      if (middlewareResult.handled) {
        // Le middleware a géré la requête (ex: liste de propriétés)
        return this.buildResponse(middlewareResult.content!, model, startTime, middlewareResult.usage);
      }
    }

    // 3. Préparer les messages avec instructions système
    const finalMessages = options?.systemInstructions
      ? [{ role: 'system' as const, content: options.systemInstructions }, ...sanitizedMessages]
      : sanitizedMessages;

    // 4. Appel OpenAI
    try {
      let response = await this.openai.chat.completions.create({
        model,
        messages: finalMessages.map(msg => ({ role: msg.role, content: msg.content })),
        temperature: options?.temperature ?? this.config.temperature,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        tools: options?.tools,
      });

      // 5. Gestion des tool calls
      const firstMessage = response.choices[0]?.message as any;
      if (firstMessage?.tool_calls?.length) {
        response = await this.handleToolCalls(firstMessage, finalMessages, options);
      }

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      this.logger.log(`✅ Réponse générée en ${Date.now() - startTime}ms`);

      return this.buildResponse(content, model, startTime, {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      });

    } catch (error: any) {
      this.logger.error(`❌ Erreur OpenAI: ${error.message}`);
      throw new ServiceUnavailableException(`Erreur OpenAI: ${error.message}`);
    }
  }

  /**
   * Gère les appels de tools
   */
  private async handleToolCalls(
    assistantMessage: any,
    messages: AiMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number; userId?: string }
  ): Promise<any> {
    const toolCalls = assistantMessage.tool_calls;
    const toolOutputs: Array<{ tool_call_id: string; content: string }> = [];

    for (const call of toolCalls) {
      try {
        const name = call.function?.name;
        const args = JSON.parse(call.function?.arguments || '{}');
        
        this.logger.debug(`🔧 Tool call: ${name}`);
        const output = await executeTool(name, args, { userId: options?.userId || 'anonymous' });
        
        toolOutputs.push({
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      } catch (e: any) {
        toolOutputs.push({
          tool_call_id: call.id,
          content: JSON.stringify({ error: e?.message || 'tool_error' }),
        });
      }
    }

    // Construire les messages de suivi
    const followupMessages: any[] = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      {
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: toolCalls.map((c: any) => ({ id: c.id, type: 'function', function: c.function })),
      },
      ...toolOutputs.map(to => ({ role: 'tool', tool_call_id: to.tool_call_id, content: to.content })),
    ];

    // Appel de suivi sans tools
    return this.openai.chat.completions.create({
      model: options?.model || this.config.chatModel,
      messages: followupMessages,
      temperature: options?.temperature ?? this.config.temperature,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
    });
  }

  /**
   * Construit l'objet de réponse standard
   */
  private buildResponse(
    content: string,
    model: string,
    startTime: number,
    usage?: Partial<AiUsage>
  ): AiResponse {
    return {
      content,
      provider: AiProvider.OPENAI,
      model,
      usage: {
        promptTokens: usage?.promptTokens || 0,
        completionTokens: usage?.completionTokens || 0,
        totalTokens: usage?.totalTokens || 0,
      },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Vérifie la santé du service
   */
  async checkHealth(): Promise<{ openai: boolean; overall: boolean }> {
    const health = { openai: false, overall: false };

    try {
      if (this.openai) {
        await this.openai.models.list();
        health.openai = true;
      }
    } catch (error: any) {
      this.logger.warn('OpenAI indisponible:', error.message);
    }

    health.overall = health.openai;
    return health;
  }

  /**
   * Liste les modèles disponibles
   */
  async getAvailableModels(): Promise<string[]> {
    if (!this.openai) return [];
    
    try {
      const models = await this.openai.models.list();
      return models.data
        .filter(m => m.id.includes('gpt'))
        .map(m => m.id)
        .sort();
    } catch (error) {
      this.logger.error('Erreur récupération modèles:', error);
      return [];
    }
  }

  /**
   * Calcule le coût estimé
   */
  calculateCost(usage: AiUsage, model: string = 'gpt-4o-mini'): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-realtime-preview': { input: 0.005, output: 0.02 },
    };

    const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
    return (
      (usage.promptTokens / 1000) * modelPricing.input +
      (usage.completionTokens / 1000) * modelPricing.output
    );
  }
}
