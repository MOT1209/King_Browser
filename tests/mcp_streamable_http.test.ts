import assert from 'node:assert/strict';
import { lockTestGlobals } from './jsdom_suite_lock';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  handleJsonRpcMessage,
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  type McpProtocolHandlers
} from '../electron/main/mcpProtocol';
import { createStreamableHttpHandlers, isLocalOrigin, type McpHttpSession } from '../electron/main/mcpStreamableHttp';

console.log('\n--- MCP Protocol and Streamable HTTP Test Suite ---');

const TOKEN = 'test-token-0123456789abcdef';
const SCREENSHOT = 'data:image/png;base64,AAAA';
const TOOL_LIST = [
  { name: 'browser_get_url', description: 'read', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_click', description: 'act', inputSchema: { type: 'object', properties: { selector: { type: 'string' } } } }
];

function makeHandlers(calls: Array<{ name: string; args: unknown }> = []): McpProtocolHandlers {
  return {
    serverVersion: '9.9.9',
    listTools: () => TOOL_LIST,
    callTool: async (name, args) => {
      calls.push({ name, args });
      if (name === 'browser_get_url') return 'https://example.com/';
      if (name === 'browser_click') return 'Error: element not found';
      if (name === 'browser_screenshot') return SCREENSHOT;
      if (name === 'slow') { await new Promise((r) => setTimeout(r, 40)); return 'slow-done'; }
      if (name === 'fast') return 'fast-done';
      throw new Error(`Permission denied: unknown tool ${name}`);
    }
  };
}

async function protocolSuite() {
  const handlers = makeHandlers();

  // Version negotiation: echo what we implement, otherwise offer the newest.
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) assert.equal(negotiateProtocolVersion(version), version);
  assert.equal(negotiateProtocolVersion('1999-01-01'), SUPPORTED_PROTOCOL_VERSIONS[0]);
  assert.equal(negotiateProtocolVersion(undefined), SUPPORTED_PROTOCOL_VERSIONS[0]);
  const init = await handleJsonRpcMessage(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, handlers
  ) as any;
  assert.equal(init.result.protocolVersion, '2024-11-05', 'an older client keeps its own version');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'king-browser');
  assert.equal(init.result.serverInfo.version, '9.9.9');

  // Notifications and client responses never get a reply, even for unknown methods.
  assert.equal(await handleJsonRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, handlers), null);
  assert.equal(await handleJsonRpcMessage({ jsonrpc: '2.0', method: 'nonsense/notification' }, handlers), null);
  assert.equal(await handleJsonRpcMessage({ jsonrpc: '2.0', id: 7, result: {} }, handlers), null);

  assert.deepEqual(await handleJsonRpcMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, handlers), { jsonrpc: '2.0', id: 2, result: {} });
  assert.deepEqual(
    ((await handleJsonRpcMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, handlers)) as any).result.tools,
    TOOL_LIST
  );

  // Malformed input is a JSON-RPC error, not a crash.
  const bad = [
    'text', 42, null, [], { id: 1, method: 'ping' }, { jsonrpc: '1.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', id: {}, method: 'ping' }
  ];
  for (const message of bad) {
    const reply = await handleJsonRpcMessage(message, handlers) as any;
    assert.equal(reply.error.code, -32600, `invalid request: ${JSON.stringify(message)}`);
  }
  const unknown = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, handlers) as any;
  assert.equal(unknown.error.code, -32601);
  assert.equal(unknown.id, 4);

  // tools/call argument validation.
  for (const params of [undefined, {}, { name: 5 }, { name: '' }, { name: 'x', arguments: 'a' }, { name: 'x', arguments: [1] }]) {
    const reply = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params }, handlers) as any;
    assert.equal(reply.error?.code, -32602, `invalid params: ${JSON.stringify(params)}`);
  }

  // Tool outcomes: success, reported failure, thrown failure, image.
  const call = async (name: string, args?: unknown) =>
    (await handleJsonRpcMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name, arguments: args } }, handlers)) as any;
  const ok = await call('browser_get_url');
  assert.deepEqual(ok.result.content, [{ type: 'text', text: 'https://example.com/' }]);
  assert.equal(ok.result.isError, undefined);
  const failed = await call('browser_click', { selector: '#x' });
  assert.equal(failed.result.isError, true, 'an "Error:" string is a tool failure the model can read');
  assert.equal(failed.error, undefined);
  const thrown = await call('does_not_exist');
  assert.equal(thrown.result.isError, true);
  assert.match(thrown.result.content[0].text, /^Error: Permission denied/);
  const shot = await call('browser_screenshot');
  assert.deepEqual(shot.result.content, [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }]);

  console.log('[PASS] MCP protocol - negotiation, notifications, validation, tool results');
}

