import { prisma, computeCost } from '../db/prisma';

/**
 * Résout l'ID réel d'un tenant à partir de son slug ou ID
 * @param tenantIdOrSlug - L'ID ou le slug du tenant (ex: "reccos")
 * @returns L'ID réel du tenant dans la base de données, ou le slug si non trouvé
 */
async function resolveTenantId(tenantIdOrSlug?: string): Promise<string | undefined> {
  if (!tenantIdOrSlug) return undefined;
  
  // Chercher d'abord par slug (cas le plus courant)
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { slug: tenantIdOrSlug },
        { id: tenantIdOrSlug },
      ],
    },
    select: { id: true },
  });
  
  return tenant?.id || tenantIdOrSlug;
}

export async function logUserUsage(params: {
  userId: string;
  tenantId?: string;
  channel: 'chat' | 'realtime';
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const { userId, channel, model, promptTokens, completionTokens } = params;
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);
  const cost = computeCost(model, promptTokens || 0, completionTokens || 0);
  
  // Résoudre l'ID réel du tenant (convertir slug → ID si nécessaire)
  const resolvedTenantId = await resolveTenantId(params.tenantId);

  await prisma.userUsage.upsert({
    where: { id: `${userId}-${channel}` },
    update: {
      lastSeen: new Date(),
      requests: { increment: 1 },
      tokensIn: { increment: promptTokens || 0 },
      tokensOut: { increment: completionTokens || 0 },
      totalTokens: { increment: totalTokens },
      totalCost: { increment: cost },
      // IMPORTANT: Mettre à jour le tenantId s'il a changé ou n'était pas défini
      tenantId: resolvedTenantId,
    },
    create: {
      id: `${userId}-${channel}`,
      userId,
      tenantId: resolvedTenantId,
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




