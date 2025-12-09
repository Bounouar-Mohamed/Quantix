import { prisma, computeCost } from '../db/prisma';

export async function logUserUsage(params: {
  userId: string;
  tenantId?: string;
  channel: 'chat' | 'realtime';
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const { userId, tenantId, channel, model, promptTokens, completionTokens } = params;
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);
  const cost = computeCost(model, promptTokens || 0, completionTokens || 0);

  await prisma.userUsage.upsert({
    where: { id: `${userId}-${channel}` },
    update: {
      lastSeen: new Date(),
      requests: { increment: 1 },
      tokensIn: { increment: promptTokens || 0 },
      tokensOut: { increment: completionTokens || 0 },
      totalTokens: { increment: totalTokens },
      totalCost: { increment: cost },
    },
    create: {
      id: `${userId}-${channel}`,
      userId,
      tenantId,
      channel,
      requests: 1,
      tokensIn: promptTokens || 0,
      tokensOut: completionTokens || 0,
      totalTokens,
      totalCost: cost,
    },
  });
}

export async function logSessionStart(params: {
  sessionId?: string;
  conversationId?: string;
  userId: string;
  model: string;
  channel: 'chat' | 'realtime';
}) {
  const { sessionId, conversationId, userId, model, channel } = params;
  await prisma.sessionUsage.create({
    data: { sessionId, conversationId, userId, model, channel, startAt: new Date() },
  });
}

export async function logSessionEnd(params: {
  sessionId?: string;
  conversationId?: string;
  tokensIn?: number;
  tokensOut?: number;
  model: string;
}) {
  const { sessionId, conversationId, tokensIn = 0, tokensOut = 0, model } = params;
  const totalCost = computeCost(model, tokensIn, tokensOut);
  await prisma.sessionUsage.updateMany({
    where: { OR: [{ sessionId }, { conversationId }] },
    data: { endAt: new Date(), tokensIn, tokensOut, totalCost },
  });
}

export async function logEvent(params: {
  userId?: string;
  sessionId?: string;
  type: string;
  meta?: any;
}) {
  await prisma.eventUsage.create({
    data: { userId: params.userId, sessionId: params.sessionId, type: params.type, meta: params.meta },
  });
}