interface Harness {
  url: string;
  sessions: Map<string, McpHttpSession>;
  calls: Array<{ name: string; args: unknown }>;
  changes: { count: number };
  close(): Promise<void>;
  clock: { now: number };
}

async function startHarness(options: { maxSessions?: number; idleMs?: number } = {}): Promise<Harness> {
  const calls: Array<{ name: string; args: unknown }> = [];
  const sessions = new Map<string, McpHttpSession>();
  const changes = { count: 0 };
  const clock = { now: 1_000_000 };
  const handlers = createStreamableHttpHandlers({
    authenticate: (req) => req.headers.authorization === `Bearer ${TOKEN}`,
    handlers: makeHandlers(calls),
    sessions,
    onSessionsChanged: () => { changes.count++; },
    now: () => clock.now,
    ...options
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.post('/mcp', handlers.post);
  app.get('/mcp', handlers.get);
  app.delete('/mcp', handlers.del);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    sessions, calls, changes, clock,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })
  };
}

const AUTH = { Authorization: `Bearer ${TOKEN}` };
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

async function rpc(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, { method: 'POST', headers: { ...JSON_HEADERS, ...AUTH, ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  return { response, status: response.status, json: text ? JSON.parse(text) : undefined };
}

const INITIALIZE = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-test', version: '0' } }
};

async function sdkClientSuite() {
  const h = await startHarness();
  try {
    // The official SDK client over the real transport: the same code path Claude Code, Cursor and others use.
    const client = new Client({ name: 'sdk-test', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(h.url), { requestInit: { headers: AUTH } });
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, 'king-browser');
    assert.equal(h.sessions.size, 1, 'initialize opens exactly one session');
    assert.equal([...h.sessions.values()][0].clientName, 'sdk-test');

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((t) => t.name), ['browser_get_url', 'browser_click'], 'tool discovery works');

    const read = await client.callTool({ name: 'browser_get_url', arguments: {} }) as any;
    assert.equal(read.content[0].text, 'https://example.com/', 'a read tool returns its text');
    const act = await client.callTool({ name: 'browser_click', arguments: { selector: '#go' } }) as any;
    assert.equal(act.isError, true, 'an action tool failure is reported as isError');
    assert.deepEqual(h.calls[1], { name: 'browser_click', args: { selector: '#go' } }, 'arguments reach the tool unchanged');
    const missing = await client.callTool({ name: 'no_such_tool', arguments: {} }) as any;
    assert.equal(missing.isError, true, 'an unknown tool is an error result, not a crash');

    // Concurrent calls on one session are matched to their own request ids.
    const [slow, fast] = await Promise.all([
      client.callTool({ name: 'slow', arguments: {} }) as Promise<any>,
      client.callTool({ name: 'fast', arguments: {} }) as Promise<any>
    ]);
    assert.equal(slow.content[0].text, 'slow-done');
    assert.equal(fast.content[0].text, 'fast-done');

    // Clean shutdown ends the session on the server (DELETE).
    await transport.terminateSession();
    await client.close();
    assert.equal(h.sessions.size, 0, 'terminating the session removes it');
    assert.ok(h.changes.count >= 2, 'the UI is told when a session opens and closes');
  } finally {
    await h.close();
  }

  // The server goes away while a client is connected: the call fails instead of hanging.
  const h2 = await startHarness();
  const client2 = new Client({ name: 'sdk-test-2', version: '1.0.0' }, { capabilities: {} });
  await client2.connect(new StreamableHTTPClientTransport(new URL(h2.url), { requestInit: { headers: AUTH } }));
  await h2.close();
  await assert.rejects(
    Promise.race([
      client2.callTool({ name: 'browser_get_url', arguments: {} }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 5000))
    ]),
    (error: Error) => error.message !== 'hung',
    'a stopped server rejects the call'
  );
  await client2.close().catch(() => {});

  console.log('[PASS] MCP Streamable HTTP - official SDK client: discovery, read, action, errors, concurrency, shutdown');
}

