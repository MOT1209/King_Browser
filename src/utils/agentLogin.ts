/**
 * Agent sign-in with a saved account (`browser_login`).
 *
 * The agent never receives the credential: `resolveLoginCredential` runs in the
 * renderer, `buildLoginFillScript` is executed inside the guest page, and the
 * only thing handed back to the agent is `describeLoginResult` (masked name).
 */
import { matchSavedCredentials, maskUsername, type SavedCredential } from './passwordMatch';

export type LoginResolution =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string };

export function resolveLoginCredential(
  records: readonly SavedCredential[],
  pageUrl: string,
  requestedUsername?: string,
  expectedOrigin?: string
): LoginResolution {
  let parsed: URL;
  try { parsed = new URL(pageUrl); } catch { return { ok: false, error: 'Error: Cannot read the current page address.' }; }
  // The approval named a site; if the page moved since, the approval no longer applies.
  if (!expectedOrigin || expectedOrigin !== parsed.origin) {
    return { ok: false, error: 'Error: The page changed since you were asked. Sign-in cancelled; ask again on the current page.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Error: Sign-in with a saved account is only allowed on HTTPS pages.' };
  }
  const matches = matchSavedCredentials(records, parsed.origin, parsed.hostname);
  if (matches.length === 0) {
    return { ok: false, error: 'Error: No saved account for this site. Ask the user to save one in Settings → Passwords, or to sign in themselves.' };
  }
  let chosen = matches[0];
  if (requestedUsername) {
    const found = matches.find(m => m.username === requestedUsername);
    if (!found) {
      return { ok: false, error: `Error: No saved account with that username. Available: ${matches.map(m => maskUsername(m.username as string)).join(', ')}` };
    }
    chosen = found;
  } else if (matches.length > 1) {
    return { ok: false, error: `Error: Several saved accounts for this site (${matches.map(m => maskUsername(m.username as string)).join(', ')}). Ask the user which one, then pass 'username'.` };
  }
  return { ok: true, username: chosen.username as string, password: chosen.password as string };
}

/** Runs inside the guest page. Returns { success, error?, filledUsername? }; never the values. */
export function buildLoginFillScript(username: string, password: string): string {
  return `
(() => {
  try {
    const visible = el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const pw = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
    if (!pw) return { success: false, error: 'No visible password field on this page (two-step sign-in pages that ask for the username first are not supported yet).' };
    const scope = pw.form || document;
    let user = null;
    for (const input of Array.from(scope.querySelectorAll('input'))) {
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'email', 'tel'].includes(type) || !visible(input)) continue;
      if (input.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) user = input;
    }
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (user) setValue(user, ${JSON.stringify(username)});
    setValue(pw, ${JSON.stringify(password)});
    const form = pw.form;
    const button = form && form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (button) button.click();
    else if (form && form.requestSubmit) form.requestSubmit();
    else pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { success: true, filledUsername: Boolean(user) };
  } catch (err) {
    return { success: false, error: 'Sign-in form error: ' + String(err && err.message || err).slice(0, 120) };
  }
})()`;
}

export function describeLoginResult(result: unknown, username: string): string {
  const r = result as { success?: boolean; error?: string; filledUsername?: boolean } | null;
  if (r && r.success) {
    return `Submitted the sign-in form for ${maskUsername(username)}${r.filledUsername ? '' : ' (no username field found; only the password was filled)'}. Use browser_read_page to confirm it worked.`;
  }
  return `Error: ${r?.error ?? 'Sign-in failed.'}`;
}

/** Script for browser_read_page: is a sign-in form visible? Contains no page data. */
export const LOGIN_REQUIRED_PROBE = `Array.from(document.querySelectorAll('input[type="password"]')).some(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; })`;
