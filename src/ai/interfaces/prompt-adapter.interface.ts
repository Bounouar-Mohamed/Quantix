/**
 * Interface pour les Prompts OpenAI (nouvelle approche recommandée)
 * Les Prompts remplacent progressivement les Assistants pour la configuration
 */

export interface PromptConfig {
    promptId: string;
    instructions: string;
    model?: string;
    temperature?: number;
    tools?: ToolConfig[];
    variables?: Record<string, any>;
}

export interface ToolConfig {
    name: string;
    description: string;
    parameters: Record<string, any>;
    type?: 'function' | 'mcp' | 'serverless';
}

export interface PromptRunResult {
    content: string;
    status: 'completed' | 'requires_action' | 'failed';
    toolCalls?: ToolCall[];
    runId?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: any;
    type?: 'function' | 'mcp' | 'serverless';
}

export interface PromptAdapter {
    /**
     * Récupérer la configuration d'un prompt depuis le dashboard OpenAI
     */
    getPromptConfig(promptId: string): Promise<PromptConfig>;

    /**
     * Exécuter un prompt et obtenir la réponse
     * Utilise Responses API ou Realtime selon le contexte
     */
    runPrompt(
        promptId: string,
        variables?: Record<string, any>,
        options?: {
            userId?: string;
            conversationId?: string;
            tenantId?: string;
            stream?: boolean;
            mcpConnections?: string[];
        }
    ): Promise<PromptRunResult>;

    /**
     * Utiliser un prompt dans une session Realtime
     */
    usePromptInRealtime(
        promptId: string,
        sessionConfig: {
            model?: string;
            voice?: string;
            variables?: Record<string, any>;
            mcpConnections?: string[];
        }
    ): Promise<{
        instructions: string;
        tools?: ToolConfig[];
    }>;
}