async function wireSuite() {
  const h = await startHarness({ maxSessions: 3, idleMs: 60_000 });
  try {
    // Authentication comes first, and a session id never substitutes for the token.
    const noToken = await fetch(h.url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(INITIALIZE) });
    assert.equal(noToken.status, 401);
    const wrongToken = await fetch(h.url, { method: 'POST', headers: { ...JSON_HEADERS, Authorization: 'Bearer nope' }, body: JSON.stringify(INITIALIZE) });
    assert.equal(wrongToken.status, 401);
    assert.equal(h.sessions.size, 0);

    // DNS rebinding / drive-by pages: a foreign Origin is refused even with a valid token.
    for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'null']) {
      const r = await rpc(h.url, INITIALIZE, { Origin: origin });
      assert.equal(r.status, 403, `origin ${origin} is refused`);
    }
    // Only http(s) on a loopback host. No King page talks to the MCP port, so a
    // king: origin and other schemes on a loopback host have no reason to pass.
    // Prevents: an extension, custom-scheme or king:// context reading responses.
    for (const origin of ['king://settings', 'king://evil', 'ftp://localhost', 'chrome-extension://localhost', 'file://localhost']) {
      assert.equal(isLocalOrigin(origin), false, `origin ${origin} is not local`);
    }
    for (const origin of ['http://localhost:1234', 'https://127.0.0.1', 'http://[::1]:3020']) {
      assert.equal(isLocalOrigin(origin), true, `origin ${origin} is local`);
    }
    const kingOrigin = await rpc(h.url, INITIALIZE, { Origin: 'king://settings' });
    assert.equal(kingOrigin.status, 403, 'a king: origin is refused');
    const local = await rpc(h.url, INITIALIZE, { Origin: 'http://localhost:5173' });
    assert.equal(local.status, 200, 'a local origin is accepted');

    // Initialize issues a session id and negotiates the version.
    const first = await rpc(h.url, INITIALIZE);
    const sid = first.response.headers.get('mcp-session-id') as string;
    assert.match(sid, /^mcp_[0-9a-f]{32}$/);
    assert.equal(first.json.result.protocolVersion, '2025-11-25');
    const legacy = await rpc(h.url, { ...INITIALIZE, params: { ...INITIALIZE.params, protocolVersion: '2025-03-26' } });
    assert.equal(legacy.json.result.protocolVersion, '2025-03-26');

    // Session cap: a runaway client cannot grow the registry without bound.
    const capped = await rpc(h.url, INITIALIZE);
    assert.equal(capped.status, 503);

    // After initialize every request needs the session id.
    const noSession = await rpc(h.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(noSession.status, 400);
    const unknownSession = await rpc(h.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'Mcp-Session-Id': 'mcp_unknown' });
    assert.equal(unknownSession.status, 404);
    const listed = await rpc(h.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'Mcp-Session-Id': sid });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.result.tools.length, 2);

    // Notifications are accepted without a body.
    const note = await rpc(h.url, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'Mcp-Session-Id': sid });
    assert.equal(note.status, 202);
    assert.equal(note.json, undefined);

    // Protocol version header: supported passes, unsupported is a 400.
    const goodVersion = await rpc(h.url, { jsonrpc: '2.0', id: 3, method: 'ping' }, { 'Mcp-Session-Id': sid, 'MCP-Protocol-Version': '2025-06-18' });
    assert.equal(goodVersion.status, 200);
    const badVersion = await rpc(h.url, { jsonrpc: '2.0', id: 3, method: 'ping' }, { 'Mcp-Session-Id': sid, 'MCP-Protocol-Version': '2031-01-01' });
    assert.equal(badVersion.status, 400);

    // Malformed bodies are 4xx with a JSON-RPC error, never a 500.
    for (const body of ['not json at all', '', '[]', '42']) {
      const r = await fetch(h.url, { method: 'POST', headers: { ...JSON_HEADERS, ...AUTH, 'Mcp-Session-Id': sid }, body });
      assert.ok(r.status >= 400 && r.status < 500, `body ${JSON.stringify(body)} gives 4xx, got ${r.status}`);
    }
    const textPlain = await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'text/plain', ...AUTH, 'Mcp-Session-Id': sid }, body: 'hi' });
    assert.equal(textPlain.status, 400, 'a non-JSON content type is a client error');
    const batchInit = await rpc(h.url, [INITIALIZE, { jsonrpc: '2.0', id: 9, method: 'ping' }]);
    assert.equal(batchInit.status, 400, 'initialize must not be batched');
    const batch = await rpc(h.url, [{ jsonrpc: '2.0', id: 10, method: 'ping' }, { jsonrpc: '2.0', id: 11, method: 'tools/list' }], { 'Mcp-Session-Id': sid });
    assert.deepEqual(batch.json.map((r: any) => r.id), [10, 11]);

    // GET offers no server-to-client stream.
    const get = await fetch(h.url, { headers: AUTH });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST, DELETE');
    assert.equal((await fetch(h.url)).status, 401, 'GET is authenticated too');

    // DELETE ends the session; the id then answers 404 so the client re-initializes.
    assert.equal((await fetch(h.url, { method: 'DELETE', headers: { ...AUTH, 'Mcp-Session-Id': sid } })).status, 204);
    const afterDelete = await rpc(h.url, { jsonrpc: '2.0', id: 4, method: 'ping' }, { 'Mcp-Session-Id': sid });
    assert.equal(afterDelete.status, 404);
    assert.equal((await fetch(h.url, { method: 'DELETE', headers: AUTH })).status, 400);

    // Idle sessions expire.
    const second = [...h.sessions.keys()][0];
    h.clock.now += 61_000;
    const expired = await rpc(h.url, { jsonrpc: '2.0', id: 5, method: 'ping' }, { 'Mcp-Session-Id': second });
    assert.equal(expired.status, 404, 'an idle session expires');
    assert.equal(h.sessions.size, 0);
  } finally {
    await h.close();
  }
  console.log('[PASS] MCP Streamable HTTP - auth, origin, sessions, versions, malformed input, expiry');
}

