# Source-based security review notes

Date: 2026-10-28. Scope: the areas below, reviewed by reading the source at commit `5510d9c` plus the changes made alongside this document, and by running the checks named in each row. This is an engineering review by a coding agent, not an independent security audit; King has had no independent audit (README). Absence of a finding here does not mean absence of a vulnerability.

## Method

1. Read the controls in each area and the tests that cover them.
2. Ran: `npm test` (all security suites), `npm run audit:prod`, `npx -y @doyensec/electronegativity@1 -i electron` (one-off), `npx -y madge@8 --circular` (one-off), and the new runtime checks in `tests/electron/` against the built app on Linux under Xvfb.
3. Added static guards where a rule existed only as a comment or as a fixed list (see "Changes").

## Summary by area

| Area | Controls found | Verified by | Result |
| :--- | :--- | :--- | :--- |
| IPC handlers | `isTrustedSender` first in every handler; one delegated handler (`install-from-webstore`) with a narrower Web Store frame rule | New `tests/ipc_sender_guard_coverage.test.ts`: all 90 handlers under `electron/` | No unguarded handler found |
| Preload exposure | Only `preload.ts` calls `exposeInMainWorld`; guest preload uses `sendToHost` only | grep; runtime check that a guest page sees no `electronAPI`, `require`, `process` | As designed |
| BrowserWindow / webview prefs | Hardened prefs on every window; `will-attach-webview` forces them on guests and allowlists partitions | Runtime `getLastWebPreferences()` of main window and a live guest: `nodeIntegration false`, `contextIsolation true`, `sandbox true`, `webSecurity true` | As designed |
| CSP | Production policy in `vite.config.ts` and `electron/main.ts`; `script-src 'self' 'wasm-unsafe-eval'` | New `tests/csp_parity.test.ts` (copies identical, built file matches, no inline/eval/remote script sources); runtime check of the loaded page | Copies were identical; now enforced |
| Navigation / openExternal | Shared validators; `open-external` https-only to public hosts; all 7 `shell.openExternal` call sites reviewed (fixed OS settings URIs, validated release URLs, `canOpenInSystemBrowser`) | Existing suites; manual review | No unvalidated call site |
| SSRF / DNS rebinding | IP classification, renderer literal check, main-process DNS check for agent navigation, MCP Host header check | Existing suites (`ssrf_ip_policy`, `agent_navigation_guard`, `mcp_streamable_http`) | As designed |
| Downloads and files | Realpath containment in Downloads, filename sanitizing, confirmation before opening script-capable documents, atomic secure-store writes | Existing suites | As designed |
| Extensions | Sender rule, ID validation, zip extraction rejects drive/UNC/absolute/`..` paths, containment, entry and size caps, post-extraction symlink check, permission review, incognito opt-in | Existing suites | As designed |
| MCP server | 127.0.0.1 bind, Host allowlist, local-only CORS, bearer token with `timingSafeEqual`, 120 req/min limit, tool tiers, policy engine and approval gate | Existing suites | See F3 |
| Secrets and logs | `safeStorage` with AES-GCM fallback and warning, redaction helpers, dev-only renderer console echo with sanitizing | Existing suites; grep | As designed |
| Local AI model cache | Files named by SHA-256 of the URL under `userData/models`; per-file and total quota; stale temp reclaim with age gate | Quota tests (in `tests/update_integrity.test.ts`) and review | As designed |
| Sync encryption | E2E envelope v2 (`syncCrypto.ts`) | Existing suites only; format not reviewed in depth | Not reviewed in depth |

## Findings

### F1. Linux sandbox is disabled when unprivileged user namespaces are off (decision needed)

`electron/main.ts` appends `--no-sandbox` when running as root (Chromium requires it) and also when `/proc/sys/kernel/unprivileged_userns_clone` is `0`. In the second case Chromium could instead use its setuid sandbox helper if `chrome-sandbox` is installed setuid root (as `.deb` packages usually do), keeping renderer sandboxing. The app warns the user, so the trade-off is visible, but the fallback is broader than necessary for installs where the helper is configured.

Status: not changed. Changing sandbox fallback behaviour affects which systems can start the app at all; needs the owner's decision and testing on the affected distributions. Possible direction: only fall back when the helper is not setuid root.

### F2. electronegativity findings (all reviewed)

| Check | Location | Verdict |
| :--- | :--- | :--- |
| REMOTE_MODULE_JS_CHECK (3) | `BrowserWindow` in `main.ts` (main, OAuth popup), `windows/sourceViewer.ts` | False positive: the `remote` module was removed in Electron 14; the tool assumed Electron 0.1 because it could not detect the version. |
| AUXCLICK_JS_CHECK (3) | same windows | Low. Middle-click opens go through the same `setWindowOpenHandler` and rate limiter as other opens. |
| OPEN_EXTERNAL_JS_CHECK (7) | `main.ts` | Reviewed each: fixed OS-settings URIs, release URLs validated against the official repository path, `canOpenInSystemBrowser`, `open-external` IPC checks. No unvalidated input. |
| CUSTOM_ARGUMENTS_JS_CHECK (4) | `main.ts` switches | Performance switches are benign; `no-sandbox` is F1. |
| PROTOCOL_HANDLER_JS_CHECK | `setAsDefaultProtocolClient('king')` | Informational; `king:` URLs are matched against an exact allowlist before being trusted. |
| PRELOAD_JS_CHECK | main window preload | Informational; reviewed under "Preload exposure". |
| CSP_GLOBAL_CHECK | `main.ts` header | Tool could not parse a template literal; CSP is checked by `csp_parity` instead. |

### F3. MCP CORS accepts any `king:` origin (informational)

The CORS middleware in `electron/mcpServer.ts` reflects an `Origin` whose protocol is `king:` regardless of host. No web content can present a `king:` origin (internal pages render inside the app's `file://` window), and every request still needs the bearer token, so there is no known exploit path. Tightening it to the exact internal pages would match `trustedSender.ts`. Not changed: it touches the MCP trust model, which AGENTS.md reserves for the owner.

### F4. Accessibility defect fixed: tab strip list items without a list

`src/components/TopBar.tsx` rendered tab items as `<li>` inside a `div` group (axe `listitem`, serious). Fixed by rendering items as `div` (`as="div"`); `tests/electron/a11y.spec.ts` failed before the fix and passes after (verified by reverting and rebuilding).

### F5. Dev-only dependency advisories (informational)

`zod <4.6.6` (GHSA-mrhx-c7xc-m3w5) inside `@remotion/*` video tooling. Not shipped; production audit is clean.

## Changes made with this review

- `tests/ipc_sender_guard_coverage.test.ts`: every IPC handler under `electron/` must call a sender guard as its first statement. Self-tests prove it flags an unguarded handler, a late guard and an uninspectable named handler.
- `tests/csp_parity.test.ts`: the two production CSP copies and the built `dist/index.html` must be identical; `script-src` must not gain inline, eval or remote sources. Verified to fail on a mutated copy.
- `tests/electron/smoke.spec.ts`: runtime webPreferences, guest isolation and CSP of the running app.
- CI: blocking production dependency audit; CodeQL workflow; SHA-pinned actions in `ci.yml` and `codeql.yml`.

## Not covered

Packaged builds (fuses were not verified on a packaged binary in this review), macOS and Windows runtime behaviour, sync protocol and Supabase policies (`supabase_schema.sql`), update server trust beyond `updateIntegrity.ts`, real extension behaviour, and real-site behaviour of the adblocker.
