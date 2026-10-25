/**
 * King ships three interface languages: English, Arabic and German.
 *
 * The dictionaries are bundled, so switching languages is synchronous and
 * works offline. Arabic is right-to-left; English and German are left-to-right.
 * The active language is persisted to `nova_language` and reflected on the
 * document element so layout and assistive technology see it immediately.
 */
import en from '../locales/en.json';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import { useState, useEffect } from 'react';
import {
  INTERFACE_LANGUAGES,
  LOCALE_MAP,
  getLocaleFor,
  isRTLLanguage,
  normalizeLanguage,
  type InterfaceLanguage,
  type SupportedLanguage
} from './language';

export {
  INTERFACE_LANGUAGES,
  LOCALE_MAP,
  normalizeLanguage,
  type InterfaceLanguage,
  type SupportedLanguage
};

type Dictionary = Record<string, any>;

const dictionaries: Record<InterfaceLanguage, Dictionary> = { en, ar, de };

/**
 * Reads the last selected interface language. `user_settings` is consulted
 * second so preferences saved before `nova_language` existed still survive.
 */
function readStoredLanguage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const direct = localStorage.getItem('nova_language');
    if (direct) return direct;
    const raw = localStorage.getItem('user_settings');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.language === 'string') return parsed.language;
  } catch (_) {
    return null;
  }
  return null;
}

function detectInitialLanguage(): InterfaceLanguage {
  const stored = readStoredLanguage();
  if (stored) return normalizeLanguage(stored);
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return normalizeLanguage(navigator.language);
    }
  } catch (_) {}
  return 'en';
}

let activeLanguage: InterfaceLanguage = detectInitialLanguage();

function applyDocumentLanguage(lang: InterfaceLanguage): void {
  if (typeof document === 'undefined') return;
  try {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTLLanguage(lang) ? 'rtl' : 'ltr';
  } catch (_) {}
}

applyDocumentLanguage(activeLanguage);

export function ensureLanguageLoaded(_lang?: SupportedLanguage): Promise<void> {
  return Promise.resolve();
}

function mergeDictionary(target: Dictionary, source: Dictionary): void {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existing = target[key];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        target[key] = {};
      }
      mergeDictionary(target[key], value as Dictionary);
    } else {
      target[key] = value;
    }
  }
}

/**
 * Overlays strings on a bundled dictionary. Used by tests and by callers that
 * extend the interface at runtime; unknown codes resolve to English.
 */
export function seedDictionary(lang: SupportedLanguage, dict: Dictionary): void {
  if (!dict || typeof dict !== 'object') return;
  const target = normalizeLanguage(lang);
  mergeDictionary(dictionaries[target], dict);
}

export function isLanguageReady(_lang?: SupportedLanguage): boolean {
  return true;
}

export function getLocale(lang?: SupportedLanguage): string {
  return getLocaleFor(lang ?? activeLanguage);
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
  return isRTLLanguage(lang ?? activeLanguage);
}

export function getLanguage(): SupportedLanguage {
  return activeLanguage;
}

/**
 * Selects an interface language, persists it and notifies subscribers.
 * Legacy codes resolve to English. The settings hook owns `user_settings`
 * persistence, so this only writes the small boot-time key.
 */
export function setLanguage(lang: SupportedLanguage | string): void {
  const next = normalizeLanguage(lang);
  activeLanguage = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('nova_language', next);
  } catch (_) {}
  applyDocumentLanguage(next);
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

  // Base string, with a whole-key fallback to English when the active
  // dictionary has not been translated yet.
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
    // English "1 total item" into an Arabic UI, which is strictly worse than
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
export type LocalizedText = Record<InterfaceLanguage, string>;
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
