import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  Recorder, buildStep, createRecordingStore, describeTarget, findRef, parseSnapshot, replaySteps, sanitizeRecording,
  MAX_STEPS, type RecordedStep
} from '../electron/main/recordings';

console.log('\n--- Recordings Test Suite ---');

const SNAPSHOT = [
  'URL: https://shop.example/',
  'Title: Shop',
  'Elements: 5',
  'e1 link "Cart" -> /cart',
  'e2 button "Save"',
  'e3 button "Save"',
  'e4 textbox "Search"',
  'e5 textbox(password) "Password"'
].join('\n');

{
  assert.deepEqual(parseSnapshot(SNAPSHOT).map(e => e.ref), ['e1', 'e2', 'e3', 'e4', 'e5']);
  assert.deepEqual(describeTarget(SNAPSHOT, 'e3'), { role: 'button', name: 'Save', occurrence: 1 }, 'identical elements are told apart by order');
  assert.equal(describeTarget(SNAPSHOT, 'e99'), undefined);
  assert.equal(findRef(SNAPSHOT, { role: 'button', name: 'Save', occurrence: 1 }), 'e3');
  const reordered = SNAPSHOT.replace('e1 link "Cart" -> /cart', 'e1 link "Home" -> /').replace('e2 button "Save"', 'e2 button "Other"');
  assert.equal(findRef(reordered, { role: 'button', name: 'Save', occurrence: 0 }), 'e3', 'a ref is re-found by role and name, not by number');
  assert.equal(findRef(SNAPSHOT, { role: 'button', name: 'Delete', occurrence: 0 }), undefined, 'a missing element is not guessed');
  console.log('[PASS] Recordings — refs are described and re-found by role, name and order');
}

{
  const clickByRef = buildStep('browser_click', { originalArgs: { ref: 'e4' }, lastSnapshot: SNAPSHOT, sensitiveText: false });
  assert.ok(clickByRef.ok && clickByRef.step.target?.name === 'Search' && !('ref' in clickByRef.step.args), 'a ref becomes a target');

  const clickBySelector = buildStep('browser_click', { originalArgs: { selector: '#go' }, lastSnapshot: '', sensitiveText: false });
  assert.ok(clickBySelector.ok && clickBySelector.step.args.selector === '#go' && !clickBySelector.step.target);

  const typeOk = buildStep('browser_type', { originalArgs: { ref: 'e4', text: 'shoes' }, lastSnapshot: SNAPSHOT, sensitiveText: false });
  assert.ok(typeOk.ok && typeOk.step.args.text === 'shoes' && !typeOk.step.needsInput);

  const typePassword = buildStep('browser_type', { originalArgs: { ref: 'e5', text: 'hunter2' }, lastSnapshot: SNAPSHOT, sensitiveText: false });
  assert.ok(typePassword.ok && typePassword.step.needsInput === true && !('text' in typePassword.step.args), 'a password field role drops the text');
  assert.ok(!JSON.stringify(typePassword).includes('hunter2'));

  const typeSensitive = buildStep('browser_type', { originalArgs: { selector: 'input[type=password]', text: 'hunter2' }, lastSnapshot: '', sensitiveText: true });
  assert.ok(typeSensitive.ok && typeSensitive.step.needsInput === true && !JSON.stringify(typeSensitive).includes('hunter2'), 'redacted text is never stored');

  const unknownRef = buildStep('browser_click', { originalArgs: { ref: 'e50' }, lastSnapshot: SNAPSHOT, sensitiveText: false });
  assert.equal(unknownRef.ok, false, 'a ref that cannot be described is not recorded');
  assert.equal(buildStep('browser_login', { originalArgs: {}, lastSnapshot: '', sensitiveText: false }).ok, false, 'sign-in is not recorded');
  assert.equal(buildStep('browser_read_page', { originalArgs: {}, lastSnapshot: '', sensitiveText: false }).ok, false, 'reads are not recorded');
  console.log('[PASS] Recordings — password text and unrepeatable steps are never stored');
}

