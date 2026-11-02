/**
 * Agent actions that need the Chrome DevTools Protocol, moved out of main.ts
 * (plan.md, WP9): page dialogs, file upload, drag and the accessibility
 * snapshot. Each handler validates the sender first, requires a public http(s)
 * page where it touches page content, and does its own argument validation; the
 * renderer is untrusted. The decisions live in dependency-free modules
 * (pageDialogs, uploadPolicy, dragPlan, axSnapshot, agentNavigationGuard); this
 * file only performs the debugger commands, so it imports Electron.
 */

import { app, ipcMain, webContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { isAgentNavigationHostPublic } from './agentNavigationGuard';
import { PageDialogTracker, planDialogResponse } from './pageDialogs';
import { validateUploadPath } from './uploadPolicy';
import { parseDragPoint, dragPath } from './dragPlan';
import { selectInteractiveNodes, formatAxSnapshot } from './axSnapshot';
import { DEEP_QUERY_SOURCE } from '../../src/utils/deepQuery';

export interface AgentCdpDeps {
  isTrustedSender: (event: Electron.IpcMainInvokeEvent) => boolean;
  /** True while the MCP server runs; dialogs are only watched then. */
  isMcpRunning: () => boolean;
}

// Page dialogs (alert/confirm/prompt/beforeunload). Electron's own handler
// closes a guest's dialog at once (measured in tests/electron/agent_cdp.spec.ts),
// so the agent cannot answer in time; this only records what happened so
// browser_handle_dialog can tell the agent why a confirm returned false. Only
// guests created while the MCP server runs are watched (no debugger is
// attached for people who never use the agent).
const pageDialogs = new PageDialogTracker();

/** Called for every new webContents; attaches the dialog recorder to agent-capable guests. */
export function watchPageDialogs(wc: Electron.WebContents, isMcpRunning: () => boolean): void {
  if (wc.getType() !== 'webview' || !isMcpRunning()) return;
  try {
    if (wc.debugger.isAttached()) return;
    wc.debugger.attach('1.3');
    wc.debugger.on('message', (_e, method, params) => {
      if (method === 'Page.javascriptDialogOpening') pageDialogs.opened(wc.id, params);
      else if (method === 'Page.javascriptDialogClosed') pageDialogs.closed(wc.id, params?.result);
    });
    wc.once('destroyed', () => pageDialogs.forget(wc.id));
    void wc.debugger.sendCommand('Page.enable').catch(() => { /* page gone */ });
  } catch (err) {
    console.warn('[PageDialog] Could not watch dialogs:', err instanceof Error ? err.message : err);
  }
}

export function registerAgentCdpHandlers({ isTrustedSender }: AgentCdpDeps): void {
ipcMain.handle('agent-page-dialog', async (event, webContentsId: unknown, action: unknown, promptText: unknown) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return { ok: false, error: 'invalid tab' };
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return { ok: false, error: 'invalid tab' };
  if (action === 'status') return { ok: true, text: pageDialogs.describe(webContentsId) };
  const plan = planDialogResponse(pageDialogs.get(webContentsId), action, promptText);
  if (!plan.ok) return { ok: false, error: plan.error };
  try {
    await wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: plan.accept, ...(plan.promptText !== undefined ? { promptText: plan.promptText } : {}) });
    return { ok: true, text: plan.accept ? 'Dialog accepted.' : 'Dialog dismissed.' };
  } catch (err) {
    return { ok: false, error: 'The dialog could not be answered: the browser had already closed it. Use status to see how it ended.' };
  }
});

ipcMain.handle('agent-ax-snapshot', async (event, webContentsId: unknown) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return { ok: false, error: 'invalid tab' };
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return { ok: false, error: 'invalid tab' };
  const pageUrl = wc.getURL();
  if (!/^https?:/i.test(pageUrl)) return { ok: false, error: 'Snapshots are only available on public websites.' };
  const hostVerdict = await isAgentNavigationHostPublic(pageUrl);
  if (!hostVerdict.allowed) return { ok: false, error: `Snapshot blocked for security (${hostVerdict.reason}).` };
  let attachedHere = false;
  try {
    if (!wc.debugger.isAttached()) { wc.debugger.attach('1.3'); attachedHere = true; }
    await wc.debugger.sendCommand('Accessibility.enable');
    const tree: any = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
    const { entries, truncated } = selectInteractiveNodes(tree?.nodes);
    // Earlier refs belong to the previous snapshot: clear them everywhere, then stamp the new ones.
    await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: `(() => { ${DEEP_QUERY_SOURCE}\nfor (const root of __kingRoots()) root.querySelectorAll('[data-king-ref]').forEach(el => el.removeAttribute('data-king-ref')); })()`
    });
    const stamped = [];
    for (const entry of entries) {
      try {
        const resolved: any = await wc.debugger.sendCommand('DOM.resolveNode', { backendNodeId: entry.backendNodeId });
        const objectId = resolved?.object?.objectId;
        if (!objectId) continue;
        await wc.debugger.sendCommand('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `function () { if (this && this.setAttribute) this.setAttribute('data-king-ref', ${JSON.stringify(entry.ref)}); }`
        });
        stamped.push(entry);
      } catch (_) { /* node vanished between the tree and the stamp */ }
    }
    return { ok: true, text: formatAxSnapshot(pageUrl, wc.getTitle(), stamped, truncated) };
  } catch (err) {
    return { ok: false, error: 'The accessibility snapshot could not be taken.' };
  } finally {
    if (attachedHere) { try { wc.debugger.detach(); } catch (_) { /* already detached */ } }
  }
});

