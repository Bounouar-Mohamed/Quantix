import { ModelProfile } from '../modelProfile';
import { ConversationContext, UserContext } from './types';
import { filterToolsByPermissions } from './permissions';

export function buildUserContextFromRequest(req: any): UserContext {
  const rolesHeader = (req.headers['user-roles'] as string) || '';
  const permsHeader = (req.headers['user-permissions'] as string) || '';
  return {
    userId: (req.headers['user-id'] as string) || req.body?.userId || 'anonymous',
    tenantId: (req.headers['tenant-id'] as string) || req.body?.tenantId,
    roles: rolesHeader ? rolesHeader.split(',').map((s) => s.trim()).filter(Boolean) : [],
    permissions: permsHeader ? permsHeader.split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

export function buildSystemPrompt(
  profile: ModelProfile,
  user: UserContext,
  conv: ConversationContext
): string {
  const header = profile.instructions;
  const persona = [
    'Persona:',
    '- Name: John (AI assistant for John Taylor Dubai).',
    '- Mission: Help real estate agents with daily tasks and closing clients.',
  ].join('\n');
  const audience = `User: ${user.userId} (tenant: ${user.tenantId || 'n/a'}). Roles: ${user.roles.join(', ') || 'none'}.`;
  const perms = `Permissions: ${user.permissions.join(', ') || 'none'} (actions are gated server-side).`;
  const convInfo = `Conversation: id=${conv.conversationId} channel=${conv.channel} messages=${conv.messageCount}`;
  const memory = conv.memorySummary ? `Memory summary:\n${conv.memorySummary}` : '';
  return [header, persona, audience, perms, convInfo, memory].filter(Boolean).join('\n\n');
}

export function buildAllowedTools(profile: ModelProfile, user: UserContext) {
  return filterToolsByPermissions(profile.tools, user);
}


