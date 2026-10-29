---
name: unit-testing
description: "Writing unit tests for King Browser with the existing node:assert runner: one file per concern in tests/, registration in tests/runAll.ts, testing pure modules from electron/main and src/utils, jsdom for components. Use when adding behaviour, fixing a bug, or testing a pure function or hook."
---

# Unit testing

## How the suite works
- `npm test` runs `pretest` (`scripts/ensure-build-artifacts.cjs` builds `dist/` and `dist-electron/` only if missing), then esbuild bundles `tests/runAll.ts` into `dist-test/runAll.cjs` and runs it in plain Node. No Electron binary is needed.
- Test files use `node:assert/strict` at module top level and print `[PASS]` lines; they run in import order inside ONE process. A file not imported in `tests/runAll.ts` never runs.
- React/DOM tests create jsdom globals themselves (see `tests/agent_control_panel.test.ts`, `tests/jsdom_suite_lock.ts`); suites that swap globals are ordered deliberately at the end of `runAll.ts`.
- No Vitest/Jest: a second runner was evaluated and rejected (`docs/engineering/agent-tooling.md`).

## Writing a test
1. Put logic in a pure module (`electron/main/*.ts` must not import Electron at runtime; inject dependencies).
2. Create `tests/<concern>.test.ts`; start with `console.log('\n--- <Concern> ---')`, then asserts. Name the failure a regression test prevents in a comment.
3. Import it in `tests/runAll.ts` near related suites.
4. Run it alone while iterating: `npx esbuild tests/<file>.ts --bundle --platform=node --outfile=dist-test/one.cjs --external:electron && node dist-test/one.cjs`.
5. Run the full suite: async work from one file can affect globals of another.

## Rules
Never skip, delete or loosen an assertion to get green. Avoid real network and real timers where a fake will do.

## Verify
`npm test` (about 2 minutes on a 4-core Linux container including the build; most of it is the Vite build).

## Done when
The new file is registered, fails without the change, and passes with it.
