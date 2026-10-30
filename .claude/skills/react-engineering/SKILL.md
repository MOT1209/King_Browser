---
name: react-engineering
description: "React 18 practice in the King Browser renderer: one-concern hooks, effect cleanup, memoization, state that survives webview churn, no secrets or privileged calls in components. Use when adding or changing a component under src/components, a hook under src/hooks, or renderer state."
---

# React engineering

## Purpose
The renderer is untrusted by the main process, so React code is about correctness and responsiveness, never about enforcing security. Keep components thin and move logic into hooks (`src/hooks`, one concern each) or pure utilities (`src/utils`) that plain Node tests can import.

## Files
`src/App.tsx`, `src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, `eslint.config.mjs` (`react-hooks/exhaustive-deps` is a warning, treat it as an error in new code), `tests/m3_performance_memoization.test.ts`, `tests/tdz_initialization_safety.test.ts`, `tests/hook_architecture_hardening.test.ts`.

## Workflow
1. Find the hook that already owns the concern (`useTabOperations`, `useSettings`, `useDownloads`, ...); extend it before adding a new one.
2. Put decisions in a pure function in `src/utils` and test that; keep the hook a thin wiring layer.
3. Every `addEventListener`, `setInterval`, `setTimeout`, IPC subscription or webview listener registered in an effect is removed in its cleanup (`useSafeTimeout` for timers).
4. Declare hooks and `const` values before first use in the same scope (the TDZ suite exists because this broke once).
5. Memoize only values that cross a memo boundary or feed a dependency array; measure before adding more (`performance-testing`).
6. Reach the main process only through a named `window.electronAPI` function; never read `process`, `require` or Node globals.
7. All visible text through `t()` / `l()`, logical CSS (`ms-`, `me-`, `start-`) for RTL (`localization-rtl`).

## Rules
- No tokens, passwords or keys in component state that is persisted to `localStorage`; secrets stay in the main-process secure store.
- Never render page-supplied HTML with `dangerouslySetInnerHTML` without the sanitizer used by `ReaderMode.tsx`.
- Interactive elements follow `accessibility` (labels, focus trap via `useModalFocusTrap`).

## Verify
`npm run typecheck`, `npm run lint`, `npm run check:strings`, `npm test`; for UI changes also `npm run build && xvfb-run -a npm run test:electron`.

## Common failures
Stale closures from missing dependencies; listeners leaking after a tab closes; effects that re-run on every render because an object literal sits in the dependency array; state initialised from `localStorage` without a try/catch.

## Done when
The change is covered by a test of its pure logic, effects clean up, strings are translated in all three locales and no hook order or TDZ error appears in `npm test`.
