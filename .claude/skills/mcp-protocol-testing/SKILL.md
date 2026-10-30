---
name: mcp-protocol-testing
description: "Testing the King Browser MCP server at the protocol level: Streamable HTTP and legacy SSE handshakes, sessions, Origin and Host checks, auth failures, tools/list tiering and the stdio bridge. Use when changing mcpServer.ts, mcpProtocol.ts, mcpStreamableHttp.ts or mcp-bridge.ts, or when an MCP client fails to connect."
---

# MCP protocol testing

## Purpose
Prove that a real MCP client sees the right thing: initialize, session ids, `tools/list` filtered by tier, `tools/call` results and every refusal path. Test through the protocol, not by calling internal functions.

## Files
`electron/main/mcpProtocol.ts` (shared JSON-RPC handling for both transports), `electron/main/mcpStreamableHttp.ts`, `electron/mcpServer.ts`, `mcp-bridge.ts`, `tests/mcp_streamable_http.test.ts`, `tests/mcp_server_transports.test.ts`, `tests/mcp_bridge_config_regressions.test.ts`, `tests/mcp_lifecycle_regressions.test.ts`, `tests/integration/agent_e2e.mjs`.

## Workflow
1. Reproduce with a loopback server on port 0 and an injected token, as the existing transport tests do; never depend on port 3020 being free.
2. Cover the happy path (initialize, `notifications/initialized`, `tools/list`, one `tools/call`) on both `/mcp` and `/sse` + `/message`.
3. Cover each refusal: missing or wrong bearer token, token in the query string, bad Host, foreign Origin on `/mcp`, missing and unknown `Mcp-Session-Id`, expired session, rate limit, malformed JSON-RPC, unknown method, unknown tool.
4. Assert tiering: a fresh settings object lists only safe tools; enabling a tier adds exactly that tier.
5. For the bridge, edit `mcp-bridge.ts` only and regenerate with `npm run build:bridge`.
6. Run the end-to-end script against a running app only when the change touches real browser behaviour.

## Rules
- Tests never print or store a real token; use a generated one.
- A test that needs the network beyond loopback is wrong; use fixtures.
- Do not change a transport test's expectation to match new behaviour without stating why the old expectation was wrong.

## Verify
`npm test`; `npm run build:bridge && git diff --exit-code mcp-bridge.mjs`; optionally `npm run test:integration` with the app running.

## Common failures
Tests passing on one transport only; session limits leaking between tests; Host header test using `localhost` only (also test `127.0.0.1` and `[::1]`); regenerated bridge not committed.

## Done when
Both transports are covered for the change, each refusal path has an assertion, and the bridge file matches its source.
