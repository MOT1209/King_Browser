import assert from 'node:assert/strict';
import { selectInteractiveNodes, formatAxSnapshot, AX_MAX_ELEMENTS } from '../electron/main/axSnapshot';

console.log('\n--- Accessibility Snapshot Test Suite ---');

const node = (role: string, name: string, id: number | undefined, extra: any = {}) => ({
  role: { value: role }, name: { value: name }, backendDOMNodeId: id, properties: extra.properties ?? [], ignored: extra.ignored
});

{
  const raw = [
    node('RootWebArea', 'Page', 1),
    node('button', 'Save', 10),
    node('button', 'Ignored', 11, { ignored: true }),
    node('button', 'Off', 12, { properties: [{ name: 'disabled', value: { value: true } }] }),
    node('textbox', 'Password', 13, { properties: [{ name: 'protected', value: { value: true } }] }),
    node('checkbox', 'Agree', 14, { properties: [{ name: 'checked', value: { value: 'true' } }] }),
    node('link', 'Docs "home"\nnow', 15, { properties: [{ name: 'url', value: { value: 'https://e.com/a#frag' } }] }),
    node('paragraph', 'Not interactive', 16),
    node('button', 'No dom node', undefined),
    node('textbox', 'Hidden', 17, { properties: [{ name: 'hidden', value: { value: true } }] })
  ];
  const { entries, truncated } = selectInteractiveNodes(raw);
  assert.equal(truncated, false);
  assert.deepEqual(entries.map(e => e.name), ['Save', 'Password', 'Agree', "Docs 'home' now"]);
  assert.deepEqual(entries.map(e => e.ref), ['e1', 'e2', 'e3', 'e4']);
  assert.equal(entries[1].role, 'textbox(password)', 'a protected field is only marked, never described by value');
  assert.equal(entries[2].checked, true);
  const text = formatAxSnapshot('https://e.com/', 'T', entries, truncated);
  assert.match(text, /e3 checkbox "Agree" \[checked\]/);
  assert.match(text, /e4 link "Docs 'home' now" -> https:\/\/e\.com\/a$/m, 'fragment dropped, quotes and newlines neutralised');
  console.log('[PASS] AX snapshot - only enabled, visible interactive nodes are listed, names neutralised');
}

{
  const many = Array.from({ length: AX_MAX_ELEMENTS + 20 }, (_, i) => node('button', `b${i}`, i + 1));
  const { entries, truncated } = selectInteractiveNodes(many);
  assert.equal(entries.length, AX_MAX_ELEMENTS);
  assert.equal(truncated, true);
  assert.deepEqual(selectInteractiveNodes('nope'), { entries: [], truncated: false });
  assert.equal(selectInteractiveNodes([null, 5, {}]).entries.length, 0, 'malformed nodes are skipped');
  console.log('[PASS] AX snapshot - long pages are capped and malformed input is ignored');
}
