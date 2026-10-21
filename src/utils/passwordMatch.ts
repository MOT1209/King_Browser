/**
 * Which saved credentials may be released to the page at `actualOrigin`.
 *
 * One rule for both the autofill menu and the agent's `browser_login`, so the
 * agent can never reach a credential the human autofill would refuse.
 */
export interface SavedCredential {
  origin?: string;
  hostname?: string;
  username?: string;
  password?: string;
}

export function matchSavedCredentials<T extends SavedCredential>(
  all: readonly T[],
  actualOrigin: string,
  actualHostname: string
): T[] {
  return all.filter(p => {
    if (!p || !p.username || !p.password) return false;
    // 1. Exact origin match
    if (p.origin) return p.origin === actualOrigin;
    // 2. Legacy record without origin: never release HTTPS-saved credentials to
    // plain HTTP, and only on standard HTTPS (port 443) of that hostname.
    if (actualOrigin.startsWith('http://')) return false;
    if (actualOrigin.startsWith('https://') && p.hostname === actualHostname) {
      try {
        const parsed = new URL(actualOrigin);
        if (!parsed.port || parsed.port === '443') return true;
      } catch (_) {}
    }
    return false;
  });
}

/** "jane.doe@example.com" → "j***@example.com"; shown to the agent instead of the real name. */
export function maskUsername(username: string): string {
  const at = username.indexOf('@');
  if (at > 0) return `${username[0]}***${username.slice(at)}`;
  return username.length > 1 ? `${username[0]}***` : '***';
}
