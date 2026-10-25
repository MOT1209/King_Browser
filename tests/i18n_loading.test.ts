import assert from 'node:assert/strict';
import fs from 'node:fs';
import en from '../src/locales/en.json';
import ar from '../src/locales/ar.json';
import de from '../src/locales/de.json';
import { setLanguage, getLanguage, t, l, isRTL, getLocale, normalizeLanguage, SUPPORTED_LANGUAGES } from '../src/services/i18n';
import { detectSystemLanguage } from '../src/types/browser';

console.log('--- Interface language policy (en / ar / de) ---');
const originalDocument = globalThis.document;
const originalStorage = globalThis.localStorage;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  (globalThis as any).document = { documentElement: { lang: 'en', dir: 'ltr' } };
  const saved = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) };

  assert.deepEqual([...SUPPORTED_LANGUAGES], ['en', 'ar', 'de']);

  // Arabic: right-to-left, Arabic strings, persisted.
  setLanguage('ar');
  assert.equal(getLanguage(), 'ar');
  assert.equal(isRTL(), true);
  assert.equal(document.documentElement.lang, 'ar');
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(saved.get('nova_language'), 'ar');
  assert.equal(t('common.cancel'), (ar as any).common.cancel);
  assert.equal(l({ en: 'Close', ar: 'إغلاق', de: 'Schließen' }), 'إغلاق');
  assert.equal(getLocale(), 'ar');

  // German: left-to-right, German strings.
  setLanguage('de');
  assert.equal(getLanguage(), 'de');
  assert.equal(isRTL(), false);
  assert.equal(document.documentElement.dir, 'ltr');
  assert.equal(t('common.cancel'), (de as any).common.cancel);
  assert.equal(l({ en: 'v{v} available', ar: 'v{v} متاح', de: 'v{v} verfügbar' }, { v: '0.0.6' }), 'v0.0.6 verfügbar');
  assert.equal(getLocale(), 'de-DE');

  // Retired and unknown codes (old settings and backups) fall back to English.
  for (const legacy of ['tr', 'zz', '', undefined, 42]) {
    setLanguage(legacy as any);
    assert.equal(getLanguage(), 'en', `${String(legacy)} falls back to English`);
    assert.equal(document.documentElement.dir, 'ltr');
  }
  assert.equal(t('common.cancel'), (en as any).common.cancel);
  assert.equal(t('definitely.not.a.key'), 'definitely.not.a.key');

  // Region codes map to the interface language.
  assert.equal(normalizeLanguage('ar-SA'), 'ar');
  assert.equal(normalizeLanguage('de-AT'), 'de');
  assert.equal(normalizeLanguage('en-GB'), 'en');

  // First run follows the OS language.
  for (const [os, expected] of [['ar-EG', 'ar'], ['de-DE', 'de'], ['fr-FR', 'en'], ['tr-TR', 'en']] as const) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: os } });
    assert.equal(detectSystemLanguage(), expected, `${os} -> ${expected}`);
  }
} finally {
  (globalThis as any).document = originalDocument;
  (globalThis as any).localStorage = originalStorage;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete (globalThis as any).navigator;
  setLanguage('en');
}
console.log('[PASS] Interface switches between English, Arabic (RTL) and German; legacy codes fall back to English.');

// Every English key exists in Arabic and German with the same {placeholders}.
function flatten(dict: Record<string, any>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    if (value && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = String(value);
  }
  return out;
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const flatEn = flatten(en as any);
for (const [code, dict] of [['ar', ar], ['de', de]] as const) {
  const flat = flatten(dict as any);
  for (const [key, text] of Object.entries(flatEn)) {
    // CLDR plural variants (key_one, key_few, ...) differ per language.
    if (/_(zero|one|two|few|many|other)$/.test(key)) continue;
    assert.ok(typeof flat[key] === 'string' && flat[key].length > 0, `${code}.json is missing ${key}`);
    assert.equal(placeholders(flat[key]), placeholders(text), `${code}.json ${key} has different placeholders`);
  }
}
assert.equal(fs.existsSync('src/locales/tr.json'), false, 'Turkish was removed from the interface');
console.log('[PASS] ar.json and de.json cover every en.json key with matching placeholders.');

// Inline l({ en, ar, de }) strings: every call carries all three languages
// (the type enforces it; this guards against `as any` escapes).
const inlineCall = /\bl\(\{ en: '((?:[^'\\]|\\.)*)', ar: '((?:[^'\\]|\\.)*)', de: '((?:[^'\\]|\\.)*)' \}/g;
let inlineCount = 0;
for (const file of fs.readdirSync('src/components', { recursive: true }) as string[]) {
  if (!file.endsWith('.tsx')) continue;
  const source = fs.readFileSync(`src/components/${file}`, 'utf8');
  for (const m of source.matchAll(inlineCall)) {
    inlineCount++;
    assert.ok(m[2].length > 0 && m[3].length > 0, `${file}: empty translation for "${m[1]}"`);
    assert.equal(placeholders(m[2]), placeholders(m[1]), `${file}: ar placeholders differ for "${m[1]}"`);
    assert.equal(placeholders(m[3]), placeholders(m[1]), `${file}: de placeholders differ for "${m[1]}"`);
  }
}
assert.ok(inlineCount > 200, `expected the translated surfaces to use l(), found ${inlineCount}`);
console.log(`[PASS] ${inlineCount} inline interface strings carry Arabic and German with matching placeholders.`);
