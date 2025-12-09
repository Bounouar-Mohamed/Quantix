/**
 * Adaptateur pour l'API Assistants legacy (beta.threads)
 * Sera remplacé par ResponsesAssistantAdapter lors de la migration
 */

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AssistantAdapter, AssistantRunResult, ToolCall, ToolOutput } from '../interfaces/assistant-adapter.interface';
import { prisma } from '../../db/prisma';
import { executeTool } from '../toolRegistry';
import { profileJohn } from '../modelProfile';

@Injectable()
export class LegacyAssistantAdapter implements AssistantAdapter {
    private readonly logger = new Logger(LegacyAssistantAdapter.name);

    constructor(private readonly openai: OpenAI) {}

    async upsertThread(conversationId: string, tenantId?: string): Promise<string> {
        const normalizedTenantId = tenantId || 'global';

        const existing = await prisma.conversationThread.findUnique({
            where: {
                tenantId_conversationId: {
                    tenantId: normalizedTenantId,
                    conversationId,
                },
            },
        });

        if (existing) {
            return existing.assistantThreadId;
        }

        const thread = await this.openai.beta.threads.create();
        await prisma.conversationThread.create({
            data: {
                conversationId,
                tenantId: normalizedTenantId,
                assistantThreadId: thread.id,
            },
        });

        return thread.id;
    }

    async addMessage(threadId: string, role: 'user' | 'assistant', content: string): Promise<void> {
        await this.openai.beta.threads.messages.create(threadId, { role, content });
    }

    async runAndGetResponse(
        threadId: string,
        assistantId: string,
        options?: { userId?: string; stream?: boolean; mcpConnections?: string[] }
    ): Promise<AssistantRunResult> {
        // Note: mcpConnections ignoré dans legacy adapter (préparation future)
        if (options?.mcpConnections && options.mcpConnections.length > 0) {
            this.logger.warn(`⚠️ MCP connections demandées mais non supportées dans legacy adapter: ${options.mcpConnections.join(', ')}`);
        }

        let run = await this.openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
        });

        // Polling (legacy)
        while (true) {
            run = await this.openai.beta.threads.runs.retrieve(threadId, run.id);

            if (run.status === 'completed') {
                const messages = await this.openai.beta.threads.messages.list(threadId, {
                    order: 'desc',
                    limit: 1,
                });

                const lastMessage = messages.data[0];
                const content = lastMessage.content[0];
                
                return {
                    content: content.type === 'text' ? content.text.value : '',
                    status: 'completed',
                    runId: run.id,
                    usage: (run as any).usage,
                };
            }

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
                const toolOutputs: ToolOutput[] = [];

                for (const toolCall of toolCalls) {
                    try {
                        const output = await executeTool(
                            toolCall.function.name,
                            JSON.parse(toolCall.function.arguments || '{}'),
                            { userId: options?.userId || 'anonymous' }
                        );
                        toolOutputs.push({
                            toolCallId: toolCall.id,
                            output,
                        });
                    } catch (error: any) {
                        toolOutputs.push({
                            toolCallId: toolCall.id,
                            output: null,
                            error: error.message,
                        });
                    }
                }

                await this.submitToolOutputs(threadId, run.id, toolOutputs);
                await new Promise((resolve) => setTimeout(resolve, 800));
                continue;
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                return {
                    content: '',
                    status: run.status as any,
                    runId: run.id,
                };
            }

            await new Promise((resolve) => setTimeout(resolve, 800));
        }
    }

    async submitToolOutputs(threadId: string, runId: string, outputs: ToolOutput[]): Promise<void> {
        await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
            tool_outputs: outputs.map(o => ({
                tool_call_id: o.toolCallId,
                output: o.error ? JSON.stringify({ error: o.error }) : JSON.stringify(o.output),
            })),
        });
    }

    async getThreadMessages(threadId: string, limit: number = 20): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
        const messages = await this.openai.beta.threads.messages.list(threadId, {
            order: 'asc',
            limit,
        });

        return messages.data
            .filter(msg => msg.content[0].type === 'text')
            .map(msg => ({
                role: msg.role as 'user' | 'assistant' | 'system',
                content: (msg.content[0] as any).text.value,
            }));
    }

    async getAssistantConfig(assistantId?: string): Promise<{ instructions: string; tools?: any[]; mcpConnections?: string[] }> {
        const id = assistantId || process.env.OPENAI_ASSISTANT_ID;
        
        if (!id) {
            return {
                instructions: profileJohn.instructions,
                tools: profileJohn.tools.map(t => ({
                    type: 'function' as const,
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })),
            };
        }

        const assistant = await this.openai.beta.assistants.retrieve(id);
        return {
            instructions: assistant.instructions || profileJohn.instructions,
            tools: assistant.tools || [],
            // MCP non supporté dans legacy API
            mcpConnections: [],
        };
    }
}



