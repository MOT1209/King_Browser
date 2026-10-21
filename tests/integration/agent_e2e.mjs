/**
 * Real end-to-end check (plan.md, Phase 1): launches the built Electron app
 * under a virtual display, starts the MCP server, then plays the role of an
 * agent over HTTP. It proves the whole chain works for real — HTTP auth →
 * tool permissions → renderer bridge — and that the agent's navigation guard
 * refuses loopback addresses.
 *
 * Not part of `npm test` (needs Electron, a display and `npm run build`).
 * Run:  npm run build && npm run test:integration
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TOKEN = 'e2e-token-0123456789abcdef';
const MCP_PORT = 3055, CDP_PORT = 9333, INSPECT_PORT = 9334, PAGE_PORT = 3056;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'king-e2e-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- A loopback site, used to prove the agent cannot reach it ---------------
const site = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><title>E2E page</title>
    <button id="safe" onclick="fetch('/clicked/safe')">Read more</button>
    <button id="danger" onclick="fetch('/clicked/danger')">Delete account</button>`);
});
await new Promise(r => site.listen(PAGE_PORT, '127.0.0.1', r));

// --- Launch the real app ----------------------------------------------------
const app = spawn('xvfb-run', ['-a', path.join(root, 'node_modules/electron/dist/electron'),
  '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`,
  `--remote-debugging-port=${CDP_PORT}`, `--inspect=${INSPECT_PORT}`, root],
  { env: { ...process.env, MCP_TOKEN: TOKEN, MCP_PORT: String(MCP_PORT) }, stdio: ['ignore', fs.openSync(process.env.KING_E2E_LOG ?? os.devNull, 'a'), fs.openSync(process.env.KING_E2E_LOG ?? os.devNull, 'a')], detached: true });

async function cleanup(code) {
  try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  site.close();
  fs.rmSync(userData, { recursive: true, force: true });
  process.exit(code);
}
process.on('uncaughtException', e => { console.error('[FAIL]', e); cleanup(1); });
process.on('unhandledRejection', e => { console.error('[FAIL]', e); cleanup(1); });

async function getJson(url) { const r = await fetch(url); return r.json(); }
async function waitFor(fn, what, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(300); }
  throw new Error(`Timed out waiting for ${what}`);
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  ws.on('message', m => { const d = JSON.parse(m); pending.get(d.id)?.(d); });
  const open = new Promise(r => ws.on('open', r));
  return { async send(method, params) { await open; const myId = ++id; return new Promise(res => { pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); }); },
  async evaluate(expression) {
    await open; const myId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(myId, d => d.error || d.result?.exceptionDetails ? reject(new Error(`${expression.slice(0, 80)} -> ${JSON.stringify(d.error ?? d.result.exceptionDetails.exception?.description)}`)) : resolve(d.result.result.value));
      ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  } };
}

const call = (tool, args = {}) => fetch(`http://127.0.0.1:${MCP_PORT}/call`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ tool, args })
}).then(async r => ({ status: r.status, body: await r.json() }));

// Main process: auto-accept the native first-use authorization dialog (a real
// user clicks "Allow"; nobody is there to click in CI).
// The inspector can accept connections before the main context is usable, so
// reconnect until the dialog override is confirmed.
await waitFor(async () => {
  const [target] = await getJson(`http://127.0.0.1:${INSPECT_PORT}/json/list`);
  const main = cdp(target.webSocketDebuggerUrl);
  return main.evaluate(`(() => { const { dialog } = process.mainModule.require('electron'); dialog.showMessageBox = async () => ({ response: 0 }); return true; })()`);
}, 'dialog override in the main process');

// Renderer: the page the human sees.
const pageTarget = await waitFor(async () => (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find(t => t.type === 'page' && t.url.startsWith('file:')), 'renderer page');
const rendererRaw = async () => {
  const t = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find(x => x.type === 'page' && x.url.startsWith('file:'));
  return cdp(t.webSocketDebuggerUrl);
};
const renderer = {
  evaluate: async expression => {
    const t = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find(x => x.type === 'page' && x.url.startsWith('file:'));
    return cdp(t.webSocketDebuggerUrl).evaluate(expression);
  }
};
await waitFor(() => renderer.evaluate('typeof window.electronAPI?.setMcpToolEnabled === "function"'), 'electronAPI');
// The renderer's settings are the source of truth for the server (see
// src/utils/mcpServerSync.ts), so do what the user does in Settings: turn the
// MCP server on. The renderer then starts it.
// A fresh profile shows first-run onboarding; the user skips it, then starts
// the MCP server (Settings → MCP Server).
await sleep(3000);
await renderer.evaluate(`(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Skip Setup'))?.click(); return true; })()`);
await sleep(1500);
// Settings → MCP Server → Start, exactly as the user does it.
const raw = await rendererRaw();
const clickButton = text => renderer.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return Boolean(b); })()`);
await renderer.evaluate(`document.querySelector('input[placeholder^="Search with Google"]').focus()`);
await raw.send('Input.insertText', { text: 'king://settings' });
await waitFor(() => clickButton('Go to:'), 'address-bar suggestion');
await waitFor(() => clickButton('MCP Server'), 'MCP Server settings section');
await waitFor(() => clickButton('Start'), 'MCP Start button');
console.log('[PASS] App launched, MCP server started');

const health = await waitFor(() => fetch(`http://127.0.0.1:${MCP_PORT}/health`, { headers: { authorization: `Bearer ${TOKEN}` } }).then(r => r.json()), 'MCP health');
assert.equal(health.status, 'ok');
const unauth = await fetch(`http://127.0.0.1:${MCP_PORT}/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(unauth.status, 401, 'calls without the token are rejected');
console.log('[PASS] Authenticated health ok, unauthenticated call rejected');

// Tools are off by default (human opt-in); the user would flip these in Settings.
for (const tool of ['browser_navigate', 'browser_click']) {
  await renderer.evaluate(`window.electronAPI.setMcpToolEnabled('${tool}', true)`);
}

// The human opens the test site in the address bar. (An agent cannot: its
// navigation guard refuses loopback and private addresses, which is itself
// the right behaviour for a browser an agent drives.)
const blocked = await call('browser_navigate', { url: `http://127.0.0.1:${PAGE_PORT}/` });
assert.match(JSON.stringify(blocked.body), /not a public address/, 'agent cannot navigate to loopback');
console.log('[PASS] Agent navigation to a loopback address is blocked');

// The activity log is reachable through the real IPC surface.
const log = JSON.parse(await renderer.evaluate('window.electronAPI.exportEngineLog("json")'));
assert.equal(typeof log.count, 'number');
console.log('[PASS] Activity log exports through the real IPC');

// Not covered yet: a click on a real page and the approval/rejection of a
// sensitive one. The agent's content-access guard also refuses loopback pages
// (correctly), so that scenario needs a public test page or an injectable
// resolver. See plan.md.

console.log('[PASS] Agent E2E suite complete');
await cleanup(0);
