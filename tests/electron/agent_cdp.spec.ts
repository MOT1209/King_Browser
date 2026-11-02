/**
 * The CDP command sequences behind browser_handle_dialog, browser_upload_file,
 * browser_drag and the accessibility snapshot, run against a real guest
 * webview. The IPC handlers refuse loopback pages on purpose (agent navigation
 * policy), so this drives the same debugger commands from the main process:
 * it proves the Electron/Chromium mechanics the handlers rely on, not the
 * handlers' own validation (that is covered by the Node suites).
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { closeKing, launchKing, navigateActiveTab, skipOnboarding, type KingLaunch } from './kingApp';
import { selectInteractiveNodes } from '../../electron/main/axSnapshot';

const PAGE = `<!doctype html><html lang="en"><title>CDP fixture</title><body>
<button id="save">Save</button>
<input type="file" id="file" aria-label="Upload">
<div id="host"></div>
<div id="card" draggable="true" style="width:80px;height:40px;background:#9cf;position:absolute;left:20px;top:200px">card</div>
<div id="zone" style="width:120px;height:80px;background:#fc9;position:absolute;left:300px;top:200px">zone</div>
<div id="pad" style="width:120px;height:60px;background:#cfc;position:absolute;left:20px;top:320px">pad</div>
<script>
  window.__drop = null; window.__pad = [];
  const zone = document.getElementById('zone');
  zone.addEventListener('dragover', e => e.preventDefault());
  zone.addEventListener('drop', e => { e.preventDefault(); window.__drop = e.dataTransfer.getData('text/plain') || 'dropped'; });
  document.getElementById('card').addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', 'card-1'));
  const pad = document.getElementById('pad');
  pad.addEventListener('pointerdown', () => window.__pad.push('down'));
  window.addEventListener('pointermove', e => { if (e.buttons) window.__pad.push('move'); });
  window.addEventListener('pointerup', () => window.__pad.push('up'));
  document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<button id="inner">Inside shadow</button>';
</script></body></html>`;

let king: KingLaunch;
let server: http.Server;
let url: string;
let tmpFile: string;

test.beforeEach(async () => {
  server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cdp`;
  tmpFile = path.join(os.tmpdir(), `king-upload-${process.pid}.txt`);
  fs.writeFileSync(tmpFile, 'hello');
  king = await launchKing();
  await skipOnboarding(king.window);
  await navigateActiveTab(king.window, url);
  await expect.poll(() => king.app.evaluate(({ webContents }, u) =>
    webContents.getAllWebContents().some((c) => c.getURL() === u && !c.isLoading()), url)).toBe(true);
});

test.afterEach(async () => {
  await closeKing(king);
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(tmpFile, { force: true });
});

test('accessibility tree lists page and shadow-root controls and refs can be stamped', async () => {
  const result = await king.app.evaluate(async ({ webContents }, u) => {
    const wc = webContents.getAllWebContents().find((c) => c.getURL() === u)!;
    wc.debugger.attach('1.3');
    try {
      await wc.debugger.sendCommand('Accessibility.enable');
      const tree: any = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
      return tree.nodes;
    } finally { wc.debugger.detach(); }
  }, url);
  const { entries } = selectInteractiveNodes(result);
  const names = entries.map((e) => e.name);
  expect(names).toContain('Save');
  expect(names).toContain('Inside shadow');

  const stamped = await king.app.evaluate(async ({ webContents }, { u, backendNodeId }) => {
    const wc = webContents.getAllWebContents().find((c) => c.getURL() === u)!;
    wc.debugger.attach('1.3');
    try {
      const resolved: any = await wc.debugger.sendCommand('DOM.resolveNode', { backendNodeId });
      await wc.debugger.sendCommand('Runtime.callFunctionOn', {
        objectId: resolved.object.objectId,
        functionDeclaration: "function () { this.setAttribute('data-king-ref', 'e1'); }",
      });
      return wc.executeJavaScript("document.getElementById('host').shadowRoot.querySelector('[data-king-ref=e1]')?.id ?? null");
    } finally { wc.debugger.detach(); }
  }, { u: url, backendNodeId: entries.find((e) => e.name === 'Inside shadow')!.backendNodeId });
  expect(stamped).toBe('inner');
});

test('a guest dialog is reported over CDP but the browser closes it first', async () => {
  // Measured behaviour that shaped browser_handle_dialog: hasBrowserHandler is
  // true, Page.javascriptDialogClosed follows at once with result false, and
  // Page.handleJavaScriptDialog then fails. If a future Electron holds the
  // dialog open, this test fails and the tool can offer real answers again.
  const outcome = await king.app.evaluate(async ({ webContents }, u) => {
    const wc = webContents.getAllWebContents().find((c) => c.getURL() === u)!;
    wc.debugger.attach('1.3');
    try {
      let opening: any = null;
      let closed: any = null;
      wc.debugger.on('message', (_e, method, params) => {
        if (method === 'Page.javascriptDialogOpening') opening = params;
        if (method === 'Page.javascriptDialogClosed') closed = params;
      });
      await wc.debugger.sendCommand('Page.enable');
      void wc.executeJavaScript("setTimeout(() => { window.__answer = confirm('Delete everything?'); }, 0)");
      for (let i = 0; i < 100 && !closed; i++) await new Promise((r) => setTimeout(r, 50));
      let handleError = '';
      try { await wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }); } catch (e: any) { handleError = String(e?.message); }
      return { opening, closed, handleError, answer: await wc.executeJavaScript('window.__answer') };
    } finally { wc.debugger.detach(); }
  }, url);
  expect(outcome.opening).toMatchObject({ type: 'confirm', message: 'Delete everything?', hasBrowserHandler: true });
  expect(outcome.closed).toMatchObject({ result: false });
  expect(outcome.handleError).toMatch(/No dialog is showing/);
  expect(outcome.answer).toBe(false);
});

test('DOM.setFileInputFiles attaches a file chosen by path', async () => {
  const name = await king.app.evaluate(async ({ webContents }, { u, file }) => {
    const wc = webContents.getAllWebContents().find((c) => c.getURL() === u)!;
    wc.debugger.attach('1.3');
    try {
      const found: any = await wc.debugger.sendCommand('Runtime.evaluate', { expression: "document.getElementById('file')" });
      await wc.debugger.sendCommand('DOM.setFileInputFiles', { files: [file], objectId: found.result.objectId });
      return wc.executeJavaScript("document.getElementById('file').files[0]?.name ?? null");
    } finally { wc.debugger.detach(); }
  }, { u: url, file: tmpFile });
  expect(name).toBe(path.basename(tmpFile));
});

async function dragBetween(king: KingLaunch, url: string, fromSel: string, toSel: string) {
  return king.app.evaluate(async ({ webContents }, { u, fromSel, toSel }) => {
    const wc = webContents.getAllWebContents().find((c) => c.getURL() === u)!;
    const center = (sel: string) => wc.executeJavaScript(
      `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const from: any = await center(fromSel);
    const to: any = await center(toSel);
    wc.debugger.attach('1.3');
    let dragData: any = null;
    wc.debugger.on('message', (_e, method, params) => { if (method === 'Input.dragIntercepted') dragData = params?.data ?? null; });
    try {
      await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
      const mouse = (type: string, p: any, buttons: number, extra: any = {}) =>
        wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: buttons || type === 'mouseReleased' ? 'left' : 'none', buttons, ...extra });
      await mouse('mouseMoved', from, 0);
      await mouse('mousePressed', from, 1, { clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await mouse('mouseMoved', { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }, 1);
        await new Promise((r) => setTimeout(r, 16));
      }
      if (dragData) for (const type of ['dragEnter', 'dragOver', 'drop']) await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x: to.x, y: to.y, data: dragData });
      await mouse('mouseReleased', to, 0, { clickCount: 1 });
      await new Promise((r) => setTimeout(r, 200));
      return { intercepted: dragData !== null, drop: await wc.executeJavaScript('window.__drop'), pad: await wc.executeJavaScript('window.__pad') };
    } finally {
      try { await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: false }); } catch { /* detached */ }
      wc.debugger.detach();
    }
  }, { u: url, fromSel, toSel });
}

test('an HTML5 drag is replayed as drag events and drops', async () => {
  const out = await dragBetween(king, url, '#card', '#zone');
  expect(out.intercepted).toBe(true);
  expect(out.drop).toBe('card-1');
});

test('a plain pointer drag reports down, move and up', async () => {
  const out = await dragBetween(king, url, '#pad', '#zone');
  expect(out.intercepted).toBe(false);
  expect(out.pad[0]).toBe('down');
  expect(out.pad).toContain('move');
  expect(out.pad[out.pad.length - 1]).toBe('up');
});
