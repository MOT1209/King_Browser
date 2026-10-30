# Agent ecosystem implementation report

2026-10-30, branch `claude/king-browser-agent-ecosystem-9z8642`, base commit `2b86a4d` (King Browser 0.0.10). Environment: Linux container, Node 22.22.0 (below the `^22.22.2` engine range, npm prints `EBADENGINE`), Electron 43 under `xvfb-run`.

Statuses: PASS = ran successfully here; FAIL; BLOCKED = could not run here; NOT TESTED = not attempted.

## 1. Initial audit findings

Full text: [AGENT_ECOSYSTEM_AUDIT.md](../audits/AGENT_ECOSYSTEM_AUDIT.md). Summary: the repository already had canonical `AGENTS.md`, a `CLAUDE.md` adapter, 47 validated skills, 45 MCP tools with four protocol suites, and hardened CI. The gaps were MCP schema validation, duplicate and drift checks, eight uncovered topics, a manual Codex step and a missing overview. Nothing that worked was rebuilt.

## 2. Changes implemented

| Change | Files |
| :--- | :--- |
| MCP tool schema, README count and handler-coverage test | `tests/mcp_tool_schemas.test.ts` |
| Duplicate-skill and duplicate-index detection | `tests/agent_skills_integrity.test.ts` (appended block) |
| Instruction consistency test (adapter size and import, no copied skills, skill counts in docs, relative links) | `tests/agent_instructions_consistency.test.ts` |
| Codex skill link script and test | `scripts/setup-agent-skills.cjs`, `tests/setup_agent_skills.test.ts`, `package.json` script `setup:agents` |
| Registration of the new tests | `tests/runAll.ts` |
| Eight new skills, indexed | `.claude/skills/*`, `AGENTS.md` |
| Documentation | `docs/engineering/{agent-ecosystem,skills-guide,mcp-development,agent-compatibility,dependency-policy}.md`, `agent-tooling.md` updated (skill count 47 to 55, links, new checks) |
| Audit and this report | `docs/audits/AGENT_ECOSYSTEM_AUDIT.md`, `docs/reports/AGENT_ECOSYSTEM_IMPLEMENTATION_REPORT.md` |

`README.md` was not changed: its tool counts were already correct (now enforced by test). No file under `electron/` or `src/` was changed.

## 3. New and improved skills

New (full template: Purpose, Files, Workflow, Rules, Verify, Common failures, Done when): `react-engineering`, `element-targeting`, `download-management`, `web-content-extraction`, `prompt-injection-defense`, `mcp-tool-development`, `mcp-protocol-testing`, `ci-cd`. Existing 47 skills were kept; they now also pass duplicate detection. Topics covered by combinations of existing skills (Electron engineering, Playwright, approval policy, release engineering and others) are mapped in `skills-guide.md` instead of adding overlapping skills. Skill content was written from the source files; the paths and npm scripts it cites are checked by the test, the advice itself was reviewed by me only.

## 4. MCP improvements

Added a schema-level test: unique names, `king_browser_info` or `browser_<snake_case>` naming, descriptions of 20+ characters, typed and described properties, `array` has `items`, `required` names declared properties, README tool counts equal the registry (45 tools, 19 safe by default), every tool has a bridge handler, engine route or alias target. Existing tests already covered the registry/permission/Settings parity and the transports. No tool was added, removed or reclassified, and the approval gate, tiers and IPC checks are untouched. Not done: JSON Schema enforcement of arguments at the server (handlers validate; changing that is a behaviour change I did not make); extra logging/diagnostics (the activity log already records actions).

## 5. Agent compatibility matrix

| Agent | Instructions | Skills | Status |
| :--- | :--- | :--- | :--- |
| Claude Code | `CLAUDE.md` -> `AGENTS.md` | `.claude/skills` | Layout PASS (tests); live session NOT TESTED |
| OpenCode | `AGENTS.md` | `.claude/skills` | Layout PASS; live session NOT TESTED |
| OpenAI Codex | `AGENTS.md` | `.agents/skills` via `npm run setup:agents` | Script PASS (tests); live session NOT TESTED |
| Cursor | `AGENTS.md` | Index only | NOT TESTED |
| Windsurf | `AGENTS.md` | Index only | NOT TESTED |
| GitHub Copilot | `AGENTS.md` | Index only | NOT TESTED |

