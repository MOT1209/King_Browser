---
name: regression-testing
description: "Regression tests in King Browser: reproduce the bug as a failing test first, name the failure it prevents, prove the test is not vacuous, and keep it in the suite. Use for every bug fix, and when reviewing a fix that arrived without a test."
---

# Regression testing

## Workflow
1. Reproduce the bug with the smallest test that fails on current code. Put it in the suite for that concern (or `tests/<concern>_regressions.test.ts`; several exist, such as `mcp_lifecycle_regressions`, `rtl_overlay_regressions`, `permission_boundary_regressions`).
2. Comment the failure it prevents in one or two sentences (user-visible symptom, not just the function name).
3. Fix the code; the test passes.
4. Prove it: undo the fix (or mutate a copy) and watch the test fail, then restore. For UI regressions caught by Playwright, rebuild between the two runs.
5. Register the file in `tests/runAll.ts` (Node suite) or place it under `tests/electron/` (runtime suite).
6. Run the full suite.

## Rules
A fix without a test needs a written reason (for example, only reproducible on real hardware) and a manual verification note. Never change an existing assertion to match new behaviour without stating why the old expectation was wrong.

## Verify
`npm test`; `npm run test:electron` for runtime regressions.

## Done when
The test failed before the fix, passes after, and is part of the default run.
