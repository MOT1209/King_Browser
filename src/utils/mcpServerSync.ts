/**
 * Keeps the MCP server in line with the user's `mcpServerEnabled` setting.
 *
 * The renderer's settings are the source of truth. The main process auto-starts
 * the server at launch from a disk mirror of those settings, and the two can
 * disagree (for example after the mirror was edited or a write was lost). Then
 * the server either runs while the renderer rejects every action, or stays off
 * although the user enabled it. Reconciling on load and on change fixes both.
 */
export type McpServerSyncAction = 'start' | 'stop' | null;

export function decideMcpServerSync(enabled: boolean, running: boolean): McpServerSyncAction {
  if (enabled && !running) return 'start';
  if (!enabled && running) return 'stop';
  return null;
}

export interface McpServerControls {
  getMcpStatus?: () => Promise<{ running?: boolean } | null | undefined>;
  startMcpServer?: () => Promise<boolean>;
  stopMcpServer?: () => Promise<boolean>;
}

/** Applies decideMcpServerSync through the Electron API; returns what it did. */
export async function syncMcpServerWithSetting(
  enabled: boolean,
  api: McpServerControls | undefined
): Promise<McpServerSyncAction> {
  if (!api?.getMcpStatus) return null;
  let running = false;
  try {
    running = Boolean((await api.getMcpStatus())?.running);
  } catch {
    return null;
  }
  const action = decideMcpServerSync(enabled, running);
  try {
    if (action === 'start') await api.startMcpServer?.();
    if (action === 'stop') await api.stopMcpServer?.();
  } catch {
    return null;
  }
  return action;
}
