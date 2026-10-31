# MCP Tool Manager - implementation report

Branch `claude/king-browser-mcp-tool-manager-xpbbmk`, 2026-10-31. Companion documents: `docs/audits/KING_BROWSER_COMPREHENSIVE_AUDIT.md`, `docs/guides/mcp-tool-manager.md`, `docs/engineering/custom-mcp-tools.md`.

## 1. Result in one paragraph

Users can add, edit, enable/disable, test, export, import and delete their own MCP tools in Settings -> MCP -> Tool Manager. A user tool is a declarative HTTPS request, run in the main process through the existing approval engine. Verified on Linux only: Node suites (1470 `[PASS]` lines, exit 0), typecheck, lint, i18n and string checks, production dependency audit (0 vulnerabilities), production build, and 8 real-Electron Playwright tests under xvfb. **Not verified: Windows, macOS, CI, packaging, live use by a real MCP client, a real HTTP call to a third-party API.** Two of the requested tool types (external MCP server connections, internal-capability aliases) are deliberately not implemented.

## 2. Initial audit findings

See the audit document. In short: one real defect in existing code (native TTS watchdog race, fixed); no SSRF bypass found in preview fetch/IP classification (probed 47 inputs); existing registry, IPC-guard and CSP tests are sound; known debt listed there.

## 3. Implemented

| Area | What |
| :--- | :--- |
| Core | `electron/main/customTools.ts`: name/description/URL/header/body/parameter validation, argument validation, request building with encoded placeholders, HTTPS executor, atomic store, edit-confirmation diff, import preview/commit with rollback, export without secrets |
| Registry | `visibleTools()` merges enabled custom tools into `tools/list` (all transports and `GET /tools`); `getToolRegistry()` feeds the UI; names `custom_*` cannot shadow built-ins |
| Execution | `executeCustomTool` + `runCustomToolInMain` use the shared `ExecutionEngine` (approval, pause/stop, history); disabled/deleted tools are refused in the backend, including while an approval dialog is open |
| IPC | 9 handlers, each starting with `isTrustedSender`; preload methods; types in `src/types/mcpTools.ts` |
| UI | `McpToolManager.tsx`: dashboard counts, search/filter/sort, add/edit dialog (name and description first, collapsible Advanced configuration), test dialog, delete confirmation, import preview, export, empty/loading/error states, switches with `role="switch"`, dialogs through `useDialogA11y`, logical (RTL-safe) spacing, `l()` strings in en/ar/de |
| Logging | `redactArgsForLog` records only argument names for `custom_*` tools |
| TTS | Watchdog race fix (separate commit) |
| Docs | audit, user guide, developer guide, `AGENTS.md` row and tool-family note, `mcp-tool-development` skill section, README network-connections row |

## 4. Architecture decisions

- One registry: the store is the only source of user tools; `TOOLS` is untouched; no parallel executor (calls go through `ExecutionEngine`).
- Only the `http` type. HTTPS only, public hosts only, redirects refused, pinned connection, size and time limits.
- Approval default is "ask every time"; "read-only" is allowed only for GET/HEAD with no credential and is overridden by strict mode and by an injection suspicion. Without an enforced policy engine, custom tools refuse to run.
- Credentials: separate encrypted file (`NCTS` fallback magic), write-only from the renderer.
- Routing to the main-process executor is by name prefix (see audit D2).
- Edits that change behaviour, including a rename, need explicit confirmation and abort running calls.

## 5. Not implemented

- **External MCP server connections** - needs a client lifecycle, transport/auth handling, imported tool schemas (same injection risk as descriptions) and approval classification for tools King did not define; cannot be tested here. Documented in `custom-mcp-tools.md`.
- **Internal-capability aliases** - would let a user re-label a sensitive built-in as a harmless name.
- **Central runtime schema enforcement for built-in tools** - risk to existing clients; needs its own change.
- **Deleting built-in tools** - by design they can only be disabled; the UI says so.
- **Localised validator messages** - English from the main process.
- **Removing the old `MCP_TOOLS` list** in `McpSection.tsx` - left to avoid redesigning an existing screen; built-ins therefore appear in both lists.
- Phase 5 changes beyond the skill/AGENTS notes: the 55-skill ecosystem and adapters were not changed; **no live agent (Codex, OpenCode, Cursor, Windsurf, Copilot, Claude Code) was run against the Tool Manager**, so no live compatibility is claimed.

