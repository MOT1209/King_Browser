/**
 * The list of sites where the ad & tracker blocker is switched off.
 *
 * Stored under one key shared by the address-bar shield popover (per-site toggle)
 * and Settings > Privacy (full list). The main process reads the same key and
 * validates every entry again before it reaches a filter, so this module only
 * has to keep the list tidy for the user.
 */

export const ADBLOCK_WHITELIST_KEY = 'adblocker_whitelist';
/** Fired on window when the list changes, so the other editor reloads it. */
export const ADBLOCK_WHITELIST_EVENT = 'king-adblock-whitelist-changed';

const HOST_RE = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?)*$/;
const MAX_ENTRIES = 500;

/** Accepts "example.com", "https://www.example.com/path?q=1" or "example.com:8080"; returns a hostname or null. */
export function normalizeWhitelistHost(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (text.includes('://')) {
    try {
      text = new URL(text).hostname;
    } catch {
      return null;
    }
  } else {
    text = text.split(/[/?#]/)[0].replace(/:\d+$/, '');
  }
  text = text.replace(/\.$/, '');
  return text.length <= 253 && HOST_RE.test(text) ? text : null;
}

export function parseWhitelist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const hosts = parsed.map(normalizeWhitelistHost).filter((h): h is string => h !== null);
    return Array.from(new Set(hosts)).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function addWhitelistHost(list: readonly string[], input: unknown): { list: string[]; added: string | null } {
  const host = normalizeWhitelistHost(input);
  if (!host) return { list: [...list], added: null };
  if (list.includes(host) || list.length >= MAX_ENTRIES) return { list: [...list], added: list.includes(host) ? host : null };
  return { list: [...list, host], added: host };
}

export function removeWhitelistHost(list: readonly string[], host: string): string[] {
  return list.filter(entry => entry !== host);
}
