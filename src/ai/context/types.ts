export type UserContext = {
  userId: string;
  tenantId?: string;
  roles: string[];
  permissions: string[];
};

export type ConversationContext = {
  conversationId: string;
  channel: 'chat' | 'realtime';
  memorySummary?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  facts?: string[];
};

export type ToolPermissionMap = Record<string, string>; // toolName -> requiredPermission


