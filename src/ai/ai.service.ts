import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { AiMessage, AiResponse, AiUsage } from './interfaces/ai.interface';
import { AiProvider } from './interfaces/ai.interface';
import { executeTool } from './toolRegistry';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openaiClient: OpenAI;
  private readonly config: any;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get('ai');
    this.initializeClients();
  }

  /**
   * Initialise les clients IA
   */
  private initializeClients(): void {
    try {
      // Initialisation OpenAI
      if (this.config.openai.apiKey) {
        this.openaiClient = new OpenAI({
          apiKey: this.config.openai.apiKey,
          baseURL: this.config.openai.baseUrl,
          timeout: this.config.openai.timeout,
        });
        this.logger.log('✅ Client OpenAI initialisé');
      } else {
        this.logger.warn('⚠️ Clé API OpenAI manquante');
      }
    } catch (error) {
      this.logger.error('❌ Erreur lors de l\'initialisation des clients IA:', error);
    }
  }

  /**
   * Génère une réponse via OpenAI
   */
  async generateResponse(
    messages: AiMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      provider?: AiProvider;
      systemInstructions?: string;
      tools?: Array<{ type: 'function'; function: { name: string; description?: string; parameters: any } }>;
      userId?: string;
    }
  ): Promise<AiResponse> {
    const provider = options?.provider || this.config.defaultProvider;
    
    switch (provider) {
      case 'openai':
        return this.generateWithOpenAI(messages, options);
      case 'anthropic':
        return this.generateWithAnthropic(messages, options);
      default:
        throw new BadRequestException(`Provider IA non supporté: ${provider}`);
    }
  }

  /**
   * Génère une réponse avec OpenAI
   */
  private async generateWithOpenAI(
    messages: AiMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemInstructions?: string;
      tools?: Array<{ type: 'function'; function: { name: string; description?: string; parameters: any } }>;
      userId?: string;
    }
  ): Promise<AiResponse> {
    if (!this.openaiClient) {
      throw new ServiceUnavailableException('Client OpenAI non initialisé');
    }

    try {
      const startTime = Date.now();
      // Injecter instructions système si fournies
      const finalMessages = options?.systemInstructions
        ? ([{ role: 'system' as const, content: options.systemInstructions }, ...messages])
        : messages;

      let response = await this.openaiClient.chat.completions.create({
        model: options?.model || this.config.openai.defaultModel,
        messages: finalMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature || this.config.openai.temperature,
        max_tokens: options?.maxTokens || this.config.openai.maxTokens,
        tools: options?.tools,
      });

      // Function calling loop (single pass): if tool calls, execute then ask model to continue
      const firstMsg = response.choices[0]?.message as any;
      if (firstMsg?.tool_calls?.length && Array.isArray(firstMsg.tool_calls)) {
        const toolCalls = firstMsg.tool_calls;
        const toolOutputs: Array<{ tool_call_id: string; output: string }> = [];

        for (const call of toolCalls) {
          try {
            const name: string = call.function?.name;
            const argsStr: string = call.function?.arguments || '{}';
            const args = JSON.parse(argsStr);
            const output = await executeTool(name, args, { userId: options?.userId || 'anonymous' });
            toolOutputs.push({ tool_call_id: call.id, output: JSON.stringify(output) });
          } catch (e: any) {
            toolOutputs.push({ tool_call_id: call.id, output: JSON.stringify({ error: e?.message || 'tool_error' }) });
          }
        }

        // Build follow-up messages: include assistant tool_calls message then tool outputs
        const followupMessages: any[] = [
          ...finalMessages.map(m => ({ role: m.role, content: m.content })),
          {
            role: 'assistant',
            content: firstMsg.content || '',
            tool_calls: toolCalls.map((c: any) => ({ id: c.id, type: 'function', function: c.function }))
          },
          ...toolOutputs.map(to => ({ role: 'tool', tool_call_id: to.tool_call_id, content: to.output }))
        ];

        response = await this.openaiClient.chat.completions.create({
          model: options?.model || this.config.openai.defaultModel,
          messages: followupMessages,
          temperature: options?.temperature || this.config.openai.temperature,
          max_tokens: options?.maxTokens || this.config.openai.maxTokens,
          tools: options?.tools,
        });
      }

      const duration = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      this.logger.log(`✅ Réponse OpenAI générée en ${duration}ms`);

      return {
        content,
        provider: AiProvider.OPENAI,
        model: options?.model || this.config.openai.defaultModel,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        duration,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('❌ Erreur OpenAI:', error);
      throw new ServiceUnavailableException(`Erreur OpenAI: ${error.message}`);
    }
  }

  /**
   * Génère une réponse avec Anthropic (Claude)
   */
  private async generateWithAnthropic(
    messages: AiMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<AiResponse> {
    // TODO: Implémenter Anthropic quand nécessaire
    throw new ServiceUnavailableException('Provider Anthropic non encore implémenté');
  }

  /**
   * Vérifie la santé des services IA
   */
  async checkHealth(): Promise<{
    openai: boolean;
    anthropic: boolean;
    overall: boolean;
  }> {
    const health = {
      openai: false,
      anthropic: false,
      overall: false,
    };

    try {
      // Test OpenAI
      if (this.openaiClient) {
        await this.openaiClient.models.list();
        health.openai = true;
      }
    } catch (error) {
      this.logger.warn('OpenAI non disponible:', error.message);
    }

    // Test Anthropic (à implémenter)
    health.anthropic = false;

    health.overall = health.openai || health.anthropic;
    
    return health;
  }

  /**
   * Obtient la liste des modèles disponibles
   */
  async getAvailableModels(provider: AiProvider = AiProvider.OPENAI): Promise<string[]> {
    switch (provider) {
      case 'openai':
        if (!this.openaiClient) return [];
        try {
          const models = await this.openaiClient.models.list();
          return models.data
            .filter(model => model.id.includes('gpt'))
            .map(model => model.id);
        } catch (error) {
          this.logger.error('Erreur lors de la récupération des modèles OpenAI:', error);
          return [];
        }
      case 'anthropic':
        // TODO: Implémenter pour Anthropic
        return [];
      default:
        return [];
    }
  }

  /**
   * Calcule le coût estimé d'une requête
   */
  calculateCost(usage: AiUsage, provider: AiProvider = AiProvider.OPENAI): number {
    // Prix approximatifs par token (à ajuster selon les tarifs actuels)
    const pricing = {
      openai: {
        'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
        'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
        'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
      },
      anthropic: {
        'claude-3-sonnet-20240229': { input: 0.003 / 1000, output: 0.015 / 1000 },
        'claude-3-haiku-20240307': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
      },
    };

    const providerPricing = pricing[provider];
    if (!providerPricing) return 0;

    // Utiliser le modèle par défaut si pas spécifié
    const modelPricing = providerPricing[this.config.openai.defaultModel] || providerPricing['gpt-3.5-turbo'];
    
    return (usage.promptTokens * modelPricing.input) + (usage.completionTokens * modelPricing.output);
  }
}
