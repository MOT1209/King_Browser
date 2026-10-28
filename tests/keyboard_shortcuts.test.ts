import assert from 'node:assert/strict';
import { matchesShortcut, resolveActionFromShortcuts } from '../src/utils/keyboardShortcuts';
import type { ShortcutBinding } from '../src/types/browser';

console.log('\n--- Keyboard Shortcuts & Genuine matches() Test Suite ---');

// Standard King Browser default shortcuts configuration (macOS vs Windows)
const macShortcuts: Record<string, ShortcutBinding> = {
  newTab: { key: 't', shift: false, meta: true },
  reopenTab: { key: 't', shift: true, meta: true },
  closeTab: { key: 'w', shift: false, meta: true },
  newIncognito: { key: 'n', shift: true, meta: true },
  reload: { key: 'r', shift: false, meta: true },
  omnibox: { key: 'k', shift: false, meta: true },
  bookmark: { key: 'd', shift: false, meta: true },
  history: { key: 'y', shift: false, meta: true },
  downloads: { key: 'j', shift: true, meta: true },
  findInPage: { key: 'f', shift: false, meta: true },
  toggleSidebar: { key: 's', shift: false, meta: true },
};

const winShortcuts: Record<string, ShortcutBinding> = {
  ...macShortcuts,
  history: { key: 'h', shift: false, meta: true },
  downloads: { key: 'j', shift: false, meta: true },
};

// 1. Genuine matchesShortcut() evaluation on macOS (metaKey = ⌘ Cmd)
assert.strictEqual(matchesShortcut(macShortcuts.newTab, { key: 't', metaKey: true }, true), true, 'Cmd+T must trigger newTab');
assert.strictEqual(matchesShortcut(macShortcuts.newTab, { key: 'T', metaKey: true }, true), true, 'Case-insensitive key T must match');
assert.strictEqual(matchesShortcut(macShortcuts.newTab, { key: 't', ctrlKey: true }, true), false, 'Ctrl+T on Mac must NOT trigger newTab (primary modifier is Meta)');
assert.strictEqual(matchesShortcut(macShortcuts.newTab, { key: 't', metaKey: true, shiftKey: true }, true), false, 'Cmd+Shift+T must NOT match newTab (shift expected false)');

assert.strictEqual(matchesShortcut(macShortcuts.reopenTab, { key: 't', metaKey: true, shiftKey: true }, true), true, 'Cmd+Shift+T must trigger reopenTab');
assert.strictEqual(matchesShortcut(macShortcuts.closeTab, { key: 'w', metaKey: true }, true), true, 'Cmd+W must trigger closeTab');
assert.strictEqual(matchesShortcut(macShortcuts.newIncognito, { key: 'n', metaKey: true, shiftKey: true }, true), true, 'Cmd+Shift+N must trigger newIncognito');
assert.strictEqual(matchesShortcut(macShortcuts.reload, { key: 'r', metaKey: true }, true), true, 'Cmd+R must trigger reload');
assert.strictEqual(matchesShortcut(macShortcuts.omnibox, { key: 'k', metaKey: true }, true), true, 'Cmd+K must trigger omnibox');
assert.strictEqual(matchesShortcut(macShortcuts.bookmark, { key: 'd', metaKey: true }, true), true, 'Cmd+D must trigger bookmark');
assert.strictEqual(matchesShortcut(macShortcuts.downloads, { key: 'j', metaKey: true, shiftKey: true }, true), true, 'Cmd+Shift+J must trigger downloads on macOS');
assert.strictEqual(matchesShortcut(macShortcuts.downloads, { key: 'j', metaKey: true, shiftKey: false }, true), false, 'Cmd+J without shift must NOT match macOS downloads');

