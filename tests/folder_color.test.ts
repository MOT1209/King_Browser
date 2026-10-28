import assert from 'node:assert/strict';
import { FOLDER_COLOR_KEYS, FOLDER_COLOR_CLASSES, normalizeFolderColor, setFolderColor } from '../src/utils/folderColors';
import type { Folder } from '../src/types/browser';

console.log('\n--- Folder colors ---');

const folder = (over: Partial<Folder> = {}): Folder => ({ id: 'f1', name: 'Work', isExpanded: true, workspaceId: 'w1', ...over });

// Only palette keys are accepted: synced or imported data can never inject a style.
for (const key of FOLDER_COLOR_KEYS) assert.equal(normalizeFolderColor(key), key);
assert.equal(normalizeFolderColor('RED'), undefined, 'keys are exact');
assert.equal(normalizeFolderColor('#ff0000'), undefined, 'a CSS color is not a palette key');
assert.equal(normalizeFolderColor('red; background:url(x)'), undefined);
assert.equal(normalizeFolderColor('__proto__'), undefined);
assert.equal(normalizeFolderColor('constructor'), undefined);
assert.equal(normalizeFolderColor(42), undefined);
assert.equal(normalizeFolderColor(null), undefined);
assert.equal(normalizeFolderColor(undefined), undefined);

// Every palette key has classes (Tailwind needs literal names, so this guards a forgotten entry).
for (const key of FOLDER_COLOR_KEYS) {
  const classes = FOLDER_COLOR_CLASSES[key];
  assert.ok(classes && classes.dot && classes.icon && classes.border, `${key} has classes`);
}
assert.equal(Object.keys(FOLDER_COLOR_CLASSES).length, FOLDER_COLOR_KEYS.length, 'no stray class entries');

// Setting and clearing.
{
  const folders = [folder(), folder({ id: 'f2', name: 'Home' })];
  const next = setFolderColor(folders, 'f1', 'blue');
  assert.equal(next[0].color, 'blue');
  assert.equal(next[1].color, undefined, 'other folders are untouched');
  assert.equal(next[1], folders[1], 'untouched rows keep their identity');
  assert.equal(folders[0].color, undefined, 'the input is not mutated');

  const cleared = setFolderColor(next, 'f1', undefined);
  assert.equal('color' in cleared[0], false, 'clearing removes the field');

  assert.equal(setFolderColor(folders, 'f1', 'neon-green' as any)[0].color, undefined, 'an unknown color is refused');
  assert.equal(setFolderColor(folders, 'nope', 'blue'), folders, 'an unknown folder changes nothing');
  assert.equal(setFolderColor(next, 'f1', 'blue'), next, 'setting the same color is a no-op');
}

// Folders saved before colors existed still read fine.
assert.equal(normalizeFolderColor((folder() as any).color), undefined);

console.log('[PASS] [Folder-Color] only palette colors are accepted and older folders are unaffected.');

// Wiring guard: the sidebar must only ever turn a folder's stored value into classes through the palette.
import fs from 'node:fs';
{
  const sidebar = fs.readFileSync('src/components/SidebarTabs.tsx', 'utf8');
  assert.ok(sidebar.includes('normalizeFolderColor(folder.color)'), 'the stored color is normalized before use');
  const uses = sidebar.match(/folder\.color/g) ?? [];
  assert.equal(uses.length, 1, 'folder.color is read in exactly one place, inside normalizeFolderColor');
  assert.ok(sidebar.includes('FOLDER_COLOR_CLASSES[folderColorKey]'), 'classes come from the literal palette');
}
console.log('[PASS] [Folder-Color] the sidebar only renders palette classes.');
