/**
 * §10 Engine control IPC — the bridge between the renderer control panel and
 * the §11 ExecutionEngine.
 *
 * Kept dependency-free at runtime (type-only import) and host-injected so tests
 * can drive it with a fake `handle` + a real engine instance. Commands are
 * allowlisted here — the renderer can never reach arbitrary engine internals
 * through this surface.
 */

import type { ExecutionEngine } from './executionEngine.js';

export interface EngineIpcHost {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
  getEngine: () => ExecutionEngine | null;
  /**
   * Sender validation, supplied by the composition root. These channels can
   * resume or auto-run the agent, so a renderer that is not the privileged main
   * window must never reach them. Optional only so tests can omit it.
   */
  isTrustedSender?: (event: unknown) => boolean;
}

export const ENGINE_IPC_CHANNELS = [
  'mcp-engine-status',
  'mcp-engine-history',
  'mcp-engine-command',
  'mcp-engine-approval'
] as const;

export type EngineCommand =
  | 'auto_run'
  | 'next_step'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'emergency_close'
  | 'cancel_phase';

const ENGINE_COMMANDS: readonly EngineCommand[] = [
  'auto_run',
  'next_step',
  'pause',
  'resume',
  'stop',
  'emergency_close',
  'cancel_phase'
];

const MAX_REASON_LENGTH = 500;
const MAX_ACTION_ID_LENGTH = 200;

function sanitizeReason(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_REASON_LENGTH);
}

export function registerEngineIpc(host: EngineIpcHost): void {
  const requireEngine = (): ExecutionEngine => {
    const engine = host.getEngine();
    if (!engine) throw new Error('Execution engine is unavailable.');
    return engine;
  };

  // Fail closed when a sender check was supplied: the engine can be driven only
  // by the trusted main window, matching every other IPC surface in main.ts.
  const assertTrusted = (event: unknown): void => {
    if (host.isTrustedSender && !host.isTrustedSender(event)) {
      throw new Error('Unauthorized sender');
    }
  };

  host.handle('mcp-engine-status', (event) => {
    assertTrusted(event);
    return requireEngine().getStatusSnapshot();
  });
  host.handle('mcp-engine-history', (event) => {
    assertTrusted(event);
    return requireEngine().getHistory();
  });

  host.handle('mcp-engine-command', (event, command, payload) => {
    assertTrusted(event);
    if (typeof command !== 'string' || !ENGINE_COMMANDS.includes(command as EngineCommand)) {
      throw new Error(`Unknown engine command: ${String(command)}`);
    }
    const engine = requireEngine();
    const cmd = command as EngineCommand;
    const reason = sanitizeReason(payload, `Stopped from control panel (${cmd})`);

    let detail: Record<string, unknown> = {};
    switch (cmd) {
      case 'auto_run':
        engine.setAutoRun();
        break;
      case 'next_step':
        engine.nextStep();
        break;
      case 'pause':
        engine.pause();
        break;
      case 'resume':
        engine.resume();
        break;
      case 'stop':
        detail = { ...engine.stop(reason) };
        break;
      case 'emergency_close':
        detail = { ...engine.emergencyClose(reason) };
        break;
      case 'cancel_phase':
        engine.cancelPhase();
        break;
    }

    return {
      ok: true,
      command: cmd,
      detail,
      state: engine.getState(),
      mode: engine.getMode()
    };
  });

  host.handle('mcp-engine-approval', (event, actionId, approved) => {
    assertTrusted(event);
    if (typeof actionId !== 'string' || !actionId || actionId.length > MAX_ACTION_ID_LENGTH) {
      throw new Error('Invalid approval action id.');
    }
    if (typeof approved !== 'boolean') {
      throw new Error('Invalid approval decision.');
    }
    return { ok: true, resolved: requireEngine().respondToApproval(actionId, approved) };
  });
}
