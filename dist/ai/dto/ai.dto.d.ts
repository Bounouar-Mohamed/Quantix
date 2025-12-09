import { AiMessage, AiProvider } from '../interfaces/ai.interface';
export declare class AiMessageDto {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare class GenerateResponseDto {
    messages: AiMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: AiProvider;
    userId?: string;
    sessionId?: string;
}
export declare class HealthCheckDto {
    openai: boolean;
    anthropic: boolean;
    overall: boolean;
    timestamp: Date;
}
