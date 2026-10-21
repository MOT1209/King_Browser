/**
 * Google refuses sign-in from embedded browsers ("Couldn't sign you in — This
 * browser or app may not be secure"). King Browser does not try to evade that
 * check. Instead it offers to continue in the user's default browser, as
 * RFC 8252 recommends for native apps.
 */

const GOOGLE_ACCOUNTS_HOST = 'accounts.google.com';

/**
 * True for Google's rejection page. The path (`/signin/rejected`, with or
 * without the `/v3` prefix) is matched loosely because Google versions it.
 */
export function isGoogleEmbeddedSigninRejection(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      parsed.hostname === GOOGLE_ACCOUNTS_HOST &&
      /\/signin\/rejected(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Only plain web pages without embedded credentials go to the system browser. */
export function canOpenInSystemBrowser(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * The page to reopen after a rejection: the site the user was signing in to,
 * where "Sign in with Google" works in a regular browser. Falls back to
 * Google's own sign-in page.
 */
export function pickSystemBrowserUrl(previousUrl: string | null | undefined): string {
  if (previousUrl && canOpenInSystemBrowser(previousUrl)) {
    try {
      if (new URL(previousUrl).hostname !== GOOGLE_ACCOUNTS_HOST) return previousUrl;
    } catch {}
  }
  return `https://${GOOGLE_ACCOUNTS_HOST}/`;
}