## 6. Tests executed (exact results)

| Check | Command | Result |
| :--- | :--- | :--- |
| Typecheck, lint, i18n, strings, Node suites | `npm run verify` (run twice, after the last code change and after the docs) | exit 0; i18n "500 keys in English, Arabic and German"; strings "No hard-coded interface text found"; 1470 `[PASS]` lines |
| New Node suites | inside `verify` | `Custom MCP tools (validation, store, SSRF-safe execution)` PASS; `MCP custom tools (registry, approval, enforcement, persistence)` PASS; `Native TTS controller` PASS |
| Regression proof (TTS) | old `nativeTts.ts` + new test | hangs, killed by `timeout` (exit 124) - the test fails without the fix |
| Production build | `npm run build`, `npm run build:electron` | succeeded |
| Dependency audit | `npm run audit:prod` | found 0 vulnerabilities |
| Electron | `xvfb-run -a npm run test:electron` and the full smoke project including `tool_manager.spec.ts` | 8 passed (7 existing + 1 new) |

What the new tests cover: add; edit with and without confirmation; delete (credential removed, running call aborted, audit record, delete during open approval); duplicate/invalid name; invalid description (short, filler, injection-like); invalid schema/parameters; enable/disable and persistence across restart (Node store, server instance, and real Electron relaunch with the same profile); schema-checked arguments; approval (rejected call sends nothing, strict mode, destination and arguments shown); SSRF (http, userinfo, localhost, `.local`, private/mapped/metadata answers, DNS rebinding mix, empty DNS answer, MCP port, placeholder in host, argument escaping the path); redirects; size limit; timeout; cancellation; credential redaction from output, errors, views, export, files and history; malicious or hand-edited definitions; import preview, duplicates, rollback, size limit; HTTP errors never reported as success.

Not covered by an automated test: the 60 s approval timeout path for custom tools (shared engine code, tested elsewhere), the Arabic RTL layout of the new screen (no screenshot or manual pass), an axe scan of the Settings screen (the existing scan covers onboarding and the shell only), export/import through the real file picker.

## 7. Cross-platform results

| Platform | Status |
| :--- | :--- |
| Linux (container) | Locally tested as in section 6 |
| Windows | **Not tested.** No Windows runner here |
| macOS | **Not tested.** `say`-based TTS cannot run here either (the controller is tested with injected fakes) |
| GitHub CI | **No workflow run exists for this branch** (`actions_list` returned 0 runs after the push); no CI result is claimed. A pull request was not opened because none was requested |
| Packaging / installers | Not run |

Environment limitations: `@electron/get` failed to download the Electron binary through the proxy (an `undici` assertion), so it was downloaded with `curl` from the official release URL and unpacked into `node_modules/electron/dist` by hand (`path.txt` written), outside version control. Node 22.23.4 was used.

## 8. Files changed

New: `electron/main/customTools.ts`, `src/components/settings/McpToolManager.tsx`, `src/types/mcpTools.ts`, `tests/custom_tools.test.ts`, `tests/mcp_custom_tools_integration.test.ts`, `tests/electron/tool_manager.spec.ts`, the audit, report and the two guides.
Modified: `electron/mcpServer.ts`, `electron/main.ts`, `electron/preload.ts`, `electron/main/policyEngine.ts` (log redaction only; classification and approval logic untouched), `electron/main/nativeTts.ts`, `src/components/settings/McpSection.tsx`, `src/vite-env.d.ts`, `tests/runAll.ts`, `tests/native_tts.test.ts`, `tests/mcp_engine_wiring.test.ts` and `tests/mcp_lifecycle_regressions.test.ts` (only to inject the new module into their VM harness), `AGENTS.md`, `README.md`, `.claude/skills/mcp-tool-development/SKILL.md`.

## 9. Risks and remaining work

1. Run CI on Windows and macOS (open a PR when you want it) and test the Tool Manager by hand there, including Arabic.
2. Make a real call against a real HTTPS API with a bearer token and confirm the approval dialog text on all three platforms.
3. Decide whether to fold the old `MCP_TOOLS` list into the manager.
4. Consider translating validator messages (return error codes, translate in the renderer).
5. Decide on external MCP server support after a threat model (`threat-modeling` skill).
6. Review note: `policyEngine.ts` was touched (log redaction). It does not change approval decisions, but the repo asks for a question before changing the approval policy; flagging it for review.
