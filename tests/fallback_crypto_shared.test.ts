import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  encryptDataWithFallback,
  decryptDataWithFallback,
  isWeakSafeStorageBackend
} from '../electron/main/proxySecurity';

/**
 * The machine-secret AES-256-GCM fallback (used when safeStorage is
 * unavailable) existed as four hand-copied implementations in main.ts (set and
 * get), mcpServer.ts and proxySecurity.ts, and they had already drifted (a
 * different salt, and only one validated the 32-byte secret). Prevents: the
 * copies diverging again, a change of the on-disk MCP token format that would
 * orphan existing token files, and silently trusting Linux's basic_text
 * safeStorage backend, which stores nothing but obfuscation.
 */

console.log('\n--- Shared fallback crypto ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-fallback-crypto-'));
try {
  // Default format (secure store): round trip.
  const sealed = encryptDataWithFallback('hello secret', dir);
  assert.equal(sealed.subarray(0, 4).toString('utf8'), 'NENC', 'default magic is NENC');
  assert.equal(decryptDataWithFallback(sealed, dir), 'hello secret', 'default format round-trips');

  // MCP token format: NMCP magic and the king-mcp-salt context.
  const mcpOpts = { magic: 'NMCP', saltContext: 'king-mcp-salt' };
  const mcpSealed = encryptDataWithFallback('mcp-token-0123456789', dir, undefined, mcpOpts);
  assert.equal(mcpSealed.subarray(0, 4).toString('utf8'), 'NMCP', 'MCP magic is NMCP');
  assert.equal(decryptDataWithFallback(mcpSealed, dir, undefined, mcpOpts), 'mcp-token-0123456789', 'MCP format round-trips');
  assert.equal(decryptDataWithFallback(mcpSealed, dir), null, 'an NMCP blob is not readable as NENC');
  assert.equal(decryptDataWithFallback(sealed, dir, undefined, mcpOpts), null, 'an NENC blob is not readable as NMCP');

  // Backward compatibility: a token file written by the pre-refactor mcpServer.ts code must still decrypt.
  const secret = fs.readFileSync(path.join(dir, '.machine_secret'));
  const username = os.userInfo().username;
  const salt = crypto.createHash('sha256').update(`${os.hostname()}:${username}:${os.homedir()}:king-mcp-salt`).digest();
  const key = crypto.scryptSync(secret, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update('legacy-token-0123456789', 'utf8'), cipher.final()]);
  const legacy = Buffer.concat([Buffer.from('NMCP', 'utf8'), iv, cipher.getAuthTag(), enc]);
  assert.equal(decryptDataWithFallback(legacy, dir, undefined, mcpOpts), 'legacy-token-0123456789', 'tokens written by the old MCP code still decrypt');

  // Tampering fails closed.
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 0xff;
  assert.equal(decryptDataWithFallback(tampered, dir), null, 'a tampered blob is rejected');

  // A corrupt machine secret is refused rather than used.
  fs.writeFileSync(path.join(dir, '.machine_secret'), Buffer.alloc(5));
  assert.equal(decryptDataWithFallback(sealed, dir), null, 'a wrong-length machine secret is not used');
  assert.throws(() => encryptDataWithFallback('x', dir), /Corrupt \.machine_secret/, 'writing with a corrupt machine secret throws');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Linux safeStorage can silently use a plaintext-equivalent backend.
assert.equal(isWeakSafeStorageBackend({ getSelectedStorageBackend: () => 'basic_text' }), true, 'basic_text is weak');
assert.equal(isWeakSafeStorageBackend({ getSelectedStorageBackend: () => 'gnome_libsecret' }), false, 'a keyring backend is not weak');
assert.equal(isWeakSafeStorageBackend({}), false, 'platforms without the API are not flagged');
assert.equal(isWeakSafeStorageBackend(undefined), false, 'a missing safeStorage is not flagged');

// Static guard: the callers must use the shared module, not private copies.
const root = process.cwd();
for (const file of ['electron/main.ts', 'electron/mcpServer.ts']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(!/scryptSync\(/.test(src), `${file} uses the shared fallback crypto instead of its own scryptSync copy`);
  assert.ok(!/createCipheriv\('aes-256-gcm'/.test(src), `${file} has no private AES-256-GCM fallback`);
}

console.log('[PASS] Shared fallback crypto');
