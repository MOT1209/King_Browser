import assert from 'node:assert/strict';
import { lockTestGlobals } from './jsdom_suite_lock';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Runs the real BrowserMCPServer (not a copy of its routes) with a stand-in for
// the `electron` module, and talks to it with the official SDK clients: the SSE
// client is what the stdio bridge used by OpenCode relies on, the Streamable
// HTTP client is what Claude Code, Cursor and Codex use. No browser window
// exists here, so tool calls end in the server's "window is not available"
// error, which is exactly the error path worth checking end to end.

console.log('\n--- MCP Server Transports (real server, SDK clients) ---');

const TOKEN = 'integration-token-0123456789';

async function loadServer() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'king-mcp-test-'));
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
  try {
    const { BrowserMCPServer, TOOL_PERMISSIONS } = await import('../electron/mcpServer');
    return { BrowserMCPServer, TOOL_PERMISSIONS, userData };
  } finally {
    // Only the import needed the stand-in; leave every other suite untouched.
    loader._load = original;
  }
}

async function run() {
  const { BrowserMCPServer, TOOL_PERMISSIONS, userData } = await loadServer();
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
  const port = (server as unknown as { actualPort: number }).actualPort;
  assert.ok(port > 0, 'server bound to a port');
  const base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };

  try {
    // Streamable HTTP client against the real server.
    const modern = new Client({ name: 'streamable-test', version: '1.0.0' }, { capabilities: {} });
    const modernTransport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers } });
    await modern.connect(modernTransport);
    const modernTools = (await modern.listTools()).tools.map((t) => t.name);
    // Default posture: only tools classed 'safe' are offered until the user enables the rest in Settings.
    assert.ok(modernTools.includes('king_browser_info') && modernTools.includes('browser_get_url'), 'safe read tools are discoverable over /mcp');
    for (const name of modernTools) assert.equal(TOOL_PERMISSIONS[name], 'safe', `${name} is offered by default only because it is safe`);
    for (const name of ['browser_click', 'browser_navigate', 'browser_type']) assert.ok(!modernTools.includes(name), `${name} stays hidden until enabled`);
    assert.equal(server.getClientCount(), 1, 'the UI client counter includes Streamable HTTP sessions');
    assert.match(server.getConnectedClientsInfo()[0].userAgent, /streamable-test/, 'the client name is shown');

    // Legacy SSE client (the path the OpenCode stdio bridge takes) still works, on the same server.
    const legacy = new Client({ name: 'sse-test', version: '1.0.0' }, { capabilities: {} });
    const legacyTransport = new SSEClientTransport(new URL(`${base}/sse`), { requestInit: { headers } });
    await legacy.connect(legacyTransport);
    const legacyTools = (await legacy.listTools()).tools.map((t) => t.name);
    assert.deepEqual(legacyTools, modernTools, 'both transports expose the identical tool list');
    assert.equal(server.getClientCount(), 2, 'one SSE client and one Streamable HTTP session');

    // The OpenCode path: the bundled stdio bridge (mcp-bridge.mjs) in front of the SSE endpoint.
    const bridge = new Client({ name: 'bridge-test', version: '1.0.0' }, { capabilities: {} });
    const bridgeTransport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('mcp-bridge.mjs')],
      env: { ...process.env as Record<string, string>, MCP_TOKEN: TOKEN, MCP_PORT: String(port) },
      stderr: 'ignore'
    });
    await bridge.connect(bridgeTransport);
    const bridgeTools = (await bridge.listTools()).tools.map((t) => t.name);
    assert.deepEqual(bridgeTools, modernTools, 'the OpenCode bridge sees the same tools');
    const bridged = await bridge.callTool({ name: 'browser_get_url', arguments: {} }) as any;
    assert.equal(bridged.isError, true);
    assert.match(bridged.content[0].text, /window is not available/, 'errors survive the bridge');
    await bridge.close();

    // Failure path end to end: no window, so the call is an error result on both transports.
    for (const [label, client] of [['/mcp', modern], ['/sse', legacy]] as const) {
      const result = await client.callTool({ name: 'browser_get_url', arguments: {} }) as any;
      assert.equal(result.isError, true, `${label}: a call without a browser window is an error result`);
      assert.match(result.content[0].text, /window is not available/, `${label}: the error is readable`);
    }
    const unknown = await modern.callTool({ name: 'definitely_not_a_tool', arguments: {} }) as any;
    assert.equal(unknown.isError, true, 'an unregistered tool is refused');

    // Authentication and origin on the real routes.
    const initBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'x', version: '0' } } });
    const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: jsonHeaders, body: initBody })).status, 401, '/mcp requires the token');
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { ...jsonHeaders, ...headers, Origin: 'https://evil.example' }, body: initBody })).status, 403, '/mcp refuses a foreign origin');
    // fetch() silently ignores a custom Host header, so this one needs a raw request.
    const rebindStatus = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...jsonHeaders, ...headers, Host: 'evil.example' } },
        (res) => { res.resume(); resolve(res.statusCode || 0); });
      req.on('error', reject);
      req.end(initBody);
    });
    assert.equal(rebindStatus, 403, '/mcp refuses a foreign Host (DNS rebinding)');
    const preflight = await fetch(`${base}/mcp`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /Mcp-Session-Id/);
    assert.match(preflight.headers.get('access-control-allow-methods') || '', /DELETE/);

    // Rotating the token is a hard revocation: Streamable HTTP sessions are dropped too.
    const newToken = server.rotateToken();
    assert.notEqual(newToken, TOKEN);
    assert.equal(server.getClientCount(), 0, 'rotation evicts every session on both transports');
    const afterRotation = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...jsonHeaders, ...headers }, body: initBody });
    assert.equal(afterRotation.status, 401, 'the old token no longer works');

    await modern.close().catch(() => {});
    await legacy.close().catch(() => {});
  } finally {
    server.stop();
    fs.rmSync(userData, { recursive: true, force: true });
  }
  console.log('[PASS] MCP real server - /mcp and /sse side by side: discovery, error path, auth, origin, revocation');
}

// Real sockets and the SDK clients need pristine globals (Event, fetch); jsdom suites replace them temporarily.
lockTestGlobals(run).catch((error) => {
  // Other suites replace console.error, so write to stderr directly.
  process.stderr.write(`MCP server transports suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
