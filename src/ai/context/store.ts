import { ConversationContext } from './types';

const conversationStore = new Map<string, ConversationContext>();

export function getOrCreateConversation(
  conversationId: string,
  channel: 'chat' | 'realtime'
): ConversationContext {
  const existing = conversationStore.get(conversationId);
  if (existing) {
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const ctx: ConversationContext = {
    conversationId,
    channel,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    facts: [],
  };
  conversationStore.set(conversationId, ctx);
  return ctx;
}

export function incrementMessageCount(conversationId: string): void {
  const ctx = conversationStore.get(conversationId);
  if (!ctx) return;
  ctx.messageCount += 1;
  ctx.updatedAt = new Date().toISOString();
}

export function setMemorySummary(conversationId: string, summary: string): void {
  const ctx = conversationStore.get(conversationId);
  if (!ctx) return;
  ctx.memorySummary = summary;
  ctx.updatedAt = new Date().toISOString();
}

export function appendFact(conversationId: string, note: string): void {
  const ctx = conversationStore.get(conversationId);
  if (!ctx) return;
  const trimmed = (note || '').trim();
  if (!trimmed) return;
  ctx.facts = ctx.facts || [];
  // de-dup simple
  if (!ctx.facts.includes(trimmed)) {
    ctx.facts.push(trimmed);
  }
  // cap to last 10
  if (ctx.facts.length > 10) ctx.facts = ctx.facts.slice(-10);
  // refresh summary from facts
  ctx.memorySummary = `Known user facts (recent):\n- ${ctx.facts.join('\n- ')}`;
  ctx.updatedAt = new Date().toISOString();
}

export function getConversation(conversationId: string): ConversationContext | undefined {
  return conversationStore.get(conversationId);
}


