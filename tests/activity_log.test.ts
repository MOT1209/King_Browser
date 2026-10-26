import assert from 'node:assert/strict';
import { buildActivityLog, exportActivityLog } from '../electron/main/activityLog';
import type { ActionRecord } from '../electron/main/executionEngine';

console.log('\n--- Activity Log Export Test Suite ---');

const history: ActionRecord[] = [
  {
    id: 'a1', toolName: 'browser_type', args: { selector: 'input[type="password"]', text: 'hunter2' },
    risk: 'sensitive', domain: 'bank.example', status: 'rejected', requestedAt: 1_700_000_000_000,
    summary: 'Enter sensitive information'
  },
  {
    id: 'a2', toolName: 'browser_click', args: { selector: '#go' }, risk: 'safe', status: 'completed',
    requestedAt: 1_700_000_001_000, startedAt: 1_700_000_001_100, endedAt: 1_700_000_001_350
  },
  {
    id: 'a3', toolName: 'browser_click', args: { selector: '#x' }, risk: 'safe', status: 'failed',
    requestedAt: 1_700_000_002_000, error: '=HYPERLINK("http://evil","click")'
  }
];

{
  const entries = buildActivityLog(history);
  assert.equal(entries[0].status, 'rejected');
  assert.equal(entries[0].reason, 'rejected by the user or the policy');
  assert.equal(entries[0].args.text, '••••••••', 'typed secrets are redacted in exports');
  assert.equal(entries[1].durationMs, 250);
  assert.equal(entries[2].durationMs, null);
  console.log('[PASS] Activity log — entries carry decision, reason and redacted args');
}

{
  const refHistory: ActionRecord[] = [
    {
      id: 'r1', toolName: 'browser_type', args: { selector: '[data-king-ref="e12"]', text: 'hunter2' },
      risk: 'sensitive', status: 'completed', requestedAt: 1_700_000_000_000
    },
    {
      id: 'r2', toolName: 'browser_type', args: { selector: '#f1', text: 'hunter3' },
      risk: 'sensitive', status: 'rejected', requestedAt: 1_700_000_001_000
    },
    {
      id: 'r3', toolName: 'browser_type', args: { selector: '#search-input', text: 'weather cairo' },
      risk: 'safe', status: 'completed', requestedAt: 1_700_000_002_000
    }
  ];
  const entries = buildActivityLog(refHistory);
  assert.equal(entries[0].args.text, '••••••••', 'ref target is redacted');
  assert.equal(entries[1].args.text, '••••••••', 'neutral target is redacted');
  assert.equal(entries[2].args.text, '••••••••', 'the log has no field description, so typing fails closed');
  assert.ok(!exportActivityLog(refHistory, 'json').includes('hunter2'), 'ref secret never appears');
  assert.ok(!exportActivityLog(refHistory, 'json').includes('hunter3'), 'neutral secret never appears');
  console.log('[PASS] Activity log — ref and neutral typed values are redacted');
}

{
  const parsed = JSON.parse(exportActivityLog(history, 'json'));
  assert.equal(parsed.count, 3);
  assert.equal(parsed.entries[1].tool, 'browser_click');
  assert.ok(!exportActivityLog(history, 'json').includes('hunter2'), 'secret never appears');
  console.log('[PASS] Activity log — JSON export');
}

{
  const csv = exportActivityLog(history, 'csv');
  const lines = csv.trim().split('\n');
  assert.ok(lines[0].startsWith('requestedAt,tool,domain'));
  assert.ok(!csv.includes('hunter2'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""click"")"`), 'formula cells are neutralised and quoted');
  console.log('[PASS] Activity log — CSV export is quoted and formula-safe');
}

console.log('[PASS] Activity Log suite complete');
