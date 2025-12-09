import { ConfigService } from '@nestjs/config';
import { AiMessage, AiResponse, AiProvider, AiUsage } from './interfaces/ai.interface';
export declare class AiService {
    private readonly configService;
    private readonly logger;
    private openaiClient;
    private readonly config;
    constructor(configService: ConfigService);
    private initializeClients;
    generateResponse(messages: AiMessage[], options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        provider?: AiProvider;
    }): Promise<AiResponse>;
    private generateWithOpenAI;
    private generateWithAnthropic;
    checkHealth(): Promise<{
        openai: boolean;
        anthropic: boolean;
        overall: boolean;
    }>;
    getAvailableModels(provider?: AiProvider): Promise<string[]>;
    calculateCost(usage: AiUsage, provider?: AiProvider): number;
}
