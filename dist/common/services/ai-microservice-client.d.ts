import { ConfigService } from '@nestjs/config';
export interface AiMicroserviceRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    sessionId?: string;
}
export interface AiMicroserviceResponse {
    content: string;
    provider: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    duration: number;
    timestamp: Date;
}
export declare class AiMicroserviceClient {
    private readonly configService;
    private readonly logger;
    private readonly client;
    private readonly baseUrl;
    constructor(configService: ConfigService);
    generateResponse(request: AiMicroserviceRequest): Promise<AiMicroserviceResponse>;
    checkHealth(): Promise<{
        openai: boolean;
        anthropic: boolean;
        overall: boolean;
        timestamp: Date;
    }>;
    getAvailableModels(provider?: string): Promise<string[]>;
    testService(): Promise<{
        message: string;
        timestamp: Date;
    }>;
}
