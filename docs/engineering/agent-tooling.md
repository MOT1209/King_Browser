# Agent tooling and engineering checks

How coding agents find instructions in this repository, which tools back the checks they run, and why each tool was added or rejected. Written 2026-10-28. Rules themselves live in [AGENTS.md](../../AGENTS.md); this document explains the setup around them.

## 1. Instructions and skills

| File | Role |
| :--- | :--- |
| `AGENTS.md` | Single source of truth for every agent: project, architecture and trust boundaries, hard rules, commands, workflow, routing table, skill index, CI, definition of done, driver-agent (MCP) rules. |
| `CLAUDE.md` | Adapter for Claude Code: `@AGENTS.md` import plus a few Claude-specific notes. Claude Code reads `CLAUDE.md`, not `AGENTS.md`, so without the import it would miss the shared rules. |
| `.claude/skills/<name>/SKILL.md` | 56 task skills. YAML frontmatter `name` (equals the directory name) and `description` (what and when), then Purpose / When to use / Files / Workflow / Rules / Verify / Done when. |
| `DESIGN.md` | Visual rules (unchanged). |

Before this change, the hard rules (sender validation, sandbox, secrets, approval gate, i18n, network destinations) were only in `CLAUDE.md`, so agents that read `AGENTS.md` (Codex, OpenCode, Cursor and others) never saw them. They now live in `AGENTS.md`.

### Why `.claude/skills/` and not a new top-level folder

The directory layout `<dir>/<name>/SKILL.md` with `name` / `description` frontmatter is what Claude Code loads natively, and OpenCode documents `.claude/skills/` as one of its skill search paths. Keeping the only copy there means two agents load the skills without any adapter, and no second copy can drift. Agents that do not load skills read the index in `AGENTS.md` and open the file. `.agents/` (where OpenAI Codex and the `npx skills` installer look) is gitignored in this repository for locally installed third-party skills (`skills-lock.json`), so it was not reused for project skills.

### Integration status per agent

Per-agent discovery, setup and troubleshooting now live in [agent-compatibility.md](agent-compatibility.md); the table below is the original summary. The overall map is [agent-ecosystem.md](agent-ecosystem.md).

"Documented" means the vendor documentation describes the mechanism; "tested here" means it was exercised in this repository.

| Agent | Instructions | Skills | Status |
| :--- | :--- | :--- | :--- |
| Claude Code | `CLAUDE.md` -> `@AGENTS.md` | `.claude/skills/` native | Documented. Skill frontmatter validated by `tests/agent_skills_integrity.test.ts`; loading in a live Claude Code session not separately tested. |
| OpenCode | `AGENTS.md` native | `.claude/skills/` native | Documented, not tested here. |
| OpenAI Codex | `AGENTS.md` native | Native path is `.agents/skills/` (gitignored here). Link locally with `npm run setup:agents` (or `mkdir -p .agents && ln -s ../.claude/skills .agents/skills`), or rely on the AGENTS.md index. | Documented, not tested here. The symlink is not committed (Windows checkouts often lack symlink support). |
| Cursor | `AGENTS.md` | No native skill loading; reads skill files on demand via the index | Documented, not tested here. No `.cursor/rules/` copy was added, to avoid duplicating AGENTS.md. |
| Windsurf | `AGENTS.md` | Same as Cursor | Documented, not tested here. |
| GitHub Copilot coding agent | `AGENTS.md` | Same as Cursor | Documented, not tested here. No `.github/copilot-instructions.md` copy was added. |

If an agent turns out not to read `AGENTS.md` in practice, add a one-line adapter in its documented location that points to `AGENTS.md`, not a copy of the rules.

### Maintaining skills

- `tests/agent_skills_integrity.test.ts` (runs in `npm test`) fails when a skill's frontmatter is malformed, the name does not match its folder, the description does not say when to use it, a `## Verify` or `## Done when` section is missing, `AGENTS.md` does not index it, a backticked repository path does not exist, or an `npm run <script>` does not exist in `package.json`.
- `tests/agent_instructions_consistency.test.ts` keeps `CLAUDE.md` an adapter, rejects copies of skills or rules in other agents' folders, checks skill counts stated in the docs and that relative links in the instruction documents resolve. Skill duplicate detection is in `agent_skills_integrity.test.ts`.
- `tests/mcp_tool_schemas.test.ts` validates every MCP tool schema and the README tool counts.
- Rename a file or script -> update the skills that mention it in the same commit (the test lists them).

## 2. Checks and commands

