#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

import os from 'os';
import path from 'path';
import fs from 'fs';

function getUserDataPath(): string {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'king-browser');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'king-browser');
  }
  return path.join(home, '.config', 'king-browser');
}

function resolveMcpConfig(): { port: number; token?: string } {
  let port = 3020;
  const token = process.env.MCP_TOKEN;

  if (process.env.MCP_PORT) {
    const parsed = parseInt(process.env.MCP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) port = parsed;
  } else {
    try {
      const portFile = path.join(getUserDataPath(), 'king-mcp-port');
      if (fs.existsSync(portFile)) {
        const saved = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
        if (!isNaN(saved) && saved > 0 && saved < 65536) port = saved;
      }
    } catch (_) {}
  }

  // King stores this credential with the OS keystore (or authenticated local
  // encryption). A standalone Node process cannot read that file as plaintext.
  // Settings → MCP → Copy Configuration supplies the explicit environment token.
  if (!token || !/^[A-Za-z0-9._~-]{16,4096}$/.test(token)) {
    throw new Error('Set a valid MCP_TOKEN using King Settings → MCP → Copy Configuration. The on-disk token is encrypted.');
  }

  return { port, token };
}

// The bridge forwards the bearer token in an Authorization header, so the
// endpoint has to be trustworthy: no embedded credentials, no exotic schemes
// and no cleartext HTTP to anything that is not this machine.
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function resolveSseUrl(port: number): URL {
  const configured = (process.env.MCP_SSE_URL || '').trim();
  let url: URL;
  try {
    url = new URL(configured || `http://127.0.0.1:${port}/sse`);
  } catch (_) {
    throw new Error('MCP_SSE_URL is not a valid URL. Use an http(s) URL such as http://127.0.0.1:3020/sse.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`MCP_SSE_URL must use http or https, not "${url.protocol}".`);
  }
  if (url.username || url.password) {
    throw new Error('MCP_SSE_URL must not embed credentials. Put the token in MCP_TOKEN instead.');
  }
  if (url.protocol === 'http:' && !LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error(
      `MCP_SSE_URL refuses to send the bearer token in cleartext to "${url.hostname}". ` +
      'Use https:// or a loopback address (127.0.0.1, localhost, ::1).'
    );
  }

  return url;
}

async function main() {
  const config = resolveMcpConfig();
  const sseUrl = resolveSseUrl(config.port);
  const activeToken = config.token;

  // Security: send the token via the Authorization header instead of the URL query string
  const sseTransport = new SSEClientTransport(sseUrl, activeToken ? {
    requestInit: {
      headers: { Authorization: `Bearer ${activeToken}` }
    }
  } : undefined);
  const client = new Client({ name: 'mcp-bridge', version: '1.0.0' }, { capabilities: {} });
  
  try {
    await client.connect(sseTransport);
    console.error('[MCP Bridge] Connected to King Browser SSE server');
  } catch (error: any) {
    console.error('[MCP Bridge] Error connecting to King Browser:', error.message);
    console.error('Make sure King Browser is running.');
    process.exit(1);
  }

  const server = new Server({
    name: 'king-browser-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const response = await client.listTools();
      return response;
    } catch (e: any) {
      console.error('[MCP Bridge] Error listing tools:', e);
      return { tools: [] };
    }
  });

  // Sensitive tools wait for the user's approval in King Browser (up to
  // MCP_APPROVAL_WINDOW_MS + MCP_ACTION_TIMEOUT_MS in src/utils/mcpActionTiming.ts).
  // The SDK's default 60s request timeout would cut that short.
  const TOOL_CALL_TIMEOUT_MS = 180_000;

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const response = await client.callTool(request.params, undefined, { timeout: TOOL_CALL_TIMEOUT_MS });
      return response;
    } catch (e: any) {
      console.error(`[MCP Bridge] Error calling tool ${request.params.name}:`, e);
      return { content: [{ type: 'text', text: `Bridge Error: ${e.message}` }], isError: true };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error('[MCP Bridge] Stdio server running and proxying requests.');
}

main().catch((error) => {
  console.error('[MCP Bridge] Fatal error:', error);
  process.exit(1);
});
