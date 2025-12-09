export type AiProvider = 'openai' | 'anthropic';
export interface AiMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface AiUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface AiResponse {
    content: string;
    provider: AiProvider;
    model: string;
    usage: AiUsage;
    duration: number;
    timestamp: Date;
}
export interface AiRequest {
    messages: AiMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: AiProvider;
    userId?: string;
    sessionId?: string;
}
export interface AiHealthStatus {
    provider: AiProvider;
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    responseTime?: number;
    error?: string;
}
