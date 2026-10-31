# King Browser comprehensive audit

Scope: repository state on branch `claude/king-browser-mcp-tool-manager-xpbbmk`, based on `main` at commit `a5379d2` (merge of PR #42). Performed 2026-10-31. Method: reading the code named below, running the existing suites, and writing probes. Claims from earlier reports were re-checked against the code and are marked **verified** or **not re-verified**.

Legend: **Fact** = observed in code or in a command run during this audit. **Assumption** = reasoned, not run. **Opinion** = judgment.

## 1. Existing architecture (facts)

- Electron main process (`electron/main.ts` composition root; `electron/main/*.ts` mostly dependency-free modules), three preloads, React renderer in `src/`, one `<webview>` per tab, MCP server on `127.0.0.1:3020` (bearer token, Streamable HTTP `/mcp`, legacy SSE, stdio bridge).
- One tool registry: `TOOLS` + `TOOL_PERMISSIONS` + `TOOL_ALIASES` in `electron/mcpServer.ts`. Permission tiers `safe` / `medium` / `sensitive`; medium and sensitive are disabled by default. Calls pass `executeToolCore` (screen lock, first-use approval, enabled check, alias resolution, site rules, policy classification) and the `ExecutionEngine` (approval dialog, pause, stop, step, activity log).
- Existing registry checks: `tests/mcp_tool_schemas.test.ts` (unique names, well-formed schemas, README counts, every tool routed), `tests/mcp_tool_catalog.test.ts` (Settings list matches registry).
- Every `ipcMain` handler is checked for a sender guard by `tests/ipc_sender_guard_coverage.test.ts`.
- 55 skills in `.claude/skills/`; `AGENTS.md` is the single instruction source, `CLAUDE.md` imports it; consistency enforced by `agent_instructions_consistency`, `agent_skills_integrity`, `setup_agent_skills` tests.

## 2. Findings

### Confirmed defects (fixed in this change)

| # | Finding | Evidence | Status |
| :--- | :--- | :--- | :--- |
| D1 | **Native TTS: an old request's watchdog could kill a newer request.** The watchdog called `killActive()` (whatever process is active). If an older request's process ignored the kill and never emitted `close`, its watchdog stayed armed and, when it fired, silenced the speech that had replaced it. Superseded and stopped requests also stayed pending until the killed process reported `close`. | Reasoned from `nativeTts.ts`; reproduced by a new regression test that hangs (exit 124, the first assertion never settles) on the old code and passes on the new code. | Fixed: each request kills only its own process, settles immediately on supersede/stop/timeout, settles exactly once, and spawns no fallback after a timeout. Tests added to `tests/native_tts.test.ts`. |
| D2 | **Custom-tool routing fell through to the renderer** for a tool deleted while its approval dialog was open (found by the new integration test during development, in code added by this change, never released). | `tests/mcp_custom_tools_integration.test.ts` step 9. | Fixed before merge: routing is by name prefix, not by store lookup. |

### Verified OK (no change needed)

- **Preview fetch / SSRF (`previewFetch.ts`, `ipAddress.ts`)**: scheme and credential checks, local hostnames, every DNS answer must be public, connection pinned to the validated address, MCP port refused, manual redirects re-validated per hop, byte limit with stream destroy. A probe of `isPrivateIP` over 47 inputs (loopback, RFC 1918, CGNAT, link-local and metadata, multicast, reserved, IPv4-mapped, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, ULA, site-local, octal/short/decimal IPv4, bracketed IPv6) classified all 41 private/reserved forms as private and the 6 public inputs (including IPv4-mapped, NAT64 and 6to4 forms that embed a public IPv4) as public. No bypass found.
- `cross-fetch` (node-fetch) is what honours the `agent` option used for pinning; the existing test checks that the agent's `lookup` returns the pinned address.
- IPC sender guard coverage, CSP parity, permission/popup/webview hardening suites all passed in `npm run verify` and in the Electron smoke run (sandbox, context isolation, no Node integration, CSP without inline script, guest isolation, partition allowlist).
- `npm run audit:prod`: 0 vulnerabilities.

### Weaknesses and technical debt (not fixed; opinions unless stated)

1. (Fact) Settings -> MCP keeps a hand-maintained `MCP_TOOLS` list that duplicates the registry; the Tool Manager now reads the registry itself. The old list is still rendered, so built-in tools appear in two places in that screen. Consolidating them is a UI decision left open.
2. (Fact) Built-in tool arguments are not validated centrally against their declared JSON Schema at runtime; each handler validates its own input. Custom tools are validated centrally. Changing built-ins needs a compatibility test with real clients (not available here).
3. (Fact) Validation messages for custom tools come from the main process in English.
4. (Fact) Non-OK responses in the preview fetch are not read or cancelled, which can hold the socket until it is garbage collected (minor resource issue, not security).
5. (Assumption) Translation lifecycle (`translation.ts`), phishing block page and WebView navigation/popup policy were reviewed through their existing tests and the runtime smoke checks only; no new defect was found, but this was not a line-by-line review.
6. (Fact) The Electron binary could not be installed by `@electron/get` in this environment (an `undici` assertion through the proxy); it was fetched with `curl` and unpacked by hand. Unit tests that import `electron/main/downloads.ts` need the binary to exist.
7. (Fact) No duplicate or unnecessary dependency was added by this change; the existing dependency list was not re-audited beyond `npm audit` for runtime dependencies.

### Missing functionality addressed

User-defined MCP tools with a management UI (this change). Not implemented, with reasons: external MCP server connections, aliasing internal capabilities, central runtime schema enforcement for built-ins (see `docs/engineering/custom-mcp-tools.md`).

## 3. Existing capabilities that must not be rebuilt

`ExecutionEngine` and the approval dialog; `policyEngine` / `approvalMode` / `siteRules`; `injectionDetector`; `previewFetch.validatePreviewUrl` and `ipAddress.isPrivateIP`; `proxySecurity` encrypt/decrypt with fallback; the enable/disable store (`mcp-tool-settings.json`); `useDialogA11y`; `showConfirm`. The Tool Manager reuses all of them.

## 4. Order in which the work was done

1. Read the architecture and tests; install dependencies (`npm ci --ignore-scripts`).
2. Core module and tests first (`customTools.ts`), then registry/approval wiring and the integration test.
3. IPC + preload + types, then the UI, then a real-Electron spec.
4. Native TTS race: failing regression test first, then the fix.
5. Documentation, full verification, report.
