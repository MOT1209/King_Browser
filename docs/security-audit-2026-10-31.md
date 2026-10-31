# Security audit - October 31, 2026

Source-based review of `main` at `2cef169`. It covers the code that changed most recently and the areas earlier reviews listed as not covered. It is not an independent audit; see "Not verified".

## 1. Supplied findings list: checked, not applicable

The audit request came with a findings table that marked twelve items as already fixed on named branches. Each claim was checked against the code. None describes this repository, and the named branches do not exist. They are recorded here so the claims are not acted on later.

| Claim | Evidence in the repository |
| :--- | :--- |
| `nodeIntegration: true` in `main.ts` | Not present. Every window and webview sets `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` (`electron/main.ts`, `electron/windows/sourceViewer.ts`); `will-attach-webview` forces the same. Runtime-checked by `tests/electron/smoke.spec.ts`. |
| Preload exposes too much | One `contextBridge.exposeInMainWorld('electronAPI', ...)` of named wrappers, no raw `ipcRenderer`; `guest-preload.ts` exposes nothing. |
| IPC handlers without sender checks (`ipcRenderer.ts`) | No such file. `tests/ipc_sender_guard_coverage.test.ts` fails on any `ipcMain` handler under `electron/` that does not call `isTrustedSender` first. |
| MCP server bound to `0.0.0.0` | `electron/mcpServer.ts` listens on `127.0.0.1` with a bearer token and Host/Origin checks. |
| Real key in `.env.example` | Only placeholder values for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. |
| No SSRF checks (`utils/network.ts`) | No such file. Main-process fetches go through `electron/main/previewFetch.ts`: public addresses only, connection pinned to the validated address, each redirect hop revalidated. |
| Undocumented E2EE service (`e2ee.service.ts`) | No such file. `src/services/syncCrypto.ts`: PBKDF2-SHA256 at 600,000 iterations, AES-GCM-256, random 16-byte salt and 12-byte IV per envelope, version strictly `2`. |
| No CI, CodeQL, SECURITY.md, CONTRIBUTING.md | All present: `.github/workflows/ci.yml` (Linux, Windows, macOS, Electron e2e), `codeql.yml`, SHA-pinned actions, both documents. |
| Dependabot missing | Present and deliberately muted (see section 4). |
| `TabManager.tsx` needs Jest tests | No such file; the project uses its own `node:assert` runner (`tests/runAll.ts`). |
| `window.open` without `rel=noopener` | `rel` does not apply to `window.open`. The main window's `setWindowOpenHandler` (`electron/main.ts`) denies every popup and sends only http(s) URLs to a normal tab. |

## 2. Baseline (before changes)

Run in a Linux container, Node 22.23.4.

| Check | Result |
| :--- | :--- |
| `npm run typecheck`, `lint`, `check:i18n`, `check:strings` | PASS |
| `npm test` | PASS (after `node node_modules/electron/install.js`; the first run failed only because the Electron binary was missing after `npm ci --ignore-scripts`) |
| `npm run audit:prod` | PASS, 0 vulnerabilities |

## 3. Findings

| ID | Severity | Location | Finding | Status |
| :--- | :--- | :--- | :--- | :--- |
| A1 | P1 (medium) | `electron/main/customTools.ts` `buildRequest` | Dot-segment path escape in custom MCP tools: an argument of `..` or `.` survives `encodeURIComponent`, and URL parsing removes the segment, so a call could reach another path on the approved host. A read-only tool ran this without a dialog. | Fixed; regression tests in `tests/custom_tools.test.ts` and `tests/mcp_custom_tools_integration.test.ts` |
| A2 | P2 (low) | `electron/mcpServer.ts` `executeCustomTool` / `runCustomToolInMain` | Approval was not bound to the definition: an edit saved while the approval dialog was open ran under the earlier approval. Only the local user can edit tools, which limits the impact. | Fixed; regression test in `tests/mcp_custom_tools_integration.test.ts` |

| A3 | P2 (low) | `electron/main/mcpStreamableHttp.ts` `isLocalOrigin`, CORS in `electron/mcpServer.ts` | MCP Origin and CORS checks accepted any `king:` origin and any scheme on a loopback host; no King page calls the MCP port. The token was still required, so no exploit path is known. | Fixed at the owner's request; regression test in `tests/mcp_streamable_http.test.ts` (review item F3) |

Details: `docs/engineering/security-review.md`, F3 and F6.

Reviewed with no defect found: the custom-tool SSRF path (DNS pinning works because `cross-fetch` uses node-fetch, which honours `agent`; redirects refused; header and auth-header names checked against a deny list), the main-window `window.open` routing, `syncCrypto.ts`, the RLS policies and pairing function in `supabase_schema.sql` (`security definer` with a fixed `search_path`; atomic single-use consumption), and `updateIntegrity.ts`.

Second pass, no defect found: CRX extraction in `crxInstaller.ts` (entries checked for drive, UNC, absolute and `..` paths before extraction, a containment and symlink sweep after it, atomic staging), downloads in `downloads.ts` (realpath before the Downloads containment test, filename sanitising including DOS device names), and engine IPC in `engineIpc.ts` (allowlisted commands, typed payloads). Observation, not changed: `registerEngineIpc` treats `isTrustedSender` as optional so tests can omit it, which fails open if a future caller forgets it; `main.ts` passes it today. Making it required touches the IPC trust model.

## 4. Owner decisions (not code defects)

- **Dependabot**: decided 2026-10-31. Version updates stay off; the `ignore` rules that also blocked security updates were removed. Security updates must still be enabled in the repository settings (not checked from here).
- **Sync rollback.** The envelope is not bound to a version counter or the user id (no AES-GCM associated data), so whoever controls the server row could serve an older envelope of the same user. Changing this changes the sync encryption format, which AGENTS.md reserves for the owner.
- **Update trust root.** `updateIntegrity.ts` proves the download matches the release metadata, not who published it; that depends on code signing, whose status was not checked here.
- **Legacy SSE MCP transport** remains as extra surface; removing it would break clients that use `/sse`, so it is a compatibility decision and was not changed.
- **Sync rollback** was not addressed in this pass: it needs a new envelope format and a migration for existing vaults, which should not be rushed.

## 5. Not verified

No Windows or macOS run, no packaged binary (fuses), no live Supabase project, no real MCP client against a running app, and no Electron e2e run in this container for this change (the change is confined to main-process modules covered by Node tests).
