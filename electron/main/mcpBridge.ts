import { BrowserWindow, ipcMain } from 'electron';
import { randomBytes } from 'crypto';
import {
  MCP_ACTION_TIMEOUT_MS,
  MCP_POLICY_CONTEXT_ACTION,
  isMcpActionPhase,
  windowForMcpActionPhase,
  type McpActionPhase
} from '../../src/utils/mcpActionTiming.js';

// Security: MCP browser_* tools are forwarded to the renderer over an
// 'mcp-action-request' IPC and awaited on a channel gated by isTrustedSender()
// below — never executed as injected JS in the privileged UI context.
//
// Lives in its own module (instead of main.ts) so electron/mcpServer.ts can
// import requestRendererMcpAction without importing the whole composition root.

type TrustedSenderCheck = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => boolean;

interface PendingMcpAction {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  win: BrowserWindow;
  toolName: string;
  onClosed?: () => void;
  /** Restarts the response timeout with `ms`; set by requestRendererMcpAction. */
  rearm?: (ms: number, phase: McpActionPhase) => void;
}

const pendingMcpActions = new Map<string, PendingMcpAction>();

type McpActionPhaseListener = (phase: McpActionPhase, windowMs: number) => void;
let phaseListener: McpActionPhaseListener | null = null;

/**
 * Lets the MCP server follow the renderer's phase changes so its execution
 * engine re-arms the in-flight timeout together with the bridge timer.
 */
export function setMcpActionPhaseListener(listener: McpActionPhaseListener | null): void {
  phaseListener = listener;
}

/** Revoke pending approvals on timeout, server shutdown, or policy changes. */
export function cancelPendingMcpActions(reason: string, toolName?: string): void {
  for (const [id, pending] of pendingMcpActions) {
    if (toolName && pending.toolName !== toolName) continue;
    pendingMcpActions.delete(id);
    clearTimeout(pending.timer);
    if (pending.onClosed) {
      try { pending.win.removeListener('closed', pending.onClosed); } catch (_) {}
    }
    try { pending.win.webContents.send('mcp-action-cancel', id); } catch (_) {}
    pending.reject(new Error(reason));
  }
}

let isTrustedSender: TrustedSenderCheck = () => false;

/**
 * Registers the 'mcp-action-response' IPC listener. Called once by main.ts
 * (the composition root) with its trusted-sender validator.
 */
export function initMcpBridge(trustedSenderCheck: TrustedSenderCheck): void {
  isTrustedSender = trustedSenderCheck;
  ipcMain.on('mcp-action-response', (event: Electron.IpcMainEvent, payload: { id?: unknown; result?: unknown; error?: unknown }) => {
    if (!isTrustedSender(event)) return;
    const id = payload?.id;
    if (typeof id !== 'string') return;
    const pending = pendingMcpActions.get(id);
    if (!pending) return;
    pendingMcpActions.delete(id);
    clearTimeout(pending.timer);
    if (pending.onClosed) {
      try { pending.win.removeListener('closed', pending.onClosed); } catch (_) {}
    }

    if (payload?.error) {
      pending.reject(new Error(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error)));
      return;
    }
    if (payload?.result && typeof payload.result === 'object' && 'error' in (payload.result as Record<string, unknown>)) {
      const errVal = (payload.result as Record<string, unknown>).error;
      pending.reject(new Error(typeof errVal === 'string' ? errVal : JSON.stringify(errVal)));
      return;
    }
    pending.resolve(payload.result);
  });

  // The renderer reports when an action waits for the user's approval and when
  // it starts executing. Only the window length comes from fixed constants;
  // the renderer cannot choose a deadline.
  ipcMain.on('mcp-action-phase', (event: Electron.IpcMainEvent, payload: { id?: unknown; phase?: unknown }) => {
    if (!isTrustedSender(event)) return;
    const id = payload?.id;
    const phase = payload?.phase;
    if (typeof id !== 'string' || !isMcpActionPhase(phase)) return;
    const pending = pendingMcpActions.get(id);
    if (!pending?.rearm) return;
    const windowMs = windowForMcpActionPhase(phase);
    pending.rearm(windowMs, phase);
    try { phaseListener?.(phase, windowMs); } catch (_) {}
  });
}

/**
 * Asks the trusted main window renderer to execute an MCP browser_* tool and
 * waits for its response. Rejects when the current phase's window runs out
 * (MCP_ACTION_TIMEOUT_MS, or MCP_APPROVAL_WINDOW_MS while the user is asked to
 * approve) or if the window is gone.
 */
export function requestRendererMcpAction(win: BrowserWindow | null, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) {
      reject(new Error('King Browser window is not available'));
      return;
    }
    const id = Date.now().toString(36) + '_' + randomBytes(8).toString('hex');
    const deadline = Date.now() + MCP_ACTION_TIMEOUT_MS;
    let phase: McpActionPhase = 'executing';
    const onTimeout = () => {
      const p = pendingMcpActions.get(id);
      if (p) {
        pendingMcpActions.delete(id);
        if (p.onClosed) {
          try { win.removeListener('closed', p.onClosed); } catch (_) {}
        }
      }
      try { win.webContents.send('mcp-action-cancel', id); } catch (_) {}
      reject(new Error(phase === 'awaiting-approval'
        ? `MCP action '${toolName}' was not approved in King Browser in time`
        : `MCP action '${toolName}' timed out waiting for renderer response`));
    };
    const timer = setTimeout(onTimeout, MCP_ACTION_TIMEOUT_MS);
    timer.unref?.();

    const rearm = (ms: number, nextPhase: McpActionPhase) => {
      const p = pendingMcpActions.get(id);
      if (!p) return;
      phase = nextPhase;
      clearTimeout(p.timer);
      p.timer = setTimeout(onTimeout, ms);
      p.timer.unref?.();
    };

    const onClosed = () => {
      const p = pendingMcpActions.get(id);
      pendingMcpActions.delete(id);
      clearTimeout(p ? p.timer : timer);
      reject(new Error('King Browser window was closed'));
    };
    try {
      win.once('closed', onClosed);
    } catch (_) {}

    pendingMcpActions.set(id, { resolve, reject, timer, win, toolName, onClosed, rearm });
    try {
      win.webContents.send('mcp-action-request', id, toolName, args, deadline);
    } catch (err) {
      clearTimeout(pendingMcpActions.get(id)?.timer ?? timer);
      try { win.removeListener('closed', onClosed); } catch (_) {}
      pendingMcpActions.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export interface PolicyPageContext {
  url: string;
  /** Present when a selector was given and the element could be described. */
  elementText?: string;
}

const MAX_POLICY_ELEMENT_TEXT = 300;

/**
 * Asks the renderer for the active tab URL and, when `selector` is given, a
 * short description of that element. Resolves to null when the context cannot
 * be read (no window, no tab, guarded page, invalid selector or reply), so the
 * caller can fail closed.
 */
export async function requestPolicyContext(win: BrowserWindow | null, selector?: string): Promise<PolicyPageContext | null> {
  try {
    const reply = await requestRendererMcpAction(win, MCP_POLICY_CONTEXT_ACTION, selector ? { selector } : {});
    if (!reply || typeof reply !== 'object') return null;
    const { url, elementText } = reply as { url?: unknown; elementText?: unknown };
    if (typeof url !== 'string' || !url) return null;
    if (!selector) return { url };
    if (typeof elementText !== 'string') return null;
    return { url, elementText: elementText.slice(0, MAX_POLICY_ELEMENT_TEXT) };
  } catch (_) {
    return null;
  }
}
