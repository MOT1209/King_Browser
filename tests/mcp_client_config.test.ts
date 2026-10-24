import assert from 'node:assert/strict';
import { buildMcpClientConfig } from '../electron/main/mcpClientConfig';

console.log('\n--- MCP Client Config Test Suite ---');

{
  const open = JSON.parse(buildMcpClientConfig('opencode', 3020, 'tok_123'));
  const server = open.mcp['king-browser'];
  assert.equal(open.$schema, 'https://opencode.ai/config.json');
  assert.equal(server.type, 'remote');
  assert.equal(server.url, 'http://localhost:3020/sse');
  assert.equal(server.enabled, true);
  assert.equal(server.headers.Authorization, 'Bearer tok_123');
  assert.equal(server.command, undefined, 'no local command / absolute path is needed');
  const generic = JSON.parse(buildMcpClientConfig('generic', 4000, 'abc'));
  assert.equal(generic.mcpServers['king-browser'].url, 'http://localhost:4000/sse');
  assert.equal(generic.mcpServers['king-browser'].headers.Authorization, 'Bearer abc');
  const tricky = JSON.parse(buildMcpClientConfig('opencode', 1, 'a"b\\c'));
  assert.equal(tricky.mcp['king-browser'].headers.Authorization, 'Bearer a"b\\c', 'values are JSON-escaped');
  console.log('[PASS] MCP client config — OpenCode (remote) and generic configs are valid JSON with the live port and token');
}
