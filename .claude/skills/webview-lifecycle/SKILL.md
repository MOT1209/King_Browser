---
name: webview-lifecycle
description: "Lifecycle of the <webview> guests that render web pages in King Browser: attach, partition selection, preload choice, navigation events, crashes, suspension and destruction. Use when changing BrowserView.tsx, webview event wiring, will-attach-webview, renderer recovery or tab suspension."
---

# Webview lifecycle

## Facts
- Tabs render as `<webview>` elements (Electron `webviewTag: true` on the main window), created in `src/components/BrowserView.tsx`; navigation helpers in `src/hooks/useWebviewNavigation.ts`.
- Attach: `will-attach-webview` in `electron/main.ts` forces secure prefs, validates the partition (`''`, `incognito-<id>`, `persist:king-agent`), hardens incognito partitions, selects `guest-preload.cjs` or `webstore-preload.cjs`.
- Per-guest wiring: `app.on('web-contents-created')` sets window-open handling with rate limiting, `will-navigate`, context menu, downloads.
- Crashes: `render-process-gone` -> `electron/main/rendererRecovery.ts` decides whether to reload (not during quit or update install); `tests/renderer_recovery.test.ts`.
- Suspension: a suspended tab has no webview; `tabManager.ts` decides which tabs stay live.

## Rules
- Never attach a webview with a partition outside the allowlist; never set `nodeintegration` or `disablewebsecurity` attributes.
- Remove listeners you add to a webview or its webContents when the tab unmounts; leaks show up as growing memory after repeated navigation.
- `webContentsId` is a runtime handle; re-read it after re-attach.

## Verify
`npm test` (`session_isolation`, `renderer_recovery`, `tab_download_lifecycle_regressions`, `history_recorder_lifecycle`), then `npm run build && xvfb-run -a npm run test:electron` (guest prefs at runtime) and, for leak suspicions, `npm run benchmark:startup` (memory after 20 navigations).

## Done when
Guests attach only with hardened prefs, listeners are cleaned up, and crash recovery behaves as tested.
