import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

function loadSource(file: string, globals: Record<string, unknown>, imports: Record<string, unknown>) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText, { exports, require: (name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected dependency ${name}`);
    return imports[name];
  }, console, Date, Set, Map, URL, ...globals });
  return exports;
}

async function run() {
  const forwarded: Array<{ tool: string; args: any }> = [];
  let dialogResponse = 0;
  let dialogCalls = 0;
  const cancelCalls: Array<{ reason: string; toolName?: string }> = [];
  let holdRenderer = false;
  let releaseRenderer: (() => void) | null = null;
  let rejectRenderer: ((err: Error) => void) | null = null;

  const executionEngineModule = loadSource('electron/main/executionEngine.ts', { setTimeout, clearTimeout, setImmediate }, {});
  const policyEngineModule = loadSource('electron/main/policyEngine.ts', { setTimeout, clearTimeout, setImmediate }, {});

  const serverModule = loadSource('electron/mcpServer.ts', { process, Buffer, setTimeout, clearTimeout }, {
    electron: {
      app: { isPackaged: false },
      powerMonitor: { on: () => {} },
      dialog: {
        showMessageBox: () => { dialogCalls += 1; return Promise.resolve({ response: dialogResponse }); }
      }
    },
    crypto, os, fs, path,
    './main/mcpBridge.js': {
      setMcpActionPhaseListener: () => {},
      requestRendererMcpAction: async (_win: any, tool: string, args: any) => {
        forwarded.push({ tool, args });
        if (holdRenderer) {
          await new Promise<void>((resolve, reject) => { releaseRenderer = resolve; rejectRenderer = reject; });
        }
        return `ok:${tool}`;
      },
      cancelPendingMcpActions: (reason: string, toolName?: string) => {
        cancelCalls.push({ reason, toolName });
        if (rejectRenderer) {
          const rejectPending = rejectRenderer;
          rejectRenderer = null;
          releaseRenderer = null;
          rejectPending(new Error(reason));
        }
      }
    },
    './main/executionEngine.js': executionEngineModule,
    './main/policyEngine.js': policyEngineModule
  });

  const win = { isDestroyed: () => false, webContents: { send: () => {} } };
  const makeServer = () => {
    const server = Object.create(serverModule.BrowserMCPServer.prototype);
    Object.assign(server, {
      mainWindow: win,
      authorizationGeneration: 0,
      firstUseApproved: false,
      disabledTools: new Set<string>()
    });
    return server;
  };

  // 1) browser_status reflects the live engine snapshot (works with and without enforcement)
  {
    const server = makeServer();
    const snapshot = JSON.parse(await server.executeTool('browser_status', {}));
    assert.equal(snapshot.state, 'idle', 'status reports idle engine state');
    assert.equal(snapshot.mode, 'auto', 'status reports execution mode');
    assert.equal(typeof snapshot.queueLength, 'number', 'status reports queue length');
  }

  // 2) engine-control tools answer locally and never reach the renderer
  {
    const server = makeServer();
    const before = forwarded.length;
    // From idle, pause is a safe-boundary no-op — nothing is running yet.
    assert.match(await server.executeTool('browser_pause', {}), /pause/i);
    assert.equal(server.getExecutionEngine().getState(), 'idle', 'pause from idle changes nothing');
    // Next Step from idle arms step mode and starts the engine.
    assert.match(await server.executeTool('browser_next_step', {}), /step/i);
    assert.equal(server.getExecutionEngine().getMode(), 'step', 'next_step switches the engine to step mode');
    assert.equal(server.getExecutionEngine().getState(), 'running', 'next_step starts an idle engine');
    // Now pause reaches a running engine and resume continues from the boundary.
    assert.match(await server.executeTool('browser_pause', {}), /pause/i);
    assert.equal(server.getExecutionEngine().getState(), 'paused', 'pause reaches a running engine');
    assert.match(await server.executeTool('browser_next_phase', {}), /no active phase/i);
    assert.match(await server.executeTool('browser_resume', {}), /resume/i);
    assert.equal(server.getExecutionEngine().getState(), 'running', 'resume leaves the paused state');
    assert.equal(forwarded.length, before, 'engine-control tools are never forwarded to the renderer');
  }

  // 3) alias resolution: agent vocabulary maps to the canonical renderer tool
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    const out = await server.executeTool('browser_open', { url: 'https://example.com' });
    const last = forwarded[forwarded.length - 1];
    assert.equal(last.tool, 'browser_navigate', 'browser_open forwarded as browser_navigate');
    assert.equal(last.args.url, 'https://example.com', 'arguments preserved through the engine');
    assert.equal(out, 'ok:browser_navigate', 'renderer result travels back to the caller');
  }

  // 4) alias permission is the intersection with the canonical tool
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    server.disabledTools.add('browser_navigate');
    await assert.rejects(
      server.executeTool('browser_open', { url: 'https://example.com' }),
      /Permission denied/,
      'enabled alias cannot bypass a disabled canonical tool'
    );
  }

  // 5) pre-existing direct path still resolves aliases when enforcement is off
  {
    const server = makeServer();
    const out = await server.executeTool('browser_back', {});
    assert.equal(forwarded[forwarded.length - 1].tool, 'browser_go_back', 'browser_back forwarded as browser_go_back');
    assert.equal(out, 'ok:browser_go_back');
  }

  // 6) sensitive action: rejected approval blocks execution, approved runs it
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    dialogResponse = 1;
    const before = forwarded.length;
    await assert.rejects(
      server.executeTool('browser_type', { selector: '#q', text: 'hello' }),
      /./,
      'rejected sensitive action must fail the tool call'
    );
    assert.ok(dialogCalls >= 1, 'approval dialog was shown for the sensitive action');
    assert.equal(forwarded.length, before, 'rejected action never reaches the renderer');

    dialogResponse = 0;
    const out = await server.executeTool('browser_type', { selector: '#q', text: 'hello' });
    assert.equal(forwarded[forwarded.length - 1].tool, 'browser_type', 'approved action forwarded');
    assert.equal(out, 'ok:browser_type');
  }

  // 7) STOP NOW: queue/execution blocked until an explicit resume
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    const stopOut = await server.executeTool('browser_stop', {});
    assert.match(stopOut, /STOP NOW/, 'stop acknowledges the emergency stop');
    assert.ok(['stopped', 'stopping'].includes(server.getExecutionEngine().getState()), 'engine reports a stopped state');
    await assert.rejects(
      server.executeTool('browser_click', { selector: '#x' }),
      /rejected|resume|stopped|stopping/i,
      'new actions are rejected after STOP NOW'
    );
  }

  // 8) UI STOP NOW (engineIpc → engine.stop) aborts the in-flight renderer
  // action through the wired abortInFlight hook — the same enforcement the MCP
  // browser_stop path gets, not just "no new actions".
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    cancelCalls.length = 0;
    holdRenderer = true;
    const before = forwarded.length;
    const submit = server.executeTool('browser_open', { url: 'https://example.com' });
    const deadline = Date.now() + 2000;
    while (forwarded.length === before && Date.now() < deadline) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(forwarded.length > before, 'the action reached the renderer and is now in flight');

    const stopAck = server.getExecutionEngine().stop('STOP NOW from control panel');
    assert.equal(stopAck.inFlightAborted, true, 'control-panel STOP NOW aborts the in-flight renderer action');
    assert.equal(cancelCalls.length, 1, 'cancelPendingMcpActions was called exactly once for the in-flight action');
    assert.equal(cancelCalls[0].reason, 'STOP NOW from control panel', 'the cancel carries the exact operator reason');

    await assert.rejects(submit, /STOP NOW from control panel/, 'the aborted tool call fails with the operator reason, never a fake success');
    const settled = server.getExecutionEngine().getHistory().filter(r => r.toolName === 'browser_navigate').pop();
    assert.equal(settled?.stoppedBy, 'STOP NOW from control panel', 'the settle is tagged with the stop reason in history');
    assert.equal(server.getExecutionEngine().getState(), 'stopped', 'engine settles to stopped, never back to running');

    releaseRenderer?.();
    releaseRenderer = null;
    rejectRenderer = null;
    holdRenderer = false;
  }

  // 9) Emergency Close takes the same abort path.
  {
    const server = makeServer();
    server.setPolicyEnforcement(true);
    cancelCalls.length = 0;
    holdRenderer = true;
    const before = forwarded.length;
    const submit = server.executeTool('browser_open', { url: 'https://example.com' });
    const deadline = Date.now() + 2000;
    while (forwarded.length === before && Date.now() < deadline) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(forwarded.length > before, 'the action reached the renderer and is now in flight');

    const closeAck = server.getExecutionEngine().emergencyClose('Emergency Close from control panel');
    assert.equal(closeAck.accepted, true, 'emergency close acknowledged');
    assert.match(closeAck.note, /Emergency close/, 'note names the emergency close');
    assert.equal(cancelCalls.length, 1, 'emergency close aborts the in-flight renderer action too');
    assert.equal(cancelCalls[0].reason, 'Emergency Close from control panel', 'the cancel carries the exact operator reason');

    await assert.rejects(submit, /Emergency Close from control panel/, 'the aborted tool call fails, never a fake success');
    assert.equal(server.getExecutionEngine().getState(), 'stopped', 'engine stays stopped after the emergency close');

    releaseRenderer?.();
    releaseRenderer = null;
    rejectRenderer = null;
    holdRenderer = false;
  }

  console.log('[PASS] MCP engine wiring: status, engine controls, aliases, approvals, STOP NOW, UI-stop abort parity');
}

run().catch(err => {
  console.error('[FAIL] MCP engine wiring:', err);
  process.exitCode = 1;
});
