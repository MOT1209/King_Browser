---
name: performance-testing
description: "Measuring King Browser performance repeatably: startup, tab creation, memory after navigation, bundle sizes, test duration, V8 micro-benchmarks and Speedometer. Use before and after any optimization, when a change may affect startup, memory or bundle size, or when someone asks for performance numbers."
---

# Performance testing

## Tools in the repo
- `npm run benchmark:startup`: Playwright `perf` project (`tests/electron/startup.perf.ts`). Cold start, warm start, Ctrl/Cmd+T latency, working set after start, after 20 navigations and after closing tabs; median of `KING_PERF_RUNS` (default 3). Writes `test-results/electron/startup-perf.json` with OS, CPU and Node version. Needs `npm run build` and a display.
- `npm run benchmark`: V8 runtime state and tab allocation micro-benchmarks (`tests/benchmark_suite.ts`).
- `npm run benchmark:speedometer`: Speedometer inside Electron (`scripts/speedometer_runner.ts`); needs internet.
- Bundle sizes: after `npm run build`, `du -b dist/assets/* | sort -n | tail` and `ls -l dist-electron/*.cjs`.
- Profiling: Chromium DevTools Performance and Memory panels on the main window (unpackaged build), heap snapshots via `--inspect` on the main process (`npm run dev` then `chrome://inspect`).

## Method
1. Baseline first on the same machine, same build mode, quiet system; record environment.
2. Change one thing; measure again with the same workload and run count.
3. Report medians and run counts, not best runs. Say which OS and hardware.
4. The baseline in `docs/engineering/quality-baseline.md` came from a 4-core Linux container under Xvfb; it is not representative of user hardware.

## Rules
Do not claim a percentage improvement without before and after numbers from the same setup. README says King has not been benchmarked against other browsers; keep it that way unless such a benchmark is actually run.

## Verify
`npm run benchmark:startup` (with `npm run build` first) and the bundle size commands above, before and after the change, on the same machine.

## Done when
Before/after numbers with environment and method are in the PR or docs.
