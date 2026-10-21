import assert from 'node:assert/strict';
import {
  ExecutionEngine,
  type ActionRequest,
  type PendingApproval
} from '../electron/main/executionEngine';
import { registerEngineIpc, ENGINE_IPC_CHANNELS } from '../electron/main/engineIpc';

console.log('\n--- Engine IPC (§10) Test Suite ---');

// The engine's action-timeout timers are unref'd on purpose, so the test
// process needs its own keep-alive to survive pending-executor tests.
const keepAlive = setInterval(() => {}, 500);

const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) await new Promise<void>(resolve => setImmediate(resolve));
};

function makeControlledExecutor() {
  const calls: Array<{ request: ActionRequest; resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const executor = (request: ActionRequest) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ request, resolve, reject });
    });
  return { calls, executor };
}

const req = (toolName: string, risk: 'safe' | 'sensitive' = 'safe'): ActionRequest =>
  ({ toolName, args: { selector: '#x' }, risk });

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function makeHost(getEngine: () => ExecutionEngine | null) {
  const handlers = new Map<string, Handler>();
  registerEngineIpc({
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
    getEngine
  });
  const call = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = handlers.get(channel);
    assert.ok(handler, `handler registered for ${channel}`);
    return await handler!(null, ...args);
  };
  return { handlers, call };
}

