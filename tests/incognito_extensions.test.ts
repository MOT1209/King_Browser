import assert from 'node:assert/strict';
import {
  hasExtensionIncognitoAccess,
  isExtensionAllowedInIncognito,
  setExtensionIncognitoAccess,
} from '../electron/main/incognitoExtensions';

const extensionId = 'incognito-policy-test-extension';
setExtensionIncognitoAccess(extensionId, false);
assert.equal(hasExtensionIncognitoAccess(extensionId), false);
assert.equal(isExtensionAllowedInIncognito(extensionId, {}), false);

setExtensionIncognitoAccess(extensionId, true);
assert.equal(hasExtensionIncognitoAccess(extensionId), true);
assert.equal(isExtensionAllowedInIncognito(extensionId, {}), true);
assert.equal(isExtensionAllowedInIncognito(extensionId, { incognito: 'not_allowed' }), false);
assert.equal(isExtensionAllowedInIncognito('', {}), false);

setExtensionIncognitoAccess(extensionId, false);
assert.equal(isExtensionAllowedInIncognito(extensionId, {}), false);

console.log('[PASS] Extracted incognito extension permission state preserves its allow/deny behavior.');
