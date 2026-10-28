import assert from 'node:assert/strict';
import {
  SITE_ZOOM_STORAGE_KEY,
  MAX_SITE_ZOOM_ENTRIES,
  siteZoomKey,
  parseSiteZoom,
  withSiteZoom,
  withoutSiteZoom,
  rememberSiteZoom,
  forgetSiteZoom,
  siteZoomFor,
  resetSiteZoomForTests,
} from '../src/utils/siteZoom';

console.log('\n--- Zoom remembered per site ---');

assert.equal(SITE_ZOOM_STORAGE_KEY, 'king_site_zoom');

// The key is the host (with port), only for web pages.
assert.equal(siteZoomKey('https://Example.com/a/b?x=1#y'), 'example.com');
assert.equal(siteZoomKey('http://localhost:3000/'), 'localhost:3000');
assert.equal(siteZoomKey('https://sub.example.com/'), 'sub.example.com', 'subdomains are separate sites');
assert.equal(siteZoomKey('king://settings'), null, 'internal pages have no site zoom');
assert.equal(siteZoomKey('about:blank'), null);
assert.equal(siteZoomKey('file:///etc/passwd'), null);
assert.equal(siteZoomKey('javascript:alert(1)'), null);
assert.equal(siteZoomKey('garbage'), null);
assert.equal(siteZoomKey(undefined), null);
assert.equal(siteZoomKey('https://' + 'a'.repeat(300) + '.com/'), null, 'absurd hosts are ignored');

// Reading storage: untrusted, validated.
assert.deepEqual(parseSiteZoom(null), {});
assert.deepEqual(parseSiteZoom('nope'), {});
assert.deepEqual(parseSiteZoom('[1,2]'), {}, 'an array is not a map');
assert.deepEqual(
  parseSiteZoom(JSON.stringify({ 'a.com': 1.5, 'b.com': 'big', 'c.com': 0.01, 'd.com': 99, 'e.com': null, '__proto__': 2, 'f.com': 0.5 })),
  { 'a.com': 1.5, 'f.com': 0.5 },
  'only finite factors inside the zoom ladder range survive'
);
assert.equal(Object.keys(parseSiteZoom(JSON.stringify(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`h${i}.com`, 1.25]))))).length, MAX_SITE_ZOOM_ENTRIES, 'a bloated store is capped');

// Updating.
{
  const a = withSiteZoom({}, 'a.com', 1.5);
  assert.deepEqual(a, { 'a.com': 1.5 });
  assert.deepEqual(withSiteZoom(a, 'b.com', 0.8), { 'a.com': 1.5, 'b.com': 0.8 });
  assert.deepEqual(withSiteZoom(a, 'a.com', 2), { 'a.com': 2 });
  assert.deepEqual(withSiteZoom(a, 'a.com', Number.NaN), a, 'a bad factor changes nothing');
  assert.deepEqual(withSiteZoom(a, 'a.com', 99), a, 'an out of range factor changes nothing');
  assert.deepEqual(withoutSiteZoom(a, 'a.com'), {});
  assert.deepEqual(withoutSiteZoom(a, 'zzz.com'), a);
  assert.deepEqual(a, { 'a.com': 1.5 }, 'inputs are never mutated');

  // Oldest entries are dropped first; touching a site makes it newest.
  let map: Record<string, number> = {};
  for (let i = 0; i < MAX_SITE_ZOOM_ENTRIES; i++) map = withSiteZoom(map, `h${i}.com`, 1.25);
  map = withSiteZoom(map, 'h0.com', 1.5);
  map = withSiteZoom(map, 'new.com', 1.1);
  assert.equal(Object.keys(map).length, MAX_SITE_ZOOM_ENTRIES);
  assert.ok('h0.com' in map, 'a recently used site is kept');
  assert.ok(!('h1.com' in map), 'the least recently used site is dropped');
  assert.ok('new.com' in map);
}

// The store: private tabs never read or write it; reset forgets the site.
{
  // Suites share one process: put back whatever localStorage was there, never delete it.
  const hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previousStorage = (globalThis as any).localStorage;
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  resetSiteZoomForTests();

  assert.equal(siteZoomFor('https://shop.example.com/cart', false), undefined, 'unknown site: nothing remembered');
  rememberSiteZoom('https://shop.example.com/cart?x=1', 1.5, false);
  assert.equal(siteZoomFor('https://shop.example.com/other', false), 1.5, 'the factor applies to every page of the site');
  assert.equal(siteZoomFor('https://example.com/', false), undefined, 'and not to other sites');
  assert.deepEqual(JSON.parse(data.get(SITE_ZOOM_STORAGE_KEY)!), { 'shop.example.com': 1.5 }, 'written through to storage');

  rememberSiteZoom('https://private.example/', 2, true);
  assert.equal(siteZoomFor('https://private.example/', false), undefined, 'a private tab never writes what sites it visited');
  assert.equal(siteZoomFor('https://shop.example.com/', true), undefined, 'a private tab never reads the list');
  rememberSiteZoom('king://settings', 2, false);
  assert.ok(!JSON.stringify([...data.values()]).includes('settings'), 'internal pages are not stored');

  forgetSiteZoom('https://shop.example.com/cart', false);
  assert.equal(siteZoomFor('https://shop.example.com/', false), undefined, 'reset forgets the site');
  assert.equal(data.has(SITE_ZOOM_STORAGE_KEY), false, 'an empty list is removed from storage');

  // A reload sees what was saved.
  rememberSiteZoom('https://docs.example.org/', 0.8, false);
  resetSiteZoomForTests();
  assert.equal(siteZoomFor('https://docs.example.org/x', false), 0.8, 'the factor survives a restart');

  // A storage that throws never breaks zooming.
  (globalThis as any).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
  resetSiteZoomForTests();
  assert.doesNotThrow(() => rememberSiteZoom('https://a.example/', 1.25, false));
  assert.equal(siteZoomFor('https://a.example/', false), 1.25, 'it still works in memory');
  if (hadStorage) (globalThis as any).localStorage = previousStorage;
  else delete (globalThis as any).localStorage;
  resetSiteZoomForTests();
}

console.log('[PASS] [Site-Zoom] zoom is remembered per site, never for private tabs, and validated on load.');

// Wiring guards (source scans): page load applies the remembered factor, private tabs are excluded
// by the helpers, and the zoom handlers keep a stable identity (they feed memoized children).
import fs from 'node:fs';
{
  const view = fs.readFileSync('src/components/BrowserView.tsx', 'utf8');
  assert.ok(view.includes('siteZoomFor(') && view.includes('currentTab?.isIncognito'), 'BrowserView applies the remembered factor and passes the private-tab flag');
  const zoom = fs.readFileSync('src/hooks/useZoom.ts', 'utf8');
  assert.ok(zoom.includes('rememberSiteZoom(tab.url, nextFactor, tab.isIncognito)'), 'a chosen factor is remembered with the private-tab flag');
  assert.ok(zoom.includes('forgetSiteZoom(tab.url, tab.isIncognito)'), 'reset forgets the site');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(/getTab: getTabForZoom/.test(app) && /const getTabForZoom = useCallback\(/.test(app), 'getTab has a stable identity');
}
console.log('[PASS] [Site-Zoom] page load, zoom steps and reset are wired through the site list.');
