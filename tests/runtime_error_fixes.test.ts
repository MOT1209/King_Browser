import assert from 'node:assert/strict';
import { ExecutionEngine, type ActionRequest } from '../electron/main/executionEngine';
import {
  MCP_ACTION_TIMEOUT_MS,
  MCP_APPROVAL_WINDOW_MS,
  isMcpActionPhase,
  windowForMcpActionPhase
} from '../src/utils/mcpActionTiming';
import { decideMcpServerSync, syncMcpServerWithSetting } from '../src/utils/mcpServerSync';
import {
  canOpenInSystemBrowser,
  isGoogleEmbeddedSigninRejection,
  pickSystemBrowserUrl
} from '../electron/main/googleSigninFallback';

console.log('\n--- Runtime Error Fixes (approval window, MCP sync, Google sign-in) ---');

// Engine timers are unref'd, so keep the process alive while timers run.
const keepAlive = setInterval(() => {}, 500);
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function run() {
  // 1. Phase timing: only the two known phases map to fixed windows.
  assert.equal(isMcpActionPhase('awaiting-approval'), true);
  assert.equal(isMcpActionPhase('executing'), true);
  assert.equal(isMcpActionPhase('anything-else'), false, 'unknown phases are rejected');
  assert.equal(isMcpActionPhase(120000), false, 'a renderer cannot pass its own window length');
  assert.equal(windowForMcpActionPhase('awaiting-approval'), MCP_APPROVAL_WINDOW_MS);
  assert.equal(windowForMcpActionPhase('executing'), MCP_ACTION_TIMEOUT_MS);
  assert.ok(MCP_APPROVAL_WINDOW_MS > MCP_ACTION_TIMEOUT_MS, 'approval window is longer than execution');
  console.log('[PASS] [Timing] phases map to fixed windows');

  // 2. Engine: an extended in-flight timeout outlives the original one.
  {
    let resolveAction!: (value: unknown) => void;
    const executor = (_request: ActionRequest) => new Promise<unknown>(resolve => { resolveAction = resolve; });
    const engine = new ExecutionEngine({ executor, actionTimeoutMs: 40 });
    assert.equal(engine.extendInFlightTimeout(1000), false, 'nothing in flight yet');
    const done = engine.submit({ toolName: 'browser_read_page', args: {}, risk: 'safe' });
    assert.equal(engine.extendInFlightTimeout(400), true, 'in-flight action can be extended');
    await sleep(120);
    assert.notEqual(engine.getInFlight(), null, 'still running after the original 40ms timeout');
    resolveAction({ ok: true });
    const record = await done;
    assert.equal(record.status, 'completed', 'completes inside the extended window');
    assert.equal(engine.extendInFlightTimeout(1000), false, 'nothing in flight after completion');
    console.log('[PASS] [Engine] extendInFlightTimeout keeps an approved action alive');
  }

  // 3. Engine: the extended window still times out, with the new length in the reason.
  {
    const executor = () => new Promise<unknown>(() => {});
    const engine = new ExecutionEngine({ executor, actionTimeoutMs: 30 });
    const done = engine.submit({ toolName: 'browser_click', args: {}, risk: 'safe' });
    engine.extendInFlightTimeout(80);
    const record = await done;
    assert.equal(record.status, 'failed');
    assert.match(record.error ?? '', /timed out after 80ms/, 'reason reports the re-armed window');
    console.log('[PASS] [Engine] a re-armed window still enforces its deadline');
  }

  // 4. Engine: invalid lengths are ignored.
  {
    const executor = () => new Promise<unknown>(() => {});
    const engine = new ExecutionEngine({ executor, actionTimeoutMs: 30 });
    const done = engine.submit({ toolName: 'browser_click', args: {}, risk: 'safe' });
    assert.equal(engine.extendInFlightTimeout(0), false);
    assert.equal(engine.extendInFlightTimeout(Number.NaN), false);
    assert.equal(engine.extendInFlightTimeout(-5), false);
    const record = await done;
    assert.match(record.error ?? '', /timed out after 30ms/, 'original timeout still applies');
    console.log('[PASS] [Engine] invalid extension lengths are rejected');
  }

  // 5. MCP server sync: the setting decides.
  assert.equal(decideMcpServerSync(true, false), 'start');
  assert.equal(decideMcpServerSync(false, true), 'stop');
  assert.equal(decideMcpServerSync(true, true), null);
  assert.equal(decideMcpServerSync(false, false), null);
  {
    const calls: string[] = [];
    const api = (running: boolean) => ({
      getMcpStatus: async () => ({ running }),
      startMcpServer: async () => { calls.push('start'); return true; },
      stopMcpServer: async () => { calls.push('stop'); return true; }
    });
    assert.equal(await syncMcpServerWithSetting(false, api(true)), 'stop', 'running but disabled -> stop');
    assert.equal(await syncMcpServerWithSetting(true, api(false)), 'start', 'enabled but stopped -> start');
    assert.equal(await syncMcpServerWithSetting(true, api(true)), null, 'consistent -> no call');
    assert.deepEqual(calls, ['stop', 'start']);
    assert.equal(await syncMcpServerWithSetting(true, undefined), null, 'no Electron API -> no-op');
    const failing = { getMcpStatus: async () => { throw new Error('ipc down'); } };
    assert.equal(await syncMcpServerWithSetting(true, failing), null, 'status failure -> no action');
  }
  console.log('[PASS] [McpSync] server follows the mcpServerEnabled setting');

  // 6. Google embedded sign-in rejection.
  assert.equal(isGoogleEmbeddedSigninRejection('https://accounts.google.com/v3/signin/rejected?x=1'), true);
  assert.equal(isGoogleEmbeddedSigninRejection('https://accounts.google.com/signin/rejected'), true);
  assert.equal(isGoogleEmbeddedSigninRejection('https://accounts.google.com/v3/signin/identifier'), false);
  assert.equal(isGoogleEmbeddedSigninRejection('https://evil.example/v3/signin/rejected'), false, 'other hosts never match');
  assert.equal(isGoogleEmbeddedSigninRejection('http://accounts.google.com/signin/rejected'), false, 'https only');
  assert.equal(isGoogleEmbeddedSigninRejection('not a url'), false);

  assert.equal(canOpenInSystemBrowser('https://dashboard.clerk.com/sign-in'), true);
  assert.equal(canOpenInSystemBrowser('http://example.com/'), true);
  assert.equal(canOpenInSystemBrowser('https://user:pass@example.com/'), false, 'no embedded credentials');
  assert.equal(canOpenInSystemBrowser('file:///C:/Windows/system32'), false);
  assert.equal(canOpenInSystemBrowser('javascript:alert(1)'), false);
  assert.equal(canOpenInSystemBrowser('king://settings'), false);

  assert.equal(pickSystemBrowserUrl('https://dashboard.clerk.com/sign-in'), 'https://dashboard.clerk.com/sign-in');
  assert.equal(pickSystemBrowserUrl('https://accounts.google.com/v3/signin/identifier'), 'https://accounts.google.com/');
  assert.equal(pickSystemBrowserUrl('file:///etc/passwd'), 'https://accounts.google.com/');
  assert.equal(pickSystemBrowserUrl(null), 'https://accounts.google.com/');
  console.log('[PASS] [GoogleSignin] rejection detected; only safe pages go to the system browser');

  console.log('Runtime error fixes: all checks passed');
}

run().then(
  () => { clearInterval(keepAlive); },
  (error) => {
    clearInterval(keepAlive);
    console.error('[FAIL] Runtime error fixes:', error);
    process.exitCode = 1;
  }
);
