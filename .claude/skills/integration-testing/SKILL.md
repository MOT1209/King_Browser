---
name: integration-testing
description: "Integration tests in King Browser that cross module or process boundaries: MCP transports, engine IPC with a real engine, sync service with vault, and the end-to-end agent script against a running app. Use when a change spans several modules or needs the MCP server, IPC wiring or sync service to be exercised together."
---

# Integration testing

## Existing integration-level suites
- In `npm test`: `mcp_server_transports`, `mcp_streamable_http` (real HTTP handlers), `engine_ipc` (fake `handle` + real `ExecutionEngine`), `mcp_engine_wiring`, `sync_service_vault`, `king_cloud_auth_behaviour` (real service paths, PBKDF2-heavy, runs last), `e2e/tier1..5` (feature, boundary, cross-feature, real-world, adversarial tiers in plain Node).
- Against a running app: `npm run test:integration` (`tests/integration/agent_e2e.mjs`) talks to the live MCP server; start the app first and provide the token as that script expects.
- Against the built Electron app: `npm run test:electron` (see `electron-e2e-testing`).

## Workflow
1. Prefer real collaborators with injected edges (resolver, filesystem root, clock) over mocks of the module under test.
2. Use loopback servers on port 0 for HTTP; never depend on the internet.
3. Clean up servers, timers and temp dirs; leaked handles keep the single test process alive.
4. Register new suites in `tests/runAll.ts`.

## Verify
`npm test`; `npm run test:integration` when the MCP server behaviour changed and you can run the app.

## Done when
The cross-module path is covered without network access, and resources are released.
