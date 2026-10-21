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
