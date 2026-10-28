---
name: ssrf-protection
description: "SSRF and DNS-rebinding defences in King Browser: private IP classification, agent navigation DNS pinning, open-external host checks, MCP Host header checks and main-process fetches. Use when the main process fetches a URL, when agent or MCP navigation rules change, or when handling IP literals and hostnames."
---

# SSRF protection

## Threat
A page, an MCP client or a prompt-injected agent gets the browser (which runs on the user's machine) to talk to loopback, LAN or cloud-metadata services.

## Controls
- `electron/main/ipAddress.ts` `isPrivateIP`: IPv4/IPv6 ranges, IPv4-mapped IPv6, zone ids. Tests: `tests/ssrf_ip_policy.test.ts`.
- `electron/main/hostPolicy.ts` `isLocalOrIntranetHost`: localhost names, single-label intranet hosts.
- `src/utils/safeNavigation.ts` `isSafeAgentNavigationUrl`: renderer-side literal check for agent navigation.
- `electron/main/agentNavigationGuard.ts`: resolves the name in main and refuses if any address is non-public (DNS rebinding). Resolver is injected for tests (`tests/agent_navigation_guard.test.ts`).
- `open-external` IPC: https only, non-local hosts.
- MCP server (`electron/mcpServer.ts`): binds 127.0.0.1, rejects Host headers other than localhost/127.0.0.1/[::1] with the port (DNS-rebinding of the MCP port), Origin restricted, bearer token required.
- Downloads: `isSafeDownloadUrl` in `electron/main/downloads.ts`.

## Note
A human typing `http://127.0.0.1:8080` in the address bar is allowed on purpose (local development); the SSRF rules apply to agent-initiated and main-process requests.

## Workflow
1. Any new main-process `fetch`/`net.request` with a URL that is not a constant: validate scheme, resolve, refuse private addresses, and set a timeout and size limit.
2. Use the existing helpers; add the decimal/octal/hex IPv4, `[::ffff:127.0.0.1]`, `localhost.` and trailing-dot cases to tests.

## Verify
`npm test` (ssrf_ip_policy, agent_navigation_guard, mcp_streamable_http).

## Done when
No new path lets an agent, page or MCP client reach a non-public address, and tests cover the encodings.
