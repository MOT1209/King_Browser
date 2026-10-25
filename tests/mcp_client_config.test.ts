import assert from 'node:assert/strict';
import { buildMcpClientConfig, MCP_CLIENT_TIMEOUT_MS } from '../electron/main/mcpClientConfig';

console.log('\n--- MCP Client Config Test Suite ---');

{
  const bridge = 'C:\\Program Files\\King Browser\\resources\\mcp-bridge.cjs';

  // OpenCode: local stdio through the bundled bridge (the verified baseline).
  // A `remote` entry would have to point at /mcp, so the generator keeps the bridge.
  const open = JSON.parse(buildMcpClientConfig('opencode', 3020, 'tok_123', bridge));
  const server = open.mcp['king-browser'];
  assert.equal(open.$schema, 'https://opencode.ai/config.json');
  assert.equal(server.type, 'local');
  assert.deepEqual(server.command, ['node', bridge]);
  assert.equal(server.enabled, true);
  assert.equal(server.timeout, MCP_CLIENT_TIMEOUT_MS);
  assert.equal(server.timeout, 180000);
  assert.equal(server.environment.MCP_TOKEN, 'tok_123');
  assert.equal(server.environment.MCP_PORT, '3020');
  assert.equal(server.url, undefined, 'the generator keeps the stdio bridge as the verified default');
  assert.equal(server.headers, undefined);

  // Generic (Claude Desktop style): the same bridge in stdio command form.
  const generic = JSON.parse(buildMcpClientConfig('generic', 4000, 'abc', bridge));
  const genericServer = generic.mcpServers['king-browser'];
  assert.equal(genericServer.command, 'node');
  assert.deepEqual(genericServer.args, [bridge]);
  assert.equal(genericServer.env.MCP_TOKEN, 'abc');
  assert.equal(genericServer.env.MCP_PORT, '4000');
  assert.equal(genericServer.url, undefined);

  // Quotes and backslashes in the token must survive JSON serialisation.
  const trickyToken = 'a"b\\c';
  const tricky = JSON.parse(buildMcpClientConfig('opencode', 1, trickyToken, bridge));
  assert.equal(tricky.mcp['king-browser'].environment.MCP_TOKEN, trickyToken, 'values are JSON-escaped');
  assert.equal(tricky.mcp['king-browser'].environment.MCP_PORT, '1');

  console.log('[PASS] MCP client config — local stdio configs carry the bridge path, live port and token');
}
