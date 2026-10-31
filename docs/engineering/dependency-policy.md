# Dependency policy

When a package may be added to King Browser, how it is chosen, and how the existing set was audited. Written 2026-10-30. The skill `dependency-management` is the short checklist; per-package decisions and their evidence are recorded in [agent-tooling.md](agent-tooling.md) section 3, which this page does not repeat.

## Rules

1. **Search first.** Check `package.json`, `node_modules` and the code for something that already does the job. A new package needs a demonstrated benefit, not a plausible one.
2. **Runtime versus dev.** `dependencies` holds only what the packaged main process loads (today: the ad blocker, `cross-fetch`, `electron-updater`, `express`, `express-rate-limit`, `jsdom`). Everything bundled into the renderer or used for tests and tooling is a `devDependency`.
3. **Pin by evidence.** Choose a release at least two weeks old, check the licence (`npm view <pkg> license`), the maintenance state (last release, open advisories) and the Electron 43 and Node `^22.22.2 || ^24.15.0` compatibility.
4. **Install with the lockfile.** `npm install -D --ignore-scripts <pkg>@<range>`, then read `git diff package-lock.json`. A package with an install or postinstall script needs a stated reason.
5. **Record it.** Name, purpose, why existing tools were not enough, licence, classification and a verification command go into `agent-tooling.md`.
6. **Network.** A package that adds an outbound destination also updates the "Network connections" table in `README.md` and the CSP (hard rule 8). No analytics or crash-reporting SDKs.
7. **Remove what is unused**, but only with the owner's confirmation when the package may be planned for use.

## Audit of the candidates in the 2026-10-30 request

Evidence comes from `agent-tooling.md` (measured 2026-10-28) and this session's checks. No package was added in this change.

| Candidate | Decision | Reason |
| :--- | :--- | :--- |
| Playwright, `@playwright/test`, `@axe-core/playwright`, `axe-core` | Retained | Already installed as devDependencies; drive the real Electron app and the accessibility scan |
| ESLint, typescript-eslint, `eslint-plugin-react-hooks` | Retained | Lint gate in CI |
| `@electron/fuses` | Retained | Applied by `scripts/apply-fuses.cjs` for packaged builds |
| npm audit | Retained | `npm run audit:prod` blocks CI on high advisories in runtime dependencies |
| CodeQL | Retained | `.github/workflows/codeql.yml` |
| Dependabot | Version updates off on purpose (SHA-pinned actions are bumped by hand); no ignore rule, so security updates can open pull requests once enabled in the repository settings (not checked from here) | See `agent-tooling.md` section 4 |
| Vitest, Testing Library, MSW | Rejected | The Node runner `tests/runAll.ts` already covers logic and jsdom components; a second runner would duplicate the 130 existing imports. No test depends on an external service |
| Prettier | Rejected for now | Would reformat most files in one diff; an owner decision |
| Knip, dependency-cruiser, Madge | On demand, not installed | Run with `npx`; Knip has many false positives here, Madge finds no runtime cycle. A CI gate is not justified yet |
| Electronegativity | On demand, not installed | Last release 2023, does not understand Electron 43; verdicts are in `security-review.md` |
| Clinic.js | Rejected | The main process runs inside Electron; DevTools and `--inspect` cover profiling |
| Electron DevTools / Node profiling | Built in | No package needed |

## Health checks you can run

```bash
npm run audit:prod                        # runtime dependencies; blocks CI
npm audit                                 # everything; known high findings come from zod inside @remotion/* (not shipped), see agent-tooling.md
npx --yes knip                            # unused-dependency candidates, review by hand
npx --yes madge --circular --extensions ts,tsx electron src mcp-bridge.ts
```

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `npm ci` fails on `onnxruntime-node` download | `npm ci --ignore-scripts`, then `node node_modules/electron/install.js` if the Electron binary is needed |
| `EBADENGINE` | Node is older than the `engines` range |
| Lockfile diff touches many packages | The install resolved newer ranges; revert and pin the range |
