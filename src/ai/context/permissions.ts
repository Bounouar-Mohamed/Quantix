import { ToolSchema } from '../modelProfile';
import { ToolPermissionMap, UserContext } from './types';

// Map tool -> required permission key
const REQUIRED_PERMISSIONS: ToolPermissionMap = {
  create_automation: 'automation:create',
  analyze_client: 'client:analyze',
  log_to_crm: 'crm:write',
  web_search: 'web:search',
  web_open: 'web:open',
};

export function filterToolsByPermissions(
  tools: ToolSchema[],
  user: UserContext
): ToolSchema[] {
  return tools.filter((t) => canExecuteTool(t.name, user));
}

export function canExecuteTool(toolName: string, user: UserContext): boolean {
  const required = REQUIRED_PERMISSIONS[toolName];
  // Autoriser explicitement les outils web si activés par configuration
  if ((toolName === 'web_search' || toolName === 'web_open') && process.env.WEB_SEARCH_ENABLED === 'true') {
    return true;
  }
  if (!required) return true; // if no mapping, allow by default
  return user.permissions.includes(required);
}


