/**
 * Per-site rules for the agent (plan.md, Phase 1).
 *
 *   ask   - every action on this site needs the user's approval, even ones the
 *           policy engine would let through ("always ask on my bank")
 *   block - the agent may not act on, read, or navigate to this site
 *
 * There is deliberately no "always allow": a rule can only make the agent more
 * restricted, so a mistyped or malicious rule can never switch off the approval
 * gate for sensitive actions.
 *
 * Dependency-free apart from node:fs (no Electron imports).
 */

import * as fs from 'node:fs';

export type SiteRuleMode = 'ask' | 'block';

export interface SiteRule {
  domain: string;
  mode: SiteRuleMode;
}

export const MAX_SITE_RULES = 100;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^localhost$/;

/** Accepts a host or a full URL; returns a lower-case hostname, or null if it is not one. */
export function normalizeRuleDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let host = input.trim().toLowerCase();
  if (!host) return null;
  if (host.includes('://')) {
    try { host = new URL(host).hostname; } catch { return null; }
  }
  host = host.replace(/^\*\./, '').replace(/\.$/, '');
  return DOMAIN_PATTERN.test(host) ? host : null;
}

/** Drops invalid entries and duplicates (the stricter mode wins), caps the list. */
export function sanitizeSiteRules(input: unknown): SiteRule[] {
  if (!Array.isArray(input)) return [];
  const byDomain = new Map<string, SiteRuleMode>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const domain = normalizeRuleDomain((item as SiteRule).domain);
    const mode = (item as SiteRule).mode;
    if (!domain || (mode !== 'ask' && mode !== 'block')) continue;
    if (byDomain.get(domain) === 'block') continue;
    byDomain.set(domain, mode);
    if (byDomain.size >= MAX_SITE_RULES) break;
  }
  return [...byDomain].map(([domain, mode]) => ({ domain, mode }));
}

/** The rule for a hostname: exact or subdomain match; the stricter mode wins on overlap. */
export function matchSiteRule(rules: readonly SiteRule[], hostname: string | undefined): SiteRule | undefined {
  if (!hostname) return undefined;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  let found: SiteRule | undefined;
  for (const rule of rules) {
    if (host === rule.domain || host.endsWith(`.${rule.domain}`)) {
      if (rule.mode === 'block') return rule;
      found = rule;
    }
  }
  return found;
}

export interface SiteRuleStore {
  get(): SiteRule[];
  set(input: unknown): SiteRule[];
}

export function createSiteRuleStore(filePath: string): SiteRuleStore {
  let cache: SiteRule[] | null = null;
  const load = (): SiteRule[] => {
    try {
      return sanitizeSiteRules(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      return [];
    }
  };
  return {
    get() {
      if (!cache) cache = load();
      return cache.map(rule => ({ ...rule }));
    },
    set(input) {
      cache = sanitizeSiteRules(input);
      try {
        fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), { encoding: 'utf8', mode: 0o600 });
      } catch {
        /* keep the in-memory rules for this run even if the disk write fails */
      }
      return cache.map(rule => ({ ...rule }));
    }
  };
}