function wiringSuite() {
  const source = fs.readFileSync('electron/mcpServer.ts', 'utf8');
  // Both transports must share one protocol implementation so they cannot drift apart.
  assert.match(source, /handleJsonRpcMessage\(body, this\.protocolHandlers\(\)\)/, 'legacy /message uses the shared handler');
  assert.match(source, /createStreamableHttpHandlers\(\{/, 'the server builds the Streamable HTTP handlers');
  for (const route of ["app.post('/mcp'", "app.get('/mcp'", "app.delete('/mcp'", "app.get('/sse'", "app.post('/message'"]) {
    assert.ok(source.includes(route), `route registered: ${route}`);
  }
  assert.match(source, /authenticate: \(req\) => this\.isAuthenticated\(req\)/, 'Streamable HTTP reuses the bearer-token check');
  assert.match(source, /isToolAllowed\(tool\.name\)\)/, 'tool listing honours the disabled-tool settings');
  assert.match(source, /this\.httpSessions\.clear\(\)/, 'revoking clients also drops Streamable HTTP sessions');
  assert.match(source, /Access-Control-Allow-Headers.*Mcp-Session-Id/, 'CORS preflight allows the session header');
  console.log('[PASS] MCP wiring - both transports share the protocol layer and the token check');
}

async function run() {
  await protocolSuite();
  await sdkClientSuite();
  await wireSuite();
  wiringSuite();
}

// Real sockets and the SDK clients need pristine globals (Event, fetch); jsdom suites replace them temporarily.
lockTestGlobals(run).catch((error) => {
  // Other suites replace console.error, so write to stderr directly.
  process.stderr.write(`MCP Streamable HTTP suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
