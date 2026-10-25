/**
 * King Browser - MCP Streamable HTTP transport (POST/GET/DELETE on one path).
 *
 * The legacy SSE transport stays untouched; this adds the transport current
 * MCP clients (Claude Code, Cursor, Codex, Gemini CLI, OpenCode `remote`, the
 * official SDKs) speak natively, so they can connect without the stdio bridge.
 *
 * Behaviour, per the MCP transport specification:
 *   - POST carries one JSON-RPC message (or a batch). Requests are answered
 *     with a JSON body; notifications and client responses get 202, no body.
 *   - The session id is issued on `initialize` (Mcp-Session-Id) and required
 *     afterwards: 400 when missing, 404 when unknown or expired.
 *   - GET answers 405: the server never pushes messages on its own.
 *   - DELETE ends a session.
 *   - Origin is validated on every request (DNS rebinding): a browser page on
 *     a foreign origin is refused with 403 before anything else happens.
 *   - A MCP-Protocol-Version header naming an unsupported version is a 400.
 *
 * Authentication is injected, so the bearer-token check stays in one place
 * (McpServer). Each session belongs to the token holder that created it; a
 * session id alone never grants access, because the token is checked first.
 *
 * Dependency-free apart from node:crypto (no Electron imports).
 */

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  handleJsonRpcMessage,
  isInitializeRequest,
  isSupportedProtocolVersion,
  JSONRPC_INVALID_REQUEST,
  type JsonRpcResponse,
  type McpProtocolHandlers
} from './mcpProtocol.js';

export interface McpHttpSession {
  id: string;
  connectedAt: number;
  lastSeenAt: number;
  userAgent: string;
  clientName?: string;
}

export interface StreamableHttpDeps {
  authenticate(req: Request): boolean;
  handlers: McpProtocolHandlers;
  sessions: Map<string, McpHttpSession>;
  /** Called after a session is created or removed (UI client counter). */
  onSessionsChanged(): void;
  maxSessions?: number;
  idleMs?: number;
  now?: () => number;
}

export const MCP_SESSION_HEADER = 'mcp-session-id';
export const DEFAULT_MAX_SESSIONS = 32;
export const DEFAULT_SESSION_IDLE_MS = 60 * 60 * 1000;

/** Origins that may talk to the server: this machine, or King's own king:// pages. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
      || url.protocol === 'king:';
  } catch (_) {
    return false;
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rpcError(res: Response, status: number, code: number, message: string) {
  res.status(status).json({ jsonrpc: '2.0', id: null, error: { code, message } });
}

export function createStreamableHttpHandlers(deps: StreamableHttpDeps) {
  const maxSessions = deps.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const idleMs = deps.idleMs ?? DEFAULT_SESSION_IDLE_MS;
  const now = deps.now ?? Date.now;

  function pruneExpired(): void {
    let removed = false;
    for (const [id, session] of deps.sessions) {
      if (now() - session.lastSeenAt > idleMs) {
        deps.sessions.delete(id);
        removed = true;
      }
    }
    if (removed) deps.onSessionsChanged();
  }

  /** Authentication and Origin checks shared by POST, GET and DELETE. Returns false after answering. */
  function admit(req: Request, res: Response): boolean {
    const origin = singleHeader(req.headers.origin);
    if (origin !== undefined && !isLocalOrigin(origin)) {
      res.status(403).json({ error: 'Forbidden: Invalid Origin header' });
      return false;
    }
    if (!deps.authenticate(req)) {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
      return false;
    }
    return true;
  }

  function lookupSession(req: Request, res: Response): McpHttpSession | null {
    const id = singleHeader(req.headers[MCP_SESSION_HEADER]);
    if (!id) {
      rpcError(res, 400, JSONRPC_INVALID_REQUEST, 'Missing Mcp-Session-Id header');
      return null;
    }
    pruneExpired();
    const session = deps.sessions.get(id);
    if (!session) {
      rpcError(res, 404, JSONRPC_INVALID_REQUEST, 'Unknown or expired session');
      return null;
    }
    session.lastSeenAt = now();
    return session;
  }

  async function post(req: Request, res: Response): Promise<void> {
    if (!admit(req, res)) return;

    const version = singleHeader(req.headers['mcp-protocol-version']);
    if (version !== undefined && !isSupportedProtocolVersion(version)) {
      rpcError(res, 400, JSONRPC_INVALID_REQUEST, 'Unsupported MCP-Protocol-Version');
      return;
    }

    // express.json() leaves req.body undefined for any non-JSON content type.
    const body: unknown = req.body;
    const isBatch = Array.isArray(body);
    const messages: unknown[] = isBatch ? (body as unknown[]) : [body];
    if (messages.length === 0 || messages.length > 32
      || messages.some((m) => typeof m !== 'object' || m === null || Array.isArray(m) || (m as { jsonrpc?: unknown }).jsonrpc !== '2.0')) {
      rpcError(res, 400, JSONRPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
      return;
    }

    let issuedSessionId: string | undefined;
    if (messages.some(isInitializeRequest)) {
      // initialize starts a session and must stand alone.
      if (messages.length !== 1) {
        rpcError(res, 400, JSONRPC_INVALID_REQUEST, 'initialize must not be batched');
        return;
      }
      pruneExpired();
      if (deps.sessions.size >= maxSessions) {
        res.status(503).json({ error: 'Too many open MCP sessions' });
        return;
      }
      const params = (messages[0] as { params?: { clientInfo?: { name?: unknown } } }).params;
      const clientName = typeof params?.clientInfo?.name === 'string' ? params.clientInfo.name.slice(0, 80) : undefined;
      issuedSessionId = `mcp_${randomUUID().replace(/-/g, '')}`;
      deps.sessions.set(issuedSessionId, {
        id: issuedSessionId,
        connectedAt: now(),
        lastSeenAt: now(),
        userAgent: String(singleHeader(req.headers['user-agent']) || 'Unknown').slice(0, 200),
        clientName
      });
      deps.onSessionsChanged();
    } else if (!lookupSession(req, res)) {
      return;
    }

    try {
      const responses: JsonRpcResponse[] = [];
      for (const message of messages) {
        const response = await handleJsonRpcMessage(message, deps.handlers);
        if (response) responses.push(response);
      }

      if (issuedSessionId) res.setHeader('Mcp-Session-Id', issuedSessionId);
      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      res.status(200).json(isBatch ? responses : responses[0]);
    } catch (_) {
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
    }
  }

  function get(req: Request, res: Response): void {
    if (!admit(req, res)) return;
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'This server does not offer a server-to-client stream; use POST' });
  }

  function del(req: Request, res: Response): void {
    if (!admit(req, res)) return;
    const session = lookupSession(req, res);
    if (!session) return;
    deps.sessions.delete(session.id);
    deps.onSessionsChanged();
    res.status(204).end();
  }

  return { post, get, del };
}
