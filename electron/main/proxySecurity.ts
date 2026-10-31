import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Validates proxy rules to ensure strictly secure protocols and valid host structure.
 * Only https://, socks5://, and socks5h:// are permitted.
 * Plaintext http:// and socks4:// are rejected.
 * Credentials in URLs are rejected to prevent leakage.
 * Uses WHATWG URL parsing without whole-string lowercasing to preserve URL component semantics.
 */
export function isValidSecureProxy(rawProxyUrl: unknown): boolean {
  if (typeof rawProxyUrl !== 'string') return false;
  const trimmed = rawProxyUrl.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const isSecureScheme = protocol === 'https:' || protocol === 'socks5:' || protocol === 'socks5h:';
    
    return isSecureScheme &&
           !!parsed.hostname &&
           !parsed.username &&
           !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Normalizes proxy URLs for Chromium's NetworkService.
 * Chromium's setProxy proxyRules only recognizes http, https, socks, socks4, and socks5.
 * It does NOT recognize socks5h:// (which causes Chromium to fall back to direct://, leaking traffic).
 * In Chromium, socks5:// already performs remote DNS resolution.
 * This helper maps socks5h:// to socks5:// so Chromium never drops to direct.
 */
export function normalizeProxyForChromium(proxyUrl: string): string {
  if (!proxyUrl || typeof proxyUrl !== 'string') return 'direct://';
  return proxyUrl.trim().replace(/^socks5h:\/\//i, 'socks5://');
}

/**
 * Machine-bound salt generation with safe fallback when os.userInfo() throws.
 * Binds keys to machine hostname, user identity, and home directory to prevent cross-device copying.
 */
export function getMachineSalt(saltContext = 'nova-secure-salt', mockUserInfoError = false): Buffer {
  let username = 'unknown';
  try {
    if (mockUserInfoError) {
      throw new Error('SystemError: user not found in /etc/passwd');
    }
    username = os.userInfo().username;
  } catch (_) {
    username = process.env.USER || process.env.USERNAME || 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`${os.hostname()}:${username}:${os.homedir()}:${saltContext}`)
    .digest();
}

/**
 * Encrypts sensitive configuration using safeStorage (DPAPI on Windows, Keychain on macOS)
 * or falls back to an authenticated AES-256-GCM cipher bound to the machine salt.
 */
export interface FallbackCryptoOptions {
  /** Four ASCII bytes that tag the blob format (default 'NENC'; the MCP token file uses 'NMCP'). */
  magic?: string;
  /** Context mixed into the machine-bound salt (default 'nova-secure-salt'; MCP uses 'king-mcp-salt'). */
  saltContext?: string;
}

const DEFAULT_FALLBACK_MAGIC = 'NENC';
const DEFAULT_FALLBACK_SALT_CONTEXT = 'nova-secure-salt';

/**
 * On Linux, Electron's safeStorage can select the `basic_text` backend when no
 * keyring is available. isEncryptionAvailable() still returns true, but the key
 * is hard-coded, so the "encrypted" data is only obfuscated.
 */
export function isWeakSafeStorageBackend(safeStorageRef?: any): boolean {
  try {
    return !!safeStorageRef
      && typeof safeStorageRef.getSelectedStorageBackend === 'function'
      && safeStorageRef.getSelectedStorageBackend() === 'basic_text';
  } catch {
    return false;
  }
}

export function encryptDataWithFallback(plainText: string, userDataPath: string, safeStorageRef?: any, options: FallbackCryptoOptions = {}): Buffer {
  const magic = options.magic ?? DEFAULT_FALLBACK_MAGIC;
  const saltContext = options.saltContext ?? DEFAULT_FALLBACK_SALT_CONTEXT;
  if (safeStorageRef && typeof safeStorageRef.isEncryptionAvailable === 'function' && safeStorageRef.isEncryptionAvailable()) {
    try {
      return safeStorageRef.encryptString(plainText);
    } catch (_) {}
  }

  // Fallback: AES-256-GCM using machine-bound secret
  const secretPath = path.join(userDataPath, '.machine_secret');
  let secret: Buffer;
  try {
    secret = fs.readFileSync(secretPath);
    if (secret.length !== 32) {
      throw new Error(
        `Corrupt .machine_secret (${secret.length} bytes, expected 32). ` +
        'Values encrypted with it cannot be recovered; restore a backup or clear secure storage.'
      );
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      secret = crypto.randomBytes(32);
      fs.writeFileSync(secretPath, secret, { mode: 0o600 });
      if (process.platform !== 'win32') {
        try { fs.chmodSync(secretPath, 0o600); } catch (_) {}
      }
    } else {
      throw err;
    }
  }

  const machineSalt = getMachineSalt(saltContext);
  const keyBuf = crypto.scryptSync(secret, machineSalt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(magic, 'utf8'), iv, tag, enc]);
}

/**
 * Decrypts sensitive configuration encrypted with encryptDataWithFallback.
 * Returns null if data is corrupt or authentication fails.
 */
export function decryptDataWithFallback(raw: Buffer, userDataPath: string, safeStorageRef?: any, options: FallbackCryptoOptions = {}): string | null {
  if (!raw || raw.length === 0) return null;
  const magic = options.magic ?? DEFAULT_FALLBACK_MAGIC;
  const saltContext = options.saltContext ?? DEFAULT_FALLBACK_SALT_CONTEXT;

  if (safeStorageRef && typeof safeStorageRef.isEncryptionAvailable === 'function' && safeStorageRef.isEncryptionAvailable()) {
    try {
      return safeStorageRef.decryptString(raw);
    } catch (_) {}
  }

  if (raw.length >= 32 && raw.subarray(0, 4).toString('utf8') === magic) {
    try {
      const secretPath = path.join(userDataPath, '.machine_secret');
      if (fs.existsSync(secretPath)) {
        const secret = fs.readFileSync(secretPath);
        if (secret.length !== 32) return null;
        const machineSalt = getMachineSalt(saltContext);
        const keyBuf = crypto.scryptSync(secret, machineSalt, 32);
        const iv = raw.subarray(4, 16);
        const tag = raw.subarray(16, 32);
        const enc = raw.subarray(32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
        decipher.setAuthTag(tag);
        return decipher.update(enc) + decipher.final('utf8');
      }
    } catch (_) {}
  }

  return null;
}
