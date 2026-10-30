# Skills guide

A skill is a Markdown playbook in `.claude/skills/<name>/SKILL.md`. Claude Code and OpenCode load it by name; other agents open it from the index in `AGENTS.md`. There are 55 skills. This guide covers adding, changing and checking them.

## Required shape

```markdown
---
name: my-skill
description: "What it covers in one sentence. Use when <the situations that should trigger it>."
---

# Title

## Purpose / Files / Workflow / Rules / Verify / Common failures / Done when
```

- `name` equals the folder name: lowercase words joined by single hyphens.
- `description` is double-quoted, 40 to 1024 characters, and contains `Use when`, `Use before`, `Use after` or `Use for`. This sentence is what an agent matches against its task, so name the files and situations, not the technology in general.
- `## Verify` and `## Done when` are required by the test. New skills should also carry Purpose, Files, Workflow, Rules and Common failures; older skills use shorter sections (Facts, Invariants, Controls) and are not rewritten for the sake of uniformity.
- Backticked repository paths and `npm run <script>` commands must exist; the test fails on a stale one.
- Length: the existing skills run 20 to 35 lines. A skill that needs more is usually two skills.

## Add a skill

1. Check the table below and `AGENTS.md` for an existing skill that covers the job. Extend it instead of adding a near-duplicate.
2. Create `.claude/skills/<name>/SKILL.md` in the shape above, using real file paths.
3. Add a row to the skill table in `AGENTS.md` (`| \`name\` | Use when |`).
4. Run `npm test` (or just the two suites: `agent_skills_integrity`, `agent_instructions_consistency`).
5. Update the skill counts in this guide, `agent-ecosystem.md` and `agent-tooling.md`; the consistency test fails if they are wrong.

## Modify a skill

Edit the one copy in `.claude/skills/`. When you rename a file or npm script, search `.claude/skills` for the old name in the same commit. Record behaviour you verified, not behaviour you expect.

## Coverage of the requested topics

| Topic | Skill |
| :--- | :--- |
| Project architecture, code quality, TypeScript, dependencies, refactoring, debugging, documentation | `project-architecture`, `code-quality`, `typescript-engineering`, `dependency-management`, `refactoring`, `debugging`, `documentation` |
| React engineering | `react-engineering` |
| Electron engineering | `project-architecture` (process ownership) with `electron-security`, `webview-lifecycle`, `session-management`, `cross-platform` |
| Performance optimisation | `performance-testing`, `memory-leak-detection` |
| Security (Electron, IPC, preload, CSP, URLs, SSRF, files, extensions, secrets, threat modelling, regression tests) | `electron-security`, `ipc-security`, `preload-security`, `content-security-policy`, `url-navigation-security`, `ssrf-protection`, `file-system-security`, `extension-security`, `secret-management`, `threat-modeling`, `security-regression-testing` |
| Browser automation, tabs, sessions, navigation | `browser-automation`, `tab-management`, `session-management`, `browser-navigation` |
| Web content extraction | `web-content-extraction` |
| Element targeting, trusted input | `element-targeting` |
| Download management | `download-management` |
| Browser accessibility | `accessibility`, `accessibility-testing` |
| MCP server, tool, protocol testing | `mcp-security`, `mcp-tool-development`, `mcp-protocol-testing` |
| AI agent integration, workflow design | `browser-automation` (driver workflows), `local-ai` (on-device models), `cross-agent-compatibility` |
| Prompt injection defence | `prompt-injection-defense` |
| Approval policies, tool permission classification | `agent-tool-governance`, `mcp-tool-development` (tier choice) |
| Unit, integration, Electron E2E, Playwright, accessibility testing | `unit-testing`, `integration-testing`, `electron-e2e-testing` (Playwright is used only through it), `accessibility-testing` |
| CI/CD, release engineering | `ci-cd`, `release-validation` |

Topics that are covered by a combination are deliberately not given their own skill: a separate "Electron engineering" or "Playwright testing" skill would restate those skills and drift from them.

## Checks and their limits

- The tests verify structure and references. They cannot verify that a skill's advice is correct; review the diff against the code.
- Duplicate detection compares description wording (word-set similarity of at least 0.8). It finds copy-paste, not two skills that overlap in substance.
- Loading in a live Claude Code or OpenCode session was not tested in this environment.
