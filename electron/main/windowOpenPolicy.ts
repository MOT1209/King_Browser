/**
 * Sign-in popups ("Sign in with GitHub/Google", Clerk/Auth0/Firebase popup
 * mode) need a real child window: they talk back to the opener through
 * window.opener / postMessage and close themselves. They used to be denied and
 * reopened as an unrelated tab, so the opener never got the result and the
 * sign-in hung. Ordinary target=_blank links keep opening as tabs.
 *
 * The rate limiter and the tab routing stay in main.ts's setWindowOpenHandler;
 * this only answers "real popup window or not".
 */
export function shouldOpenAsPopupWindow(url: string, disposition: string): boolean {
  if (disposition !== 'new-window') return false;
  try {
    const parsed = new URL(url);
    // Popup libraries often open about:blank first and set the location after.
    if (parsed.href === 'about:blank') return true;
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** Storage Access API permissions used by embedded sign-in frames. */
export function isStorageAccessPermission(permission: string): boolean {
  return permission === 'storage-access' || permission === 'top-level-storage-access';
}

/**
 * Hosts whose embedded sign-in widgets may receive unpartitioned storage
 * without a prompt. The list is explicit rather than suffix-matched on
 * purpose: allowing "google.com" would cover every other Google subdomain,
 * and a lookalike such as "accounts.google.com.example" is rejected by the
 * exact hostname comparison.
 */
const IDENTITY_PROVIDER_HOSTS: ReadonlySet<string> = new Set([
  'accounts.google.com',
  'accounts.youtube.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'github.com',
  'www.facebook.com',
  'web.facebook.com',
  'www.linkedin.com',
]);

/**
 * True when a frame may use the Storage Access API without asking the user.
 * Everything else falls back to the normal permission prompt, so an unknown
 * third-party frame cannot silently obtain unpartitioned cookie access.
 * HTTPS is required: a plaintext origin cannot prove it is the provider.
 */
export function isAllowedStorageAccessOrigin(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    return IDENTITY_PROVIDER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Restricts subframe navigation strictly to safe schemes: http:, https:, and about:blank.
 */
export function isSafeSubframeNavigation(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const isSafeHttp = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
    const isSafeAboutBlank = parsed.protocol === 'about:' && (parsed.pathname === 'blank' || parsed.href === 'about:blank');
    return isSafeHttp || isSafeAboutBlank;
  } catch {
    return false;
  }
}
