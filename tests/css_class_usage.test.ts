import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// The King rebrand renamed the new-tab classes in the components but not in
// index.css, which silently dropped the new-tab layout. Every brand-prefixed
// class the stylesheet targets must still be used by some component.
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const sources = (fs.readdirSync(path.join(root, 'src'), { recursive: true }) as string[])
  .filter(file => /\.(tsx?|jsx?)$/.test(file))
  .map(file => fs.readFileSync(path.join(root, 'src', file), 'utf8'))
  .join('\n');

const classes = [...new Set([...css.matchAll(/\.((?:king|nova)-[a-z0-9-]+)/g)].map(m => m[1]))];
assert.ok(classes.length > 0, 'expected brand-prefixed classes in index.css');
for (const name of classes) {
  assert.ok(new RegExp(`(^|[^a-z0-9-])${name}([^a-z0-9-]|$)`).test(sources), `index.css styles .${name}, but no component uses that class`);
}
console.log(`[PASS] [CSS-Classes] ${classes.length} brand-prefixed classes in index.css are all used by components.`);
