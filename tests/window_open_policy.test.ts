import assert from 'node:assert/strict';
import {
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

console.log('[PASS] Extracted window-open security policy preserves popup and safe-subframe rules.');
