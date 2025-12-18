const KEY_CHARS = 'A-Za-z0-9._-';
const ID_CHARS = 'A-Za-z0-9_-';

const SENSITIVE_PATTERNS: RegExp[] = [
  new RegExp(`sk-[${KEY_CHARS}]{16,}`, 'gi'),
  new RegExp(`rk-[${KEY_CHARS}]{16,}`, 'gi'),
  new RegExp(`ek_[${KEY_CHARS}]{16,}`, 'gi'),
  new RegExp(`Bearer\\s+[${KEY_CHARS}]+`, 'gi'),
  new RegExp(`AIza[${KEY_CHARS}]{20,}`, 'gi'),
  new RegExp(`conv_[${ID_CHARS}]+`, 'gi'),
  new RegExp(`thread_[${ID_CHARS}]+`, 'gi'),
  new RegExp(`sess_[${ID_CHARS}]+`, 'gi'),
  new RegExp(`run_[${ID_CHARS}]+`, 'gi'),
  new RegExp(`asst_[${ID_CHARS}]+`, 'gi'),
];

let isConfigured = false;

function sanitizeString(value: string): string {
  let sanitized = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  if (sanitized.length > 500) {
    return `${sanitized.slice(0, 500)}…[truncated]`;
  }
  return sanitized;
}

function serializeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'string') {
    return arg;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function sanitizeArgs(args: unknown[]): string[] {
  return args.map((arg) => sanitizeString(serializeArg(arg)));
}

type SafeConsoleOptions = {
  force?: boolean;
  sink?: (level: 'log' | 'warn' | 'error', payload: string[]) => void;
};

export function configureSafeConsole(options?: SafeConsoleOptions): void {
  if (isConfigured && !options?.force) {
    return;
  }
  isConfigured = true;

  const verboseLogs = process.env.LOG_VERBOSE === 'true';
  const sink = options?.sink;

  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (!verboseLogs) {
      return;
    }
    const sanitized = sanitizeArgs(args);
    sink?.('log', sanitized);
    originalLog(...sanitized);
  };

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const sanitized = sanitizeArgs(args);
    sink?.('warn', sanitized);
    originalWarn(...sanitized);
  };

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const sanitized = sanitizeArgs(args);
    sink?.('error', sanitized);
    originalError(...sanitized);
  };
}

