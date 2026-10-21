import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import { MCP_ACTION_TIMEOUT_MS, MCP_APPROVAL_WINDOW_MS } from '../src/utils/mcpActionTiming';

for (const file of ['mcp-bridge.ts', 'mcp-bridge.mjs']) {
  const source = fs.readFileSync(file, 'utf8');
  // The bridge must wait at least as long as an approved action may take,
  // otherwise the SDK's 60s default cuts the approval window short.
  const timeoutMatch = /const TOOL_CALL_TIMEOUT_MS = ([\d_]+);/.exec(source);
  assert.ok(timeoutMatch, `${file} must define TOOL_CALL_TIMEOUT_MS`);
  assert.ok(Number(timeoutMatch![1].replace(/_/g, '')) > MCP_APPROVAL_WINDOW_MS + MCP_ACTION_TIMEOUT_MS,
    `${file} tool-call timeout must exceed the approval + execution windows`);
  assert.match(source, /client\.callTool\(request\.params, (undefined|void 0), \{ timeout: TOOL_CALL_TIMEOUT_MS \}\)/,
    `${file} must pass TOOL_CALL_TIMEOUT_MS to callTool`);
  const start = source.indexOf('function getUserDataPath');
  const end = source.indexOf('async function main', start);
  function config(token?: string) {
    const readFiles: string[] = [];
    const code = ts.transpileModule(source.slice(start, end) + '\nresolveMcpConfig();', {
      compilerOptions: { target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const result = vm.runInNewContext(code, {
      os, path, process: { platform: 'darwin', env: { MCP_TOKEN: token } },
      fs: { existsSync: () => true, readFileSync: (name: string) => { readFiles.push(name); return name.endsWith('king-mcp-port') ? '3020' : 'NMCP encrypted ciphertext'; } }
    });
    assert.ok(readFiles.every(name => !name.endsWith('king-mcp-token')), 'standalone Node must never read an encrypted token as plaintext');
    return result;
  }
  assert.throws(() => config(), /MCP_TOKEN/, `${file} must explain the missing explicit token before connecting`);
  assert.equal(config('12345678-1234-1234-1234-123456789abc').token, '12345678-1234-1234-1234-123456789abc');
  assert.throws(() => config('malicious\r\nheader'), /MCP_TOKEN/, 'invalid header characters must be rejected');
}
console.log('[PASS] Standalone MCP bridge credential configuration');
