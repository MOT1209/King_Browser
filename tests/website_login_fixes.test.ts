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

// 4. A sign-in popup must stay in the session that opened it. Returning a
//    `webPreferences` override REPLACES the inherited one, and a popup without
//    an explicit session lands on the default session - so an incognito tab's
//    OAuth popup could read the normal profile's cookies.
assert.match(main, /session: contents\.session/,
  'the popup override pins the opener session');
assert.match(main, /did-create-window'[\s\S]{0,700}?child\.webContents\.session !== contents\.session/,
  'a popup that did not inherit the opener session is closed instead of used');
assert.match(main, /did-create-window'[\s\S]{0,900}?child\.webContents\.setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/,
  'a sign-in popup cannot open further windows');
assert.doesNotMatch(main, /nativeWindowOpen/,
  'native window open is never disabled: window.opener and postMessage depend on it');
console.log('[PASS] [LoginFix] popup session inheritance, no popup chains, window.opener preserved');

// 5. The Google rejection escape hatch must reach popups and iframes. Popups are
//    type 'window', and the rejection usually arrives in a subframe, which
//    'did-navigate' never reports.
assert.match(main, /wcType === 'webview' \|\| wcType === 'window'/,
  'OAuth popup windows are watched for a Google rejection');
assert.match(main, /on\('did-frame-navigate'[\s\S]{0,120}?onNavigate\(/,
  'iframe-based rejections reach the fallback');
assert.match(main, /if \(isStorageAccessPermission\(permission\) && !isTrustedAppOrigin\(url\)\) \{\s*return callback\(true\);/,
  'a storage-access REQUEST from an embedded sign-in frame is answered silently');
assert.match(main, /isStorageAccessPermission\(permission\) && !isTrustedAppOrigin\(requestingOrigin\)\) return true;/,
  'the storage-access CHECK reports the access third-party cookies already give');
assert.match(main, /'storage-access': 'Storage Access/,
  'storage access has a human-readable permission label');
console.log('[PASS] [LoginFix] Google fallback covers popups and iframes; storage access is labelled');

// 6. Auth failures that need a different action than "try again" carry their
//    own copy: an address that already has an account points at sign-in, and an
//    unconfirmed address points at the confirmation link instead of blaming the
//    password.
const sync = fs.readFileSync('src/services/syncService.ts', 'utf8');
assert.match(sync, /if \(isExistingAccountError\(err\)\) \{\s*throw new Error\('An account with this email already exists\. Sign in instead\.'\);/,
  'registering an existing account points at sign-in instead of a retry');
assert.match(sync, /if \(isUnconfirmedEmailError\(err\)\) throw new EmailVerificationRequiredError\(normalizedEmail\);/,
  'an unconfirmed login asks for the confirmation link instead of blaming the password');
// 7. Password recovery is wired to Supabase's resetPasswordForEmail, and the
//    AccountModal disconnect now performs a real logout instead of only
//    clearing local UI state.
assert.match(sync, /public async requestPasswordReset\(email: string\): Promise<void>/,
  'syncService exposes requestPasswordReset');
assert.match(sync, /supabase\.auth\.resetPasswordForEmail\(normalizedEmail\)/,
  'password recovery uses Supabase resetPasswordForEmail');
const accountModal = fs.readFileSync('src/components/AccountModal.tsx', 'utf8');
assert.match(accountModal, /await syncService\.logout\(\);/,
  'AccountModal disconnect performs a real logout');
console.log('[PASS] [LoginFix] password recovery and real logout are wired');
