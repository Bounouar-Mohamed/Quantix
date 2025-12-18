import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ModelProfile } from '../modelProfile';
import { ConversationContext, UserContext } from './types';
import { filterToolsByPermissions } from './permissions';
import { ensureIdentifier, ensureOptionalIdentifier } from '../../common/utils/identifiers';

const USER_CONTEXT_HEADER = 'x-user-context';
const USER_CONTEXT_SIGNATURE_HEADER = 'x-user-context-signature';

function parseSignedUserContext(req: any): UserContext {
  const encoded = req.headers[USER_CONTEXT_HEADER] as string | undefined;
  const signature = req.headers[USER_CONTEXT_SIGNATURE_HEADER] as string | undefined;
  const secret = process.env.USER_CONTEXT_SECRET;

  if (!secret) {
    throw new UnauthorizedException('Signature user context non configurée');
  }

  if (!encoded || !signature) {
    throw new UnauthorizedException('User context signé manquant');
  }

  const expected = createHmac('sha256', secret).update(encoded).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new UnauthorizedException('Signature user context invalide');
  }

  let payload: any;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    payload = JSON.parse(decoded);
  } catch (error) {
    throw new UnauthorizedException('User context illisible');
  }

  const roles = Array.isArray(payload?.roles)
    ? payload.roles.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
    : [];
  const permissions = Array.isArray(payload?.permissions)
    ? payload.permissions.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
    : [];

  return {
    userId: ensureIdentifier(payload?.userId, 'userId'),
    tenantId: ensureOptionalIdentifier(payload?.tenantId, 'tenantId'),
    roles,
    permissions,
  };
}

export function buildUserContextFromRequest(req: any): UserContext {
  if (process.env.USER_CONTEXT_SECRET) {
    return parseSignedUserContext(req);
  }

  const rolesHeader = (req.headers['user-roles'] as string) || '';
  const permsHeader = (req.headers['user-permissions'] as string) || '';
  return {
    userId: ensureIdentifier(
      (req.headers['user-id'] as string) || req.body?.userId || 'anonymous',
      'userId',
    ),
    tenantId: ensureOptionalIdentifier(
      (req.headers['tenant-id'] as string) || req.body?.tenantId,
      'tenantId',
    ),
    roles: rolesHeader ? rolesHeader.split(',').map((s) => s.trim()).filter(Boolean) : [],
    permissions: permsHeader ? permsHeader.split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

export function buildSystemPrompt(
  profile: ModelProfile,
  user: UserContext,
  conv: ConversationContext
): string {
  // Les instructions du profil contiennent déjà la personnalité (Noor ou John)
  const header = profile.instructions;
  
  // Contexte utilisateur
  const audience = `User: ${user.userId} (tenant: ${user.tenantId || 'n/a'}). Roles: ${user.roles.join(', ') || 'none'}.`;
  const perms = `Permissions: ${user.permissions.join(', ') || 'none'} (actions are gated server-side).`;
  
  // Contexte conversation
  const convInfo = `Conversation: id=${conv.conversationId} channel=${conv.channel} messages=${conv.messageCount}`;
  const memory = conv.memorySummary ? `Memory summary:\n${conv.memorySummary}` : '';
  
  return [header, audience, perms, convInfo, memory].filter(Boolean).join('\n\n');
}

export function buildAllowedTools(profile: ModelProfile, user: UserContext) {
  return filterToolsByPermissions(profile.tools, user);
}


