# Test Baseline — Nova Snapshot (King Browser scaffold)

> Purpose: Record the exact test-suite state at the moment King Browser was forked from Nova Browser, so regressions introduced by King Browser work can be told apart from pre-existing upstream behavior.

## Environment

| Field | Value |
|---|---|
| Date | 2026-10-17 |
| Machine | Windows 10/11 (slow build machine — vite prod build ~14 min) |
| Node | v24.19.0 |
| npm | 11.17.0 |
| Electron binary | v43.7.7 (downloaded via `node node_modules/electron/install.js`) |
| Base commit | `778503ca29ae5496119ac59efb73a2abd6caff8a` (Nova `main`) |

## Commands

```bash
npm test              # → npm run test:e2e  (esbuild bundle → node dist-test/runAll.cjs)
```

The suite is a **single-process mega-bundle**: `tests/runAll.ts` imports ~80 test files; most run synchronously during module evaluation in one Node process.

## Result

| Run | Result |
|---|---|
| `npm test` (bundled, full) | **1030 PASS / 2 FAIL**, then the process exits (code 1) mid-suite — no completion marker |
| `tests/challenger_m3_performance_empirical.ts` **standalone** | **23/23 PASS, exit 0** |

## The 2 failures — flaky, environmental (NOT product defects) — RESOLVED 2026-10-18

Both failures are in the "Autocomplete Cancellation" section of `tests/challenger_m3_performance_empirical.ts`:

```
[FAIL] ... Debounce ensures only 1 network fetch executed for rapid burst -> Fetch count: 0, Completed: 0
[FAIL] ... Final query completes cleanly and updates suggestions -> Suggestions: []
```

### Root cause

1. `runMilestone3ChallengerSuite()` starts during module evaluation and reaches an `await` early (test 2.1's 10 s `waitForCompletion` poll). Control returns to the module loader, which then **synchronously evaluates the remaining ~70 test files** — minutes of CPU-blocking work on this machine.
2. During that time the event loop is blocked, so the suite's own timers (50 ms debounce) cannot fire.
3. When the loop finally unblocks, the poll timer's first callback checks `Date.now() - start > 10000` against wall-clock time that already advanced minutes → it gives up immediately, **before** the debounce timer gets its turn. fetchCount is still 0 → false FAIL.
4. The file then calls `process.exit(1)` (its designed "CHALLENGE VERDICT: REQUEST_CHANGES" gate at line ~691), which **kills the entire test process** — explaining why the run ends without a completion marker.

### Proof it is environmental

Running the same file standalone (free event loop, no bundle starvation):

```bash
npx esbuild tests/challenger_m3_performance_empirical.ts --bundle --platform=node --outfile=dist-test/m3standalone.cjs
node dist-test/m3standalone.cjs
# → TOTAL: 23, PASSED: 23, FAILED: 0 — CHALLENGE VERDICT: APPROVE
```

## Resolution (2026-10-18)

Both false failures are fixed at the harness level. Waits are now **drain-tolerant**: after the wall-clock deadline they still grant a bounded grace window of event-loop turns, so timers that expired while the loop was blocked get their turn before the wait gives up. No wait was shortened.

- `tests/challenger_m3_performance_empirical.ts` — `waitForCompletion` / `waitForInFlight` (200 grace polls after the deadline).
- `tests/execution_engine.test.ts` — new `waitUntil` helper, also used for the post-timeout queue-continuation check (previously a single-`flush` race).

Verified: full bundled suite `npm test` → **1166 PASS / 0 FAIL, exit 0** (`dist-test/full_run6.txt`), plus 3× standalone runs green for both suites. The runner also no longer dies mid-suite — the challenger's `process.exit(1)` gate became `process.exitCode = 1` during the exit-code audit.

## Consequences for King Browser development

1. **Baseline = fully green** (`dist-test/full_run6.txt`: 1166 PASS / 0 FAIL). After the drain-tolerant wait fixes, any failure is a regression candidate; confirm reproducibility standalone on the affected file.
2. **Prefer per-file runs during development** (`npx esbuild tests/<file> … && node …`) — the mega-bundle runner is slow and its timing-sensitive files are unreliable on this machine.
3. If the suite aborts before finishing, that is the M3 challenger's `process.exit(1)` — inspect its summary block at the tail of the log to see the triggering checks.
4. The 2 tests were fixed by making their waits drain-tolerant (bounded grace after the deadline) — never by shortening waits.
