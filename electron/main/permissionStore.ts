/**
 * The pure rules behind site permission prompts: which key a request maps to,
 * which origin owns a grant, how long a remembered answer lives, and how the
 * answers are persisted. The Electron handlers, the pending-prompt queue and
 * the renderer round trip stay in main.ts; this file has no Electron imports
 * so every rule can be tested directly.
 *
 * Fail closed throughout: unknown media types, credential-bearing or opaque
 * origins, expired and future-dated answers all count as "no answer".
 */
import fs from 'fs';

export const PERMISSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PermissionDecision = { allow: boolean; ts: number };
/** Origin -> (permission key -> decision). */
export type PermissionDecisions = Map<string, Map<string, PermissionDecision>>;

/**
 * Camera and microphone are separate capabilities. Old `media` records do not
 * identify what was approved and deliberately require a fresh prompt (null).
 */
export function permissionKeys(permission: string, mediaTypes?: unknown): string[] | null {
  if (permission !== 'media') return [permission];
  if (!Array.isArray(mediaTypes) || mediaTypes.length === 0 ||
      mediaTypes.some(type => type !== 'audio' && type !== 'video')) return null;
  return [...new Set(mediaTypes as string[])].map(type => `media:${type}`);
}

/** The owner of a grant for `url`, or '' when the URL may not hold grants. */
export function permissionOriginFor(url: string, isTrustedAppOrigin: (url: string) => boolean): string {
  if (isTrustedAppOrigin(url)) return 'app';
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return '';
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
    // WHATWG URL.origin serializes every extension as "null". Keep each
    // installed extension's identity separate; opaque origins get no grants.
    if (parsed.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(parsed.hostname)) {
      return `chrome-extension://${parsed.hostname}`;
    }
  } catch (_) {}
  return '';
}

/**
 * The remembered answer for every key, or undefined when any key is undecided.
 * A single denial wins. Expired and future-dated entries are dropped on read.
 */
export function rememberedDecision(
  decisions: PermissionDecisions, origin: string, keys: string[], now: number = Date.now()
): boolean | undefined {
  const entries = decisions.get(origin);
  if (!entries) return undefined;
  const values = keys.map(key => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (!Number.isFinite(entry.ts) || entry.ts > now || now - entry.ts >= PERMISSION_TTL_MS) {
      entries.delete(key);
      return undefined;
    }
    return entry.allow;
  });
  if (entries.size === 0) decisions.delete(origin);
  if (values.some(value => value === false)) return false;
  return values.every(value => value === true) ? true : undefined;
}

/** Removes every answer older than the TTL, and origins left with none. */
export function purgeExpiredPermissions(decisions: PermissionDecisions, now: number = Date.now()): void {
  const cutoff = now - PERMISSION_TTL_MS;
  for (const [origin, perms] of decisions) {
    for (const [perm, entry] of perms) {
      if (entry.ts < cutoff) perms.delete(perm);
    }
    if (perms.size === 0) decisions.delete(origin);
  }
}

/** Parses the persisted file, dropping expired and malformed entries. Throws on invalid JSON. */
export function parseRememberedPermissions(raw: string, now: number = Date.now()): PermissionDecisions {
  const result: PermissionDecisions = new Map();
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') return result;
  const cutoff = now - PERMISSION_TTL_MS;
  for (const [origin, perms] of Object.entries(data)) {
    if (typeof origin === 'string' && perms && typeof perms === 'object') {
      const permMap = new Map<string, PermissionDecision>();
      for (const [perm, entry] of Object.entries(perms as Record<string, any>)) {
        if (entry && typeof entry.allow === 'boolean' && typeof entry.ts === 'number' && entry.ts >= cutoff) {
          permMap.set(perm, { allow: entry.allow, ts: entry.ts });
        }
      }
      if (permMap.size > 0) result.set(origin, permMap);
    }
  }
  return result;
}

/**
 * Writes to a sibling temp file, then renames. A crash or ENOSPC mid-write used
 * to leave a truncated file: the next JSON.parse throws and every remembered
 * decision is silently forgotten. rename is atomic on the same volume, so the
 * file holds either the old contents or the new ones, never a half-written
 * prefix. The mode is forced because writeFileSync's `mode` only applies when
 * it CREATES the file, and this file lists which origins were granted
 * camera, microphone or geolocation, so it must never be world-readable.
 * Throws after cleaning up the temp file; the caller decides how to report it.
 */
export function writeRememberedPermissions(file: string, decisions: PermissionDecisions): void {
  const obj: Record<string, Record<string, PermissionDecision>> = {};
  for (const [origin, perms] of decisions.entries()) {
    obj[origin] = {};
    for (const [perm, entry] of perms.entries()) {
      obj[origin][perm] = entry;
    }
  }
  const tmpFile = file + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(tmpFile, 0o600); } catch (err) { console.warn('[Security] Could not restrict permissions on a private file; it may be readable by other users:', err); }
    fs.renameSync(tmpFile, file);
  } catch (writeErr) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    throw writeErr;
  }
}
