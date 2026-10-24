/**
 * Ready-to-paste MCP client configurations (plan.md, Phase 3: one-step OpenCode setup).
 *
 * Both configs point the client straight at the running King Browser server, so
 * nothing has to be installed and no absolute path to mcp-bridge.mjs is needed.
 *
 * Dependency-free (no Electron imports).
 */

export type McpClientKind = 'generic' | 'opencode';

export function buildMcpClientConfig(kind: McpClientKind, port: number, token: string): string {
  const url = `http://localhost:${port}/sse`;
  const headers = { Authorization: `Bearer ${token}` };
  if (kind === 'opencode') {
    return JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        mcp: { 'king-browser': { type: 'remote', url, enabled: true, headers } }
      },
      null,
      2
    );
  }
  return JSON.stringify({ mcpServers: { 'king-browser': { url, headers } } }, null, 2);
}
