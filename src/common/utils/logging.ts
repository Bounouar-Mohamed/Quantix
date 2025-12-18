import { createHash } from 'crypto';

export function isVerboseLoggingEnabled(): boolean {
  return process.env.LOG_VERBOSE === 'true';
}

export function maskIdentifier(
  value?: string | null,
  label: string = 'id',
): string {
  if (!value) {
    return `${label}:n/a`;
  }
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return `${label}:${digest}`;
}

export function describeLength(value?: string | null): string {
  if (!value) {
    return '0 chars';
  }
  return `${value.length} chars`;
}