"Layout PASS" means the files these agents are documented to read exist and are consistent. It is not evidence that the agent behaves accordingly. Driver-side MCP connection instructions remain in the README; real third-party clients against the running app are BLOCKED here.

## 6. Dependencies

Added: none. Removed: none. Retained: all existing. Decisions for each candidate in the request (Vitest, Testing Library, MSW, Prettier, Knip, dependency-cruiser, Madge, Electronegativity, Clinic.js, and the retained Playwright, axe, ESLint, fuses, audit, CodeQL, Dependabot) are in `docs/engineering/dependency-policy.md`. No candidate showed a demonstrated benefit beyond what the existing tools give.

## 7. Security improvements

No runtime security code changed. Improved guards: schema and registry checks reduce the chance of an unclassified or mis-described tool; adapter and skill-copy checks stop a second, diverging copy of the rules. Preserved and re-verified by tests: `nodeIntegration` off, sandbox and context isolation (`smoke.spec.ts`), production CSP without inline script (`smoke.spec.ts`, `csp_parity`), IPC sender guard coverage, approval policy suites.

## 8. Tests executed

Run in this environment after the final change:

| Check | Result |
| :--- | :--- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run check:i18n` | PASS (500 keys, en/ar/de) |
| `npm run check:strings` | PASS |
| `npm test` | PASS: exit 0, 1470 `[PASS]` lines, 0 `[FAIL]` lines |
| `npm run build` | PASS |
| `xvfb-run -a npm run test:electron` | PASS: 6 of 6 (axe x2, sandbox/isolation, CSP, guest isolation, shortcuts) |
| `npm run audit:prod` | PASS: 0 vulnerabilities |
| `npm run build:bridge` then `git diff --exit-code mcp-bridge.mjs` | PASS, no drift |
| `node scripts/setup-agent-skills.cjs --check` | Reports "not set up" and exits 1 as designed (link not created in this checkout) |

Mutation checks of the new tests (each reverted afterwards): README count changed to 44 -> `mcp_tool_schemas` FAIL as intended; `@AGENTS.md` line removed from `CLAUDE.md` -> consistency FAIL; a `.cursor/skills` directory -> consistency FAIL; a copied skill listed in the index -> duplicate detection FAIL (`ci-cd ~ ci-cd-copy (1.00)`).

One earlier `npm test` run failed because the new consistency test correctly found `agent-tooling.md` still saying 47 skills; I updated the doc, not the test.

Not run: `npm run test:integration` (needs a running app plus an agent, BLOCKED), `npm run benchmark:startup` (opt-in, not relevant to this change), macOS and Windows runs (BLOCKED, Linux only), CI on GitHub (NOT TESTED until pushed and run), website tests (not touched).

## 9. Known limitations

- No agent product was run against the repository; compatibility rests on vendor documentation plus file-layout tests.
- Duplicate detection compares description wording only.
- The schema test validates the declared schemas; it does not prove each handler enforces them.
- New skills were written from code reading; no one has used them on a real task yet.
- The 47 older skills keep their varied headings; only Verify and Done when are enforced.
- Node 22.22.0 here is below the engine range; results may differ on the supported range (CI uses Node 22).

## 10. Remaining tasks

1. Open each agent against the repository once and update the status tables with what actually happened.
2. Connect a real MCP client to a running build and run `npm run test:integration`.
3. Promote `electron-e2e` and macOS jobs to blocking after stable CI runs (owner decision).
4. Decide on Prettier and Knip (owner decisions, see dependency policy).
5. Optionally add argument enforcement from `inputSchema` in the server (behaviour change, needs approval-model review).

## 11. Files changed

Modified: `AGENTS.md`, `package.json`, `tests/runAll.ts`, `tests/agent_skills_integrity.test.ts`, `docs/engineering/agent-tooling.md`.
Added: eight `.claude/skills/<name>/SKILL.md` files (listed in section 3), `scripts/setup-agent-skills.cjs`, `tests/mcp_tool_schemas.test.ts`, `tests/agent_instructions_consistency.test.ts`, `tests/setup_agent_skills.test.ts`, `docs/engineering/{agent-ecosystem,skills-guide,mcp-development,agent-compatibility,dependency-policy}.md`, `docs/audits/AGENT_ECOSYSTEM_AUDIT.md`, this report.
