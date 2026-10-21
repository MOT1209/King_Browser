/**
 * Timing shared by the main process and the renderer for MCP browser actions.
 *
 * An action has two windows:
 *  - execution: how long a running action may take (hang detection).
 *  - approval: how long the renderer may wait for the user to approve a
 *    sensitive action before it is cancelled.
 *
 * Both sides must agree on these numbers. The renderer reports the phase over
 * IPC and the main process re-arms its timers with these constants, so a
 * client can never choose its own deadline.
 */
export const MCP_ACTION_TIMEOUT_MS = 15_000;
export const MCP_APPROVAL_WINDOW_MS = 120_000;

export type McpActionPhase = 'awaiting-approval' | 'executing';

export function isMcpActionPhase(value: unknown): value is McpActionPhase {
  return value === 'awaiting-approval' || value === 'executing';
}

/** Window the main process allows for a phase reported by the renderer. */
export function windowForMcpActionPhase(phase: McpActionPhase): number {
  return phase === 'awaiting-approval' ? MCP_APPROVAL_WINDOW_MS : MCP_ACTION_TIMEOUT_MS;
}

/**
 * Internal renderer action (not an MCP tool) that returns the active tab URL
 * and a short description of the element an action targets, for the
 * main-process approval policy. The MCP server only accepts registered tool
 * names from clients, so agents cannot call it.
 */
export const MCP_POLICY_CONTEXT_ACTION = '__king_policy_context';
