# Agent ecosystem audit

Audited 2026-10-30 at commit `2b86a4d` (King Browser 0.0.10), before any change in this work. Facts come from reading the repository and running commands; opinions are marked.

## Verdict

The ecosystem was already substantial: shared instructions, 47 skills with a validating test, a documented MCP server with four protocol test suites, SHA-pinned CI with CodeQL and a production audit. Rebuilding any of that would have been waste. The real gaps were narrow: no schema-level validation of MCP tools, no duplicate-skill or cross-file consistency checks, eight topics with no skill, a manual Codex setup step, and no single document explaining the whole setup.

## 1. Existing capabilities (facts)

| Area | State |
| :--- | :--- |
| Instructions | `AGENTS.md` canonical (project, trust boundaries, 9 hard rules, commands, workflow, routing table, skill index, CI, definition of done, driver rules). `CLAUDE.md` is a 15-line adapter importing it |
| Skills | 47 skills in `.claude/skills/`; each had frontmatter, `## Verify` (or `## Automated`) and `## Done when`; typical length 20 to 35 lines |
| MCP | 45 tools in `electron/mcpServer.ts`, tiered `safe` 19 / `medium` / `sensitive`; Streamable HTTP `/mcp` and legacy SSE; stdio bridge generated from `mcp-bridge.ts`; bearer token, Host and Origin checks, rate limit, session handling |
| Approval | `policyEngine.ts` with 15 triggers, strict and balanced modes, site rules, injection tripwire; no mode disables approval |
| Tests | Node runner `tests/runAll.ts` (130 imports at the start, counting side-effect imports), Playwright Electron specs, axe scan, MCP transport suites |
| CI | `ci.yml` (Linux blocking, Windows blocking, macOS non-blocking, `electron-e2e` non-blocking), `codeql.yml`, `release.yml`; actions pinned to SHAs; `permissions: contents: read` |
| Docs | `docs/engineering/agent-tooling.md` (instruction layout, dependency decisions, CI notes), `quality-baseline.md`, `security-review.md` |

Baseline checks before changes (this environment, Node 22.22.0): `npm run typecheck` PASS, `npm run lint` PASS, `npm run check:i18n` PASS (500 keys x 3 languages), `npm run check:strings` PASS, `npm run audit:prod` PASS (0 vulnerabilities).

## 2. Skill quality

Fact: all 47 passed `tests/agent_skills_integrity.test.ts` (frontmatter, index, paths, scripts). Opinion: quality is good where it matters, because every path and command a skill cites is checked against the tree, which is the usual way skills rot.

Gaps against the requested template (Purpose, Files, Workflow, Rules, Verify, Failure cases, Completion):

- Only 15 of 47 had a `## Workflow` heading and none had a "Common failures" section; they use topic-specific headings instead. Rewriting 47 skills to one template would be churn with no behaviour gain, so the test requires only Verify and Done when, and new skills use the fuller template.
- No check for duplicate skills.

## 3. MCP tools and protocol

Fact: `mcp_tool_catalog.test.ts` proved registry, permission table and Settings list agree. Not checked anywhere: that each tool's `inputSchema` is well formed (typed, described properties, `required` naming real properties), that README tool counts are true, that every registered tool is routed to a handler. Counts in README were correct at audit time (45 tools, 19 safe).

Protocol compatibility: both transports covered by tests against loopback servers. Not covered: a real third-party client in this environment (BLOCKED, no clients installed).

Observed but not changed (opinion): `browser_fill_form` is implemented in the main process by expanding into `browser_type` calls, so it has no renderer case; the new test lists it explicitly. Tool arguments are re-validated in handlers, not through the published JSON Schema, so the schema is documentation for clients, not enforcement.

## 4. Supported coding agents

All six named agents were documented in `agent-tooling.md` as reading `AGENTS.md`; Codex needs `.agents/skills`, which required a manual `ln -s`. None was exercised in a live session of that agent in this or the earlier work. This audit cannot change that.

## 5. Missing pieces

| Kind | Finding |
| :--- | :--- |
| Skills | None for React, element targeting and trusted input, downloads, content extraction, prompt-injection defence, MCP tool development, MCP protocol testing, CI/CD. Other requested topics (Electron engineering, Playwright, approval policies, tool classification, release engineering, accessibility, workflow design) are covered by combinations of existing skills (mapping in `skills-guide.md`) |
| Integrations | Codex setup was manual and untested |
| Checks | MCP schema validation; duplicate skills; adapter drift; docs skill counts; docs link resolution |
| Documents | No overview of how instructions, skills, MCP and checks fit; no per-topic guides for skills, MCP development, compatibility, dependency policy |
| Libraries | None missing. See section 7 |

## 6. Security weaknesses (relevant to this scope)

No new vulnerability was found in the parts read (MCP auth, tiers, policy engine, IPC guard test). Residual risks, unchanged and already documented elsewhere: the injection detector is a tripwire; the approval gate depends on the policy engine's pattern lists; no independent security audit has occurred (README says so). I did not re-audit the whole Electron surface; `docs/engineering/security-review.md` and `docs/security-audit-2026-10-05.md` hold earlier reviews.

## 7. Dependencies

Nothing needed adding. Decisions for every candidate named in the request are in `docs/engineering/dependency-policy.md`. Fact: `npm audit` (all) reports high findings from `zod` inside `@remotion/*`, which is not shipped.

## 8. Testing gaps

| Gap | Status after this work |
| :--- | :--- |
| MCP schema validity | Closed by `mcp_tool_schemas.test.ts` |
| Duplicate skills, adapter drift, stale counts, broken doc links | Closed by `agent_skills_integrity` and `agent_instructions_consistency` |
| Codex setup script | Closed by `setup_agent_skills.test.ts` |
| Live agent sessions (Claude Code, Codex, OpenCode, Cursor, Windsurf, Copilot) | Open |
| Real third-party MCP client against the running app | Open |
| macOS and Windows Playwright | Open (CI covers Node suites only) |

## 9. Priorities

1. Cheap guards against silent drift (done): schema, duplicate, consistency tests.
2. Missing skills where a mistake is expensive (done): prompt-injection defence, MCP tool development and protocol testing, element targeting, downloads.
3. One overview and per-topic guides (done).
4. Open: run each agent against the repository and update the status table; promote `electron-e2e` and macOS to blocking after stable runs; decide on Prettier and Knip as owner decisions.
