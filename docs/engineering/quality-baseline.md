# Quality baseline

Measured 2026-10-28 on one machine, to compare later changes against. These numbers describe this environment only. They are not a comparison with other browsers (King has not been benchmarked against other browsers; see README).

## Environment

| Field | Value |
| :--- | :--- |
| OS | Ubuntu 24.04.5 LTS container, Linux 6.18 x64 |
| CPU / RAM | 4 x Intel Xeon @ 2.80 GHz, 16 GB |
| Display | Xvfb (`xvfb-run -a`), software rendering |
| Node / npm | v22.22.0 (below the `^22.22.2` engine range; npm warns `EBADENGINE`) / 10.9.4 |
| Electron | 43.7.7, unpackaged (`electron .` loading `dist/index.html`) |
| King | 0.0.9, base commit `5510d9c` plus this change |

## Checks and durations (wall clock, before this change)

| Command | Result | Time |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | PASS | 16 s |
| `npm run lint` | PASS | 10 s |
| `npm test` (includes a fresh `vite build` of 42 s via `pretest`) | PASS, 1,444 `[PASS]` lines, 0 `[FAIL]` | 117 s |
| `npm audit --omit=dev` | 0 vulnerabilities | - |

## Bundle sizes (`npm run build`)

| Output | Size |
| :--- | :--- |
| `dist/` total | 51.7 MB (of which `dist/assets` 14.9 MB) |
| Largest chunks | `web-llm` 6.0 MB, `aiWorker` 6.0 MB, `transformers.web` 0.59 MB, `index` (app) 0.45 MB, `vendor-supabase` 0.22 MB, CSS 0.21 MB |
| `dist-electron/main.cjs` | 2.0 MB |
| `dist-electron/mcp-bridge.cjs` | 0.71 MB |
| Preloads | `preload.cjs` 16 KB, `webstore-preload.cjs` 16 KB, `guest-preload.cjs` 11 KB |

Commands: `du -sb dist dist/assets`, `du -b dist/assets/* | sort -n | tail`, `ls -l dist-electron/*.cjs`.

## Startup, tabs, memory (`npm run benchmark:startup`, 3 runs, medians)

Workload defined in `tests/electron/startup.perf.ts`; raw output in `test-results/electron/startup-perf.json`.

| Metric | Run 1 | Run 2 | Run 3 | Median |
| :--- | ---: | ---: | ---: | ---: |
| Cold start: launch to React root rendered (fresh profile) | 2063 ms | 2069 ms | 2068 ms | 2068 ms |
| Warm start: launch to address bar visible (same profile) | 2029 ms | 2030 ms | 2015 ms | 2029 ms |
| New tab (Ctrl+T until the strip grows), median of 10 | 49 ms | 40 ms | 39 ms | 40 ms |
| Working set, all processes, after warm start | 774 MB | 781 MB | 780 MB | 780 MB |
| After 20 navigations of one tab (11 tabs open) | 996 MB | 996 MB | 1006 MB | 996 MB |
| After closing 10 tabs and waiting 3 s | 883 MB | 883 MB | 888 MB | 883 MB |

Caveats:
- Unpackaged startup first tries the Vite dev server (`http://localhost:5173`) twice before loading `dist/index.html` (`electron/main.ts`), so both start times include that fallback; a packaged build loads the file directly. Packaged startup was not measured.
- Software rendering under Xvfb; GPU-backed desktops will differ.
- Working set is the sum over all Electron processes from `app.getAppMetrics()`. Memory not returning to the post-start level after closing tabs is expected to some degree (process reuse, caches); it is a lead for `memory-leak-detection`, not a proven leak.
- Not measured: background-tab CPU, AI model initialization (needs model downloads), renderer frame timing.

## Accessibility (`npm run test:electron`, axe-core 4.13)

| Screen | Violations before this change | After |
| :--- | :--- | :--- |
| Onboarding | `color-contrast` (serious, "King Browser Setup" label 4.07:1), `region` (moderate, 4 nodes outside landmarks) | unchanged, tracked as known |
| Browser shell, new tab | `color-contrast` (serious: "AI" pill 2.16:1, task counter 3.83:1), `listitem` (serious: tab items `<li>` without a list) | `listitem` fixed; contrast tracked as known |

Known violations are listed in `KNOWN_VIOLATIONS` in `tests/electron/a11y.spec.ts`; any other rule fails the run. Fixing the contrast items needs design decisions (`DESIGN.md` tokens), so they were not changed here.

## Dependency advisories

- Production: 0.
- Development: 10 high, all `zod <4.6.6` under `@remotion/*` (video tooling, not shipped).
