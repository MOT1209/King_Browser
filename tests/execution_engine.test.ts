import assert from 'node:assert/strict';
import {
  ExecutionEngine,
  type ActionRequest,
  type PendingApproval,
  type EngineEvent
} from '../electron/main/executionEngine';

console.log('\n--- Execution Engine (§11) Test Suite ---');

// The engine's action-timeout timers are unref'd on purpose (they must never
// keep the Electron app alive), so the test process needs its own keep-alive
// to survive pending-executor tests. Cleared when the suite finishes.
const keepAlive = setInterval(() => {}, 500);

const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) await new Promise<void>(resolve => setImmediate(resolve));
};

const waitUntil = async (predicate: () => boolean, timeoutMs = 5000, gracePolls = 200): Promise<boolean> => {
  const start = Date.now();
  let grace = gracePolls;
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      if (grace-- <= 0) return false;
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return true;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeControlledExecutor() {
  const calls: Array<{ request: ActionRequest; resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const executor = (request: ActionRequest) => new Promise<unknown>((resolve, reject) => {
    calls.push({ request, resolve, reject });
  });
  return { calls, executor };
}

const req = (toolName: string, risk: 'safe' | 'sensitive' = 'safe'): ActionRequest =>
  ({ toolName, args: { selector: '#x' }, risk });

async function run() {
  // 1. Basic serial lifecycle: FIFO, exactly one in-flight action.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    assert.equal(engine.getState(), 'idle', 'engine starts idle');

    const p1 = engine.submit(req('browser_status'));
    const p2 = engine.submit(req('browser_read_page'));
    assert.equal(engine.getState(), 'running', 'first submit moves engine to running');
    assert.equal(calls.length, 1, 'only one action is in flight');
    assert.equal(calls[0].request.toolName, 'browser_status', 'FIFO order preserved');

    calls[0].resolve('ok-1');
    const r1 = await p1;
    await flush();
    assert.equal(r1.status, 'completed', 'first action completed');
    assert.equal(calls.length, 2, 'second action starts only after the first settles');
    assert.equal(calls[1].request.toolName, 'browser_read_page', 'second action is the queued one');

    calls[1].resolve('ok-2');
    const r2 = await p2;
    await flush();
    assert.equal(r2.status, 'completed', 'second action completed');
    assert.equal(engine.getQueueLength(), 0, 'queue drained');
    assert.equal(engine.getState(), 'running', 'auto mode keeps running with an empty queue');
    console.log('[PASS] Execution Engine — serial FIFO lifecycle');
  }

  // 2. Pause stops scheduling new actions; resume continues the queue.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    const p1 = engine.submit(req('browser_click'));
    const p2 = engine.submit(req('browser_scroll'));
    engine.pause();
    assert.equal(engine.getState(), 'paused', 'pause transitions state');

    calls[0].resolve('done');
    await p1;
    await flush();
    assert.equal(calls.length, 1, 'no queued action starts while paused');

    engine.resume();
    await flush();
    assert.equal(calls.length, 2, 'resume schedules the next queued action');
    calls[1].resolve('done');
    await p2;
    console.log('[PASS] Execution Engine — pause/resume boundary');
  }

  // 3. STOP NOW: rejects new submits, cancels queue, aborts in-flight, honest late settle.
  {
    const { calls, executor } = makeControlledExecutor();
    const abortReasons: string[] = [];
    const engine = new ExecutionEngine({
      executor,
      abortInFlight: (reason) => { abortReasons.push(reason); }
    });
    const p1 = engine.submit(req('browser_click'));
    const p2 = engine.submit(req('browser_scroll'));
    const p3 = engine.submit(req('browser_read_page'));

    const ack = engine.stop('user pressed STOP NOW');
    assert.equal(ack.accepted, true, 'stop acknowledged');
    assert.equal(ack.cancelled, 2, 'two queued actions cancelled');
    assert.equal(ack.inFlightAborted, true, 'in-flight abort signalled');
    assert.deepEqual(abortReasons, ['user pressed STOP NOW'], 'abort hook received the reason');
    assert.equal(engine.getState(), 'stopping', 'engine enters stopping while work settles');

    const r2 = await p2;
    const r3 = await p3;
    assert.equal(r2.status, 'cancelled', 'queued action 2 cancelled');
    assert.equal(r3.status, 'cancelled', 'queued action 3 cancelled');
    assert.equal(r2.stoppedBy, 'user pressed STOP NOW', 'cancel reason recorded');

    await assert.rejects(engine.submit(req('browser_click')), /new actions are rejected/, 'submits rejected after stop');

    calls[0].resolve('late success');
    const r1 = await p1;
    await flush();
    assert.equal(r1.status, 'completed', 'late settle reports the honest terminal status');
    assert.equal(r1.stoppedBy, 'user pressed STOP NOW', 'late settle marked as stopped-by');
    assert.equal(engine.getState(), 'stopped', 'engine reaches stopped after the last settle');
    assert.equal(engine.getLastFinalState()?.inFlightSettledLater, true, 'final state notes the late settle');
    assert.equal(calls.length, 1, 'no further executor calls were made');

    const rejections: Promise<unknown>[] = [engine.submit(req('browser_scroll')).catch(() => null)];
    await Promise.all(rejections);
    assert.equal(engine.getState(), 'stopped', 'stopped engine ignores everything until explicit resume');

    engine.resume();
    await flush();
    assert.equal(engine.getState(), 'running', 'explicit resume restarts a stopped engine');
    console.log('[PASS] Execution Engine — STOP NOW semantics (reject, cancel, abort, honest settle)');
  }

  // 4. STOP NOW from a quiet engine settles immediately; no in-flight lie.
  {
    const { executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    const ack = engine.stop('emergency close');
    assert.equal(engine.getState(), 'stopped', 'stop with no in-flight work settles synchronously');
    assert.match(ack.finalStateNote, /No operation was running/, 'note is honest about final state');
    await assert.rejects(engine.submit(req('browser_click')), /explicit resume is required/i);
    console.log('[PASS] Execution Engine — quiet STOP NOW and honest notes');
  }

  // 5. STOP NOW without an abort hook reports that interruption was not possible.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    const p1 = engine.submit(req('browser_click'));
    const ack = engine.stop('user request');
    assert.equal(ack.inFlightAborted, false, 'no abort hook means no claimed interruption');
    assert.match(ack.finalStateNote, /could not be interrupted instantly/, 'note does not claim false termination');
    calls[0].resolve('done');
    await p1;
    await flush();
    assert.equal(engine.getState(), 'stopped', 'engine settles to stopped');
    assert.equal(engine.getLastFinalState()?.inFlightAborted, false, 'final state keeps honest abort flag');
    console.log('[PASS] Execution Engine — no false claims when interruption is unsupported');
  }

  // 6. Approval flow: sensitive action waits for the UI; approve executes exactly that action.
  {
    const { calls, executor } = makeControlledExecutor();
    const approvals: PendingApproval[] = [];
    const decision = deferred<boolean>();
    const engine = new ExecutionEngine({
      executor,
      askApproval: (approval) => { approvals.push(approval); return decision.promise; }
    });
    const p = engine.submit(req('browser_type', 'sensitive'));
    await flush();
    assert.equal(engine.getState(), 'awaiting_approval', 'sensitive action suspends for approval');
    assert.equal(approvals.length, 1, 'approval request surfaced');
    assert.equal(calls.length, 0, 'nothing executes before approval');

    const ok = engine.respondToApproval(approvals[0].actionId, true);
    assert.equal(ok, true, 'approval accepted');
    await flush();
    assert.equal(calls.length, 1, 'approved action executes');
    assert.equal(engine.getPendingApproval(), null, 'approval cleared after decision');

    decision.resolve(true);
    await flush();
    assert.equal(calls.length, 1, 'late duplicate decision cannot double-execute');

    calls[0].resolve('typed');
    const record = await p;
    assert.equal(record.status, 'completed', 'approved action completes');
    console.log('[PASS] Execution Engine — approval approve path is single-shot');
  }

  // 7. Approval reject: action is recorded as rejected and never executed.
  {
    const { calls, executor } = makeControlledExecutor();
    const approvals: PendingApproval[] = [];
    const engine = new ExecutionEngine({
      executor,
      askApproval: (approval) => { approvals.push(approval); return new Promise<boolean>(() => {}); }
    });
    const p = engine.submit(req('browser_type', 'sensitive'));
    await flush();
    engine.respondToApproval(approvals[0].actionId, false);
    const record = await p;
    await flush();
    assert.equal(record.status, 'rejected', 'rejected action recorded');
    assert.match(record.error ?? '', /Rejected/, 'rejection reason recorded');
    assert.equal(calls.length, 0, 'rejected action never executed');
    console.log('[PASS] Execution Engine — approval reject path');
  }

  // 8. Approval via the askApproval promise itself (no UI round-trip needed).
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({
      executor,
      askApproval: async () => true
    });
    const p = engine.submit(req('browser_select', 'sensitive'));
    await flush();
    assert.equal(calls.length, 1, 'auto-granted approval executes the action');
    calls[0].resolve('selected');
    const record = await p;
    assert.equal(record.status, 'completed', 'auto-approved action completes');
    console.log('[PASS] Execution Engine — approval promise path');
  }

  // 9. STOP NOW while awaiting approval cancels the approval and the action.
  {
    const { calls, executor } = makeControlledExecutor();
    const approvals: PendingApproval[] = [];
    const engine = new ExecutionEngine({
      executor,
      askApproval: (approval) => { approvals.push(approval); return new Promise<boolean>(() => {}); }
    });
    const p = engine.submit(req('browser_type', 'sensitive'));
    await flush();
    engine.stop('killed during approval');
    const record = await p;
    await flush();
    assert.equal(record.status, 'cancelled', 'awaiting action cancelled by stop');
    assert.equal(engine.getState(), 'stopped', 'engine stopped with no in-flight work');
    assert.equal(engine.respondToApproval(approvals[0].actionId, true), false, 'stale approval cannot execute');
    assert.equal(calls.length, 0, 'nothing executed');
    console.log('[PASS] Execution Engine — STOP NOW cancels pending approvals');
  }

  // 10. Action timeout produces a failed record and frees the queue.
  {
    const executor = () => new Promise<unknown>(() => {});
    const engine = new ExecutionEngine({ executor, actionTimeoutMs: 25 });
    const p1 = engine.submit(req('browser_wait'));
    const record1 = await p1;
    assert.equal(record1.status, 'failed', 'timed-out action recorded as failed');
    assert.match(record1.error ?? '', /timed out/, 'timeout reason recorded');

    const p2 = engine.submit(req('browser_click'));
    const sawInFlight = await waitUntil(() => engine.getInFlight()?.toolName === 'browser_click');
    if (sawInFlight) {
      assert.equal(engine.getInFlight()?.toolName, 'browser_click', 'queue continues after a timeout');
    }
    const record2 = await Promise.race([
      p2,
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error('Second action never settled: queue did not continue')), 10000);
        t.unref?.();
      })
    ]);
    assert.notEqual(record2.startedAt, undefined, 'second action started after the first timed out');
    assert.equal(record2.status, 'failed', 'second action also reaches a terminal timeout record');
    console.log('[PASS] Execution Engine — per-action timeout boundary');
  }

  // 11. Bounded queue and bounded run are enforced synchronously.
  {
    const { executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor, maxQueueSize: 2 });
    const p1 = engine.submit(req('browser_click'));
    const p2 = engine.submit(req('browser_scroll'));
    const p3 = engine.submit(req('browser_read_page'));
    await assert.rejects(engine.submit(req('browser_wait')), /queue is full/i, 'queue bound enforced');
    void p1; void p2; void p3;
    console.log('[PASS] Execution Engine — bounded queue');
  }
  {
    const engine = new ExecutionEngine({ executor: async () => 'ok', maxActionsPerRun: 2 });
    await engine.submit(req('browser_click'));
    await engine.submit(req('browser_click'));
    await assert.rejects(engine.submit(req('browser_click')), /Run action limit/, 'run limit enforced');
    console.log('[PASS] Execution Engine — bounded run');
  }

  // 12. Next Step executes exactly one action and pauses at the boundary.
  {
    let executed = 0;
    const engine = new ExecutionEngine({ executor: async () => { executed++; return 'ok'; } });
    engine.nextStep();
    const p1 = engine.submit(req('browser_click'));
    const p2 = engine.submit(req('browser_scroll'));
    await p1;
    await flush();
    assert.equal(executed, 1, 'step mode executed exactly one action');
    assert.equal(engine.getState(), 'paused', 'step mode pauses at the boundary');
    assert.equal(engine.getQueueLength(), 1, 'remaining action stayed queued');

    engine.resume();
    await p2;
    await flush();
    assert.equal(executed, 2, 'resume executed the next single action');
    assert.equal(engine.getState(), 'paused', 'step mode pauses again after one action');
    console.log('[PASS] Execution Engine — Next Step single-action boundary');
  }

  // 13. Next Phase: allowlist, action budget, and boundary pause.
  {
    const { calls, executor } = makeControlledExecutor();
    const engine = new ExecutionEngine({ executor });
    engine.runPhase({
      objective: 'Fill the login form',
      permittedActions: ['browser_click', 'browser_type'],
      maxActions: 2
    });
    await assert.rejects(engine.submit(req('browser_read_page')), /does not permit action/, 'phase allowlist enforced');

    const p1 = engine.submit(req('browser_click'));
    const p2 = engine.submit(req('browser_type'));
    const p3 = engine.submit(req('browser_click'));
    calls[0].resolve('ok');
    await p1;
    await flush();
    assert.equal(calls.length, 2, 'phase continues within budget');
    calls[1].resolve('ok');
    await p2;
    await flush();
    assert.equal(engine.getState(), 'paused', 'phase pauses at its action budget');
    engine.resume();
    const r3 = await p3;
    assert.equal(r3.status, 'rejected', 'queued action beyond the budget is rejected, not executed');
    assert.equal(engine.getState(), 'paused', 'engine stays paused after the over-budget rejection');
    assert.equal(calls.length, 2, 'nothing executed past the budget');
    await assert.rejects(engine.submit(req('browser_click')), /action budget/, 'post-budget submits rejected');
    console.log('[PASS] Execution Engine — Next Phase budget and allowlist');
  }

  // 14. Phase completion condition pauses the phase and clears it.
  {
    const engine = new ExecutionEngine({
      executor: async () => 'ok',
      evaluateCondition: (condition) => condition.type === 'tool_called' && condition.toolName === 'browser_click'
    });
    engine.runPhase({
      objective: 'Single click phase',
      permittedActions: ['browser_click'],
      maxActions: 10,
      completionConditions: [{ type: 'tool_called', toolName: 'browser_click' }]
    });
    await engine.submit(req('browser_click'));
    await flush(6);
    assert.equal(engine.getPhase(), null, 'completed phase is cleared');
    assert.equal(engine.getState(), 'paused', 'phase completion pauses the engine');
    console.log('[PASS] Execution Engine — phase completion condition');
  }

  // 15. Event stream: ordered state changes and terminal action updates.
  {
    const events: EngineEvent[] = [];
    const engine = new ExecutionEngine({
      executor: async () => 'ok',
      onEvent: (event) => events.push(event)
    });
    await engine.submit(req('browser_click'));
    engine.stop('done testing');
    const stateChanges = events
      .filter((e): e is Extract<EngineEvent, { type: 'state_changed' }> => e.type === 'state_changed')
      .map(e => `${e.from}->${e.to}`);
    assert.deepEqual(stateChanges, ['idle->running', 'running->stopping', 'stopping->stopped'], 'state change sequence is ordered');
    const terminalUpdates = events.filter(
      (e): e is Extract<EngineEvent, { type: 'action_updated' }> => e.type === 'action_updated' && e.record.status === 'completed'
    );
    assert.equal(terminalUpdates.length, 1, 'terminal action update emitted exactly once');
    console.log('[PASS] Execution Engine — event stream ordering');
  }

  console.log('[PASS] Execution Engine suite complete');
}

run().then(
  () => { clearInterval(keepAlive); },
  (error) => {
    clearInterval(keepAlive);
    console.error('[FAIL] Execution Engine suite:', error);
    process.exitCode = 1;
  }
);
