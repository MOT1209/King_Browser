/**
 * Google refuses sign-in from embedded browsers ("Couldn't sign you in — This
 * browser or app may not be secure"). By default King Browser offers to
 * continue in the user's default browser, as RFC 8252 recommends for native
 * apps. The opt-in "Google sign-in compatibility" setting instead presents a
 * Firefox user agent on accounts.google.com only (the approach other Electron
 * browsers use); Google can stop accepting it at any time.
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

/** True for pages on Google's account host, where the compatibility user agent applies. */
export function isGoogleAccountsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === GOOGLE_ACCOUNTS_HOST;
  } catch {
    return false;
  }
}

// Firefox 140 shipped on 2025-06-24 and Firefox releases every four weeks.
// Deriving the version from the date keeps the user agent current, so Google
// does not reject it as an outdated browser.
const FIREFOX_BASE_VERSION = 140;
const FIREFOX_BASE_RELEASE_MS = Date.UTC(2025, 5, 24);
const FIREFOX_RELEASE_INTERVAL_MS = 28 * 24 * 60 * 60 * 1000;

export function currentFirefoxVersion(now: number = Date.now()): number {
  const elapsed = Math.max(0, now - FIREFOX_BASE_RELEASE_MS);
  return FIREFOX_BASE_VERSION + Math.floor(elapsed / FIREFOX_RELEASE_INTERVAL_MS);
}

/** Firefox user agent for the host OS, used on accounts.google.com when the setting is on. */
export function getGoogleSigninCompatUserAgent(platform: string = process.platform, now: number = Date.now()): string {
  const v = currentFirefoxVersion(now);
  const os = platform === 'win32'
    ? 'Windows NT 10.0; Win64; x64'
    : platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10.15'
      : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}
