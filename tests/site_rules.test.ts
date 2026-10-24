import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createSiteRuleStore, matchSiteRule, normalizeRuleDomain, sanitizeSiteRules, MAX_SITE_RULES } from '../electron/main/siteRules';

console.log('\n--- Site Rules Test Suite ---');

{
  assert.equal(normalizeRuleDomain('Bank.Example.COM'), 'bank.example.com');
  assert.equal(normalizeRuleDomain('https://bank.example.com/login?x=1'), 'bank.example.com');
  assert.equal(normalizeRuleDomain('*.example.com'), 'example.com');
  for (const bad of ['', '   ', 'no_dots', 'a b.com', 'javascript:alert(1)', '../etc', 'exa$mple.com', 42, null, undefined, 'a'.repeat(300) + '.com']) {
    assert.equal(normalizeRuleDomain(bad), null, `rejects ${String(bad).slice(0, 20)}`);
  }
  console.log('[PASS] Site rules — domain normalisation accepts hosts/URLs and rejects junk');
}

{
  const rules = sanitizeSiteRules([
    { domain: 'example.com', mode: 'ask' },
    { domain: 'example.com', mode: 'block' },
    { domain: 'Example.com', mode: 'ask' },
    { domain: 'x.org', mode: 'allow' },
    { domain: 'ok.org', mode: 'ask' },
    'garbage', null
  ]);
  assert.deepEqual(rules, [{ domain: 'example.com', mode: 'block' }, { domain: 'ok.org', mode: 'ask' }], 'stricter mode wins, unknown modes (allow) are dropped');
  const many = sanitizeSiteRules(Array.from({ length: 500 }, (_, i) => ({ domain: `s${i}.example.com`, mode: 'ask' })));
  assert.equal(many.length, MAX_SITE_RULES, 'the list is capped');
  assert.deepEqual(sanitizeSiteRules('nope'), []);
  console.log('[PASS] Site rules — sanitising: no "allow" mode, stricter wins, capped');
}

{
  const rules = sanitizeSiteRules([{ domain: 'bank.com', mode: 'ask' }, { domain: 'secret.bank.com', mode: 'block' }]);
  assert.equal(matchSiteRule(rules, 'bank.com')?.mode, 'ask');
  assert.equal(matchSiteRule(rules, 'www.bank.com')?.mode, 'ask', 'subdomains match');
  assert.equal(matchSiteRule(rules, 'secret.bank.com')?.mode, 'block', 'block beats ask on overlap');
  assert.equal(matchSiteRule(rules, 'evilbank.com'), undefined, 'a suffix that is not a subdomain does not match');
  assert.equal(matchSiteRule(rules, 'bank.com.evil.io'), undefined);
  assert.equal(matchSiteRule(rules, undefined), undefined);
  assert.equal(matchSiteRule(rules, 'BANK.com.')?.mode, 'ask', 'case and trailing dot are ignored');
  console.log('[PASS] Site rules — matching is exact/subdomain only, block wins');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-rules-'));
  const file = path.join(dir, 'rules.json');
  const store = createSiteRuleStore(file);
  assert.deepEqual(store.get(), []);
  store.set([{ domain: 'bank.com', mode: 'ask' }, { domain: 'bad one', mode: 'ask' }]);
  assert.deepEqual(createSiteRuleStore(file).get(), [{ domain: 'bank.com', mode: 'ask' }], 'rules persist across restarts');
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(createSiteRuleStore(file).get(), [], 'a corrupt file yields no rules instead of throwing');
  assert.doesNotThrow(() => createSiteRuleStore(path.join(dir, 'missing', 'r.json')).set([{ domain: 'a.com', mode: 'ask' }]));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[PASS] Site rules — store persists, survives corruption and write failures');
}