// 2. Genuine matchesShortcut() evaluation on Windows / Linux (ctrlKey = Ctrl)
assert.strictEqual(matchesShortcut(winShortcuts.newTab, { key: 't', ctrlKey: true }, false), true, 'Ctrl+T must trigger newTab on Windows');
assert.strictEqual(matchesShortcut(winShortcuts.newTab, { key: 't', metaKey: true }, false), false, 'Meta+T on Windows must NOT trigger newTab');
assert.strictEqual(matchesShortcut(winShortcuts.reopenTab, { key: 't', ctrlKey: true, shiftKey: true }, false), true, 'Ctrl+Shift+T must trigger reopenTab on Windows');
assert.strictEqual(matchesShortcut(winShortcuts.closeTab, { key: 'w', ctrlKey: true }, false), true, 'Ctrl+W must trigger closeTab on Windows');
assert.strictEqual(matchesShortcut(winShortcuts.downloads, { key: 'j', ctrlKey: true, shiftKey: false }, false), true, 'Ctrl+J must trigger downloads on Windows');
assert.strictEqual(matchesShortcut(winShortcuts.downloads, { key: 'j', ctrlKey: true, shiftKey: true }, false), false, 'Ctrl+Shift+J must NOT trigger downloads on Windows');
assert.strictEqual(matchesShortcut(winShortcuts.history, { key: 'h', ctrlKey: true }, false), true, 'Ctrl+H must trigger history on Windows');

// 3. Genuine resolveActionFromShortcuts() resolution against full dictionary
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 't', metaKey: true }, true), 'newTab');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 't', metaKey: true, shiftKey: true }, true), 'reopenTab');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 'w', metaKey: true }, true), 'closeTab');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 'j', metaKey: true, shiftKey: true }, true), 'downloads');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 'k', metaKey: true }, true), 'omnibox');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 'z', metaKey: true }, true), null, 'Unregistered key must return null');
assert.strictEqual(resolveActionFromShortcuts(macShortcuts, { key: 't' }, true), null, 'Key without modifier must return null');

console.log('[PASS] [Keyboard Shortcuts] Genuine matchesShortcut() and resolveActionFromShortcuts() verified across 23 test permutations.');

// 4. Alt modifier, recording and conflicts for the Settings > Shortcuts editor.
import { eventToBinding, findConflict, formatBinding } from '../src/utils/keyboardShortcuts';

// Bindings saved before Alt support (no `alt` field) must not fire on Alt chords.
assert.strictEqual(matchesShortcut(winShortcuts.newTab, { key: 't', ctrlKey: true, altKey: true }, false), false, 'AltGr+T must never trigger Ctrl+T');
assert.strictEqual(matchesShortcut({ key: 't', meta: true }, { key: 't', metaKey: true, altKey: true }, true), false, 'Cmd+Option+T must not match a Cmd+T binding');
assert.strictEqual(matchesShortcut({ key: 'p', alt: true, shift: true }, { key: 'p', altKey: true, shiftKey: true }, false), true, 'Alt+Shift+P binding matches on Windows');
assert.strictEqual(matchesShortcut({ key: 'i', meta: true, alt: true }, { key: 'i', metaKey: true, altKey: true }, true), true, 'Cmd+Option+I binding matches on macOS');

// Recording: modifiers alone and bare keys are not shortcuts; F-keys are.
assert.strictEqual(eventToBinding({ key: 'Control', ctrlKey: true }, false), null);
assert.strictEqual(eventToBinding({ key: 'a' }, false), null, 'a bare letter would fire while typing');
assert.strictEqual(eventToBinding({ key: 'q', ctrlKey: true, altKey: true }, false), null, 'AltGr chords are rejected');
assert.deepStrictEqual(eventToBinding({ key: 'K', ctrlKey: true, shiftKey: true }, false), { key: 'k', shift: true, meta: true, alt: false });
assert.deepStrictEqual(eventToBinding({ key: 'F6' }, false), { key: 'f6', shift: false, meta: false, alt: false });
assert.deepStrictEqual(eventToBinding({ key: '.', metaKey: true, shiftKey: true }, true), { key: '.', shift: true, meta: true, alt: false });
assert.strictEqual(eventToBinding({ key: 'k', ctrlKey: true }, true), null, 'Ctrl is not the primary modifier on macOS');

// Labels use the platform's modifier name instead of a combined "Cmd/Ctrl".
assert.strictEqual(formatBinding({ key: 't', meta: true }, false), 'Ctrl+T');
assert.strictEqual(formatBinding({ key: 't', meta: true, shift: true }, true), 'Cmd+Shift+T');
assert.strictEqual(formatBinding({ key: 'arrowleft', alt: true }, false), 'Alt+Left');
assert.strictEqual(formatBinding({ key: 'f12' }, false), 'F12');
assert.strictEqual(formatBinding(undefined, false), '');

