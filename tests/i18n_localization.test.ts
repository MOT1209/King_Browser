import assert from 'node:assert/strict';
import { getLocale, formatDate, formatTime, setLanguage, getLanguage, onLanguageChange, t, LOCALE_MAP, isRTL, SupportedLanguage } from '../src/services/i18n';
import en from '../src/locales/en.json';
import de from '../src/locales/de.json';
import ar from '../src/locales/ar.json';

console.log('\n--- i18n: English, Arabic and German ---');

// Locale map: two LTR languages and one RTL language.
assert.equal(LOCALE_MAP.en, 'en-US');
assert.equal(LOCALE_MAP.de, 'de-DE');
assert.equal(LOCALE_MAP.ar, 'ar-SA');
// Legacy Turkish code resolves to the English locale.
assert.equal(LOCALE_MAP.tr, 'en-US');
assert.equal(getLocale('tr'), 'en-US');

const fixedDate = new Date(2026, 8, 4, 15, 30);
assert.ok(formatDate(fixedDate, 'en').includes('Friday'));
assert.ok(formatDate(fixedDate, 'de').includes('Freitag'));
assert.ok(formatDate(fixedDate, 'ar').includes('الجمعة'));
assert.ok(formatTime(fixedDate, 'en').length > 0);
assert.ok(formatTime(fixedDate, 'de').length > 0);
assert.ok(formatTime(fixedDate, 'ar').length > 0);

// Greetings come from the active dictionary, not from English.
setLanguage('en');
assert.equal(t('newtab.goodMorning'), en.newtab.goodMorning);
setLanguage('de');
assert.equal(t('newtab.goodMorning'), de.newtab.goodMorning);
setLanguage('ar');
assert.equal(t('newtab.goodMorning'), ar.newtab.goodMorning);
assert.equal(getLanguage(), 'ar');
assert.equal(isRTL(), true);

// Reactive listener fires on every switch and stops after unsubscribe.
let observed: SupportedLanguage | null = null;
let notifications = 0;
const unsubscribe = onLanguageChange((lang) => {
  notifications++;
  observed = lang;
});

setLanguage('de');
assert.equal(observed, 'de');
assert.equal(notifications, 1);

setLanguage('ar');
assert.equal(observed, 'ar');
assert.equal(notifications, 2);

unsubscribe();
setLanguage('en');
assert.equal(observed, 'ar');
assert.equal(notifications, 2);

// The three dictionaries stay in exact parity. Arabic may add the extra CLDR
// plural forms its grammar needs; every other key must exist in all three.
function flattenKeys(value: Record<string, any>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object'
      ? flattenKeys(child as Record<string, any>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const englishKeys = new Set(flattenKeys(en));
assert.ok(englishKeys.size > 0);

for (const [code, dictionary] of Object.entries({ en, de, ar })) {
  const keys = new Set(flattenKeys(dictionary));
  const missing = [...englishKeys].filter((key) => !keys.has(key));
  assert.deepEqual(missing, [], `Missing keys in ${code}`);

  const unexpected = [...keys].filter((key) => {
    if (englishKeys.has(key)) return false;
    const base = key.replace(pluralSuffix, '');
    return !(pluralSuffix.test(key) && englishKeys.has(base));
  });
  assert.deepEqual(unexpected, [], `Unexpected keys in ${code}`);

  for (const key of keys) {
    const value = key.split('.').reduce<any>((node, part) => node?.[part], dictionary);
    assert.equal(typeof value, 'string', `${code}.${key} must be a string`);
    assert.ok(String(value).trim().length > 0, `${code}.${key} must not be empty`);
  }
}

// Arabic plural categories actually resolve for counted strings.
setLanguage('ar');
assert.equal(t('newtab.tasksLeft', { count: 0 }), 'لا مهام متبقية');
assert.equal(t('newtab.tasksLeft', { count: 2 }), 'متبقي مهمتين');

setLanguage('en');
console.log('[PASS] [i18n Localization] Three locales format dates, translate greetings, and keep exact dictionary parity.');
