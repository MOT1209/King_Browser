/**
 * Native agent input (src/utils/trustedInput.ts).
 *
 * Regressions this suite prevents:
 *   - Typing set el.value and fired synthetic input/change events, which React
 *     controlled inputs and contenteditable editors ignore.
 *   - press_key dispatched untrusted KeyboardEvents, so key combos and the
 *     browser's own Enter handling never happened.
 *   - Scrolling called window.scrollBy, so inner scroll containers never moved.
 *   - A covered element was clicked through el.click(), which no human can do.
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseKeyCombo,
  selectAllCombo,
  keyEventSequence,
  wheelDelta,
  buildLocateScript
} from '../src/utils/trustedInput';

console.log('\n--- Trusted agent input ---');

// Key names map to Electron accelerator names; modifiers are normalised.
assert.deepEqual(parseKeyCombo('Enter'), { keyCode: 'Enter', modifiers: [] });
assert.deepEqual(parseKeyCombo('ArrowDown'), { keyCode: 'Down', modifiers: [] });
assert.deepEqual(parseKeyCombo('escape'), { keyCode: 'Escape', modifiers: [] });
assert.deepEqual(parseKeyCombo('a'), { keyCode: 'a', modifiers: [] });
assert.deepEqual(parseKeyCombo('F5'), { keyCode: 'F5', modifiers: [] });
assert.deepEqual(parseKeyCombo('Ctrl+Shift+K'), { keyCode: 'K', modifiers: ['control', 'shift'] });
assert.deepEqual(parseKeyCombo('Cmd+a'), { keyCode: 'a', modifiers: ['meta'] });
assert.deepEqual(parseKeyCombo('Control++'), { keyCode: 'Plus', modifiers: ['control'] });
assert.deepEqual(parseKeyCombo('ع'), { keyCode: 'ع', modifiers: [] }, 'a single Arabic letter is a key');
console.log('[PASS] Trusted input — key names and combos parse');

for (const bad of ['', '   ', 'NotAKey', 'Hyper+a', 'Control+', 'F99', 'ab', 'a'.repeat(100), null, 42]) {
  assert.equal(parseKeyCombo(bad as any), null, `rejects ${JSON.stringify(bad)}`);
}
console.log('[PASS] Trusted input — unknown keys and modifiers are rejected');

assert.deepEqual(selectAllCombo('MacIntel'), { keyCode: 'a', modifiers: ['meta'] });
assert.deepEqual(selectAllCombo('Win32'), { keyCode: 'a', modifiers: ['control'] });
assert.deepEqual(selectAllCombo('Linux x86_64'), { keyCode: 'a', modifiers: ['control'] });
console.log('[PASS] Trusted input — select-all uses the platform modifier');

// A printable key and Enter get a char event (Enter's char is what triggers the
// browser's implicit form submission); shortcuts and navigation keys do not.
const types = (combo: ReturnType<typeof parseKeyCombo>) => keyEventSequence(combo!).map(e => e.type).join(',');
assert.equal(types(parseKeyCombo('Enter')), 'keyDown,char,keyUp');
assert.equal(types(parseKeyCombo('x')), 'keyDown,char,keyUp');
assert.equal(types(parseKeyCombo('Control+a')), 'keyDown,keyUp', 'a shortcut types no character');
assert.equal(types(parseKeyCombo('Tab')), 'keyDown,keyUp');
assert.equal(types(parseKeyCombo('Down')), 'keyDown,keyUp');
assert.ok(keyEventSequence(parseKeyCombo('Shift+Tab')!).every(e => e.modifiers.includes('shift')), 'modifiers ride on every event');
console.log('[PASS] Trusted input — key event sequences');

assert.deepEqual(wheelDelta('down', 300), { deltaX: 0, deltaY: -300 });
assert.deepEqual(wheelDelta('up', 300), { deltaX: 0, deltaY: 300 });
assert.deepEqual(wheelDelta('right', 200), { deltaX: -200, deltaY: 0 });
assert.deepEqual(wheelDelta('down', undefined), { deltaX: 0, deltaY: -500 }, 'default amount matches the old scroll');
assert.deepEqual(wheelDelta('down', 99999), { deltaX: 0, deltaY: -10000 }, 'amount is clamped');
assert.equal(wheelDelta('top', 100), null, 'top/bottom are not wheel scrolls');
assert.equal(wheelDelta('sideways' as any, 100), null);
console.log('[PASS] Trusted input — wheel deltas');

// The locate script is page code: it must embed the selector as a JSON string,
// and report a covered element instead of clicking through it.
{
  const hostile = 'a"); alert(1); ("';
  assert.ok(buildLocateScript(hostile).includes(JSON.stringify(hostile)), 'selector is JSON-encoded');

  const dom = new JSDOM('<button id="go">Go</button><div id="cover" class="modal">Cookie banner</div>', { runScripts: 'outside-only' });
  const win = dom.window as any;
  win.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 40, right: 110, bottom: 50 });
  win.HTMLElement.prototype.scrollIntoView = () => {};

  win.document.elementFromPoint = () => win.document.getElementById('go');
  const hit = win.eval(buildLocateScript('#go'));
  assert.equal(hit.found, true);
  assert.equal(hit.hit, true, 'uncovered element is hit');
  assert.equal(hit.x, 60);
  assert.equal(hit.y, 30);

  win.document.elementFromPoint = () => win.document.getElementById('cover');
  const covered = win.eval(buildLocateScript('#go'));
  assert.equal(covered.hit, false, 'covered element is not hit');
  assert.ok(covered.covering.includes('div') && covered.covering.includes('Cookie banner'), `covering is described: ${covered.covering}`);

  // A hidden checkbox is reached through its label, as a person would click it.
  win.document.body.insertAdjacentHTML('beforeend', '<input type="checkbox" id="agree"><label for="agree" id="agree-label">I agree</label>');
  win.HTMLElement.prototype.getBoundingClientRect = function (this: any) {
    return this.id === 'agree'
      ? { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
      : { left: 10, top: 10, width: 100, height: 40, right: 110, bottom: 50 };
  };
  win.document.elementFromPoint = () => win.document.getElementById('agree-label');
  const viaLabel = win.eval(buildLocateScript('#agree'));
  assert.equal(viaLabel.hit, true, 'a zero-size checkbox is clicked through its label');

  assert.equal(win.eval(buildLocateScript('#missing')).found, false, 'missing element is reported');
  assert.equal(win.eval(buildLocateScript('[[bad')).error !== undefined, true, 'invalid selector is reported');
}
console.log('[PASS] Trusted input — locate script hit-tests and describes covers');

console.log('[PASS] Trusted input suite complete');
