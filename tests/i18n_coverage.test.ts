import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setLanguage, l, displayTabTitle } from '../src/services/i18n';

console.log('\n--- Inline interface strings (l) ---');

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

// l() picks the active language and interpolates params.
setLanguage('de');
assert.equal(l({ en: 'v{v} available', ar: 'v{v} متاح', de: 'v{v} verfügbar' }, { v: '0.0.6' }), 'v0.0.6 verfügbar');
setLanguage('ar');
assert.equal(l({ en: 'Close', ar: 'إغلاق', de: 'Schließen' }), 'إغلاق');
// Built-in pages store an English title; it is translated when shown.
assert.equal(displayTabTitle({ url: 'king://settings', title: 'Settings' }), 'الإعدادات');
assert.equal(displayTabTitle({ url: 'https://example.com/', title: 'Example' }), 'Example');
setLanguage('en');
assert.equal(displayTabTitle({ url: 'king://newtab', title: 'New Tab' }), 'New Tab');

// Every l({ en, ar, de }) call in components carries non-empty Arabic and
// German text with the same {placeholders} as English.
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
    // JS strings are not HTML: an entity such as &apos; would be shown literally.
    for (const text of [m[1], m[2], m[3]]) assert.doesNotMatch(text, /&(#\d+|[a-z]+);/i, `${file}: HTML entity in "${text}"`);
  }
}
assert.ok(inlineCount > 200, `expected the translated surfaces to use l(), found ${inlineCount}`);
assert.equal(fs.existsSync('src/locales/tr.json'), false, 'Turkish is not an interface language');
console.log(`[PASS] ${inlineCount} inline interface strings carry Arabic and German with matching placeholders.`);
