---
name: mcp-security
description: "Security of the King Browser MCP server and stdio bridge: loopback binding, Host and Origin checks, bearer token, rate limiting, session handling, tool tiers and tool exposure. Use when changing electron/mcpServer.ts, mcpProtocol.ts, mcpStreamableHttp.ts, mcp-bridge.ts, tool registration or MCP settings."
---

# MCP security

## Controls (`electron/mcpServer.ts` unless noted)
- Listens on `127.0.0.1` (port 3020, falls back to an ephemeral port if busy). Never bind `0.0.0.0`.
- Host header must be `localhost`, `127.0.0.1` or `[::1]` (with or without the port): blocks DNS rebinding of the port.
- CORS answers only local origins; Streamable HTTP validates Origin and sessions in `electron/main/mcpStreamableHttp.ts` (`Mcp-Session-Id` issued on initialize, 400 missing, 404 unknown/expired, idle expiry, max sessions).
- `Authorization: Bearer <token>` only (no query-string token), compared with `timingSafeEqual`; token encrypted at rest.
- `express-rate-limit`: 120 requests per minute per client, `/health` exempt.
- Tool tiers in `TOOL_PERMISSIONS`: `safe`, `medium` (hidden from `tools/list` until enabled in Settings -> MCP), `sensitive`. Unknown tools are treated as sensitive.
- Every tool call goes through the policy engine and execution engine (see `agent-tool-governance`); both transports share `electron/main/mcpProtocol.ts`, so they cannot drift.
- Bridge: `mcp-bridge.ts` is the source, `mcp-bridge.mjs` is generated (`npm run build:bridge`) and must match (CI diff check).

## Adding a tool
1. Register in `mcpServer.ts` with a tier; default to `sensitive` if unsure.
2. Renderer handler in `src/hooks/useBrowserAgentBridge.ts`.
3. Policy classification in `electron/main/policyEngine.ts`; redaction for any sensitive argument.
4. Tests: `tests/mcp_tool_catalog.test.ts` and a policy test; update README tool list and count and AGENTS.md tool families.

## Verify
`npm test` (`mcp_streamable_http`, `mcp_server_transports`, `mcp_tool_catalog`, `mcp_single_approval_authority`, `mcp_lifecycle_regressions`, `mcp_startup_regressions`, `mcp_bridge_config_regressions`), `npm run build:bridge && git diff --exit-code mcp-bridge.mjs`. End-to-end with a running app: `npm run test:integration` (needs the app running, see `tests/integration/agent_e2e.mjs`).

## Done when
No tool is reachable without the token, tier and policy, and the bridge matches its source.
