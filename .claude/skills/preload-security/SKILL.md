---
name: preload-security
description: "Preload script rules for King Browser (preload.ts, guest-preload.ts, webstore-preload.ts): minimal contextBridge surface, no raw ipcRenderer, no Node globals to pages. Use when adding or changing anything exposed to a renderer or web page through a preload."
---

# Preload security

## Purpose
The preload is the only door between untrusted JavaScript and Electron. Keep it narrow.

## The three preloads
| File | Loaded into | Exposes |
| :--- | :--- | :--- |
| `electron/preload.ts` | Main window only | `window.electronAPI` via `contextBridge.exposeInMainWorld` (about 110 named functions) |
| `electron/guest-preload.ts` | Every web page (webview) | Nothing in the page world; isolated listeners for password-form capture, link hover, login-field focus, reported with `ipcRenderer.sendToHost` |
| `electron/webstore-preload.ts` | Chrome Web Store pages only (chosen in `will-attach-webview`) | Install button integration calling `install-from-webstore` |

## Rules
- Expose named functions with fixed channels, never `ipcRenderer`, `invoke(channel)`, `require`, `process`, or event objects (an `IpcRendererEvent` leaks `sender`).
- Listener helpers return an unsubscribe function and strip the event argument before calling back.
- Guest preload: nothing goes into the main world. Data read from pages is untrusted; size-limit and type-check it before `sendToHost`. Never send password values unless the user flow requires it (password save prompt) and never log them.
- A new preload method needs a matching guarded `ipcMain` handler (see `ipc-security`).

## Workflow
1. `grep -n "exposeInMainWorld" electron/*.ts` to confirm only `preload.ts` exposes an API.
2. Add the method next to related ones; keep argument types primitive.
3. Rebuild: `npm run build:electron` (preloads are bundled to `dist-electron/*.cjs`).
4. Runtime check: `tests/electron/smoke.spec.ts` asserts the main window has `electronAPI` and no `require`/`process`, and that a guest page sees no `electronAPI`, `require` or `process`.

## Verify
`npm run build:electron && npm test`, then `npm run build && xvfb-run -a npm run test:electron`.

## Done when
The exposed surface grew only by what the feature needs, and guest pages still see nothing privileged.
