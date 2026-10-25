/**
 * Ready-to-paste MCP client configurations (plan.md, Phase 3: one-step OpenCode setup).
 *
 * King Browser serves MCP over legacy SSE, while OpenCode's `remote` transport
 * speaks Streamable HTTP: a `type: "remote"` entry always fails with
 * `Cannot POST /sse (HTTP 404)`. Every client therefore goes through the stdio
 * bridge, which translates stdio to the SSE endpoint. The bridge is bundled to
 * dist-electron/mcp-bridge.cjs and shipped with the app, so the generated
 * config needs no repository checkout.
 *
 * Dependency-free (no Electron imports) so the config can be unit-tested.
 */

export type McpClientKind = 'generic' | 'opencode';

// A sensitive tool waits for the user's approval (120 s) and then executes
// (15 s), so the client must not time out before the bridge's own 180 s budget.
export const MCP_CLIENT_TIMEOUT_MS = 180000;

export function buildMcpClientConfig(
  kind: McpClientKind,
  port: number,
  token: string,
  bridgePath: string
): string {
  const environment = { MCP_TOKEN: token, MCP_PORT: String(port) };

  if (kind === 'opencode') {
    return JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        mcp: {
          'king-browser': {
            type: 'local',
            command: ['node', bridgePath],
            enabled: true,
            timeout: MCP_CLIENT_TIMEOUT_MS,
            environment
          }
        }
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      mcpServers: {
        'king-browser': {
          command: 'node',
          args: [bridgePath],
          env: environment
        }
      }
    },
    null,
    2
  );
}
