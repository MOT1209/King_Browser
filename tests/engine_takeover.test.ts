import assert from 'node:assert/strict';
import { ExecutionEngine, type ActionRequest, type EngineEvent } from '../electron/main/executionEngine';
import { sanitizeHandoffUrl, formatHandoffMessage } from '../electron/main/handoffNote';
import { handoffUrlForAgent } from '../src/utils/handoffUrl';
import { registerEngineIpc } from '../electron/main/engineIpc';

console.log('\n--- Human take-over (the human drives, the agent waits) ---');

const keepAlive = setInterval(() => {}, 500);
const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) await new Promise<void>(resolve => setImmediate(resolve));
};
function makeControlledExecutor() {
  const calls: Array<{ request: ActionRequest; resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const executor = (request: ActionRequest) => new Promise<unknown>((resolve, reject) => { calls.push({ request, resolve, reject }); });
  return { calls, executor };
}
const req = (toolName: string, risk: 'safe' | 'sensitive' = 'safe'): ActionRequest => ({ toolName, args: { selector: '#x' }, risk });

// ---- handoff note: what the agent is told after the human used the browser ----
assert.equal(sanitizeHandoffUrl('https://shop.example.com/cart?token=SECRET#frag'), 'https://shop.example.com/cart', 'query and fragment never reach the agent');
assert.equal(sanitizeHandoffUrl('https://user:pass@example.com/a'), 'https://example.com/a', 'credentials in the URL are dropped');
assert.equal(sanitizeHandoffUrl('king://newtab'), 'king://newtab', 'internal pages are named');
assert.equal(sanitizeHandoffUrl('javascript:alert(1)'), null);
assert.equal(sanitizeHandoffUrl('data:text/html,<script>x</script>'), null);
assert.equal(sanitizeHandoffUrl('file:///etc/passwd'), null);
assert.equal(sanitizeHandoffUrl('not a url'), null);
assert.equal(sanitizeHandoffUrl(42), null);
assert.equal(sanitizeHandoffUrl(undefined), null);
assert.ok((sanitizeHandoffUrl('https://example.com/' + 'a'.repeat(1000)) ?? '').length <= 200, 'long paths are clipped');
assert.ok([...(sanitizeHandoffUrl('https://example.com/a\u0000b\n') ?? '')].every(ch => (ch.codePointAt(0) ?? 0) > 0x1f), 'control characters are dropped');

const withUrl = formatHandoffMessage('https://example.com/cart');
assert.ok(withUrl.includes('https://example.com/cart') && /human/i.test(withUrl) && /not instructions/i.test(withUrl), 'the note names the page and marks itself as data');
assert.ok(/human/i.test(formatHandoffMessage(null)) && !formatHandoffMessage(null).includes('http'), 'a note without a page still says the human acted');

// Privacy: only pages the agent could already see are named.
assert.equal(handoffUrlForAgent({ url: 'https://a.test/x', isIncognito: true }, false), undefined, 'a private tab is never named');
assert.equal(handoffUrlForAgent({ url: 'https://a.test/x' }, true), undefined, 'isolated agent profile: a tab the agent did not open is not named');
assert.equal(handoffUrlForAgent({ url: 'https://a.test/x', isAgentOwned: true }, true), 'https://a.test/x');
assert.equal(handoffUrlForAgent({ url: 'https://a.test/x' }, false), 'https://a.test/x');
assert.equal(handoffUrlForAgent(null, false), undefined);

async function run() {
  // 1. Taking over pauses a running agent and refuses new actions with a clear reason.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    const events: EngineEvent[] = [];
    const engine2 = new ExecutionEngine({ executor, onEvent: e => events.push(e) });
    const first = engine2.submit(req('browser_click'));
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(engine2.takeOver(), true);
    assert.equal(engine2.isTakenOver(), true);
    assert.equal(engine2.getState(), 'paused', 'a running agent is paused');
    assert.equal(engine2.getStatusSnapshot().takenOver, true, 'the status reports the take-over');
    assert.ok(events.some(e => e.type === 'takeover_changed' && e.takenOver === true), 'the panel is notified');
    // The action already in flight finishes; nothing new starts.
    calls[0].resolve('done');
    const record = await first;
    assert.equal(record.status, 'completed');
    await assert.rejects(engine2.submit(req('browser_click')), /human has taken over/i, 'the agent is told why it is waiting');
    await assert.rejects(engine2.submit(req('browser_click')), /do not retry|not .*loop|wait/i, 'and not to hammer the engine');
    assert.equal(engine.getState(), 'idle');
  }

  // 2. The agent cannot take control back: resume, next step and auto-run are refused while taken over.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    engine.submit(req('browser_click')).catch(() => {});
    await flush();
    engine.takeOver();
    engine.resume();
    assert.equal(engine.getState(), 'paused', 'browser_resume cannot end a take-over');
    engine.nextStep();
    assert.equal(engine.getState(), 'paused', 'next step cannot end a take-over');
    engine.setAutoRun();
    assert.equal(engine.getState(), 'paused', 'auto-run cannot end a take-over');
    calls[0]?.resolve('x');
    assert.equal(engine.isTakenOver(), true);
  }

  // 3. Taking over from idle holds the agent before it even starts.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    assert.equal(engine.takeOver(), true);
    assert.equal(engine.getState(), 'idle');
    await assert.rejects(engine.submit(req('browser_click')), /human has taken over/i);
    assert.equal(calls.length, 0, 'nothing reached the executor');
    assert.equal(engine.handBack(null), true);
    assert.equal(engine.isTakenOver(), false);
    const p = engine.submit(req('browser_click'));
    await flush();
    assert.equal(calls.length, 1, 'after hand-back the agent works again');
    calls[0].resolve('ok');
    await p;
  }

  // 4. Taking over cancels queued work and rejects a pending approval, so nothing stale runs on a page the human changed.
  {
    const { calls, executor } = makeControlledExecutor();
    let approvalResolve!: (v: boolean) => void;
    const engine = new ExecutionEngine({ executor, askApproval: () => new Promise<boolean>(r => { approvalResolve = r; }) });
    const p1 = engine.submit(req('browser_click'));
    await flush();
    const p2 = engine.submit(req('browser_type'));
    const p3 = engine.submit(req('browser_open'));
    assert.equal(engine.getQueueLength(), 2);
    engine.takeOver();
    assert.equal(engine.getQueueLength(), 0, 'queued actions are cancelled');
    const r2 = await p2; const r3 = await p3;
    assert.equal(r2.status, 'cancelled');
    assert.equal(r3.status, 'cancelled');
    assert.match(String(r2.error), /took over/i);
    calls[0].resolve('ok');
    await p1;

    const engineB = new ExecutionEngine({ executor, askApproval: () => new Promise<boolean>(r => { approvalResolve = r; }) });
    const pa = engineB.submit(req('browser_click', 'sensitive'));
    await flush();
    assert.equal(engineB.getState(), 'awaiting_approval');
    engineB.takeOver();
    const ra = await pa;
    assert.equal(ra.status, 'rejected', 'a pending approval is rejected when the human takes over');
    assert.equal(engineB.getPendingApproval(), null);
    approvalResolve(true); // a late click on a stale dialog changes nothing
    await flush();
    assert.equal(engineB.getState(), 'paused');
    assert.equal(calls.length, 1, 'the late approval executed nothing');
  }

  // 5. Handing back resumes, and the note reaches the agent exactly once.
  {
    const { executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    engine.submit(req('browser_click')).catch(() => {});
    await flush();
    engine.takeOver();
    assert.equal(engine.handBack('https://example.com/cart'), true);
    assert.equal(engine.getState(), 'running', 'the agent resumes');
    assert.equal(engine.isTakenOver(), false);
    assert.equal(engine.consumeHandoffNote(), 'https://example.com/cart');
    assert.equal(engine.consumeHandoffNote(), null, 'delivered once');
    assert.equal(engine.handBack(null), false, 'handing back when nothing was taken is a no-op');
  }

  // 6. STOP NOW works during a take-over and clears it.
  {
    const { executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    engine.submit(req('browser_click')).catch(() => {});
    await flush();
    engine.takeOver();
    const result = engine.stop('human pressed stop');
    assert.equal(result.accepted, true);
    assert.equal(engine.isTakenOver(), false, 'STOP NOW ends the take-over');
    assert.equal(engine.consumeHandoffNote(), null);
    assert.equal(engine.takeOver(), false, 'cannot take over a stopped engine');
  }

  // 7. IPC: the panel can take over and hand back; payloads are validated.
  {
    const { executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    registerEngineIpc({ handle: (c, l) => { handlers.set(c, l); }, getEngine: () => engine, isTrustedSender: e => e === 'trusted' });
    const command = (sender: unknown, name: unknown, payload?: unknown) => handlers.get('mcp-engine-command')!(sender, name, payload) as any;

    const took: any = command('trusted', 'take_over');
    assert.equal(took.ok, true);
    assert.equal(engine.isTakenOver(), true);
    assert.throws(() => command('untrusted', 'hand_back', { url: 'https://a.test/' }), /Unauthorized/, 'only the trusted window can hand back');
    assert.equal(engine.isTakenOver(), true);

    command('trusted', 'hand_back', { url: 'https://shop.example.com/cart?token=SECRET' });
    assert.equal(engine.isTakenOver(), false);
    assert.equal(engine.consumeHandoffNote(), 'https://shop.example.com/cart', 'the main process strips the query before storing');

    command('trusted', 'take_over');
    command('trusted', 'hand_back', { url: 'javascript:alert(1)' });
    assert.equal(engine.consumeHandoffNote(), null, 'an unsafe URL is not forwarded');
    command('trusted', 'take_over');
    command('trusted', 'hand_back', 'oops');
    assert.equal(engine.isTakenOver(), false, 'a malformed payload still hands back, with no note');
    assert.equal(engine.consumeHandoffNote(), null);
    assert.throws(() => command('trusted', 'take_it_all'), /Unknown engine command/);
  }

  console.log('[PASS] [Take-Over] the human can take the browser, the agent cannot take it back, and STOP NOW still works.');
  clearInterval(keepAlive);
}

run().catch(error => { console.error('[FAIL] Take-over:', error); process.exitCode = 1; clearInterval(keepAlive); });