ipcMain.handle('agent-drag', async (event, webContentsId: unknown, fromRaw: unknown, toRaw: unknown) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return { ok: false, error: 'invalid tab' };
  const from = parseDragPoint(fromRaw);
  const to = parseDragPoint(toRaw);
  if (!from || !to) return { ok: false, error: 'Invalid drag coordinates.' };
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return { ok: false, error: 'invalid tab' };
  const pageUrl = wc.getURL();
  if (!/^https?:/i.test(pageUrl)) return { ok: false, error: 'Dragging is only available on public websites.' };
  const hostVerdict = await isAgentNavigationHostPublic(pageUrl);
  if (!hostVerdict.allowed) return { ok: false, error: `Drag blocked for security (${hostVerdict.reason}).` };
  let attachedHere = false;
  let dragData: unknown = null;
  const onMessage = (_e: unknown, method: string, params: any) => {
    if (method === 'Input.dragIntercepted') dragData = params?.data ?? null;
  };
  try {
    if (!wc.debugger.isAttached()) { wc.debugger.attach('1.3'); attachedHere = true; }
    wc.debugger.on('message', onMessage);
    // Intercepting lets an HTML5 drag be replayed as drag events instead of
    // starting the operating system's drag loop.
    await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
    // A release names the button that was released while `buttons` is already 0.
    const mouse = (type: string, p: { x: number; y: number }, buttons: number, extra: Record<string, unknown> = {}) =>
      wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: buttons || type === 'mouseReleased' ? 'left' : 'none', buttons, ...extra });
    await mouse('mouseMoved', from, 0);
    await mouse('mousePressed', from, 1, { clickCount: 1 });
    for (const p of dragPath(from, to)) {
      await mouse('mouseMoved', p, 1);
      await new Promise(r => setTimeout(r, 16));
    }
    if (dragData) {
      for (const type of ['dragEnter', 'dragOver', 'drop']) {
        await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x: to.x, y: to.y, data: dragData });
      }
    }
    await mouse('mouseReleased', to, 0, { clickCount: 1 });
    return { ok: true, text: dragData ? 'Dragged and dropped the element.' : 'Dragged the element with the mouse.' };
  } catch (err) {
    return { ok: false, error: 'The drag could not be performed.' };
  } finally {
    try { wc.debugger.removeListener('message', onMessage); } catch (_) { /* gone */ }
    try { if (!wc.isDestroyed()) await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: false }); } catch (_) { /* detached */ }
    if (attachedHere) { try { wc.debugger.detach(); } catch (_) { /* already detached */ } }
  }
});

ipcMain.handle('agent-upload-file', async (event, webContentsId: unknown, selector: unknown, filePath: unknown) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return { ok: false, error: 'invalid tab' };
  if (typeof selector !== 'string' || !selector || selector.length > 500) return { ok: false, error: "Missing or invalid 'selector' parameter" };
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return { ok: false, error: 'invalid tab' };
  const pageUrl = wc.getURL();
  if (!/^https?:/i.test(pageUrl)) return { ok: false, error: 'File upload is only available on public websites.' };
  const hostVerdict = await isAgentNavigationHostPublic(pageUrl);
  if (!hostVerdict.allowed) return { ok: false, error: `File upload blocked for security (${hostVerdict.reason}).` };
  // Canonicalize and check the path here, in the privileged process, whatever the renderer sent.
  const verdict = validateUploadPath(filePath, {
    fs: { realpath: (p) => fs.realpathSync.native(p), stat: (p) => fs.statSync(p) },
    platform: process.platform,
    userDataDir: app.getPath('userData'),
    homeDir: app.getPath('home')
  });
  if (!verdict.ok) return { ok: false, error: verdict.error };
  let attachedHere = false;
  try {
    if (!wc.debugger.isAttached()) { wc.debugger.attach('1.3'); attachedHere = true; }
    const found: any = await wc.debugger.sendCommand('Runtime.evaluate', {
      expression: `(() => { ${DEEP_QUERY_SOURCE}\nvar el = __kingQuery(${JSON.stringify(selector)}); return el && el.tagName === 'INPUT' && el.type === 'file' && !el.disabled ? el : null; })()`
    });
    const objectId = found?.result?.objectId;
    if (found?.exceptionDetails || !objectId) return { ok: false, error: 'No enabled file input matches that target.' };
    await wc.debugger.sendCommand('DOM.setFileInputFiles', { files: [verdict.path], objectId });
    return { ok: true, text: `Attached ${path.basename(verdict.path)} to the file input.` };
  } catch (err) {
    return { ok: false, error: 'The file could not be attached.' };
  } finally {
    if (attachedHere) { try { wc.debugger.detach(); } catch (_) { /* already detached */ } }
  }
});
}
