/**
 * Recent console output per tab, for the agent's browser_console_messages
 * tool. Kept in memory only, capped per tab, and scrubbed of the credential
 * shapes pages most often log by accident.
 */
export type ConsoleLevel = 'log' | 'warning' | 'error';

export interface ConsoleEntry {
  level: ConsoleLevel;
  message: string;
  source: string;
  line: number;
  time: number;
}

const MAX_ENTRIES_PER_TAB = 200;
const MAX_MESSAGE_CHARS = 1000;
const buffers = new Map<string, ConsoleEntry[]>();

/** Electron reports either a numeric level (0-3) or a name, depending on version. */
export function normalizeConsoleLevel(level: unknown): ConsoleLevel {
  if (level === 3 || level === 'error') return 'error';
  if (level === 2 || level === 'warning' || level === 'warn') return 'warning';
  return 'log';
}

export function redactConsoleText(text: string): string {
  return text
    .replace(/(password|passwd|token|secret|api[_-]?key|authorization|cookie)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]');
}

/** Drops the query string and fragment, where pages tend to put tokens. */
function stripUrlSecrets(source: string): string {
  try {
    const parsed = new URL(source);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

export function recordConsoleMessage(tabId: string, entry: { level: unknown; message: unknown; source?: unknown; line?: unknown }): void {
  if (!tabId) return;
  const list = buffers.get(tabId) ?? [];
  list.push({
    level: normalizeConsoleLevel(entry.level),
    message: redactConsoleText(String(entry.message ?? '')).slice(0, MAX_MESSAGE_CHARS),
    source: stripUrlSecrets(String(entry.source ?? '')),
    line: Number(entry.line) || 0,
    time: Date.now()
  });
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB);
  buffers.set(tabId, list);
}

export function getConsoleMessages(tabId: string, minLevel: 'all' | 'warning' | 'error' = 'all', limit = 50): ConsoleEntry[] {
  const rank: Record<ConsoleLevel, number> = { log: 0, warning: 1, error: 2 };
  const min = minLevel === 'error' ? 2 : minLevel === 'warning' ? 1 : 0;
  const cap = Math.min(MAX_ENTRIES_PER_TAB, Math.max(1, Math.floor(Number(limit) || 50)));
  return (buffers.get(tabId) ?? []).filter(e => rank[e.level] >= min).slice(-cap);
}

/** A new document starts with an empty console, as in DevTools. */
export function clearConsoleMessages(tabId: string): void {
  buffers.delete(tabId);
}