{
  const rec = new Recorder();
  rec.add('browser_navigate', { originalArgs: { url: 'https://shop.example/' }, lastSnapshot: '', sensitiveText: false });
  rec.add('browser_read_page', { originalArgs: {}, lastSnapshot: '', sensitiveText: false });
  rec.add('browser_click', { originalArgs: { ref: 'e77' }, lastSnapshot: SNAPSHOT, sensitiveText: false });
  assert.equal(rec.stepCount, 1);
  assert.equal(rec.skippedReasons.length, 1, 'a recordable step that failed to record is reported; reads are silently ignored');
  const saved = rec.finish('abc123', '  My   flow ');
  assert.equal(saved?.name, 'My flow');
  assert.equal(new Recorder().finish('x', 'empty'), null, 'an empty recording is not saved');
  for (let i = 0; i < MAX_STEPS + 20; i++) rec.add('browser_scroll', { originalArgs: { direction: 'down' }, lastSnapshot: '', sensitiveText: false });
  assert.ok(rec.stepCount <= MAX_STEPS, 'recordings are capped');
  console.log('[PASS] Recordings — recorder keeps repeatable steps, reports skipped ones, and is capped');
}

{
  assert.equal(sanitizeRecording(null), null);
  assert.equal(sanitizeRecording({ id: '../x', name: 'a', steps: [{ tool: 'browser_scroll', args: {} }] }), null, 'bad id');
  assert.equal(sanitizeRecording({ id: 'ok', name: 'a', steps: [{ tool: 'browser_run_js', args: { code: 'x' } }] }), null, 'unknown tools are dropped, leaving nothing');
  const clean = sanitizeRecording({ id: 'ok', name: 'a', steps: [
    { tool: 'browser_click', args: { selector: '#a', ref: 'e1' }, target: { role: 'button', name: 'Go', occurrence: 0 } },
    { tool: 'browser_evil', args: {} }
  ] });
  assert.equal(clean?.steps.length, 1);
  assert.ok(!('ref' in clean!.steps[0].args), 'a stored ref is stripped: refs are never trusted from disk');
  console.log('[PASS] Recordings — stored data is validated; unknown tools and stored refs are dropped');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-rec-'));
  const file = path.join(dir, 'rec.json');
  const store = createRecordingStore(file);
  const rec = sanitizeRecording({ id: 'r1', name: 'One', steps: [{ tool: 'browser_scroll', args: { direction: 'down' } }] })!;
  store.add(rec);
  assert.equal(createRecordingStore(file).list().length, 1, 'recordings survive a restart');
  store.remove('r1');
  assert.equal(createRecordingStore(file).list().length, 0);
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(createRecordingStore(file).list(), [], 'a corrupt file yields nothing');
  assert.doesNotThrow(() => createRecordingStore(path.join(dir, 'missing', 'r.json')).add(rec));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[PASS] Recordings — store persists and survives corruption and write failures');
}

async function replayTests() {
  const steps: RecordedStep[] = [
    { tool: 'browser_navigate', args: { url: 'https://shop.example/' } },
    { tool: 'browser_click', args: {}, target: { role: 'button', name: 'Save', occurrence: 1 } },
    { tool: 'browser_type', args: {}, needsInput: true, target: { role: 'textbox(password)', name: 'Password', occurrence: 0 } },
    { tool: 'browser_scroll', args: { direction: 'down' } }
  ];
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const run = async (tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    return tool === 'browser_snapshot' ? SNAPSHOT : 'ok';
  };

  const report = await replaySteps(steps, { run });
  assert.equal(report.status, 'needs_input', 'the replay stops at a step that needs the user');
  assert.equal(report.completed, 2);
  assert.deepEqual(calls.map(c => c.tool), ['browser_navigate', 'browser_snapshot', 'browser_click'], 'later steps never ran');
  assert.equal(calls[2].args.ref, 'e3', 'the click found its element again by role, name and order');

  calls.length = 0;
  const missing = await replaySteps([{ tool: 'browser_click', args: {}, target: { role: 'button', name: 'Gone', occurrence: 0 } }], { run });
  assert.equal(missing.status, 'target_not_found');
  assert.equal(calls.filter(c => c.tool === 'browser_click').length, 0, 'a missing element is never clicked');

  const refused = await replaySteps([{ tool: 'browser_scroll', args: {} }, { tool: 'browser_scroll', args: {} }], {
    run: async () => { throw new Error('Rejected by the user'); }
  });
  assert.equal(refused.status, 'failed');
  assert.equal(refused.completed, 0, 'a refused approval stops the replay');
  assert.match(refused.message, /Rejected by the user/);
  console.log('[PASS] Recordings — replay re-finds elements, stops for the user, and stops on refusal');
}

replayTests().catch(error => { console.error(error); process.exitCode = 1; });
