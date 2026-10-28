import assert from 'node:assert/strict';
import {
  DEFAULT_MENU_ACCELERATORS,
  bindingToAccelerator,
  resolveMenuAccelerators,
  sanitizeMenuBindings,
} from '../electron/main/shortcutAccelerators';

console.log('\n--- Menu accelerators follow Settings > Shortcuts ---');

const b = (key: string, opts: { shift?: boolean; meta?: boolean; alt?: boolean } = {}) =>
  ({ key, shift: !!opts.shift, meta: opts.meta ?? true, alt: !!opts.alt });

assert.equal(bindingToAccelerator(b('t')), 'CmdOrCtrl+T');
assert.equal(bindingToAccelerator(b('y', { shift: true })), 'Shift+CmdOrCtrl+Y');
assert.equal(bindingToAccelerator(b('p', { alt: true, meta: false })), 'Alt+P');
assert.equal(bindingToAccelerator(b('arrowleft', { alt: true })), 'Alt+CmdOrCtrl+Left');
assert.equal(bindingToAccelerator(b('f6', { meta: false })), 'F6');
assert.equal(bindingToAccelerator(b('+')), 'CmdOrCtrl+Plus');
assert.equal(bindingToAccelerator(b('a', { meta: false })), null, 'a bare letter is never a menu shortcut');

// Unknown ids and malformed bindings are dropped (fail closed).
const sanitized = sanitizeMenuBindings({
  newTab: { key: 'Y', shift: true, meta: true },
  closeTab: { key: 'ctrl+w' },
  bogus: { key: 't', meta: true },
  print: 'p',
  reload: { key: '<script>', meta: true },
  zoomOut: { key: '-', meta: 'yes' },
});
assert.deepEqual(sanitized, { newTab: b('y', { shift: true }), zoomOut: b('-', { meta: false }) });
assert.deepEqual(sanitizeMenuBindings(null), {});
assert.deepEqual(sanitizeMenuBindings([1, 2]), {});

// Regression: a rebound action kept firing from the menu on its old keys.
const rebound = resolveMenuAccelerators({ newTab: b('y', { shift: true }) });
assert.equal(rebound.newTab, 'Shift+CmdOrCtrl+Y');
assert.equal(rebound.closeTab, DEFAULT_MENU_ACCELERATORS.closeTab, 'untouched items keep their default');
assert.ok(!Object.values(rebound).includes('CmdOrCtrl+T'), 'the old key is free again');

// Swapping two actions works.
const swapped = resolveMenuAccelerators({ newTab: b('w'), closeTab: b('t') });
assert.equal(swapped.newTab, 'CmdOrCtrl+W');
assert.equal(swapped.closeTab, 'CmdOrCtrl+T');

// Reserved or taken keys are refused: the item keeps its default if free, else no key.
const reserved = resolveMenuAccelerators({ newTab: b('c') });
assert.equal(reserved.newTab, 'CmdOrCtrl+T', 'Ctrl+C (copy) cannot be taken; default kept');
const taken = resolveMenuAccelerators({ newTab: b('d') });
assert.equal(taken.newTab, 'CmdOrCtrl+T', 'another item default cannot be taken');
const clash = resolveMenuAccelerators({ newTab: b('w'), closeTab: b('w') });
assert.equal(clash.newTab, 'CmdOrCtrl+W');
assert.equal(clash.closeTab, '', 'its own default (Ctrl+W) is taken too, so it gets no key');
const values = Object.values(clash).filter(Boolean);
assert.equal(new Set(values).size, values.length, 'no two menu items share an accelerator');

console.log('[PASS] [Menu-Accelerators] menu keys follow user bindings, validated and collision-free.');
