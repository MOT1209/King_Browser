import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isElementRef, refToSelector, resolveElementRef } from '../electron/main/elementRefs';
import { buildSnapshotScript } from '../src/utils/elementSnapshot';

// jsdom is loaded at run time (it reads files next to itself), not bundled.
const nodeRequire = createRequire(join(process.cwd(), 'noop.js'));
const { JSDOM } = nodeRequire('jsdom') as typeof import('jsdom');

console.log('\n--- Element Refs Test Suite ---');

{
  for (const ok of ['e1', 'e12', 'e99999']) assert.equal(isElementRef(ok), true, ok);
  for (const bad of ['', 'e0', 'e012', 'E1', 'e', 'e1; drop', 'e1"]', '[data-king-ref="e1"]', 'e100000', 12, null, undefined]) {
    assert.equal(isElementRef(bad), false, String(bad));
  }
  assert.equal(refToSelector('e12'), '[data-king-ref="e12"]');
  assert.throws(() => refToSelector('e1"] , body'), /Invalid element ref/);
  console.log('[PASS] Element refs — only e<number> is accepted and nothing else can reach a selector');
}

{
  assert.deepEqual(resolveElementRef('browser_click', { ref: 'e3' }), { selector: '[data-king-ref="e3"]' });
  assert.deepEqual(resolveElementRef('browser_type', { ref: 'e3', text: 'hi' }), { text: 'hi', selector: '[data-king-ref="e3"]' });
  assert.equal(resolveElementRef('browser_click', { ref: 'e3', selector: '#other' }).selector, '[data-king-ref="e3"]', 'a ref wins over a selector');
  assert.deepEqual(resolveElementRef('browser_click', { selector: '#go' }), { selector: '#go' }, 'selectors still work');
  assert.throws(() => resolveElementRef('browser_click', { ref: 'bad' }), /Invalid element ref/);
  assert.throws(() => resolveElementRef('browser_click', {}), /needs a "ref"/);
  assert.throws(() => resolveElementRef('browser_type', { text: 'x' }), /needs a "ref"/);
  const untouched = { url: 'https://example.com', ref: 'whatever' };
  assert.equal(resolveElementRef('browser_navigate', untouched), untouched, 'tools without a target are left alone');
  console.log('[PASS] Element refs — ref becomes a selector before classification; bad or missing targets are refused');
}

{
  const dom = new JSDOM(`<!doctype html><title>Shop  page</title><body>
    <a href="/cart?x=1#top">Cart</a>
    <button>Delete account</button>
    <button disabled>Disabled</button>
    <label for="q">Search</label><input id="q" type="text" value="secret typed value">
    <input type="password" aria-label="Password" value="hunter2">
    <input type="checkbox" aria-label="Remember me" checked>
    <input type="hidden" name="csrf" value="tok">
    <select aria-label="Country"><option>DE</option></select>
    <div role="button" aria-label='Say "hi"'>x</div>
    <button aria-hidden="true">Hidden from AT</button>
    <p>Plain text is not listed</p>
  </body>`, { url: 'https://shop.example/page', runScripts: 'outside-only' });
  const run = () => dom.window.eval(buildSnapshotScript({ requireVisible: false })) as string;
  const out = run();
  assert.match(out, /^URL: https:\/\/shop\.example\/page\nTitle: Shop page\nElements: 7\n/, 'header counts the listed elements');
  assert.match(out, /e1 link "Cart" -> \/cart\?x=1\n/, 'links show their target without the fragment');
  assert.match(out, /e2 button "Delete account"/);
  assert.match(out, /e3 textbox "Search"/, 'a label names its field');
  assert.match(out, /e4 textbox\(password\) "Password"/, 'password fields are marked');
  assert.match(out, /e5 checkbox "Remember me" \[checked\]/);
  assert.match(out, /e6 combobox "Country"/);
  assert.match(out, /e7 button "Say 'hi'"/, 'quotes in names cannot break the line format');
  assert.ok(!out.includes('Disabled') && !out.includes('Hidden from AT') && !out.includes('csrf'), 'disabled, aria-hidden and hidden inputs are skipped');
  assert.ok(!out.includes('hunter2') && !out.includes('secret typed value'), 'typed values are never listed');
  const doc = dom.window.document;
  assert.equal(doc.querySelector('[data-king-ref="e2"]')?.textContent, 'Delete account', 'the ref is stamped on the real element');
  // A second snapshot re-stamps from scratch; old stamps do not linger.
  doc.querySelector('button')!.remove();
  const again = run();
  assert.match(again, /Elements: 6/);
  assert.equal(doc.querySelectorAll('[data-king-ref]').length, 6, 'stamps are cleared and re-issued');
  console.log('[PASS] Element refs — snapshot lists interactive elements, hides values, stamps and re-stamps refs');
}

{
  const many = Array.from({ length: 30 }, (_, i) => `<button>b${i}</button>`).join('');
  const dom = new JSDOM(`<body>${many}</body>`, { runScripts: 'outside-only' });
  const out = dom.window.eval(buildSnapshotScript({ requireVisible: false, maxElements: 10 })) as string;
  assert.match(out, /Elements: 10 \(more not shown\)/);
  assert.equal(dom.window.document.querySelectorAll('[data-king-ref]').length, 10);
  console.log('[PASS] Element refs — long pages are capped');
}

{
  assert.deepEqual(resolveElementRef('browser_drag', { ref: 'e1', toRef: 'e2' }), { selector: '[data-king-ref="e1"]', toSelector: '[data-king-ref="e2"]' });
  assert.deepEqual(resolveElementRef('browser_drag', { selector: '#a', toRef: 'e2' }), { selector: '#a', toSelector: '[data-king-ref="e2"]' });
  assert.throws(() => resolveElementRef('browser_drag', { ref: 'e1' }), /drop target/);
  assert.throws(() => resolveElementRef('browser_drag', { toRef: 'e2' }), /source/);
  assert.throws(() => resolveElementRef('browser_drag', { ref: 'e1"]', toRef: 'e2' }), /Invalid element ref/);
  console.log('[PASS] Element refs — browser_drag resolves both ends and refuses a missing one');
}
