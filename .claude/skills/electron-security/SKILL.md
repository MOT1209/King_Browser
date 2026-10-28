---
name: electron-security
description: "Electron hardening review for King Browser: BrowserWindow and webview webPreferences, sandbox, contextIsolation, nodeIntegration, will-attach-webview, window.open, permissions, fuses and command-line switches. Use when creating or changing any BrowserWindow, webview, session, permission handler, app.commandLine switch or packaging option."
---

# Electron security

## Purpose
Keep the process boundaries that make a browser safe to point at hostile pages.

## Non-negotiable (CLAUDE.md hard rule 2)
`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on every window and webview. No `webSecurity: false`, no `allowRunningInsecureContent`, no `experimentalFeatures`.

## Where the controls are
- Main window: `new BrowserWindow` in `electron/main.ts` (search `webPreferences`), `webviewTag: true` is required for tabs.
- Every `<webview>`: `contents.on('will-attach-webview', ...)` in `electron/main.ts` forces secure prefs, rejects unknown partitions (only `''`, `incognito-<id>`, `persist:king-agent`), and picks `guest-preload.cjs` or `webstore-preload.cjs`.
- Popups: `setWindowOpenHandler` (main window and guests), rate limited per webContents; `electron/main/windowOpenPolicy.ts` decides real popup versus tab; overrides set `session: contents.session` so incognito popups do not use the normal profile.
- Navigation: `will-navigate` handlers (main window may only stay on the app origin; see `url-navigation-security`).
- Permissions: `setPermissionRequestHandler` / `setPermissionCheckHandler` per session, fail closed; prompts in `src/hooks/usePermissionRequests.ts`.
- Other windows: `electron/windows/sourceViewer.ts`, the OAuth popup window near the end of `main.ts`; same prefs required.
- Fuses: `scripts/apply-fuses.cjs` (electron-builder `afterPack`) flips RunAsNode, NODE_OPTIONS, inspect args, file-protocol privileges off and cookie encryption, asar-only and asar integrity on. Dev runs (`npm run dev`) are NOT fused.
- Command-line switches near the top of `main.ts`. Known, deliberate exception: on Linux `no-sandbox` is appended when running as root or when `/proc/sys/kernel/unprivileged_userns_clone` is `0`, with a user warning. Changing that is a policy decision for the owner.

## Workflow
1. For any new window or webContents, copy the hardened prefs block; never inherit defaults.
2. Grep your diff for `webPreferences`, `appendSwitch`, `setPermission`, `setWindowOpenHandler`, `partition`.
3. Run the static tests (`tests/securityHardening.test.ts`, `tests/security_regression_audit.test.ts`, `tests/session_isolation.test.ts`, `tests/window_open_policy.test.ts`) via `npm test`.
4. Verify at runtime: `npm run build && xvfb-run -a npm run test:electron` reads `getLastWebPreferences()` of the main window and a live guest (`tests/electron/smoke.spec.ts`).
5. Optional scanner: `npx -y @doyensec/electronegativity@1 -i electron`. It assumes Electron 0.1 when it cannot detect the version, so REMOTE_MODULE and similar findings are false positives on Electron 43; validate every finding against the source and record the verdict in `docs/engineering/security-review.md`.

## Verify
`npm test`, `npm run build:electron`, then `npm run build && xvfb-run -a npm run test:electron`.

## Done when
Static and runtime checks pass, no new switch or pref weakens isolation, and any new window is covered by a test.
