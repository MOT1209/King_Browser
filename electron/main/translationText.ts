/**
 * Text helpers for page translation, split out of main.ts (plan.md, WP9).
 * Pure functions with no Electron imports, so they can be tested directly.
 */

export function escapeHtmlForTranslation(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TRANSLATION_HTML_ENTITY_MAP: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&amp;': '&'
};

export function unescapeHtmlForTranslation(str: string): string {
  return str.replace(/&(?:lt|gt|quot|#39|nbsp|amp);/g, (match) => TRANSLATION_HTML_ENTITY_MAP[match] || match);
}
