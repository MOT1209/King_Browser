/**
 * King Browser - transport-independent MCP message handling.
 *
 * One function answers every JSON-RPC message the tool server understands, so
 * the legacy SSE transport (/sse + /message) and the Streamable HTTP transport
 * (/mcp) cannot drift apart. The module knows nothing about HTTP, Electron or
 * any particular client: tools are reached through `McpProtocolHandlers`.
 *
 * Decisions made here:
 *   - protocol version: echo the client's version when supported, otherwise
 *     answer with the newest one we implement (the client then decides);
 *   - notifications (no `id`) and client responses never produce a reply;
 *   - malformed tool calls are JSON-RPC errors (-32602), tool failures are
 *     results with `isError: true` so the model can read and react to them.
 *
 * Dependency-free apart from ./mcpContent (no Electron imports).
 */

import { toMcpContent, formatToolError, type McpContentBlock } from './mcpContent.js';

/** Newest first. The tool surface (tools/list, tools/call, ping) is identical across them. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export type JsonRpcId = string | number;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpProtocolHandlers {
  serverVersion: string;
  /** Tools the caller may see (disabled tools already filtered out). */
  listTools(): unknown[];
  /** Runs a tool. Failures may be thrown or returned as a string starting with "Error:". */
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;

export function isSupportedProtocolVersion(value: unknown): value is (typeof SUPPORTED_PROTOCOL_VERSIONS)[number] {
  return typeof value === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

export function negotiateProtocolVersion(requested: unknown): string {
  return isSupportedProtocolVersion(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** True for a JSON-RPC request (has a method and an id), false for notifications and client responses. */
export function isJsonRpcRequest(message: unknown): boolean {
  return isPlainObject(message)
    && typeof message.method === 'string'
    && (typeof message.id === 'string' || typeof message.id === 'number');
}

export function isInitializeRequest(message: unknown): boolean {
  return isJsonRpcRequest(message) && (message as Record<string, unknown>).method === 'initialize';
}

/**
 * Answers one JSON-RPC message. Returns null when the message needs no reply
 * (a notification or a response sent by the client).
 */
export async function handleJsonRpcMessage(
  message: unknown,
  handlers: McpProtocolHandlers
): Promise<JsonRpcResponse | null> {
  if (!isPlainObject(message) || message.jsonrpc !== '2.0') {
    return failure(null, JSONRPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const hasId = message.id !== undefined && message.id !== null;
  if (hasId && typeof message.id !== 'string' && typeof message.id !== 'number') {
    return failure(null, JSONRPC_INVALID_REQUEST, 'Invalid JSON-RPC request id');
  }

  // A message without a method is a response to a server-initiated request.
  // This server sends none, so there is nothing to correlate and nothing to say.
  if (typeof message.method !== 'string') {
    return hasId ? null : failure(null, JSONRPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  // Notifications never get an answer, not even for unknown methods.
  if (!hasId) return null;
  const id = message.id as JsonRpcId;
  const params = isPlainObject(message.params) ? message.params : undefined;

  switch (message.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: { name: 'king-browser', version: handlers.serverVersion }
        }
      };

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: handlers.listTools() } };

    case 'tools/call': {
      const name = params?.name;
      if (typeof name !== 'string' || name.length === 0) {
        return failure(id, JSONRPC_INVALID_PARAMS, 'tools/call requires a tool name');
      }
      const rawArgs = params?.arguments;
      if (rawArgs !== undefined && rawArgs !== null && !isPlainObject(rawArgs)) {
        return failure(id, JSONRPC_INVALID_PARAMS, 'tools/call arguments must be an object');
      }
      try {
        const result = await handlers.callTool(name, (rawArgs ?? {}) as Record<string, unknown>);
        const isError = typeof result === 'string' && result.startsWith('Error:');
        const content: McpContentBlock[] = toMcpContent(result);
        return { jsonrpc: '2.0', id, result: { content, ...(isError ? { isError: true } : {}) } };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: formatToolError(err) }], isError: true }
        };
      }
    }

    default:
      return failure(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}
