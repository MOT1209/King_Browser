import assert from 'node:assert/strict';
import { seedDictionary, ensureLanguageLoaded, isLanguageReady, setLanguage, getLanguage, t, isRTL, getLocale } from '../src/services/i18n';

console.log('--- Three-language interface policy ---');

const originalDocument = globalThis.document;
const originalStorage = globalThis.localStorage;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  const documentElement = { lang: 'en', dir: 'ltr' };
  (globalThis as any).document = { documentElement };
  const saved = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => { saved.set(k, v); }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US', languages: ['en-US'] }
  });

  const expectations = [
    { lang: 'en', locale: 'en-US', dir: 'ltr', rtl: false, cancel: 'Cancel' },
    { lang: 'de', locale: 'de-DE', dir: 'ltr', rtl: false, cancel: 'Abbrechen' },
    { lang: 'ar', locale: 'ar-SA', dir: 'rtl', rtl: true, cancel: 'إلغاء' }
  ] as const;

  for (const expected of expectations) {
    setLanguage(expected.lang);
    assert.equal(getLanguage(), expected.lang);
    assert.equal(getLocale(), expected.locale);
    assert.equal(getLocale(expected.lang), expected.locale);
    assert.equal(isRTL(), expected.rtl);
    assert.equal(isRTL(expected.lang), expected.rtl);
    assert.equal(t('common.cancel'), expected.cancel);
    assert.equal(documentElement.lang, expected.lang);
    assert.equal(documentElement.dir, expected.dir);
    assert.equal(saved.get('nova_language'), expected.lang);
    assert.equal(isLanguageReady(expected.lang), true);
    assert.equal(typeof ensureLanguageLoaded(expected.lang).then, 'function');
  }

  // Legacy codes remain readable at the API boundary but resolve to English.
  for (const legacy of ['tr', 'zz', 'en-GB']) {
    setLanguage(legacy);
    assert.equal(getLanguage(), 'en');
    assert.equal(getLocale(), 'en-US');
    assert.equal(isRTL(), false);
    assert.equal(t('common.cancel'), 'Cancel');
    assert.equal(saved.get('nova_language'), 'en');
  }

  // A key absent from the active language falls back to English, and an
  // unknown key returns its path so missing strings are visible in tests.
  setLanguage('de');
  assert.equal(t('definitely.not.a.key'), 'definitely.not.a.key');

  // seedDictionary overlays a bundled dictionary at runtime. The original
  // value is restored so the parity suite still sees the shipped strings.
  seedDictionary('de', { common: { cancel: 'Seedwert' } });
  setLanguage('de');
  assert.equal(t('common.cancel'), 'Seedwert');
  seedDictionary('de', { common: { cancel: 'Abbrechen' } });
  assert.equal(t('common.cancel'), 'Abbrechen');
  setLanguage('en');
  assert.equal(t('common.cancel'), 'Cancel');

  // Arabic uses the full CLDR plural set, not just one/other.
  setLanguage('ar');
  assert.equal(t('newtab.tasksLeft', { count: 0 }), 'لا مهام متبقية');
  assert.equal(t('newtab.tasksLeft', { count: 2 }), 'متبقي مهمتين');
  assert.equal(t('newtab.tasksLeft', { count: 5 }), 'متبقي 5 مهام');
  assert.equal(t('newtab.tasksLeft', { count: 25 }), 'متبقي 25 مهمة');
} finally {
  (globalThis as any).document = originalDocument;
  (globalThis as any).localStorage = originalStorage;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete (globalThis as any).navigator;
  setLanguage('en');
}
console.log('[PASS] English, Arabic and German switch immediately, persist, and mirror RTL only for Arabic.');