// Conflicts: rebinding one action onto another's keys is reported, not silently shadowed.
assert.strictEqual(findConflict(winShortcuts, { key: 'w', meta: true }, 'newTab'), 'closeTab');
assert.strictEqual(findConflict(winShortcuts, { key: 't', meta: true, shift: false }, 'newTab'), null, 'an action does not conflict with itself');
assert.strictEqual(findConflict(winShortcuts, { key: 'w', meta: true, alt: true }, 'newTab'), null);

console.log('[PASS] [Keyboard Shortcuts] Alt bindings, recording, labels and conflict detection verified.');

// 5. Physical-key fallback: shortcuts must work on an Arabic keyboard layout,
// where Ctrl+T reports the Arabic letter on that key instead of 't'.
assert.strictEqual(matchesShortcut(winShortcuts.newTab, { key: 'ف', code: 'KeyT', ctrlKey: true }, false), true, 'Ctrl+T on an Arabic layout opens a new tab');
assert.strictEqual(matchesShortcut(winShortcuts.closeTab, { key: 'ص', code: 'KeyW', ctrlKey: true }, false), true, 'Ctrl+W on an Arabic layout closes the tab');
assert.deepStrictEqual(eventToBinding({ key: 'ق', code: 'KeyF', ctrlKey: true }, false), { key: 'f', shift: false, meta: true, alt: false }, 'recording on an Arabic layout stores the Latin key');
// Shift turns '.' into '>' on US layouts; the agent panel binding is Ctrl+Shift+.
assert.strictEqual(matchesShortcut({ key: '.', meta: true, shift: true }, { key: '>', code: 'Period', ctrlKey: true, shiftKey: true }, false), true);
// Latin layouts keep the character: AZERTY Ctrl+Z (physical W key) must not close the tab.
assert.strictEqual(matchesShortcut(winShortcuts.closeTab, { key: 'z', code: 'KeyW', ctrlKey: true }, false), false, 'AZERTY Ctrl+Z is undo, not close tab');

console.log('[PASS] [Keyboard Shortcuts] Arabic-layout and shifted-punctuation fallback verified.');

// 6. Only changed bindings are sent to the main process for the menu.
import { buildDefaultShortcuts, customizedBindings } from '../src/utils/shortcutCatalog';
{
  const defaults = buildDefaultShortcuts(false);
  assert.deepStrictEqual(customizedBindings(defaults, false), {}, 'defaults send nothing');
  assert.deepStrictEqual(customizedBindings(undefined, false), {});
  const changed = customizedBindings({ ...defaults, newTab: { key: 'Y', shift: true, meta: true }, settings: { key: 'q', meta: true } }, false);
  assert.deepStrictEqual(changed, { newTab: { key: 'y', shift: true, meta: true, alt: false } }, 'only changed catalog actions are sent');
  console.log('[PASS] [Keyboard Shortcuts] only customized bindings reach the menu.');
}

// 7. Reserved combinations: a custom binding must not take copy/paste or fixed browser keys.
import { reservedOwner } from '../src/utils/shortcutCatalog';
{
  assert.strictEqual(reservedOwner({ key: 'c', meta: true }, false), 'copy', 'binding Ctrl+C would break copy');
  assert.strictEqual(reservedOwner({ key: 'z', meta: true, shift: true }, false), 'redo');
  assert.strictEqual(reservedOwner({ key: '3', meta: true }, false), 'switchTab');
  assert.strictEqual(reservedOwner({ key: 'f5' }, false), 'reload');
  assert.strictEqual(reservedOwner({ key: 'arrowleft', alt: true }, false), 'goBack');
  assert.strictEqual(reservedOwner({ key: 'q', meta: true }, true), 'quit');
  assert.strictEqual(reservedOwner({ key: 'q', meta: true }, false), null);
  assert.strictEqual(reservedOwner({ key: 'y', meta: true, shift: true }, false), null);
  // Every default binding is allowed (defaults may equal a reserved key, e.g. none today).
  for (const [id, binding] of Object.entries(buildDefaultShortcuts(false))) {
    assert.strictEqual(reservedOwner(binding, false), null, `default ${id} must not be reserved`);
  }
  console.log('[PASS] [Keyboard Shortcuts] reserved combinations are refused.');
}
