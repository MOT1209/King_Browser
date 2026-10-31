# Custom MCP tools - developer guide

User-defined tools (Settings -> MCP -> Tool Manager) are data, not code. This page records how they work, which decisions were made, and how to extend them.

## Where things live

| Concern | File |
| :--- | :--- |
| Validation, store, argument checking, request building, SSRF-safe executor, import/export | `electron/main/customTools.ts` (dependency-free; no Electron imports) |
| Registry merge, approval, execution, test action, secret storage glue | `electron/mcpServer.ts` (`customToolStore`, `visibleTools`, `executeCustomTool`, `runCustomToolInMain`) |
| IPC (`mcp-tool-registry`, `mcp-custom-tool-*`, `mcp-custom-tools-*`) | `electron/main.ts`, `electron/preload.ts`, `src/vite-env.d.ts`; every handler starts with `isTrustedSender` |
| Shared view types | `src/types/mcpTools.ts` |
| UI | `src/components/settings/McpToolManager.tsx` (mounted in `McpSection.tsx`) |
| Tests | `tests/custom_tools.test.ts`, `tests/mcp_custom_tools_integration.test.ts` |

Persistence in the profile folder: `mcp-custom-tools.json` (definitions, last test results; no secrets), `mcp-custom-tool-secrets.bin` (all credentials, encrypted with `safeStorage`, or AES-256-GCM with the shared fallback and magic `NCTS` when `safeStorage` is unavailable), `mcp-custom-tools-audit.jsonl` (create, update, enable, disable, delete, import: id and name only).

## Registry model

There is one registry. Built-in tools stay in `TOOLS` / `TOOL_PERMISSIONS`; the store is the only source of user tools; `visibleTools()` is the one list that `tools/list` (Streamable HTTP, SSE, stdio bridge) and `GET /tools` serve. Names are `custom_[a-z][a-z0-9_]{1,55}`, so they cannot shadow a built-in and fit the `^[a-zA-Z0-9_-]+$` rule of the enable/disable settings. A tool is *active* only when it is enabled and its persisted definition still validates; an edited-by-hand file never activates an invalid definition.

## Call path

1. `executeToolCore` runs the existing gates (screen lock, first-use approval, `isToolAllowed`). `isToolAllowed` for a custom tool means `store.isActive(name)`.
2. `executeCustomTool` validates the arguments against the tool's schema (before any dialog or network), then decides the risk: `always` or a test call is `sensitive` (trigger `share_private`); strict mode and a pending injection suspicion also force approval; only a credential-free GET/HEAD tool marked `read-only` may run without a dialog. If the policy engine is not enforced, the call is refused.
3. The call is submitted to the shared `ExecutionEngine`, so pause, stop, step mode, the activity log and the approval dialog behave as for built-in tools. `dispatchToRenderer` routes by name prefix (not by store lookup) to `runCustomToolInMain`, so a tool deleted while its dialog was open fails instead of falling through to the renderer.
4. `runCustomToolInMain` re-checks the tool is still active, then calls `executeHttpTool`. The store tracks an `AbortController` per running call; disable, delete and behaviour-changing edits abort it.
5. The result is fenced as external data and scanned by the injection detector.

## Security decisions

- **No code execution.** The only type is `http`. Anything else is rejected in `validateDefinition`.
- **SSRF.** `validatePreviewUrl` (shared with the link-preview fetch) resolves the host, requires every answer to be public, and the request is pinned to the validated address with a custom `lookup`. The executor additionally requires `https`, refuses redirects (`redirect: 'manual'`, a 3xx is an error), and reads at most `maxResponseBytes` with a timeout. The MCP port is refused. Placeholders can never appear in the origin; path values are `encodeURIComponent`-encoded so an argument cannot change the host or escape its path segment.
- **Headers.** `Host`, `Authorization`, `Cookie`, `Content-Length`, `Transfer-Encoding` and similar are not settable; values with CR/LF are refused. Credentials go only through the `auth` setting.
- **Secrets.** Write-only from the renderer. Views carry `hasSecret`. Export, the definitions file, the audit trail, the run history (`redactArgsForLog` records argument names only for `custom_*`), error strings and the response text never contain the credential (`redactSecret` also strips an echoed credential from a server response).
- **Descriptions** are read by agents as trusted guidance, so imported or typed descriptions that match the injection detector are rejected.
- **Edits** that alter behaviour need `confirmed: true`; the store returns the list of changes instead of saving.
- **Import** is all-or-nothing, size-limited (512 KB, 50 tools) and runs every entry through `validateDefinition`.
- **Built-in tools cannot be deleted**; the manager only toggles them through the existing `setToolEnabled`.

## Not implemented, and why

- **External MCP server connections.** Safe support needs a client lifecycle, transport and auth handling, tool-schema import with the same description-injection problem, and a per-tool approval mapping for tools we did not classify. None of that can be tested here without a real server and a security review, so it was left out rather than half-built.
- **Exposing internal browser capabilities under new names.** Aliases already exist (`TOOL_ALIASES`); letting users create more would let them re-label a sensitive tool as a safe one.
- **Runtime JSON Schema validation for built-in tools.** Custom tools are validated at call time. Built-in handlers validate their own arguments in the renderer bridge, and `tests/mcp_tool_schemas.test.ts` checks the declared schemas. Enforcing the declared schema centrally for built-ins could change what current clients get back, so it needs its own change and compatibility test.
- **Localised validator messages.** Validation runs in the main process and returns English text.

## Extending

Add a new execution type only with: a closed validator (unknown keys rejected), a place in `executeToolCore`'s existing approval path (never a parallel executor), SSRF/size/time limits, secret handling through the store's secret functions, and tests in both suites. Run `npm run verify`, `npm run build:electron`, and the security suites.