| Command | What it runs | Notes |
| :--- | :--- | :--- |
| `npm run typecheck` | `tsc --noEmit` | New alias of the existing CI step. `tests/` is not typechecked. |
| `npm run lint` | `eslint . --quiet` | Unchanged; ignores `test-results/` and `playwright-report/` now. |
| `npm run check:i18n`, `npm run check:strings` | Dictionary and literal-string checks | Unchanged. |
| `npm test` | esbuild-bundled `tests/runAll.ts` in Node | Now also runs `ipc_sender_guard_coverage`, `csp_parity`, `agent_skills_integrity`. |
| `npm run setup:agents` | Links `.agents/skills` to `.claude/skills` for Codex (`-- --check` only reports) | Local, gitignored link |
| `npm run verify` | typecheck + lint + i18n + strings + test | New; the pre-push check named in AGENTS.md. |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` | New; blocking CI step. |
| `npm run test:electron` | Playwright `smoke` project in `tests/electron/` | New; needs `npm run build`, the Electron binary and a display. |
| `npm run benchmark:startup` | Playwright `perf` project | New; opt-in measurements. |

Not added: `format:check` (no formatter, see below), `test:coverage` (no coverage tool, see below), `test:security` (the security suites are part of `npm test`; a separate script would run a subset of the same file).

## 3. Dependency decisions

Versions were chosen at least two weeks old at the time of writing. Licences checked with `npm view <pkg> license`.

### Added (devDependencies only; nothing ships in the app)

| Package | Version | Purpose | Why existing tools were not enough | Licence | Verify |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `@playwright/test` | `~1.63.0` | Launch the built Electron app (`_electron`), drive the UI, read main-process state, traces on failure | No test launched the real app; `tests/e2e/*` run in plain Node. Puppeteer-style scripts in `scripts/` only capture screenshots. | Apache-2.0 | `npm run test:electron` |
| `@axe-core/playwright` (+ `axe-core` 4.13) | `~4.13.0` | Automated accessibility scan of the running UI | `dialog_a11y` and `hover_only_controls` test specific behaviours; nothing checked semantics or contrast. 4.14.0 was 13 days old, so 4.13 was used. | MPL-2.0 (dev tooling, not distributed) | `npm run test:electron` |

`overrides.playwright-core: ~1.63.0` keeps a single `playwright-core` (`@axe-core/playwright` otherwise pulled 1.64.1 next to 1.63.0). Playwright's `_electron` API is marked experimental by Playwright; it launched Electron 43.7.7 successfully here.

Bundle impact: none (test-only). Install impact: 5 packages, none with an install or postinstall script.

### Retained (already present)

| Tool | Role |
| :--- | :--- |
| Custom Node runner (`tests/runAll.ts`, `node:assert`, jsdom) | Unit, integration and tiered e2e suites; about 1,450 PASS lines; runs anywhere without Electron. |
| `typescript ~5.6`, `eslint 9` + `typescript-eslint` | Typecheck and lint. |
| `@electron/fuses` via `scripts/apply-fuses.cjs` | Disables RunAsNode, NODE_OPTIONS, inspect arguments, file-protocol privileges; enables cookie encryption, asar-only loading and asar integrity in packaged builds. |
| `electron-builder` + `electron-updater` | Packaging and updates; no second framework was introduced. |
| `tests/benchmark_suite.ts`, `scripts/speedometer_runner.ts` | Existing benchmarks, kept as is. |

### Rejected or left as on-demand commands

| Candidate | Decision | Reason |
| :--- | :--- | :--- |
| Vitest | Rejected | A second runner would duplicate `tests/runAll.ts` (126 imported test files). The existing runner already covers TS logic and jsdom component tests. |
| React Testing Library, `@testing-library/user-event`, `jest-dom` | Rejected | Component tests render with React + jsdom directly; RTL would only pay off together with a new runner. Real user-level flows are now covered by Playwright against the app. |
| MSW | Rejected | Tests already isolate the network through injected resolvers and loopback servers on port 0; no test depends on an external service. |
| Prettier (`format:check`) | Rejected for now | No formatter is configured; enforcing one would reformat most files in one large diff. Revisit as a separate, owner-approved change. |
| knip | On demand, not added | `npx knip` reported 14 "unused" packages, most of them false positives (it does not see the esbuild entry points in `package.json` scripts or the `video/` Remotion sources). Candidates that grep also found unused in source: `@assistant-ui/react`, `radix-ui`, `class-variance-authority`, `eventsource`, `@remotion/player`, `@types/dompurify` (dompurify ships its own types), `motion-dom`, `motion-utils` (may be explicit peers of `framer-motion`). Not removed: needs the owner's confirmation (components.json suggests planned shadcn use). `ws` is imported by `tests/integration/agent_e2e.mjs` but not listed (it resolves as a transitive dependency). |
| madge / dependency-cruiser | On demand, not added | `npx madge --circular --extensions ts,tsx electron src mcp-bridge.ts` finds one cycle, `aiAgent.ts <-> aiActionContext.ts`, which goes through an `import type` and does not exist at runtime. No runtime cycles, so a dependency for a CI gate is not justified yet. |
| electronegativity | On demand, not added | Last release 2023; cannot detect Electron 43 and assumes 0.1, so several checks are false positives. Ran once; verdicts in [security-review.md](security-review.md). Command: `npx -y @doyensec/electronegativity@1 -i electron`. |
| clinic.js | Rejected | Profiles plain Node servers; the main process runs inside Electron, where Chromium DevTools and `--inspect` heap snapshots cover the same need. |
| Coverage tooling (c8) | Not added | The suite runs as one esbuild bundle; source-mapped coverage is possible but was not set up or verified in this change. |
| `electron-updater` | Already present | No new update mechanism. |

### Advisories

- `npm audit --omit=dev`: 0 vulnerabilities (2026-10-28).
- `npm audit` (all): 10 high, all from `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5) inside `@remotion/*` (video rendering tooling under `video/`, not shipped). `npm audit fix --force` would downgrade `@remotion/cli`; left for the owner.

## 4. CI changes

- `ci.yml`: actions pinned to commit SHAs (`actions/checkout` v4.4.0, `actions/setup-node` v4.4.0, `actions/upload-artifact` v4.6.2); new blocking "Production dependency audit" step; new `electron-e2e` job (Linux, `continue-on-error: true` until it has passed a few times, matching how `test-macos` was introduced). Workflow permissions stay `contents: read`.
- `codeql.yml` (new): CodeQL for JavaScript/TypeScript, `build-mode: none`, on pushes to `main`, pull requests and weekly; job-level `security-events: write` only. Pinned to `github/codeql-action` v4.39.1. The repository is public, so code scanning is available without extra licences.
- `release.yml`: actions pinned to the commit SHAs their tags resolved to on 2026-10-28 (including `softprops/action-gh-release` v2.6.2, which runs with `contents: write`), approved by the owner. No other change to the release workflow.
- `release.yml` (2026-10-31, owner-requested): after publishing the rolling nightly, a step deletes nightly assets the current build did not produce (versioned names such as `King-Browser-0.0.9-x64.exe` otherwise accumulate). Guarded by `tests/release_nightly_cleanup.test.ts`, which runs the step's script against a stub `gh`.
- `dependabot.yml` (2026-10-31, owner-requested): version updates stay disabled (`open-pull-requests-limit: 0`), so pinned SHAs are not bumped automatically; update them by hand with the version comment. The `ignore: "*"` rules were removed because ignore conditions also suppress Dependabot security updates. Security update pull requests additionally need "Dependabot security updates" enabled in the repository settings, which was not checked from here.

## 5. Troubleshooting

| Symptom | Cause and fix |
| :--- | :--- |
| `npm ci` fails in `onnxruntime-node` install with `ECONNRESET` | Its postinstall downloads native binaries. Use `npm ci --ignore-scripts`; tests do not need it. |
| `test:electron`: "Build artifacts missing" | Run `npm run build`. |
| `test:electron`: Electron binary not found | Installed with `--ignore-scripts`: `node node_modules/electron/install.js`. |
| Electron exits immediately on Linux CI with a sandbox error | Configure the setuid helper (`chown root:root` + `chmod 4755` on `node_modules/electron/dist/chrome-sandbox`), as the CI job does. Do not pass `--no-sandbox`. |
| `test:electron` hangs or "Missing X server" | Run under `xvfb-run -a` on Linux. |
| axe: `Target.createTarget: Not supported` | Use `.setLegacyMode(true)`; Electron does not allow the helper page axe opens by default. |
| UI looks outdated in E2E | Unpackaged Electron falls back to `dist/index.html`; rebuild. |
| `EBADENGINE` warning | Node is older than `^22.22.2`; upgrade Node. |

## 6. Limitations

- Electron E2E runs only on Linux in CI; macOS and Windows were not exercised with Playwright.
- Playwright's Electron support is experimental and attaches through the inspector, which fuses disable in packaged builds; packaged installers are not tested by any automated check.
- The axe scan covers two screens and cannot judge keyboard flow or screen-reader output.
- No agent integration other than the file layout was tested in a live session of that agent.
