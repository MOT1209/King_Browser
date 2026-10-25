import assert from 'node:assert/strict';
import { getLocale, formatDate, formatTime, setLanguage, getLanguage, onLanguageChange, t, LOCALE_MAP, SupportedLanguage } from '../src/services/i18n';
import en from '../src/locales/en.json';
import de from '../src/locales/de.json';
import ar from '../src/locales/ar.json';

console.log('\n--- i18n & English Date/Time Suite ---');

// Dates follow the interface language's locale.
assert.equal(LOCALE_MAP.en, 'en-US');
assert.equal(LOCALE_MAP.de, 'de-DE');
assert.equal(LOCALE_MAP.ar, 'ar');
{
  const fixedDate = new Date(2026, 8, 4, 15, 30);
  assert.ok(formatDate(fixedDate, 'en').includes('September') && formatDate(fixedDate, 'en').includes('Friday'));
  assert.ok(formatDate(fixedDate, 'de').includes('September') && formatDate(fixedDate, 'de').includes('Freitag'));
  for (const code of ['en', 'ar', 'de'] as SupportedLanguage[]) {
    assert.equal(getLocale(code), LOCALE_MAP[code]);
    assert.ok(formatTime(fixedDate, code).length > 0);
  }
}

// 4. Greetings in All Locales
const getGreetingKey = (hour: number): string => {
  if (hour < 12) return 'newtab.goodMorning';
  if (hour < 18) return 'newtab.goodAfternoon';
  return 'newtab.goodEvening';
};

setLanguage('en');
assert.equal(t(getGreetingKey(9)), 'Good Morning');
assert.equal(t(getGreetingKey(14)), 'Good Afternoon');
assert.equal(t(getGreetingKey(20)), 'Good Evening');


// 5. Reactive Listener on Language Change
let listenerTriggered = false;
let observedLang: SupportedLanguage | null = null;
const unsubscribe = onLanguageChange((lang) => {
  listenerTriggered = true;
  observedLang = lang;
});

// Re-selecting the current language is a no-op; a real change notifies.
setLanguage('en');
assert.equal(listenerTriggered, false);
setLanguage('de');
assert.equal(listenerTriggered, true);
assert.equal(observedLang, 'de');
assert.equal(getLanguage(), 'de');
unsubscribe();
setLanguage('en');

// 6. Locale Dictionary Parity for New Sections
const dictionaries = { en, de, ar };
const requiredNewtabKeys = [
  'goodMorning', 'goodAfternoon', 'goodEvening',
  'incognitoTitle', 'incognitoDesc', 'incognitoPlaceholder',
  'shieldActive', 'shieldDisabled', 'searchEngine',
  'tasks', 'tasksLeft', 'clearCompletedTasks', 'noTasks',
  'addTaskPlaceholder', 'deleteTask', 'clearTasksTitle',
  'addShortcutTitle', 'editShortcutTitle', 'shortcutName', 'shortcutUrl',
  'shuffleWallpaper'
];

const requiredHistoryKeys = [
  'title', 'pagesRecorded', 'clearBrowsingData', 'searchPlaceholder',
  'noHistory', 'today', 'yesterday', 'last7Days', 'older',
  'clearModalTitle', 'clearModalDesc', 'lastHour', 'last24Hours',
  'last7DaysOption', 'allTime'
];

const requiredDownloadsKeys = [
  'title', 'clearList', 'searchPlaceholder', 'noDownloads',
  'noDownloadsDesc', 'openFolder', 'cancel', 'pause', 'resume',
  'retry', 'completed', 'cancelled', 'interrupted', 'progressing'
];

for (const [langCode, dict] of Object.entries(dictionaries)) {
  const d = dict as Record<string, any>;
  for (const key of requiredNewtabKeys) {
    assert.ok(d.newtab && typeof d.newtab[key] === 'string' && d.newtab[key].length > 0, `Missing newtab.${key} in ${langCode}`);
  }
  for (const key of requiredHistoryKeys) {
    assert.ok(d.history && typeof d.history[key] === 'string' && d.history[key].length > 0, `Missing history.${key} in ${langCode}`);
  }
  for (const key of requiredDownloadsKeys) {
    assert.ok(d.downloads && typeof d.downloads[key] === 'string' && d.downloads[key].length > 0, `Missing downloads.${key} in ${langCode}`);
  }
}

// Reset language to en
setLanguage('en');

console.log('[PASS] [i18n Localization] Locale date/time formatting, greetings and dictionary coverage verified.');
