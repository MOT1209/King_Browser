import assert from 'node:assert/strict';
import { isAllowedWebviewPartition, evaluateWebviewSrc } from '../electron/main/webviewPolicy';

/**
 * The rules deciding which partition and which src a <webview> may attach with
 * lived inline in the will-attach-webview handler in main.ts, reachable only
 * through a running app. Prevents: a page or compromised renderer attaching a
 * guest to an arbitrary persistent partition (for example persist:admin), a
 * file:/javascript:/data: src, a credential-bearing src, an uninstalled
 * extension id, or a lookalike host receiving the Chrome Web Store preload.
 */

console.log('\n--- Webview attach policy ---');

const AGENT = 'persist:king-agent';

// Partitions
assert.equal(isAllowedWebviewPartition('', AGENT), true, 'the default (empty) partition is allowed');
assert.equal(isAllowedWebviewPartition(AGENT, AGENT), true, 'the agent partition is allowed');
assert.equal(isAllowedWebviewPartition('incognito-abc_12-X', AGENT), true, 'incognito partitions are allowed');
for (const bad of ['persist:admin', 'persist:king-agent2', 'incognito-', 'incognito-a b', 'incognito-a/b', 'incognito-../x', 'Incognito-abc', ' incognito-abc', 'incognito-abc\n', 'partition']) {
  assert.equal(isAllowedWebviewPartition(bad, AGENT), false, `partition ${JSON.stringify(bad)} is refused`);
}

// src
const none = () => false;
const installed = (id: string) => id === 'abcdefghijklmnop';
assert.deepEqual(evaluateWebviewSrc('https://example.com/', none), { allowed: true, isWebstore: false });
assert.deepEqual(evaluateWebviewSrc('http://example.com/', none), { allowed: true, isWebstore: false });
assert.deepEqual(evaluateWebviewSrc('about:blank', none), { allowed: true, isWebstore: false });
assert.deepEqual(evaluateWebviewSrc('chrome-extension://abcdefghijklmnop/page.html', installed), { allowed: true, isWebstore: false });
for (const bad of [
  'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'blob:https://example.com/id',
  'about:srcdoc', 'about:config', 'ftp://example.com/', 'https://user:pw@example.com/', 'https://user@example.com/',
  'chrome-extension://notinstalled/page.html', 'chrome-extension://abc.def/page.html', 'not a url', ''
]) {
  if (bad === '') continue; // an absent src is handled by the caller (nothing to validate)
  assert.equal(evaluateWebviewSrc(bad, installed).allowed, false, `src ${JSON.stringify(bad)} is refused`);
}

// Web Store preload only for the real Web Store origins.
assert.equal(evaluateWebviewSrc('https://chromewebstore.google.com/detail/x', none).isWebstore, true);
assert.equal(evaluateWebviewSrc('https://chrome.google.com/webstore/detail/x', none).isWebstore, true);
assert.equal(evaluateWebviewSrc('https://chrome.google.com/other', none).isWebstore, false, 'chrome.google.com outside /webstore/ is not the store');
assert.equal(evaluateWebviewSrc('http://chromewebstore.google.com/detail/x', none).isWebstore, false, 'http is not the store');
assert.equal(evaluateWebviewSrc('https://chromewebstore.google.com.evil.example/', none).isWebstore, false, 'lookalike host is not the store');
assert.equal(evaluateWebviewSrc('https://evilchromewebstore.google.com/', none).isWebstore, false, 'sibling host is not the store');

// Static guard: the handler must use the shared policy instead of private copies.
import fs from 'node:fs';
import path from 'node:path';
const main = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf8');
assert.ok(main.includes('isAllowedWebviewPartition('), 'main.ts uses isAllowedWebviewPartition');
assert.ok(main.includes('evaluateWebviewSrc('), 'main.ts uses evaluateWebviewSrc');
assert.ok(!main.includes("/^incognito-[a-zA-Z0-9_-]+$/.test(part)"), 'main.ts has no private copy of the partition regexp');

console.log('[PASS] Webview attach policy');
