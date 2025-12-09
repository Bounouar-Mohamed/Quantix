/**
 * Registre partagé des handlers de tools
 * Utilisé par Realtime WS et Chat REST
 */

import { performSearch, fetchPageMeta } from "./services/webSearch";

export type ToolHandler = (args: any, ctx: { userId: string }) => Promise<any>;

/**
 * Registre des handlers de tools
 */
export const toolHandlers: Record<string, ToolHandler> = {
    async create_automation(args, ctx) {
        console.log('📅 create_automation exécuté (stub)', args);
        return { success: true, message: 'Automation created (stub)' };
    },

    async analyze_client(args, ctx) {
        console.log('🔍 analyze_client exécuté (stub)', args);
        return { success: true, message: 'Client analyzed (stub)' };
    },

    async log_to_crm(args, ctx) {
        console.log('📝 log_to_crm exécuté (stub)', args);
        return { success: true, message: 'Logged to CRM (stub)' };
    },

    async web_search(args, ctx) {
        const { query, maxResults, recencyDays } = args;
        // Toujours utiliser au moins 3-5 résultats pour avoir des alternatives
        const numResults = Math.max(maxResults ?? 5, 3);
        console.log(`🔍 Exécution recherche: "${query}", maxResults=${numResults}, recencyDays=${recencyDays}`);
        const results = await performSearch(query, numResults, recencyDays);
        return { results };
    },

    async web_open(args, ctx) {
        const { url } = args;
        console.log(`🔓 Exécution web_open: ${url}`);
        const meta = await fetchPageMeta(url);
        return meta;
    }
};

/**
 * Exécuter un tool par son nom
 */
export async function executeTool(
    toolName: string,
    args: any,
    context: { userId: string }
): Promise<any> {
    const handler = toolHandlers[toolName];
    if (!handler) {
        throw new Error(`Tool ${toolName} not found`);
    }
    return await handler(args, context);
}

