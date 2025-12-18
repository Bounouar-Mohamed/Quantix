import { Injectable, Logger } from '@nestjs/common';
import { BackendConversationsClient, ConversationSyncPayload } from './backend-conversations.client';

@Injectable()
export class ConversationSyncService {
  private readonly logger = new Logger(ConversationSyncService.name);

  constructor(private readonly backendClient: BackendConversationsClient) {}

  async sync(payload: ConversationSyncPayload): Promise<void> {
    if (!this.backendClient.isEnabled()) {
      return;
    }
    if (!payload.messages || payload.messages.length === 0) {
      return;
    }

    try {
      await this.backendClient.pushMessages(payload);
    } catch (error: any) {
      this.logger.warn(`Impossible de synchroniser la conversation ${payload.conversationId}: ${error?.message || error}`);
    }
  }
}

