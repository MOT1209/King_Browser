import assert from 'node:assert/strict';
import { lockTestGlobals } from './jsdom_suite_lock';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';

/**
 * The MCP rate limiter ran before authentication with one bucket shared by every
 * loopback caller, so any local process that sent 120 unauthenticated requests
 * got the real agent a 429 for the rest of the minute.
 * Prevents: unauthenticated traffic consuming the budget of authenticated clients.
 */

console.log('\n--- MCP rate limiter does not let unauthenticated traffic lock out the agent ---');

const TOKEN = 'ratelimit-token-0123456789';

async function run() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'king-mcp-rl-'));
  const electronStub = {
    app: { getPath: () => userData, getVersion: () => '0.0.0-test', isPackaged: false },
    safeStorage: { isEncryptionAvailable: () => false },
    dialog: {},
    powerMonitor: { on: () => {} },
    BrowserWindow: class {},
    ipcMain: { handle: () => {}, on: () => {}, removeHandler: () => {} }
  };
  const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (request: string, ...rest: unknown[]) {
    return request === 'electron' ? electronStub : original.call(this, request, ...rest);
  };
  process.env.MCP_TOKEN = TOKEN;
  let BrowserMCPServer: any;
  try {
    ({ BrowserMCPServer } = await import('../electron/mcpServer'));
  } finally {
    loader._load = original;
  }

  const server = new BrowserMCPServer(0);
  const quiet = { log: console.log, warn: console.warn };
  console.log = () => {};
  console.warn = () => {};
  try {
    await server.start();
  } finally {
    console.log = quiet.log;
    console.warn = quiet.warn;
  }
  const base = `http://127.0.0.1:${(server as any).actualPort}`;
  const initBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'rl-test', version: '1.0.0' } }
  });
  const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

  try {
    let sawLimit = false;
    for (let i = 0; i < 200; i++) {
      const res = await fetch(`${base}/mcp`, { method: 'POST', headers: jsonHeaders, body: initBody });
      await res.arrayBuffer();
      if (res.status === 429) sawLimit = true;
    }
    assert.ok(sawLimit, 'unauthenticated flooding is still rate limited');

    const authed = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${TOKEN}` }, body: initBody });
    await authed.arrayBuffer();
    assert.notEqual(authed.status, 429, 'an authenticated client is not locked out by unauthenticated traffic');
    assert.equal(authed.status, 200, 'the authenticated initialize still succeeds');
  } finally {
    server.stop();
    fs.rmSync(userData, { recursive: true, force: true });
  }
  console.log('[PASS] MCP rate limiter separates unauthenticated and authenticated traffic');
}

lockTestGlobals(run).catch((error) => {
  process.stderr.write(`MCP rate limit suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
