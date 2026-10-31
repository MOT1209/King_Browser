import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isSafeSubframeNavigation } from '../electron/main/windowOpenPolicy';

/**
 * 1. Sign-in popups (OAuth) were allowed as real child windows but, unlike
 *    webviews, had no will-navigate / will-redirect guard, so a popup could be
 *    navigated to a phishing domain or a non-web scheme. Prevents: a popup
 *    navigating to file:, javascript:, credential-bearing URLs or a known
 *    phishing host.
 * 2. guest-preload.ts forwarded password/login messages to the host on any
 *    event, including events a page script created with dispatchEvent(). Page
 *    script could forge password-form-submitted / login-field-focused /
 *    king-link-hover. Prevents: synthetic events reaching the host bridge.
 */

console.log('\n--- Popup navigation guard and guest-preload event trust ---');

assert.equal(isSafeSubframeNavigation('https://accounts.example.com/o/oauth2'), true);
assert.equal(isSafeSubframeNavigation('about:blank'), true);
assert.equal(isSafeSubframeNavigation('file:///etc/passwd'), false);
assert.equal(isSafeSubframeNavigation('javascript:alert(1)'), false);
assert.equal(isSafeSubframeNavigation('https://user:pw@example.com/'), false);

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
const start = main.indexOf("contents.on('did-create-window', (child) => {");
assert.ok(start > 0, 'did-create-window hardening still exists');
const end = main.indexOf("if (contents.getType() === 'webview')", start);
const block = main.slice(start, end);
for (const ev of ['will-navigate', 'will-redirect']) {
  assert.ok(block.includes(`child.webContents.on('${ev}'`), `popups are guarded on ${ev}`);
}
assert.ok(block.includes('isSafeSubframeNavigation('), 'popup navigations are limited to safe schemes');
assert.ok(block.includes('checkPhishingDomain('), 'popup navigations are checked against phishing domains');

const preload = fs.readFileSync(path.join(root, 'electron/guest-preload.ts'), 'utf8');
for (const ev of ['input', 'submit', 'keydown', 'click', 'focusin', 'mouseover']) {
  const re = new RegExp(`document\\.addEventListener\\('${ev}', \\(e\\) => \\{\\s*\\n\\s*if \\(!e\\.isTrusted\\) return;`);
  assert.match(preload, re, `guest-preload ignores untrusted '${ev}' events`);
}

console.log('[PASS] Popup navigation guard and guest-preload event trust');
