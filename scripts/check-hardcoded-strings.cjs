#!/usr/bin/env node
/**
 * Flags English interface text written straight into components instead of
 * going through t() / l(), which leaves it untranslated in Arabic and German.
 *
 * Checks every .tsx file under src/ for:
 *   1. title, placeholder, aria-label and alt attributes with a literal string.
 *   2. JSX text between tags, such as <span>Close</span>.
 *
 * Brand and product names, sample values and language names are allowed (see
 * ALLOWED). A line can opt out with an `i18n-ignore` comment. Exits with code 1
 * when anything is found so CI can block the change.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Text that is the same in every language.
const ALLOWED = new Set([
  'King', 'King Browser', 'King AI', 'GitHub', 'Chromium', 'Electron', 'English',
  'you@example.com', 'user@example.com', 'example.com', 'bank.example.com',
  'king-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx'
]);

// The GitHub-style page BrowserView shows in the web demo (no Electron) is a
// mock of the project's repository page and intentionally stays in English.
const IGNORED_FILES = new Set([path.join('components', 'BrowserView.tsx')]);

const ATTRIBUTE = /\b(title|placeholder|aria-label|alt)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g;
const JSX_TEXT = />\s*([A-Za-z][A-Za-z'’.,!?&:\- ]*[a-z][A-Za-z'’.,!?&:\- ]*)\s*</g;
const TYPE_LIKE = /=>|Promise|Record|Array|Map|Set/;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

const failures = [];
for (const file of listFiles(SRC_DIR)) {
  const relative = path.relative(SRC_DIR, file);
  if (IGNORED_FILES.has(relative)) continue;
  let inBlockComment = false;
  fs.readFileSync(file, 'utf8').split('\n').forEach((raw, index) => {
    if (raw.includes('i18n-ignore')) return;
    // Comments are not interface text; drop them before matching.
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const start = line.indexOf('/*');
    if (start !== -1) {
      inBlockComment = true;
      line = line.slice(0, start);
    }
    if (line.trim().startsWith('//')) return;

    const report = (text) => {
      if (!ALLOWED.has(text.trim())) failures.push(`${relative}:${index + 1}  ${text.trim()}`);
    };
    for (const match of line.matchAll(ATTRIBUTE)) report(match[2]);
    for (const match of line.matchAll(JSX_TEXT)) {
      if (!TYPE_LIKE.test(match[1])) report(match[1]);
    }
  });
}

if (failures.length > 0) {
  console.error('Hard-coded interface text found (wrap it in t() or l()):');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('No hard-coded interface text found.');
