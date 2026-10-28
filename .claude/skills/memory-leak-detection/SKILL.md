---
name: memory-leak-detection
description: "Finding memory leaks in King Browser: repeated-navigation and tab open/close workloads, app.getAppMetrics working sets, heap snapshots of the renderer and main process, common leak sources (listeners on webviews, timers, IPC subscriptions, caches). Use when memory grows over time, after adding listeners or caches, or when tab closing does not release memory."
---

# Memory leak detection

## Workload
`npm run benchmark:startup` records working-set memory after start, after 20 navigations of one tab, and after closing 10 tabs. Growth that does not come back after closing tabs and waiting is a lead, not a proof (Chromium caches and process reuse also hold memory).

## Investigation
1. Renderer: DevTools Memory panel on the main window (unpackaged build). Take a heap snapshot, run the workload (open/close 20 tabs), force GC, take another, compare "Objects allocated between snapshots" and look for detached DOM nodes and growing arrays/maps.
2. Main process: `electron --inspect=9229 .` (dev only; fuses disable this in packaged builds), connect from `chrome://inspect`, compare snapshots of Maps keyed by webContents id.
3. Per-process numbers: `app.getAppMetrics()` from Playwright (`readWebContentsSecurity` shows how to evaluate in main).

## Usual suspects here
- Listeners added to `<webview>` or webContents without removal on unmount (`BrowserView.tsx`, `useWebviewNavigation.ts`).
- Per-webContents Maps in main without a `destroyed` cleanup (the popup rate limiter shows the correct pattern: `contents.once('destroyed', ...)`).
- `ipcRenderer.on` subscriptions from preload helpers not unsubscribed in hook cleanups.
- Unbounded caches: link previews (`tests/link_preview_lru.test.ts` shows the LRU pattern), suggestion cache, thumbnail cache, console buffers.
- Intervals without `clearInterval` (hibernation tick, safe timeouts via `src/hooks/useSafeTimeout.ts`).

## Verify
`npm run benchmark:startup` before and after the fix with the same `KING_PERF_RUNS`; the memory after closing tabs no longer grows between runs.

## Done when
The leak has a cause, a fix with cleanup, and a before/after measurement with the same workload.
