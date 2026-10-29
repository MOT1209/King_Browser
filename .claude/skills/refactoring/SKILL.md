---
name: refactoring
description: "Behaviour-preserving refactoring in King Browser, such as extracting logic from electron/main.ts or src/App.tsx into tested modules. Use when restructuring code without changing behaviour, moving code between files, or splitting large components and hooks."
---

# Refactoring

## Purpose
Improve structure without changing behaviour, provably.

## When to use
Extracting from `electron/main.ts` (about 6.8k lines) or `src/App.tsx`, splitting `src/components/TopBar.tsx` or `src/hooks/useBrowserAgentBridge.ts`, renaming across modules.

## Workflow
1. Pin current behaviour first: find the tests that cover the code (`grep -l` the function names in `tests/`). If none exist, write characterization tests before moving anything.
2. Move code verbatim first (pure code motion), in its own commit. `src/hooks/useTabHibernation.ts` documents this pattern ("pure code motion" from App.tsx).
3. Only then improve the moved code, in a separate commit.
4. Keep security checks in place during the move: an extracted IPC handler still calls `isTrustedSender(event)` first (enforced by `tests/ipc_sender_guard_coverage.test.ts`).
5. Imports into `electron/main/*.ts` must not import `electron/main.ts` back (it boots Electron on import); inject dependencies instead (see `initDownloads(send, trustedSenderCheck)`).
6. Watch for module-init-order problems: `tests/tdz_initialization_safety.test.ts` exists because of them.

## Safety
No behaviour change hidden inside a refactor commit. Do not refactor and fix a bug in the same commit.

## Verify
`npm run verify`; for main-process moves also `npm run build:electron` and, where available, `npm run build && xvfb-run -a npm run test:electron` (or without xvfb on macOS/Windows).

## Done when
The same tests pass before and after, the diff of the motion commit is moves only, and no security check was lost.
