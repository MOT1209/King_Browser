import assert from 'node:assert/strict';
import {
  MAX_TRANSLATION_ITEMS,
  MAX_TRANSLATION_TEXT_CHARS,
  MAX_TRANSLATION_TOTAL_CHARS,
  limitTranslationInput,
  validLanguage,
  buildTranslationChunks,
  applyTranslatedChunk,
  translateBatch,
  detectLanguage,
  type TranslationDeps
} from '../electron/main/translation';

/**
 * The page-translation handlers sat in main.ts with no behavioural test: the
 * input limits, the chunking and the id-based reassembly of results only ran
 * against Google's endpoint. Prevents: an oversized or non-string payload from
 * the renderer reaching the network, results landing on the wrong element,
 * one failed chunk discarding the whole page, and a hostile language code
 * being spliced into the request URL.
 */

console.log('\n--- Page translation batching ---');

// Input limits.
assert.equal(limitTranslationInput(new Array(MAX_TRANSLATION_ITEMS + 50).fill('x')).length, MAX_TRANSLATION_ITEMS);
assert.deepEqual(limitTranslationInput(['a', 5, null, { x: 1 }, 'b'] as unknown[]), ['a', '', '', '', 'b'], 'non-strings become empty slots, order is kept');
assert.equal(limitTranslationInput(['x'.repeat(MAX_TRANSLATION_TEXT_CHARS + 500)])[0].length, MAX_TRANSLATION_TEXT_CHARS);
const big = limitTranslationInput(new Array(100).fill('y'.repeat(MAX_TRANSLATION_TEXT_CHARS)));
assert.equal(big.join('').length, MAX_TRANSLATION_TOTAL_CHARS, 'the total character budget is enforced');
assert.equal(big.length, 100, 'slots past the budget stay as empty strings so indices still line up');

// Language codes.
assert.equal(validLanguage('de', 'en'), 'de');
assert.equal(validLanguage('zh-CN', 'en'), 'zh-CN');
assert.equal(validLanguage('pt_BR', 'en'), 'pt_BR');
for (const bad of ['', 'e', 'en&dt=x', 'en#', 'xx-yy-zz', '../etc', 'a'.repeat(30), 5, null, undefined]) {
  assert.equal(validLanguage(bad, 'FALLBACK'), 'FALLBACK', `${JSON.stringify(bad)} falls back`);
}

// Chunking.
assert.deepEqual(buildTranslationChunks(['', '   ']), [], 'blank items are not sent');
const many = buildTranslationChunks(new Array(80).fill('hi'));
assert.ok(many.every((c) => c.indices.length <= 35), 'no chunk holds more than 35 items');
assert.equal(many.flatMap((c) => c.indices).length, 80, 'every item lands in exactly one chunk');
const wide = buildTranslationChunks(new Array(4).fill('z'.repeat(900)));
assert.ok(wide.every((c) => c.payload.length <= 1600 + 920), 'payloads stay near the 1600 character budget');
assert.ok(wide.length >= 2);
assert.match(buildTranslationChunks(['a <b> & "c"'])[0].payload, /<p id="0">a &lt;b&gt; &amp; &quot;c&quot;<\/p>/, 'text is escaped before it is wrapped');

// Reassembly.
const results = ['one', 'two', 'three'];
applyTranslatedChunk(results, '<p id="0">EINS</p><p id=2>DREI &amp; mehr</p><p id="9">out of range</p><p id="1">   </p>');
assert.deepEqual(results, ['EINS', 'two', 'DREI & mehr'], 'ids map back, unescape applies, out-of-range and empty content are ignored');

// End to end with a fake endpoint.
function fakeDeps(handler: (url: URL) => { ok: boolean; status?: number; body?: unknown } | Error): { deps: TranslationDeps; urls: URL[] } {
  const urls: URL[] = [];
  const deps: TranslationDeps = {
    userAgent: 'test-agent',
    fetch: async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      const out = handler(url);
      if (out instanceof Error) throw out;
      return { ok: out.ok, status: out.status ?? (out.ok ? 200 : 500), json: async () => out.body };
    }
  };
  return { deps, urls };
}
// Stand-in for the service: translates two known words and leaves everything else (entities included) untouched.
const DICTIONARY: Record<string, string> = { hello: 'HELLO', word: 'WORD' };
const upper = (url: URL) => {
  const q = url.searchParams.get('q') || '';
  return { ok: true, body: [[[q.replace(/>([^<]+)</g, (_m, t) => `>${DICTIONARY[String(t)] ?? t}<`), q]]] };
};

async function run() {
  const a = fakeDeps(upper);
  const out = await translateBatch({ texts: ['hello', '', 'Tom & Jerry <b>', 42], sourceLang: 'en', targetLang: 'de' }, a.deps);
  assert.equal(out.success, true);
  assert.deepEqual(out.translations, ['HELLO', '', 'Tom & Jerry <b>', ''], 'order is preserved, special characters survive the round trip and untranslatable slots stay empty');
  assert.ok(a.urls.length >= 1);
  for (const url of a.urls) {
    assert.equal(url.origin, 'https://translate.googleapis.com', 'only the translation endpoint is contacted');
    assert.equal(url.searchParams.get('sl'), 'en');
    assert.equal(url.searchParams.get('tl'), 'de');
  }

  const hostile = fakeDeps(upper);
  await translateBatch({ texts: ['x'], sourceLang: 'en&evil=1', targetLang: 'de#frag' }, hostile.deps);
  assert.equal(hostile.urls[0].searchParams.get('sl'), 'auto', 'a hostile source language falls back');
  assert.equal(hostile.urls[0].searchParams.get('tl'), 'en', 'a hostile target language falls back');
  assert.equal(hostile.urls[0].searchParams.has('evil'), false, 'nothing is smuggled into the query');

  const empty = fakeDeps(upper);
  assert.deepEqual(await translateBatch({ texts: [] }, empty.deps), { translations: [], success: true });
  assert.deepEqual(await translateBatch(null, empty.deps), { translations: [], success: true }, 'a malformed payload is an empty batch');
  assert.equal(empty.urls.length, 0, 'an empty batch makes no request');

  // One failing chunk must not discard the rest.
  let call = 0;
  const flaky = fakeDeps((url) => (++call === 1 ? new Error('network down') : upper(url)));
  const texts = new Array(40).fill('word');
  const partial = await translateBatch({ texts }, flaky.deps);
  assert.equal(partial.success, true);
  assert.equal(partial.translations.length, 40);
  assert.ok(partial.translations.some((t) => t === 'word'), 'the failed chunk keeps its original text');
  assert.ok(partial.translations.some((t) => t === 'WORD'), 'other chunks are still translated');

  // Language detection.
  const det = fakeDeps(() => ({ ok: true, body: [[], null, 'de'] }));
  assert.equal(await detectLanguage('Guten Tag '.repeat(100), det.deps), 'de');
  assert.ok((det.urls[0].searchParams.get('q') || '').length <= 300, 'only a short sample is sent');
  assert.equal(await detectLanguage('x', fakeDeps(() => ({ ok: false })).deps), 'auto');
  assert.equal(await detectLanguage('x', fakeDeps(() => new Error('boom')).deps), 'auto');
  assert.equal(await detectLanguage('x', fakeDeps(() => ({ ok: true, body: 'nope' })).deps), 'auto');

  console.log('[PASS] Page translation batching');
}
run().catch((error) => {
  process.stderr.write(`Translation batch suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
