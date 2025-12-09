export declare const aiConfig: (() => {
    openai: {
        apiKey: string;
        baseUrl: string;
        defaultModel: string;
        maxTokens: number;
        temperature: number;
        timeout: number;
    };
    anthropic: {
        apiKey: string;
        baseUrl: string;
        defaultModel: string;
        maxTokens: number;
        temperature: number;
        timeout: number;
    };
    defaultProvider: string;
    maxRetries: number;
    retryDelay: number;
    globalLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
        costPerDay: number;
    };
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    openai: {
        apiKey: string;
        baseUrl: string;
        defaultModel: string;
        maxTokens: number;
        temperature: number;
        timeout: number;
    };
    anthropic: {
        apiKey: string;
        baseUrl: string;
        defaultModel: string;
        maxTokens: number;
        temperature: number;
        timeout: number;
    };
    defaultProvider: string;
    maxRetries: number;
    retryDelay: number;
    globalLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
        costPerDay: number;
    };
}>;
