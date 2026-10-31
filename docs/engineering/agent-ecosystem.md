# Agent ecosystem

How the pieces that let coding agents work on, and drive, King Browser fit together. Written 2026-10-30. This is the map; each part has its own guide.

| Part | What it is | Source of truth | Guide |
| :--- | :--- | :--- | :--- |
| Instructions | Rules, architecture, commands, workflow for any contributor agent | `AGENTS.md` (Claude Code reaches it through `CLAUDE.md` -> `@AGENTS.md`) | [agent-compatibility.md](agent-compatibility.md) |
| Skills | 56 task playbooks, one folder each | `.claude/skills/<name>/SKILL.md`, indexed in `AGENTS.md` | [skills-guide.md](skills-guide.md) |
| MCP server | The tools a driver agent uses to control the browser | `electron/mcpServer.ts`, `electron/main/mcpProtocol.ts` | [mcp-development.md](mcp-development.md) |
| Approval gate | Human decision for sensitive actions | `electron/main/policyEngine.ts` | `agent-tool-governance` skill |
| Checks | Tests that keep all of the above consistent | `tests/` (registered in `tests/runAll.ts`) | below |
| Dependencies | Why each tool is or is not installed | `docs/engineering/agent-tooling.md` | [dependency-policy.md](dependency-policy.md) |

Two roles: a contributor agent edits the repository; a driver agent controls the running browser through MCP. They share one trust model: the approval gate and the IPC sender checks cannot be weakened by either.

## Automated checks that guard the ecosystem

All run inside `npm test` (and therefore in the Linux and Windows CI jobs); none needs Electron or a display.

| Test | Prevents |
| :--- | :--- |
| `tests/agent_skills_integrity.test.ts` | Broken frontmatter, a skill missing from the `AGENTS.md` index, a reference to a file or npm script that no longer exists, duplicate or near-duplicate skills |
| `tests/agent_instructions_consistency.test.ts` | A `CLAUDE.md` that stops importing `AGENTS.md` or grows into a second copy, adapter files for other agents that copy rules, skills copied into another agent's folder, stale skill counts, broken relative links in the instruction documents |
| `tests/setup_agent_skills.test.ts` | The Codex link script copying files, overwriting a real directory or not being idempotent |
| `tests/mcp_tool_catalog.test.ts` | Registry, permission table and Settings list drifting apart |
| `tests/mcp_tool_schemas.test.ts` | A tool with an untyped or undescribed property, a `required` entry naming no property, a README tool count that is wrong, a registered tool with no handler |
| `tests/mcp_streamable_http.test.ts`, `tests/mcp_server_transports.test.ts` | Transport, session, Origin, Host and auth regressions |
| `tests/ipc_sender_guard_coverage.test.ts`, `tests/csp_parity.test.ts` | Unguarded IPC handlers; production CSP copies diverging |
| `tests/policy_engine.test.ts`, `tests/injection_corpus.test.ts` | Approval-trigger and injection-tripwire regressions |

Security-policy coverage is structural: `TOOL_PERMISSIONS` must list exactly the registered tools, unknown tools default to `sensitive`, and every privileged IPC handler must call `isTrustedSender`.

## Adding things

| To add | Do this |
| :--- | :--- |
| A skill | [skills-guide.md](skills-guide.md#add-a-skill) |
| An MCP tool | [mcp-development.md](mcp-development.md#add-a-tool) |
| Support for another coding agent | [agent-compatibility.md](agent-compatibility.md#add-another-agent) |
| A dependency | [dependency-policy.md](dependency-policy.md) |

No plugin system exists and none is planned: a skill is a folder, a tool is an entry in one array, an agent adapter is a pointer file. Adding a registry or loader would add code to maintain without removing a step.

## Troubleshooting

| Symptom | Cause and fix |
| :--- | :--- |
| `npm test` fails in `agent_skills_integrity` | The message names the skill and the problem; fix the skill, not the test |
| `agent_instructions_consistency`: "says N skills" | A doc states a skill count that is no longer true; update the number |
| `mcp_tool_schemas`: README count | Update both counts in `README.md` (the "defines N tools" sentence and the "Exposes N tools ... classed safe" sentence) |
| Agent ignores the rules | It does not read `AGENTS.md`; see the per-agent table in [agent-compatibility.md](agent-compatibility.md) and add a pointer file, not a copy |
| Codex does not list the skills | Run `npm run setup:agents` |
