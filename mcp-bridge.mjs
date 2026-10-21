#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import os from "os";
import path from "path";
import fs from "fs";
function getUserDataPath() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "king-browser");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "king-browser");
  }
  return path.join(home, ".config", "king-browser");
}
function resolveMcpConfig() {
  let port = 3020;
  let token = process.env.MCP_TOKEN;
  if (process.env.MCP_PORT) {
    const parsed = parseInt(process.env.MCP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) port = parsed;
  } else {
    try {
      const portFile = path.join(getUserDataPath(), "king-mcp-port");
      if (fs.existsSync(portFile)) {
        const saved = parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
        if (!isNaN(saved) && saved > 0 && saved < 65536) port = saved;
      }
    } catch (_) {
    }
  }
  if (!token || !/^[A-Za-z0-9._~-]{16,4096}$/.test(token)) {
    throw new Error("Set a valid MCP_TOKEN using King Settings \u2192 MCP \u2192 Copy Configuration. The on-disk token is encrypted.");
  }
  return { port, token };
}
async function main() {
  const config = resolveMcpConfig();
  const defaultUrl = `http://127.0.0.1:${config.port}/sse`;
  const sseUrl = new URL(process.env.MCP_SSE_URL || defaultUrl);
  const activeToken = process.env.MCP_TOKEN || config.token;
  const sseTransport = new SSEClientTransport(sseUrl, activeToken ? {
    requestInit: {
      headers: { Authorization: `Bearer ${activeToken}` }
    }
  } : void 0);
  const client = new Client({ name: "mcp-bridge", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(sseTransport);
    console.error("[MCP Bridge] Connected to King Browser SSE server");
  } catch (error) {
    console.error("[MCP Bridge] Error connecting to King Browser:", error.message);
    console.error("Make sure King Browser is running.");
    process.exit(1);
  }
  const server = new Server({
    name: "king-browser-mcp",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const response = await client.listTools();
      return response;
    } catch (e) {
      console.error("[MCP Bridge] Error listing tools:", e);
      return { tools: [] };
    }
  });
  // Sensitive tools wait for the user's approval in King Browser (up to
  // MCP_APPROVAL_WINDOW_MS + MCP_ACTION_TIMEOUT_MS in src/utils/mcpActionTiming.ts).
  // The SDK's default 60s request timeout would cut that short.
  const TOOL_CALL_TIMEOUT_MS = 180000;
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const response = await client.callTool(request.params, void 0, { timeout: TOOL_CALL_TIMEOUT_MS });
      return response;
    } catch (e) {
      console.error(`[MCP Bridge] Error calling tool ${request.params.name}:`, e);
      return { content: [{ type: "text", text: `Bridge Error: ${e.message}` }], isError: true };
    }
  });
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error("[MCP Bridge] Stdio server running and proxying requests.");
}
main().catch((error) => {
  console.error("[MCP Bridge] Fatal error:", error);
  process.exit(1);
});
