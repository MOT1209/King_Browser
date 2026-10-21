import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isStorageAccessPermission, shouldOpenAsPopupWindow } from '../electron/main/windowOpenPolicy';

console.log('\n--- Website Login Fixes Suite ---');

// 1. Sign-in popups get a real window; links keep opening as tabs.
assert.equal(shouldOpenAsPopupWindow('https://github.com/login/oauth/authorize?client_id=x', 'new-window'), true,
  'window.open with features (OAuth popup) opens a real child window');
assert.equal(shouldOpenAsPopupWindow('about:blank', 'new-window'), true, 'popups that start at about:blank are allowed');
assert.equal(shouldOpenAsPopupWindow('http://localhost:3000/callback', 'new-window'), true);
assert.equal(shouldOpenAsPopupWindow('https://example.com/docs', 'foreground-tab'), false, 'target=_blank links stay tabs');
assert.equal(shouldOpenAsPopupWindow('https://example.com/', 'background-tab'), false);
for (const url of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,x', 'https://user:pass@example.com/', 'chrome-extension://abc/popup.html', 'not a url']) {
  assert.equal(shouldOpenAsPopupWindow(url, 'new-window'), false, `${url} never gets a popup window`);
}
console.log('[PASS] [LoginFix] sign-in popups open as real windows; everything else keeps the old routing');

// 2. Storage Access API permissions.
assert.equal(isStorageAccessPermission('storage-access'), true);
assert.equal(isStorageAccessPermission('top-level-storage-access'), true);
assert.equal(isStorageAccessPermission('media'), false);
assert.equal(isStorageAccessPermission('geolocation'), false);
console.log('[PASS] [LoginFix] storage-access permissions are recognised');

// 3. Regressions in the sources that broke every sign-in.
const browserView = fs.readFileSync('src/components/BrowserView.tsx', 'utf8');
assert.doesNotMatch(browserView, /<webview[\s\S]{0,400}?src=\{getSafeUrl\(tab\.url\)\}/,
  'the webview src must not follow tab.url (each change reloads the guest as a GET)');
assert.match(browserView, /<webview[\s\S]{0,600}?allowpopups=/, 'the webview allows popups');
assert.match(browserView, /!e\?\.isInPlace/, 'in-page navigations do not rewrite tab.url');

const guestPreload = fs.readFileSync('electron/guest-preload.ts', 'utf8');
assert.doesNotMatch(guestPreload, /Navigator\.prototype/,
  'the guest preload must not patch navigator (bot-detection signal)');

const main = fs.readFileSync('electron/main.ts', 'utf8');
assert.match(main, /setWindowOpenHandler\(\(\{ url, disposition \}\) => \{[\s\S]{0,900}?shouldOpenAsPopupWindow\(url, disposition\)/,
  'the guest window-open handler gives sign-in popups a real window');
assert.match(main, /isStorageAccessPermission\(permission\)/, 'the permission check answers storage access');
console.log('[PASS] [LoginFix] webview src, popups, preload and permission wiring');
