import assert from 'node:assert/strict';
import { describeApprovalArgs, previewSelectorFor, MAX_DETAIL_LINES, MAX_DETAIL_VALUE } from '../electron/main/approvalDetails';
import { redactArgs } from '../electron/main/policyEngine';

console.log('\n--- Approval details (what the human sees before approving) ---');

// Typed text is the point of the preview: a neutral field shows exactly what will be typed.
assert.deepEqual(
  describeApprovalArgs('browser_type', { selector: '#q', text: 'hello world' }),
  [{ kind: 'type', text: 'hello world' }],
  'the selector is already in the summary and is not repeated'
);

// Regression guard on the real pipeline: details must be built from the policy
// engine's REDACTED args, so a password typed into a neutrally named field is masked
// when the live element description says it is a password field.
{
  const raw = { selector: '#f1', text: 'hunter2-secret' };
  const redacted = redactArgs('browser_type', raw, 'input type=password autocomplete=current-password');
  const lines = describeApprovalArgs('browser_type', redacted);
  assert.equal(lines.length, 1);
  assert.ok(!JSON.stringify(lines).includes('hunter2'), 'a secret never reaches the details');
  assert.ok(lines[0].text.includes('••••'));
}
{
  const redacted = redactArgs('browser_navigate', { url: 'https://x.test/', apiKey: 'abc123' });
  const lines = describeApprovalArgs('browser_navigate', redacted);
  assert.ok(!JSON.stringify(lines).includes('abc123'), 'sensitive keys stay masked');
  assert.ok(lines.some(l => l.kind === 'url' && l.text === 'https://x.test/'));
}

// Other tools.
assert.deepEqual(describeApprovalArgs('browser_press_key', { key: 'Enter' }), [{ kind: 'key', text: 'Enter' }]);
assert.deepEqual(describeApprovalArgs('browser_select_option', { selector: '#c', value: 'de' }), [{ kind: 'option', text: 'de' }]);
assert.deepEqual(describeApprovalArgs('browser_click', { selector: '#buy' }), [], 'nothing extra to show for a plain click');
assert.deepEqual(describeApprovalArgs('browser_click', {}), []);

// Limits: long values are clipped, whitespace is normalized, control characters are dropped.
{
  const [line] = describeApprovalArgs('browser_type', { text: 'a'.repeat(5000) });
  assert.ok(line.text.length <= MAX_DETAIL_VALUE + 1, 'long values are clipped');
  assert.ok(line.text.endsWith('…'));
}
{
  // Built from code points so the test file itself holds no invisible characters.
  const nul = String.fromCharCode(0x00);
  const rlo = String.fromCharCode(0x202e);
  const [line] = describeApprovalArgs('browser_type', { text: `line1\n\n  line2${nul}${rlo} evil` });
  assert.ok(!line.text.includes(nul) && !line.text.includes(rlo), 'control and bidi-override characters are removed');
  assert.ok(line.text.startsWith('line1 line2'));
}

// Unknown / odd args: at most MAX_DETAIL_LINES lines, values stringified safely, never throws.
{
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) many[`k${i}`] = `v${i}`;
  assert.equal(describeApprovalArgs('browser_unknown', many).length, MAX_DETAIL_LINES);
}
assert.doesNotThrow(() => describeApprovalArgs('browser_x', { a: { b: [1, 2, { c: 3 }] }, d: null, e: undefined, f: 5, g: true }));
const circular: any = {}; circular.self = circular;
assert.doesNotThrow(() => describeApprovalArgs('browser_x', { c: circular }), 'circular values do not throw');
assert.deepEqual(describeApprovalArgs('browser_type', null as any), []);
assert.deepEqual(describeApprovalArgs('browser_type', 'oops' as any), []);

// Preview selector: only a plain, bounded string is ever handed to the page.
assert.equal(previewSelectorFor({ selector: '#buy' }), '#buy');
assert.equal(previewSelectorFor({ selector: '   ' }), undefined);
assert.equal(previewSelectorFor({ selector: 42 }), undefined);
assert.equal(previewSelectorFor({ selector: 'x'.repeat(600) }), undefined, 'an oversized selector is refused');
assert.equal(previewSelectorFor({}), undefined);
assert.equal(previewSelectorFor(null as any), undefined);

console.log('[PASS] [Approval-Details] details come from redacted args, are bounded, and are free of control characters.');

// The native dialog body, in every interface language.
import { approvalDialogStrings, buildApprovalDialogDetail } from '../electron/main/uiStrings';
{
  const input = {
    domain: 'shop.example.com',
    summary: 'Submit a form: browser_type',
    toolName: 'browser_type',
    details: [{ kind: 'type' as const, text: 'hello' }, { kind: 'other' as const, text: 'delay: 5' }],
  };
  const en = buildApprovalDialogDetail(input, approvalDialogStrings('en'));
  assert.equal(en, 'Site: shop.example.com\nAction: Submit a form: browser_type\nTool: browser_type\n\nDetails:\n- Will type: hello\n- delay: 5');
  const ar = buildApprovalDialogDetail(input, approvalDialogStrings('ar'));
  assert.ok(ar.includes('الموقع: shop.example.com') && ar.includes('سيكتب: hello'), 'Arabic labels are used');
  const de = buildApprovalDialogDetail(input, approvalDialogStrings('de'));
  assert.ok(de.includes('Website: shop.example.com') && de.includes('Wird eingeben: hello'));
  assert.ok(!buildApprovalDialogDetail({ toolName: 'browser_click' }, approvalDialogStrings('en')).includes('Details'), 'no details block when there is nothing to show');
  for (const lang of ['en', 'ar', 'de'] as const) {
    const s = approvalDialogStrings(lang);
    assert.ok(s.approve && s.reject && s.title && s.message, `${lang} dialog strings are complete`);
  }
}
console.log('[PASS] [Approval-Details] the native dialog body is localized and lists the details.');

// Regression: the live activity strip over the page was hardcoded English
// ("Waiting for your approval", raw status words) in the Arabic and German UI.
import fs from 'node:fs';
{
  const overlay = fs.readFileSync('src/components/AICursorOverlay.tsx', 'utf8');
  assert.ok(!overlay.includes('Waiting for your approval'), 'the approval line must come from the locale files');
  assert.ok(overlay.includes("t('agentPanel.waitingForApproval"), 'the approval line is translated');
  assert.ok(overlay.includes('STATUS_LABEL_KEYS'), 'status words are translated');
}
console.log('[PASS] [Approval-Details] the activity strip is localized.');
