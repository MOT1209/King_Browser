// King's interface ships in English, Arabic and German. All three
// dictionaries are bundled, so switching never waits on a network or chunk load.
import en from '../locales/en.json';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import { useState, useEffect } from 'react';

export type SupportedLanguage = 'en' | 'ar' | 'de';
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'ar', 'de'];

type Dictionary = Record<string, any>;
const dictionaries: Record<SupportedLanguage, Dictionary> = { en, ar, de };
let activeLanguage: SupportedLanguage = 'en';

/**
 * Maps any stored or OS language code to an interface language. Unknown and
 * retired codes (old settings and backups may still say 'tr') fall back to English.
 */
export function normalizeLanguage(lang: unknown): SupportedLanguage {
  if (typeof lang !== 'string') return 'en';
  const code = lang.trim().toLowerCase();
  if (code === 'ar' || code.startsWith('ar-')) return 'ar';
  if (code === 'de' || code.startsWith('de-')) return 'de';
  return 'en';
}

export function ensureLanguageLoaded(_lang?: SupportedLanguage): Promise<void> {
  return Promise.resolve();
}

/** Lets tests replace a dictionary. */
export function seedDictionary(lang: SupportedLanguage, dict: Dictionary): void {
  const key = normalizeLanguage(lang);
  dictionaries[key] = dict;
}

export function isLanguageReady(_lang?: SupportedLanguage): boolean {
  return true;
}

export const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-US', ar: 'ar', de: 'de-DE'
};

export function getLocale(lang?: SupportedLanguage): string {
  return LOCALE_MAP[normalizeLanguage(lang ?? activeLanguage)];
}

export function formatDate(date: Date | number, lang?: SupportedLanguage, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const locale = getLocale(lang);
  return d.toLocaleDateString(locale, options || { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatTime(date: Date | number, lang?: SupportedLanguage, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const locale = getLocale(lang);
  return d.toLocaleTimeString(locale, options || { hour: '2-digit', minute: '2-digit' });
}

const listeners = new Set<(lang: SupportedLanguage) => void>();

export function isRTL(lang?: string): boolean {
  return normalizeLanguage(lang ?? activeLanguage) === 'ar';
}

function applyDocumentLanguage(lang: SupportedLanguage): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
}

function readStoredLanguage(): SupportedLanguage {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('nova_language');
      if (stored) return normalizeLanguage(stored);
    }
  } catch (_) {}
  return 'en';
}

// Apply the last chosen language before the first render, so the UI does not
// flash English (and left-to-right) for Arabic users.
activeLanguage = readStoredLanguage();
applyDocumentLanguage(activeLanguage);

export function getLanguage(): SupportedLanguage {
  return activeLanguage;
}

export function setLanguage(lang: SupportedLanguage | string): void {
  const next = normalizeLanguage(lang);
  const changed = next !== activeLanguage;
  activeLanguage = next;
  // Do not rewrite user_settings here: its persistence owner holds live state.
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('nova_language', next);
  } catch (_) {}
  applyDocumentLanguage(next);
  if (!changed) return;
  listeners.forEach(fn => {
    try { fn(next); } catch (_) {}
  });
}

