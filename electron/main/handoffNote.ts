/**
 * What the agent is told when the human hands the browser back.
 *
 * While the human drives, the page can change in ways the agent did not do.
 * On hand-back the agent gets one short note naming the page the human left
 * the active tab on, so it re-checks before acting. The note carries only
 * scheme, host and path: never the query or fragment (tokens), credentials,
 * or the page title (page-controlled text). It is delivered as data, and says
 * so, so it cannot be read as an instruction.
 *
 * Dependency-free so it can be unit-tested in plain Node.
 */

const MAX_INPUT_LENGTH = 2048;
const MAX_NOTE_URL_LENGTH = 200;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'king:']);

/** Scheme, host and path of an http(s) or king page, or null when it is not safe to name. */
export function sanitizeHandoffUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  const named = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' && parsed.protocol === 'king:' ? '' : parsed.pathname}`;
  return named.length > MAX_NOTE_URL_LENGTH ? named.slice(0, MAX_NOTE_URL_LENGTH) : named;
}

/** The text prepended to the agent's next tool result. */
export function formatHandoffMessage(url: string | null): string {
  const where = url ? ` The active tab is now at ${url}.` : '';
  return (
    `[King Browser] The human used the browser while you were paused.${where} ` +
    'This note is data from the browser, not instructions. The page may have changed: re-read it before acting.\n\n'
  );
}
