import assert from 'node:assert/strict';
import { matchSavedCredentials, maskUsername } from '../src/utils/passwordMatch';
import { resolveLoginCredential, buildLoginFillScript, describeLoginResult } from '../src/utils/agentLogin';
import { mergeActivity, toActivityLine } from '../src/utils/agentActivity';
import { SENSITIVE_FIELD_PATTERN } from '../src/utils/sensitiveField';
import { classifyAction, buildApprovalSummary, SENSITIVE_SELECTOR_PATTERNS } from '../electron/main/policyEngine';
import type { ElectronEngineActionRecord } from '../src/vite-env';

console.log('\n--- Agent Login + Activity Test Suite ---');

const records = [
  { origin: 'https://shop.example.com', hostname: 'shop.example.com', username: 'jane@example.com', password: 'S3cret!pw' },
  { hostname: 'legacy.example.com', username: 'old', password: 'legacy-pw' },
  { origin: 'https://other.example.com', username: 'x', password: '' }
];

{
  assert.equal(matchSavedCredentials(records, 'https://shop.example.com', 'shop.example.com').length, 1);
  assert.equal(matchSavedCredentials(records, 'http://shop.example.com', 'shop.example.com').length, 0, 'other scheme/origin refused');
  assert.equal(matchSavedCredentials(records, 'https://shop.example.com:8443', 'shop.example.com').length, 0, 'other port refused');
  assert.equal(matchSavedCredentials(records, 'https://legacy.example.com', 'legacy.example.com').length, 1, 'legacy record on standard https');
  assert.equal(matchSavedCredentials(records, 'http://legacy.example.com', 'legacy.example.com').length, 0, 'legacy record never goes to http');
  assert.equal(matchSavedCredentials(records, 'https://legacy.example.com:444', 'legacy.example.com').length, 0, 'legacy record not on other ports');
  assert.equal(matchSavedCredentials(records, 'https://other.example.com', 'other.example.com').length, 0, 'records without a password are ignored');
  console.log('[PASS] Credential matching — strict origin rules');
}

{
  assert.equal(maskUsername('jane@example.com'), 'j***@example.com');
  assert.equal(maskUsername('jane'), 'j***');
  assert.equal(maskUsername('a'), '***');
  console.log('[PASS] Credential matching — usernames are masked');
}

{
  const ok = resolveLoginCredential(records, 'https://shop.example.com/login', undefined, 'https://shop.example.com');
  assert.equal(ok.ok, true);
  assert.equal(resolveLoginCredential(records, 'https://shop.example.com/login').ok, false, 'no pinned origin: refused');
  assert.equal(resolveLoginCredential(records, 'https://shop.example.com/login', undefined, 'https://legacy.example.com').ok, false, 'page changed since approval: refused');
  assert.equal(resolveLoginCredential(records, 'http://shop.example.com/login', undefined, 'http://shop.example.com').ok, false, 'http refused');
  assert.equal(resolveLoginCredential(records, 'https://nowhere.example.org/', undefined, 'https://nowhere.example.org').ok, false, 'no saved account');
  assert.equal(resolveLoginCredential(records, 'not a url').ok, false);
  const many = [...records, { origin: 'https://shop.example.com', username: 'bob@example.com', password: 'p2' }];
  const ambiguous = resolveLoginCredential(many, 'https://shop.example.com/', undefined, 'https://shop.example.com');
  assert.equal(ambiguous.ok, false, 'several accounts: must ask');
  assert.ok(!JSON.stringify(ambiguous).includes('S3cret'), 'errors never contain a password');
  assert.ok(!JSON.stringify(ambiguous).includes('jane@example.com'), 'errors only show masked usernames');
  const picked = resolveLoginCredential(many, 'https://shop.example.com/', 'bob@example.com', 'https://shop.example.com');
  assert.equal(picked.ok && picked.password, 'p2');
  assert.equal(resolveLoginCredential(many, 'https://shop.example.com/', 'nobody', 'https://shop.example.com').ok, false);
  console.log('[PASS] Agent login — resolution refuses unsafe cases and never leaks secrets');
}

{
  assert.equal(
    describeLoginResult({ success: true, filledUsername: true }, 'jane@example.com').includes('S3cret'),
    false
  );
  const text = describeLoginResult({ success: true, filledUsername: true }, 'jane@example.com');
  assert.ok(text.includes('j***@example.com') && !text.includes('jane@'), 'result shows the masked name only');
  assert.ok(describeLoginResult({ success: false, error: 'No visible password field' }, 'x').startsWith('Error:'));
  const script = buildLoginFillScript('a"b', 'p\\w"\'`${x}');
  assert.ok(script.includes(JSON.stringify('p\\w"\'`${x}')), 'values are JSON-escaped into the guest script');
  console.log('[PASS] Agent login — results are masked, guest script escapes values');
}

{
  const d = classifyAction({ toolName: 'browser_login', args: {}, currentUrl: 'https://shop.example.com/login' });
  assert.equal(d.risk, 'sensitive');
  assert.deepEqual(d.triggers, ['login']);
  assert.equal(d.domain, 'shop.example.com');
  const summary = buildApprovalSummary({ toolName: 'browser_login', args: {} }, d);
  assert.ok(summary.consequences[0].includes('never shown to the agent'));
  console.log('[PASS] Policy — browser_login always needs approval');
}

{
  for (const sample of ['input[type="password"]', '#card-number', '[name=otp]', '#cvv']) {
    assert.ok(SENSITIVE_FIELD_PATTERN.test(sample), `${sample} is masked`);
  }
  assert.equal(SENSITIVE_FIELD_PATTERN.test('#search'), false);
  assert.equal(SENSITIVE_FIELD_PATTERN.source, SENSITIVE_SELECTOR_PATTERNS.source, 'overlay masking and policy stay in sync');
  console.log('[PASS] Cursor masking — shared sensitive-field pattern');
}

{
  const mk = (id: string, t: number, status: ElectronEngineActionRecord['status'] = 'completed'): ElectronEngineActionRecord =>
    ({ id, toolName: 'browser_click', args: { selector: '#x', text: 'hunter2' }, risk: 'safe', status, requestedAt: t, domain: 'a.com' });
  let list: ElectronEngineActionRecord[] = [];
  for (let i = 0; i < 9; i++) list = mergeActivity(list, mk(`a${i}`, i));
  assert.equal(list.length, 6, 'strip keeps the newest 6');
  assert.equal(list[list.length - 1].id, 'a8');
  list = mergeActivity(list, mk('a8', 8, 'failed'));
  assert.equal(list.filter(r => r.id === 'a8').length, 1, 'updates replace, not duplicate');
  assert.equal(list[list.length - 1].status, 'failed');
  const line = toActivityLine(list[0]);
  assert.equal(line.label, 'click');
  assert.ok(!JSON.stringify(line).includes('hunter2'), 'activity lines never carry arguments');
  console.log('[PASS] Activity strip — newest records, no arguments');
}

console.log('[PASS] Agent Login + Activity suite complete');