async function run() {
  // 1. Registration surface: exactly the four documented channels.
  {
    const { executor } = makeControlledExecutor();
    const { handlers } = makeHost(() => new ExecutionEngine({ executor }));
    for (const channel of ENGINE_IPC_CHANNELS) {
      assert.ok(handlers.has(channel), `channel ${channel} is registered`);
    }
    assert.equal(handlers.size, ENGINE_IPC_CHANNELS.length, 'no extra channels are exposed');
    console.log('[PASS] Engine IPC — channel surface');
  }

  // 2. Status/history: snapshot shape on a fresh engine.
  const { calls, executor } = makeControlledExecutor();
  const engine = new ExecutionEngine({ executor });
  const { call } = makeHost(() => engine);
  {
    const snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'idle', 'fresh engine reports idle');
    assert.equal(snapshot.mode, 'auto', 'fresh engine defaults to full control');
    assert.equal(snapshot.queueLength, 0, 'queue starts empty');
    assert.equal(snapshot.pendingApproval, null, 'no pending approval initially');
    const history = (await call('mcp-engine-history')) as unknown[];
    assert.deepEqual(history, [], 'history starts empty');
    console.log('[PASS] Engine IPC — status & history');
  }

  // 3. Next Step: armed from idle with an empty queue, nothing runs; with a
  //    queue it runs exactly one action, then pauses at the boundary.
  {
    const result = (await call('mcp-engine-command', 'next_step')) as Record<string, unknown>;
    assert.equal(result.ok, true, 'next_step acknowledged');
    assert.equal(result.mode, 'step', 'mode switched to step');
    assert.equal(result.state, 'running', 'engine is running');
    await flush();
    assert.equal(calls.length, 0, 'an empty queue starts nothing');

    void engine.submit(req('browser_navigate'));
    void engine.submit(req('browser_click'));
    await flush();
    assert.equal(calls.length, 1, 'step mode starts only the first queued action');
    calls[0].resolve('done');
    await flush();
    let snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'paused', 'step boundary pauses the engine');
    assert.equal(snapshot.queueLength, 1, 'the second action stays queued');

    await call('mcp-engine-command', 'next_step');
    await flush();
    assert.equal(calls.length, 2, 'next step runs exactly the next queued action');
    calls[1].resolve('done-2');
    await flush();
    snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'paused', 'boundary pauses again');
    assert.equal(snapshot.queueLength, 0, 'queue drained one step at a time');
    console.log('[PASS] Engine IPC — next step boundary');
  }

  // 4. Auto-run / pause / resume round-trip.
  {
    await call('mcp-engine-command', 'auto_run');
    let snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'running', 'auto-run resumes from paused');
    assert.equal(snapshot.mode, 'auto', 'mode switched back to full control');

    await call('mcp-engine-command', 'pause');
    snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'paused', 'pause acknowledged');

    await call('mcp-engine-command', 'resume');
    snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'running', 'resume acknowledged');
    console.log('[PASS] Engine IPC — auto-run / pause / resume');
  }

  // 5. STOP NOW with an uninterruptible in-flight action reports honestly.
  {
    void engine.submit(req('browser_navigate'));
    await flush();
    assert.equal(calls.length, 3, 'in-flight action is running');

    const result = (await call('mcp-engine-command', 'stop', 'Panel test stop')) as Record<string, unknown>;
    const detail = result.detail as Record<string, unknown>;
    assert.equal(result.ok, true, 'stop acknowledged');
    assert.equal(detail.accepted, true, 'stop accepted');
    assert.equal(detail.inFlightAborted, false, 'no abortInFlight hook is wired');
    assert.match(
      String(detail.finalStateNote),
      /could not be interrupted instantly|reported honestly/,
      'stop does not claim an instant interruption'
    );
    assert.equal(result.state, 'stopping', 'engine reports stopping while in-flight settles');

    calls[2].resolve('finished-late');
    await flush();
    const snapshot = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(snapshot.state, 'stopped', 'engine settles to stopped');
    assert.equal(snapshot.stopReason, 'Panel test stop', 'stop reason recorded');

    await assert.rejects(
      () => call('mcp-engine-command', 'next_step'),
      /Cannot next step: engine is stopped/,
      'new work is rejected until explicit resume'
    );

    await call('mcp-engine-command', 'resume');
    const resumed = (await call('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(resumed.state, 'running', 'explicit resume revives the engine');
    assert.equal(resumed.stopReason, null, 'resume clears the stop reason');
    console.log('[PASS] Engine IPC — STOP NOW honesty & resume');
  }

  // 6. Command validation fails closed.
  {
    await assert.rejects(() => call('mcp-engine-command', 'fly'), /Unknown engine command/);
    await assert.rejects(() => call('mcp-engine-command', 42), /Unknown engine command/);
    await assert.rejects(() => call('mcp-engine-approval', 42, true), /Invalid approval action id/);
    await assert.rejects(() => call('mcp-engine-approval', '', true), /Invalid approval action id/);
    await assert.rejects(() => call('mcp-engine-approval', 'act_x', 'yes'), /Invalid approval decision/);
    console.log('[PASS] Engine IPC — fail-closed validation');
  }

  // 7. Approval round-trip: status exposes the pending action, wrong ids are
  //    rejected, reject never reaches the executor, approve does.
  {
    const { calls: acalls, executor: aexec } = makeControlledExecutor();
    const approvalRequests: Array<{ approval: PendingApproval; resolve: (approved: boolean) => void }> = [];
    const engine2 = new ExecutionEngine({
      executor: aexec,
      askApproval: (approval) =>
        new Promise<boolean>(resolve => {
          approvalRequests.push({ approval, resolve });
        })
    });
    const { call: call2 } = makeHost(() => engine2);

    const first = engine2.submit({
      toolName: 'browser_submit_form',
      args: { selector: '#go' },
      risk: 'sensitive',
      summary: 'Submit the checkout form',
      domain: 'example.com'
    });
    await flush();
    assert.equal(approvalRequests.length, 1, 'sensitive action asks for approval');

    const awaiting = (await call2('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(awaiting.state, 'awaiting_approval', 'engine waits for the decision');
    const pending = awaiting.pendingApproval as Record<string, unknown>;
    assert.equal(pending.actionId, approvalRequests[0].approval.actionId, 'status exposes the pending action id');
    assert.equal(pending.domain, 'example.com', 'status exposes the target domain');

    const wrong = (await call2('mcp-engine-approval', 'act_wrong', true)) as Record<string, unknown>;
    assert.equal(wrong.resolved, false, 'approval bound to the exact action id');

    const rejected = (await call2('mcp-engine-approval', approvalRequests[0].approval.actionId, false)) as Record<string, unknown>;
    assert.equal(rejected.resolved, true, 'rejection resolves');
    const rejectedRecord = await first;
    assert.equal(rejectedRecord.status, 'rejected', 'rejected action is recorded as rejected');
    assert.equal(acalls.length, 0, 'rejected action never reaches the executor');

    const second = engine2.submit({
      toolName: 'browser_click',
      args: { selector: '#pay' },
      risk: 'sensitive',
      summary: 'Click the pay button',
      domain: 'example.com'
    });
    await flush();
    const approved = (await call2('mcp-engine-approval', approvalRequests[1].approval.actionId, true)) as Record<string, unknown>;
    assert.equal(approved.resolved, true, 'approval resolves');
    await flush();
    assert.equal(acalls.length, 1, 'approved action reaches the executor');
    acalls[0].resolve('clicked');
    const approvedRecord = await second;
    await flush();
    assert.equal(approvedRecord.status, 'completed', 'approved action completes');
    console.log('[PASS] Engine IPC — approval round-trip');
  }

  // 8. Phase commands: cancel_phase clears the active phase.
  {
    const { executor: pexec } = makeControlledExecutor();
    const engine3 = new ExecutionEngine({ executor: pexec });
    const { call: call3 } = makeHost(() => engine3);
    engine3.runPhase({ objective: 'Checkout flow', permittedActions: ['browser_click'], maxActions: 2 });

    const withPhase = (await call3('mcp-engine-status')) as Record<string, unknown>;
    const phaseInfo = withPhase.phase as Record<string, unknown>;
    assert.equal((phaseInfo.phase as Record<string, unknown>).objective, 'Checkout flow', 'phase visible in status');

    await call3('mcp-engine-command', 'cancel_phase');
    const cleared = (await call3('mcp-engine-status')) as Record<string, unknown>;
    assert.equal(cleared.phase, null, 'cancel_phase clears the phase');
    console.log('[PASS] Engine IPC — phase cancel');
  }

  // 9. Emergency close: refuses further work without pretending to kill work.
  {
    const result = (await call('mcp-engine-command', 'emergency_close', 'panic')) as Record<string, unknown>;
    const detail = result.detail as Record<string, unknown>;
    assert.equal(result.ok, true, 'emergency close acknowledged');
    assert.match(String(detail.note), /will not schedule further actions/, 'note states the real guarantee');
    console.log('[PASS] Engine IPC — emergency close note');
  }

  // 10. No engine → every call fails closed instead of crashing the process.
  {
    const { call: callNone } = makeHost(() => null);
    await assert.rejects(() => callNone('mcp-engine-status'), /Execution engine is unavailable/);
    await assert.rejects(() => callNone('mcp-engine-command', 'pause'), /Execution engine is unavailable/);
    console.log('[PASS] Engine IPC — unavailable engine fails closed');
  }

  // 11. Sender gate: when the composition root supplies isTrustedSender, every
  //     channel rejects an untrusted renderer and still serves the trusted one.
  //     These channels can resume/auto-run the agent, so a webview or any other
  //     webContents must not reach them.
  {
    const { executor: gexec } = makeControlledExecutor();
    const gatedEngine = new ExecutionEngine({ executor: gexec });
    const handlers = new Map<string, Handler>();
    registerEngineIpc({
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
      getEngine: () => gatedEngine,
      isTrustedSender: (event) => event === trustedEvent
    });
    const trustedEvent = { sender: 'main-window' };
    const untrustedEvent = { sender: 'webview' };
    const callAs = async (event: unknown, channel: string, ...args: unknown[]): Promise<unknown> => {
      const handler = handlers.get(channel);
      assert.ok(handler, `handler registered for ${channel}`);
      return await handler!(event, ...args);
    };

    for (const channel of ENGINE_IPC_CHANNELS) {
      const args = channel === 'mcp-engine-command' ? ['pause'] : channel === 'mcp-engine-approval' ? ['act_x', true] : [];
      await assert.rejects(
        () => callAs(untrustedEvent, channel, ...args),
        /Unauthorized sender/,
        `${channel} rejects an untrusted sender`
      );
    }
    // The gate runs before the command allowlist, so a forged command cannot
    // probe which commands exist either.
    await assert.rejects(() => callAs(untrustedEvent, 'mcp-engine-command', 'fly'), /Unauthorized sender/);

    const trustedStatus = (await callAs(trustedEvent, 'mcp-engine-status')) as Record<string, unknown>;
    assert.equal(trustedStatus.state, 'idle', 'trusted sender still reaches the engine');
    const trustedPause = (await callAs(trustedEvent, 'mcp-engine-command', 'pause')) as Record<string, unknown>;
    assert.equal(trustedPause.ok, true, 'trusted sender can still command the engine');
    console.log('[PASS] Engine IPC — sender gate');
  }

  console.log('[PASS] Engine IPC suite complete');
}

run().then(
  () => {
    clearInterval(keepAlive);
  },
  (error) => {
    clearInterval(keepAlive);
    console.error('[FAIL] Engine IPC suite:', error);
    process.exitCode = 1;
  }
);
