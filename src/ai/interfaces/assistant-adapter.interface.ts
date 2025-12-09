/**
 * Interface d'adaptation pour les APIs Assistants
 * Permet la migration vers Responses API et support MCP
 */

export interface AssistantRunResult {
    content: string;
    status: 'completed' | 'requires_action' | 'failed' | 'cancelled';
    toolCalls?: ToolCall[];
    runId: string;
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

export interface ToolOutput {
    toolCallId: string;
    output: any;
    error?: string;
}

export interface AssistantAdapter {
    /**
     * Créer ou récupérer un thread
     */
    upsertThread(conversationId: string, tenantId?: string): Promise<string>;

    /**
     * Ajouter un message au thread
     */
    addMessage(threadId: string, role: 'user' | 'assistant', content: string): Promise<void>;

    /**
     * Exécuter un run et obtenir la réponse
     * Compatible avec l'ancienne API (polling) et la nouvelle Responses API (streaming)
     */
    runAndGetResponse(
        threadId: string,
        assistantId: string,
        options?: {
            userId?: string;
            stream?: boolean;
            mcpConnections?: string[]; // IDs des connexions MCP à utiliser
        }
    ): Promise<AssistantRunResult>;

    /**
     * Soumettre les résultats de tool calls
     */
    submitToolOutputs(
        threadId: string,
        runId: string,
        outputs: ToolOutput[]
    ): Promise<void>;

    /**
     * Récupérer les messages d'un thread
     */
    getThreadMessages(threadId: string, limit?: number): Promise<Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>>;

    /**
     * Obtenir la configuration d'un assistant (instructions, tools, MCP)
     */
    getAssistantConfig(assistantId?: string): Promise<{
        instructions: string;
        tools?: any[];
        mcpConnections?: string[]; // Connexions MCP configurées
    }>;
}



