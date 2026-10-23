import assert from 'node:assert/strict';
import {
  isAllowedStorageAccessOrigin,
  isSafeSubframeNavigation,
  isStorageAccessPermission,
  shouldOpenAsPopupWindow,
} from '../electron/main/windowOpenPolicy';

assert.equal(shouldOpenAsPopupWindow('https://accounts.example/signin', 'new-window'), true);
assert.equal(shouldOpenAsPopupWindow('about:blank', 'new-window'), true);
assert.equal(shouldOpenAsPopupWindow('https://example.com', 'new-window'), true);
assert.equal(shouldOpenAsPopupWindow('https://example.com', 'foreground-tab'), false);
assert.equal(shouldOpenAsPopupWindow('javascript:alert(1)', 'new-window'), false);
assert.equal(shouldOpenAsPopupWindow('https://user:pass@example.com', 'new-window'), false);

assert.equal(isStorageAccessPermission('storage-access'), true);
assert.equal(isStorageAccessPermission('top-level-storage-access'), true);
assert.equal(isStorageAccessPermission('media'), false);

for (const url of ['https://example.com', 'http://localhost:3000', 'about:blank']) {
  assert.equal(isSafeSubframeNavigation(url), true, `${url} should be safe`);
}
for (const url of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'not a url']) {
  assert.equal(isSafeSubframeNavigation(url), false, `${url} should be rejected`);
}

// Storage access is granted silently only to the identity providers embedded
// sign-in widgets use; every other third-party frame has to prompt.
for (const url of [
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://accounts.youtube.com/accounts/SetOSID',
  'https://appleid.apple.com/auth/authorize',
  'https://idmsa.apple.com/appleauth/auth',
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  'https://login.live.com/oauth20_authorize.srf',
  'https://github.com/login/oauth/authorize',
  'https://www.facebook.com/connect/ping',
  'https://www.linkedin.com/oauth/v2/authorization',
]) {
  assert.equal(isAllowedStorageAccessOrigin(url), true, `${url} should be granted silently`);
}
for (const url of [
  '',
  'accounts.google.com',
  'https://google.com',
  'https://mail.google.com',
  'https://accounts.google.com.example.com',
  'https://accounts.google.com.evil.example',
  'http://accounts.google.com',
  'https://user:pass@accounts.google.com',
  'https://accounts.google.com:8443/login',
  'javascript:alert(1)',
  'https://evil.example',
  'not a url',
]) {
  assert.equal(isAllowedStorageAccessOrigin(url), false, `${url} must not be granted silently`);
}

console.log('[PASS] Extracted window-open security policy preserves popup and safe-subframe rules.');
