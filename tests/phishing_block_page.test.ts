import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildPhishingBlockScript } from '../electron/main/phishingBlockPage';

/**
 * The phishing block page script was copy-pasted into both will-navigate and
 * will-redirect. The blocked URL is attacker controlled and is injected into
 * executeJavaScript source, so it must only ever reach the page as a JSON
 * string literal. Prevents: a crafted URL breaking out of the string and
 * running code in the blocked page, and the two copies drifting apart.
 */

console.log('\n--- Phishing block page script ---');

function run(url: string) {
  const created: Array<{ tag: string; textContent: string; style: { cssText: string } }> = [];
  const body = { style: { cssText: '' }, children: [] as unknown[], appendChild(child: unknown) { this.children.push(child); } };
  const document = {
    title: '',
    body,
    createElement: (tag: string) => {
      const el = { tag, textContent: '', style: { cssText: '' } };
      created.push(el);
      return el;
    }
  };
  const sandbox = { document, pwned: false };
  vm.runInNewContext(buildPhishingBlockScript(url), sandbox);
  return { document, created, sandbox };
}

const plain = run('https://evil.example/login');
assert.equal(plain.document.title, 'Dangerous Site Blocked');
assert.equal(plain.created.length, 2, 'a heading and a paragraph are created');
assert.match(plain.created[1].textContent, /https:\/\/evil\.example\/login/, 'the blocked URL is shown');
assert.equal(plain.document.body.children.length, 2, 'both elements are attached');

const hostile = "https://evil.example/'); pwned = true; ('\"`${pwned = true}</script>";
const attacked = run(hostile);
assert.equal(attacked.sandbox.pwned, false, 'a hostile URL does not execute as code');
assert.ok(attacked.created[1].textContent.includes('pwned = true'), 'the hostile URL is displayed as text');

const long = run('https://evil.example/' + 'a'.repeat(2000));
assert.ok(long.created[1].textContent.length < 800, 'very long URLs are truncated');

console.log('[PASS] Phishing block page script');
