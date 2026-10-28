---
name: ipc-security
description: "IPC hardening for King Browser: sender validation with isTrustedSender, payload validation, channel allowlists, sendToHost from guests. Use when adding, changing or reviewing any ipcMain.handle/on, ipcRenderer call, preload method or engine IPC channel."
---

# IPC security

## Purpose
Only the privileged app UI may invoke privileged main-process actions, with validated arguments.

## Facts
- `electron/security/trustedSender.ts`: `isTrustedSender(event)` requires the sender to be the main window's webContents, its main frame, and an app origin (`dist/index.html` file URL, exact internal `king://` pages, `http://localhost:5173` only when unpackaged). Tested in `tests/trusted_sender_policy.test.ts`.
- Handlers live in `electron/main.ts` and in modules that receive the check by injection (`downloads.ts`, `suggestions.ts`, `mcpBridge.ts`, `engineIpc.ts` via `assertTrusted`).
- `install-from-webstore` is the one delegated exception: `crxInstaller.installFromWebstore` also accepts the top-level Chrome Web Store frame.
- Guests never get `ipcRenderer.invoke` to main; `guest-preload.ts` uses `ipcRenderer.sendToHost` only, which lands in the renderer that owns the webview.
- `tests/ipc_sender_guard_coverage.test.ts` scans every handler under `electron/` and fails unless the first statement is a sender check.

## Adding a channel
1. Handler: first statement `if (!isTrustedSender(event)) return <safe failure>;` (or `assertTrusted(event)` in engine IPC).
2. Treat every argument as `unknown`: check type, length bounds, enum membership; reject rather than coerce.
3. Return data, not capabilities: never return file handles, raw tokens, or decrypted secrets the UI does not need.
4. Preload: expose one narrow function per action in `electron/preload.ts` (see `preload-security`); never expose `ipcRenderer` itself or a generic `invoke(channel, ...)`.
5. Renderer: call through `src/utils/electronBridge.ts` patterns already used nearby.
6. Test: a unit test for the validation logic, and rely on the coverage test for the guard. If the channel is security-critical, add it to the list in `tests/security_regression_audit.test.ts`.

## Verify
`npm test` (coverage test lists any unguarded handler with file:line), `npm run build:electron`.

## Done when
The guard is first, inputs are validated, the preload surface grew by one named function at most, and tests pass.
