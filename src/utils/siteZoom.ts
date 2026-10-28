/**
 * Page zoom remembered per site.
 *
 * Zoom lived only on the tab record and was lost with the tab. Now a factor the
 * user chose is saved against the site (host and port) and applied when any
 * page of that site loads. Resetting zoom forgets the site.
 *
 * Private tabs neither read nor write the list: the list is a record of which
 * sites were visited, which a private tab must not add to. Internal pages have
 * no site. Storage is untrusted input and is validated on load, and a storage
 * that throws never breaks zooming.
 *
 * Pure helpers are exported for unit tests.
 */

export const SITE_ZOOM_STORAGE_KEY = 'king_site_zoom';
export const MAX_SITE_ZOOM_ENTRIES = 200;
const MIN_FACTOR = 0.25;
const MAX_FACTOR = 5;
const MAX_HOST_LENGTH = 253;

export type SiteZoomMap = Record<string, number>;

/** The host (with port) of a web page; null for anything that is not http(s). */
export function siteZoomKey(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.host.toLowerCase();
    return host && host.length <= MAX_HOST_LENGTH ? host : null;
  } catch {
    return null;
  }
}

function validFactor(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_FACTOR && value <= MAX_FACTOR;
}

export function parseSiteZoom(raw: string | null): SiteZoomMap {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: SiteZoomMap = Object.create(null);
  for (const [host, factor] of Object.entries(value as Record<string, unknown>)) {
    if (host === '__proto__' || host.length > MAX_HOST_LENGTH || !validFactor(factor)) continue;
    result[host] = factor;
  }
  const entries = Object.entries(result).slice(-MAX_SITE_ZOOM_ENTRIES);
  return Object.fromEntries(entries);
}

/** A new map with the site's factor set; the site becomes the newest entry. */
export function withSiteZoom(map: SiteZoomMap, host: string, factor: number): SiteZoomMap {
  if (!host || !validFactor(factor)) return map;
  const { [host]: _old, ...rest } = map;
  const entries = Object.entries({ ...rest, [host]: factor }).slice(-MAX_SITE_ZOOM_ENTRIES);
  return Object.fromEntries(entries);
}

export function withoutSiteZoom(map: SiteZoomMap, host: string): SiteZoomMap {
  if (!(host in map)) return map;
  const { [host]: _removed, ...rest } = map;
  return rest;
}

// ------------------------------------------------------------------ store

let cache: SiteZoomMap | null = null;

function load(): SiteZoomMap {
  if (cache) return cache;
  try {
    cache = typeof localStorage === 'undefined' ? {} : parseSiteZoom(localStorage.getItem(SITE_ZOOM_STORAGE_KEY));
  } catch {
    cache = {};
  }
  return cache;
}

function save(next: SiteZoomMap): void {
  cache = next;
  try {
    if (typeof localStorage === 'undefined') return;
    if (Object.keys(next).length === 0) localStorage.removeItem(SITE_ZOOM_STORAGE_KEY);
    else localStorage.setItem(SITE_ZOOM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable or full: the factor lasts for this session.
  }
}

/** The remembered factor for the page's site, or undefined (always undefined for private tabs). */
export function siteZoomFor(url: unknown, isIncognito: boolean | undefined): number | undefined {
  if (isIncognito) return undefined;
  const host = siteZoomKey(url);
  return host ? load()[host] : undefined;
}

export function rememberSiteZoom(url: unknown, factor: number, isIncognito: boolean | undefined): void {
  if (isIncognito) return;
  const host = siteZoomKey(url);
  if (!host) return;
  const next = withSiteZoom(load(), host, factor);
  if (next !== load()) save(next);
}

export function forgetSiteZoom(url: unknown, isIncognito: boolean | undefined): void {
  if (isIncognito) return;
  const host = siteZoomKey(url);
  if (!host) return;
  const next = withoutSiteZoom(load(), host);
  if (next !== load()) save(next);
}

/** Test-only: drop the in-memory copy so the next read goes to storage. */
export function resetSiteZoomForTests(): void {
  cache = null;
}
