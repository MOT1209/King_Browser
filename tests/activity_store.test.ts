import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createActivityStore, mergeHistory } from '../electron/main/activityStore';
import type { ActionRecord } from '../electron/main/executionEngine';

console.log('\n--- Activity Store Test Suite ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-activity-'));
const file = path.join(dir, 'agent-activity.jsonl');

const record = (id: string, status: ActionRecord['status'], args: Record<string, unknown> = {}): ActionRecord => ({
  id, toolName: 'browser_type', args, risk: 'sensitive', status, requestedAt: 1_700_000_000_000
});

{
  const store = createActivityStore(file);
  store.append(record('a1', 'requested'));
  store.append(record('a2', 'running'));
  assert.equal(store.readAll().length, 0, 'in-progress updates are not stored');
  store.append(record('a3', 'completed', { selector: 'input[type="password"]', text: 'hunter2' }));
  store.append(record('a4', 'rejected'));
  const again = createActivityStore(file).readAll();
  assert.deepEqual(again.map(r => r.id), ['a3', 'a4'], 'records survive a new store instance (restart)');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('hunter2'), 'typed secrets are redacted on disk');
  console.log('[PASS] Activity store — persists finished actions with redacted args');
}

{
  // A snapshot ref and a neutral selector carry no field description, so the
  // log cannot know whether the target is a password field. It must fail closed.
  const opaque = path.join(dir, 'opaque.jsonl');
  const store = createActivityStore(opaque);
  store.append(record('r1', 'completed', { selector: '[data-king-ref="e12"]', text: 'hunter2' }));
  store.append(record('r2', 'rejected', { selector: '#f1', text: 'hunter3' }));
  const text = fs.readFileSync(opaque, 'utf8');
  assert.ok(!text.includes('hunter2') && !text.includes('hunter3'), 'ref and neutral typed values are redacted on disk');
  console.log('[PASS] Activity store — redacts ref and neutral typed values');
}

{
  fs.appendFileSync(file, '{"id":"torn","toolName":"x"\n');
  assert.deepEqual(createActivityStore(file).readAll().map(r => r.id), ['a3', 'a4'], 'a torn line is skipped');
  console.log('[PASS] Activity store — tolerates a torn last line');
}

{
  const small = path.join(dir, 'small.jsonl');
  const store = createActivityStore(small, 200);
  for (let i = 0; i < 12; i++) store.append(record(`r${i}`, 'completed'));
  assert.ok(fs.existsSync(`${small}.1`), 'file is rotated at the size limit');
  assert.ok(fs.statSync(small).size < 600, 'current file stays small');
  assert.equal(store.readAll().at(-1)?.id, 'r11', 'newest record is last');
  console.log('[PASS] Activity store — rotates instead of growing without bound');
}

{
  const merged = mergeHistory([record('a', 'completed'), record('b', 'failed')], [record('b', 'completed'), record('c', 'completed')]);
  assert.deepEqual(merged.map(r => `${r.id}:${r.status}`), ['a:completed', 'b:completed', 'c:completed']);
  console.log('[PASS] Activity store — live history wins over stored duplicates');
}

{
  const unwritable = createActivityStore(path.join(dir, 'missing-dir', 'x.jsonl'));
  assert.doesNotThrow(() => unwritable.append(record('z', 'completed')));
  assert.deepEqual(unwritable.readAll(), []);
  console.log('[PASS] Activity store — a write failure never throws');
}

fs.rmSync(dir, { recursive: true, force: true });
