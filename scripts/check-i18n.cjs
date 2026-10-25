#!/usr/bin/env node
/**
 * Verifies that the three interface dictionaries stay complete and safe to
 * render.
 *
 * Checks:
 *   1. Every English key exists in Arabic and German.
 *   2. No dictionary adds a key that English does not define, except for the
 *      extra CLDR plural forms Arabic grammar requires (`_zero`, `_two`, ...).
 *   3. No translated value is empty.
 *   4. Placeholders (`{name}`) match between English and each translation.
 *
 * Exits with code 1 when a check fails so CI can block the change.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const LANGUAGES = ['ar', 'de'];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function readDictionary(code) {
  const file = path.join(LOCALES_DIR, `${code}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${file}: ${error.message}`);
    process.exit(1);
  }
}

function flatten(value, prefix = '') {
  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      entries.push(...flatten(child, fullKey));
    } else {
      entries.push([fullKey, child]);
    }
  }
  return entries;
}

function placeholders(text) {
  const found = new Set();
  for (const match of String(text).matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

const english = new Map(flatten(readDictionary('en')));
const failures = [];

for (const code of LANGUAGES) {
  const translated = new Map(flatten(readDictionary(code)));

  for (const [key, englishValue] of english) {
    if (!translated.has(key)) {
      failures.push(`${code}: missing key "${key}"`);
      continue;
    }

    const value = translated.get(key);
    if (typeof value !== 'string' || value.trim() === '') {
      failures.push(`${code}: "${key}" must be a non-empty string`);
      continue;
    }

    // Arabic plural forms may legitimately omit a placeholder (for example,
    // the zero form does not print the count), so only compare base keys.
    if (!PLURAL_SUFFIX.test(key)) {
      const expected = placeholders(englishValue);
      const actual = placeholders(value);
      if (expected.join(',') !== actual.join(',')) {
        failures.push(
          `${code}: "${key}" placeholders [${actual.join(', ')}] do not match English [${expected.join(', ')}]`
        );
      }
    }
  }

  for (const key of translated.keys()) {
    if (english.has(key)) continue;
    const base = key.replace(PLURAL_SUFFIX, '');
    if (PLURAL_SUFFIX.test(key) && english.has(base)) continue;
    failures.push(`${code}: unexpected key "${key}"`);
  }
}

if (failures.length > 0) {
  console.error('Interface dictionary check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Interface dictionaries are complete: ${english.size} keys in English, Arabic and German.`
);
