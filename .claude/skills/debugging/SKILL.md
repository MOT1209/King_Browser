---
name: debugging
description: "Systematic debugging for King Browser: reproduce, isolate the process (main, preload, renderer, guest, MCP), find the root cause, fix with a regression test. Use when a test fails, the app misbehaves, Electron crashes or an agent action does something unexpected."
---

# Debugging

## Purpose
Find the real cause, fix it once, and leave a test that keeps it fixed.

## Workflow
1. Reproduce. Capture the exact error and the command. For the test suite: `npm test` bundles everything into `dist-test/runAll.cjs`; to run one file alone, `npx esbuild tests/<file>.ts --bundle --platform=node --outfile=dist-test/one.cjs --external:electron && node dist-test/one.cjs`.
2. Decide which process fails:
   - Main: terminal output of `npm run dev`; `electron/main/crashLog.ts` and `rendererRecovery.ts` handle crashes.
   - Renderer: DevTools of the main window (dev builds); renderer console lines are echoed to the terminal in unpackaged builds.
   - Guest page: the tab's DevTools; guest-preload messages arrive via `ipc-message` on the webview.
   - MCP: `browser_status`, the activity log (`electron/main/activityLog.ts`), and `tests/integration/agent_e2e.mjs`.
3. Classify the cause: your change, existing code, environment (Node version, missing Electron binary, no display), or external dependency.
4. Write a failing test that names the failure (see `regression-testing`), then fix the smallest thing.
5. Re-run the failing test, then `npm test`.

## Known environment traps
- `npm ci` fails on `onnxruntime-node` postinstall without internet; CI uses `npm ci --ignore-scripts` and fetches Electron with `node node_modules/electron/install.js`.
- Electron under Linux needs a display: `xvfb-run -a`. As root it switches to `--no-sandbox` itself (`electron/main.ts`, with a warning).
- Unpackaged Electron first tries `http://localhost:5173` and falls back to `dist/index.html`; stale `dist/` means you test old UI. Rebuild with `npm run build`.

## Safety
Never fix by deleting or weakening a test or a security check (AGENTS.md).

## Verify
The new regression test fails without the fix and passes with it; then `npm test` (and `npm run test:electron` for UI or main-process bugs).

## Done when
A test reproduces the bug and now passes, the full suite passes, and the root cause is stated in the commit message.
