import assert from 'node:assert/strict';
import { addWhitelistHost, normalizeWhitelistHost, parseWhitelist, removeWhitelistHost } from '../src/utils/adblockWhitelist';

console.log('\n--- Ad blocker site list ---');

{
  assert.equal(normalizeWhitelistHost('Example.COM'), 'example.com');
  assert.equal(normalizeWhitelistHost('  https://www.Example.com/path?q=1#x  '), 'www.example.com');
  assert.equal(normalizeWhitelistHost('example.com:8080/page'), 'example.com');
  assert.equal(normalizeWhitelistHost('example.com.'), 'example.com', 'a trailing dot is dropped');
  assert.equal(normalizeWhitelistHost('localhost'), 'localhost');
  for (const bad of ['', '   ', 'a b.com', '*.example.com', 'exa$mple.com', '-bad.com', 'bad-.com', 'javascript:alert(1)', 'user@example.com', '@@||evil^', 42, null, undefined, 'a'.repeat(300) + '.com']) {
    assert.equal(normalizeWhitelistHost(bad), null, `rejects ${String(bad).slice(0, 24)}`);
  }
  console.log('[PASS] Blocker site list — pasted URLs become clean hostnames and filter syntax is rejected');
}

{
  const first = addWhitelistHost([], 'https://news.example.org/a');
  assert.deepEqual(first, { list: ['news.example.org'], added: 'news.example.org' });
  const again = addWhitelistHost(first.list, 'NEWS.example.org');
  assert.deepEqual(again.list, ['news.example.org'], 'a duplicate is not added twice');
  assert.equal(again.added, 'news.example.org');
  assert.deepEqual(addWhitelistHost(first.list, 'not a site'), { list: ['news.example.org'], added: null }, 'junk leaves the list alone');
  assert.deepEqual(removeWhitelistHost(['a.com', 'b.com'], 'a.com'), ['b.com']);
  assert.deepEqual(removeWhitelistHost(['a.com'], 'zzz.com'), ['a.com']);
  console.log('[PASS] Blocker site list — add, de-duplicate and remove');
}

{
  assert.deepEqual(parseWhitelist(null), []);
  assert.deepEqual(parseWhitelist('not json'), []);
  assert.deepEqual(parseWhitelist('{"a":1}'), []);
  assert.deepEqual(parseWhitelist(JSON.stringify(['a.com', 'A.com', 'bad host', 7, 'b.com'])), ['a.com', 'b.com'], 'stored junk and duplicates are dropped');
  const many = JSON.stringify(Array.from({ length: 800 }, (_, i) => `s${i}.example.com`));
  assert.equal(parseWhitelist(many).length, 500, 'the list is capped');
  console.log('[PASS] Blocker site list — stored data is validated and capped');
}
