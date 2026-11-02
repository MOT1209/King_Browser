import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildSnapshotScript } from '../src/utils/elementSnapshot';
import { buildLocateScript } from '../src/utils/trustedInput';
import { refToSelector } from '../electron/main/elementRefs';
import { withDeepQuery } from '../src/utils/deepQuery';

const nodeRequire = createRequire(join(process.cwd(), 'noop.js'));
const { JSDOM } = nodeRequire('jsdom') as typeof import('jsdom');

console.log('\n--- Deep Query (shadow DOM and iframes) Test Suite ---');

function page() {
  const dom = new JSDOM('<!doctype html><body><button id="light">Light</button><div id="host"></div><iframe id="fr"></iframe></body>', { runScripts: 'outside-only' });
  const doc = dom.window.document;
  const shadow = doc.getElementById('host')!.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button id="inner">Inside shadow</button><div id="host2"></div>';
  const nested = shadow.getElementById('host2')!.attachShadow({ mode: 'open' });
  nested.innerHTML = '<input id="deep" placeholder="Deep field">';
  const frameDoc = (doc.getElementById('fr') as HTMLIFrameElement).contentDocument!;
  frameDoc.body.innerHTML = '<a href="/x">In frame</a>';
  return dom;
}

{
  const win = page().window as any;
  const out: string = win.eval(buildSnapshotScript({ requireVisible: false }));
  assert.match(out, /button "Light"/);
  assert.match(out, /button "Inside shadow"/, 'open shadow roots are listed');
  assert.match(out, /textbox "Deep field"/, 'nested shadow roots are listed');
  assert.match(out, /link "In frame"/, 'same-origin iframes are listed');
  const ref = /(e\d+) textbox "Deep field"/.exec(out)![1];
  const found = win.eval(withDeepQuery(`__kingQuery(${JSON.stringify(refToSelector(ref))})`));
  assert.equal(found?.id, 'deep', 'a ref inside nested shadow DOM resolves');
  assert.equal(win.eval(withDeepQuery('__kingQuery("#light")')).id, 'light', 'light DOM still wins');
  assert.equal(win.eval(withDeepQuery('__kingQuery("#nope")')), null);
  console.log('[PASS] Deep query - snapshot lists and resolves shadow DOM and same-origin iframe elements');
}

{
  const win = page().window as any;
  const located = win.eval(buildLocateScript('#inner'));
  assert.equal(located.found, true, 'locate reaches an element inside a shadow root');
  const frameLink = win.eval(buildLocateScript('a[href="/x"]'));
  assert.equal(frameLink.found, true, 'locate reaches an element inside an iframe');
  assert.equal(win.eval(buildLocateScript('[[bad')).error !== undefined, true, 'invalid selector is still reported');
  console.log('[PASS] Deep query - locate script finds elements across shadow and frame boundaries');
}
