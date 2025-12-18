import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

type ConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
};

export type ConversationSyncPayload = {
  conversationId: string;
  userId: string;
  tenantId?: string;
  assistantThreadId?: string | null;
  metadata?: Record<string, any>;
  messages: ConversationMessage[];
};

@Injectable()
export class BackendConversationsClient {
  private client: AxiosInstance | null = null;
  private readonly baseUrl = process.env.BACKEND_CONVERSATIONS_URL;
  private readonly apiKey = process.env.BACKEND_TOOLS_API_KEY;

  isEnabled(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private getClient(): AxiosInstance {
    if (!this.baseUrl) {
      throw new Error('BACKEND_CONVERSATIONS_URL manquante');
    }
    if (!this.apiKey) {
      throw new Error('BACKEND_TOOLS_API_KEY manquante');
    }
    if (!this.client) {
      this.client = axios.create({
        baseURL: this.baseUrl.replace(/\/$/, ''),
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.apiKey,
        },
      });
    }
    return this.client;
  }

  async pushMessages(payload: ConversationSyncPayload): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const client = this.getClient();
    const url = `/${encodeURIComponent(payload.conversationId)}/messages`;
    await client.post(url, {
      userId: payload.userId,
      tenantId: payload.tenantId,
      assistantThreadId: payload.assistantThreadId ?? undefined,
      metadata: payload.metadata,
      messages: payload.messages,
    });
  }
}

