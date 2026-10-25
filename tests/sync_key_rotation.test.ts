/**
 * E2EE sync-key salt convergence.
 *
 * The account publishes its KDF salt in user_metadata so every device derives
 * the SAME key. Before this test existed, a device holding a key derived from a
 * different (never published) salt silently kept using it: the two devices then
 * wrote vaults neither of them could read, and nothing reported an error.
 *
 * The secure store is faked by shadowing the instance's own accessors rather
 * than by installing a global `window.electronAPI`: this file runs inside the
 * shared test bundle, and a global fake leaks into every suite imported after
 * it. The KDF itself is the real one, so a change to the key format or the salt
 * handling fails here.
 */

import assert from 'node:assert/strict';
import { KingSyncService } from '../src/services/syncService';
import { bytesToBase64, base64ToBytes, decryptSyncPayload, encryptSyncPayload } from '../src/services/syncCrypto';

const USER_ID = 'rotation-test-user';
const KEY_STORE = `sync_master_key_${USER_ID}`;
const PREVIOUS_STORE = `${KEY_STORE}_previous`;
const PASSWORD = 'correct horse battery staple';

const store = new Map<string, string>();

const service = new KingSyncService() as any;
service.currentUser = { id: USER_ID, email: 'rotation@example.com' };
// Shadow the secure-store accessors for this instance only.
service.readSecureStore = async (name: string) => store.get(name) ?? null;
service.writeSecureStore = async (name: string, value: string) => {
  if (value === '') store.delete(name);
  else store.set(name, value);
  return true;
};
service.deleteSecureStore = async (name: string) => store.delete(name);

const saltA = bytesToBase64(new Uint8Array(16).fill(1));
const saltB = bytesToBase64(new Uint8Array(16).fill(2));

async function main(): Promise<void> {
  // 1. Fresh device with no published salt: derive with a random salt, store it.
  let result = await service.acquireSyncKey(PASSWORD, undefined);
  assert.equal(result.rotated, false);
  const firstKey = store.get(KEY_STORE);
  assert.ok(firstKey?.startsWith(`nk2$${result.saltB64}$`), 'stored key embeds the salt it was derived from');

  // 2. Same salt again: reuse the stored key instead of paying for another KDF.
  result = await service.acquireSyncKey(PASSWORD, result.saltB64);
  assert.equal(result.rotated, false);
  assert.equal(store.get(KEY_STORE), firstKey);
  assert.equal(store.get(PREVIOUS_STORE), undefined, 'a matching salt must not create a previous-key entry');

  // 3. The account now publishes a different salt: converge on it, keep the old
  //    key for decryption, and report the rotation to the caller.
  result = await service.acquireSyncKey(PASSWORD, saltB);
  assert.equal(result.rotated, true);
  assert.equal(result.saltB64, saltB);
  const rotatedKey = store.get(KEY_STORE);
  assert.ok(rotatedKey?.startsWith(`nk2$${saltB}$`), 'the new key is derived from the published salt');
  assert.notEqual(rotatedKey, firstKey);
  assert.equal(store.get(PREVIOUS_STORE), firstKey, 'the pre-rotation key is retained');
  assert.equal(service.masterKey, rotatedKey, 'the in-memory key is the converged one');

  assert.deepEqual(
    await service.getDecryptionFallbackKeys(),
    [firstKey],
    'the retained key is tried before any legacy material'
  );

  // 4. Real envelopes, not just the key strings: a vault and a password blob
  //    sealed under the pre-rotation key must still open through the retained
  //    key while the current key refuses them.
  const sealedVault = await encryptSyncPayload({ bookmarks: ['example.com'] }, firstKey!);
  await assert.rejects(
    decryptSyncPayload(sealedVault, rotatedKey!),
    'the converged key must not open a vault written under the old one'
  );
  const fallbacks = await service.getDecryptionFallbackKeys();
  assert.deepEqual(await decryptSyncPayload(sealedVault, fallbacks[0]), { bookmarks: ['example.com'] });

  const credential = { id: 'p1', host: 'example.com', username: 'u', password: 'secret', updatedAt: 1 };
  const sealedPasswords = await service.encryptPasswords([credential], firstKey!);
  await assert.rejects(
    service.decryptPasswords(sealedPasswords.ciphertext, sealedPasswords.salt, sealedPasswords.iv, rotatedKey!),
    'the converged key must not open a credential blob written under the old one'
  );
  const opened = await service.decryptPasswords(
    sealedPasswords.ciphertext,
    sealedPasswords.salt,
    sealedPasswords.iv,
    fallbacks[0]
  );
  assert.equal(opened.length, 1);
  assert.equal(opened[0].password, 'secret');

  // 5. A second rotation replaces the retained key rather than stacking them.
  result = await service.acquireSyncKey(PASSWORD, saltA);
  assert.equal(result.rotated, true);
  assert.equal(store.get(PREVIOUS_STORE), rotatedKey);
  assert.deepEqual(await service.getDecryptionFallbackKeys(), [rotatedKey]);

  // 6. A retained key that is no longer present in the store is not remembered
  //    forever: the fallback list reflects the store, not stale memory.
  service.previousMasterKey = null;
  store.delete(PREVIOUS_STORE);
  assert.deepEqual(await service.getDecryptionFallbackKeys(), []);

  // 7. An unusable published salt is never used to derive. The returned salt is
  //    a full-size replacement and `rotated` is set so the caller re-publishes
  //    it — otherwise every sign-in on every device would derive a different key.
  const shortSalt = bytesToBase64(new Uint8Array(8).fill(9));
  result = await service.acquireSyncKey(PASSWORD, shortSalt);
  assert.equal(result.rotated, true, 'a replaced salt must be reported so it gets re-published');
  assert.notEqual(result.saltB64, shortSalt);
  assert.equal(base64ToBytes(result.saltB64).length, 16);
  assert.equal(service.masterKey, store.get(KEY_STORE));
  assert.ok(service.masterKey?.startsWith(`nk2$${result.saltB64}$`));
}

main()
  .then(() => {
    console.log('[PASS] Sync key converges on the published salt and retains the previous key for decryption.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
