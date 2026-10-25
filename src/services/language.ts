/**
 * Language primitives shared by the interface engine, the settings hook and
 * the Electron launch path.
 *
 * This module stays dependency-free on purpose: it is imported from React
 * code, from Node-only tests and from scripts that have no DOM.
 */

/** The three interface languages King ships. */
export type InterfaceLanguage = 'en' | 'ar' | 'de';

/**
 * Legacy language codes stay readable at the API boundary so old backups and
 * synced preferences still load, but they cannot select a fourth interface
 * language. Turkish resolves to English.
 */
export type SupportedLanguage = InterfaceLanguage | 'tr';

/** Selectable interface languages, in presentation order. */
export const INTERFACE_LANGUAGES: readonly InterfaceLanguage[] = ['en', 'ar', 'de'];

/** BCP 47 locales used for `Intl` date, time and plural formatting. */
export const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-US',
  ar: 'ar-SA',
  de: 'de-DE',
  // Legacy Turkish preferences render in the English interface and locale.
  tr: 'en-US'
};

/**
 * Maps any stored, detected or caller-supplied language code to one of the
 * three interface languages. Unknown values and legacy codes fall back to
 * English instead of failing.
 */
export function normalizeLanguage(value?: string | null): InterfaceLanguage {
  if (!value) return 'en';
  const base = String(value).trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'ar') return 'ar';
  if (base === 'de') return 'de';
  return 'en';
}

/** BCP 47 locale for `Intl`, resolved through {@link normalizeLanguage}. */
export function getLocaleFor(lang?: string | null): string {
  return LOCALE_MAP[normalizeLanguage(lang)];
}

/** True only for Arabic, the single right-to-left interface language. */
export function isRTLLanguage(lang?: string | null): boolean {
  return normalizeLanguage(lang) === 'ar';
}