export function onLanguageChange(fn: (lang: SupportedLanguage) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Suffix that marks a CLDR plural form, e.g. `downloads.totalItems_one`. */
const PLURAL_SUFFIX_SEPARATOR = '_';

/**
 * Resolves a dotted key path to a string, or `undefined` when any segment is
 * missing or the final value is not a string.
 */
function lookupString(dict: Record<string, any> | undefined, parts: string[]): string | undefined {
  if (!dict) return undefined;
  let current: any = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

const pluralRulesCache = new Map<string, Intl.PluralRules | null>();

function getPluralRules(locale: string): Intl.PluralRules | null {
  if (pluralRulesCache.has(locale)) {
    return pluralRulesCache.get(locale) ?? null;
  }
  let rules: Intl.PluralRules | null = null;
  try {
    rules = new Intl.PluralRules(locale);
  } catch (_) {
    rules = null;
  }
  pluralRulesCache.set(locale, rules);
  return rules;
}

/**
 * CLDR category (`zero`/`one`/`two`/`few`/`many`/`other`) that `count` falls
 * into for `locale`. Returns `undefined` when the runtime has no usable
 * `Intl.PluralRules`, so callers can fall back to the unsuffixed string.
 */
function selectPluralCategory(locale: string, count: number): string | undefined {
  const rules = getPluralRules(locale);
  if (!rules) return undefined;
  try {
    return rules.select(count);
  } catch (_) {
    return undefined;
  }
}

/** First `number`-typed param, in insertion order. Strings are never counts. */
function firstNumericParam(params: Record<string, string | number>): number | undefined {
  for (const value of Object.values(params)) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function t(path: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[activeLanguage] || dictionaries.en;
  const parts = path.split('.');

  // Base string, with the pre-existing whole-key fallback to English.
  let current = lookupString(dict, parts);
  if (current === undefined) {
    current = lookupString(dictionaries.en, parts);
  }
  if (current === undefined) {
    return path;
  }

  if (params) {
    // Plural support: when a numeric param is interpolated, prefer a
    // CLDR-suffixed variant of the resolved key. The suffix goes on the LAST
    // path segment — `downloads.totalItems` -> `downloads.totalItems_one` —
    // because that is where the form lives in the dictionaries, not as a
    // further level of nesting. The category always comes from the *active*
    // locale's rules, and the variant is only ever read from the active
    // dictionary: borrowing another language's inflected form would leak e.g.
    // English "1 total item" into a Turkish UI, which is strictly worse than
    // the uninflected base string. Keys without a suffixed variant render
    // exactly as they always have.
    const count = firstNumericParam(params);
    if (count !== undefined) {
      const category = selectPluralCategory(getLocale(), count);
      if (category) {
        const pluralParts = parts.slice();
        pluralParts[pluralParts.length - 1] =
          `${pluralParts[pluralParts.length - 1]}${PLURAL_SUFFIX_SEPARATOR}${category}`;
        const variant = lookupString(dict, pluralParts);
        if (variant !== undefined) {
          current = variant;
        }
      }
    }

    let text = current;
    Object.entries(params).forEach(([k, v]) => {
      text = text.split(`{${k}}`).join(String(v));
    });
    return text;
  }
  return current;
}

/**
 * Inline translation for component strings that have no dictionary key:
 * `l({ en: 'Close', ar: 'إغلاق', de: 'Schließen' })`. The type requires all
 * three languages, so a string cannot ship untranslated. `{name}` params are
 * interpolated like t().
 */
export type LocalizedText = Record<SupportedLanguage, string>;
export function l(texts: LocalizedText, params?: Record<string, string | number>): string {
  let text = texts[activeLanguage] ?? texts.en;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.split(`{${k}}`).join(String(v));
    });
  }
  return text;
}

/**
 * Title to show for a tab. Built-in pages (king://newtab, settings, ...) store
 * an English title in tab state, so they are translated at display time; web
 * pages keep the title the site set.
 */
const INTERNAL_PAGE_TITLES: Array<[string, LocalizedText]> = [
  ['king://newtab', { en: 'New Tab', ar: 'تبويب جديد', de: 'Neuer Tab' }],
  ['king://settings', { en: 'Settings', ar: 'الإعدادات', de: 'Einstellungen' }],
  ['king://history', { en: 'History', ar: 'السجل', de: 'Verlauf' }],
  ['king://downloads', { en: 'Downloads', ar: 'التنزيلات', de: 'Downloads' }],
  ['king://changelog', { en: "What's New", ar: 'ما الجديد', de: 'Neuigkeiten' }],
  ['king://whats-new', { en: "What's New", ar: 'ما الجديد', de: 'Neuigkeiten' }],
];
export function displayTabTitle(tab: { title?: string; url?: string } | null | undefined): string {
  const url = tab?.url || '';
  for (const [prefix, text] of INTERNAL_PAGE_TITLES) {
    if (url === prefix || url.startsWith(`${prefix}#`) || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)) return l(text);
  }
  if (!url || url === 'about:blank') {
    if (!tab?.title || tab.title === 'New Tab') return l(INTERNAL_PAGE_TITLES[0][1]);
  }
  return tab?.title || url || l(INTERNAL_PAGE_TITLES[0][1]);
}

export function useTranslation() {
  const [lang, setLangState] = useState<SupportedLanguage>(activeLanguage);

  useEffect(() => {
    return onLanguageChange(newLang => {
      setLangState(newLang);
    });
  }, []);

  return {
    t,
    l,
    language: lang,
    locale: getLocale(lang),
    isRTL: isRTL(lang),
    setLanguage,
    formatDate: (date: Date | number, options?: Intl.DateTimeFormatOptions) => formatDate(date, lang, options),
    formatTime: (date: Date | number, options?: Intl.DateTimeFormatOptions) => formatTime(date, lang, options)
  };
}
