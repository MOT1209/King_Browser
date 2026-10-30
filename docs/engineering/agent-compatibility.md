# Agent compatibility

How each coding agent finds the instructions and skills of this repository, and how each connects to the browser as a driver. Written 2026-10-30.

Status words used below: **Documented** means the vendor's documentation describes the mechanism; **Verified here** means it was run in this repository. Nothing in the contributor table is "Verified here" for a live agent session: this environment has no access to those products. What was verified is the file layout, by tests that run in `npm test`.

## Contributor agents: instructions and skills

| Agent | Reads instructions | Loads skills | Setup | Status |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | `CLAUDE.md`, which imports `AGENTS.md` | `.claude/skills/` automatically | None | Documented. Import line and file layout checked by `agent_instructions_consistency` and `agent_skills_integrity` |
| OpenCode | `AGENTS.md` | `.claude/skills/` (a documented search path) | None | Documented |
| OpenAI Codex | `AGENTS.md` | `.agents/skills/` | `npm run setup:agents` links `.agents/skills` to `.claude/skills` locally (`.agents/` is gitignored) | Documented. The script is tested; Codex itself was not run |
| Cursor | `AGENTS.md` | No skill loading; reads skill files from the index in `AGENTS.md` | None | Documented |
| Windsurf | `AGENTS.md` | Same as Cursor | None | Documented |
| GitHub Copilot coding agent | `AGENTS.md` | Same as Cursor | None | Documented |
| Other agents | If they read `AGENTS.md`, the same as Cursor | Open the file named in the index | None | Unknown until tried |

Design rules, enforced by `tests/agent_instructions_consistency.test.ts`:

- `AGENTS.md` is the only place rules are written. `CLAUDE.md` stays under 40 lines and imports it.
- Skills exist once, in `.claude/skills/`. A copy under `.cursor/`, `.windsurf/`, `.github/` or `.opencode/` fails the test. `.agents/skills` may only be the link made by the setup script.
- Any adapter file added for another agent (`GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, `.cursor/rules/*`, `.windsurf/rules/*`) must mention `AGENTS.md` and stay under 30 lines.

### Add another agent

1. Read the vendor documentation for where it looks for repository instructions. If it reads `AGENTS.md`, do nothing.
2. If it does not, add a pointer file at its documented location: one sentence plus "Read `AGENTS.md`". Do not copy rules.
3. If it loads skills from its own folder, link to `.claude/skills` (as `setup-agent-skills.cjs` does for `.agents/skills`); do not copy.
4. Add a row to the table above with the honest status, run `npm test`.

## Driver agents: connecting to the running browser

Settings -> MCP shows the port and token and copies ready configuration for OpenCode and a generic client. The full per-client instructions (OpenCode, Claude Code, Claude Desktop, Codex, Cursor and Windsurf, direct Streamable HTTP) are in the README section "Connecting External AI Agents"; they are not repeated here so they cannot diverge.

| Client | Transport | Where documented | Status |
| :--- | :--- | :--- | :--- |
| OpenCode | stdio bridge or `type: remote` on `/mcp` | README, `docs/TESTING_WITH_OPENCODE.md` | The generated configuration is unit-tested (`mcp_client_config`); the README states the bridge setup is the one tested against a real server (see its Compatibility status) |
| Claude Code | stdio bridge (`claude mcp add`) or HTTP | README | Documented; not run here |
| Codex | stdio bridge (`codex mcp add`) | README | Documented; not run here |
| Cursor, Windsurf | stdio bridge via `mcp.json` | README | Documented; not run here |
| Any MCP client | Streamable HTTP `POST /mcp` or legacy SSE | `docs/engineering/mcp-development.md` | Protocol covered by `mcp_streamable_http` and `mcp_server_transports` tests, not by real third-party clients |

Driver rules (approval, untrusted content, privacy) are `AGENTS.md` section 2.

## Validate

```bash
npm test                      # runs the structural suites listed in agent-ecosystem.md
npm run setup:agents -- --check   # Codex only: reports whether .agents/skills is linked
```

## Troubleshoot

| Symptom | Fix |
| :--- | :--- |
| Agent does not follow hard rules | Confirm it reads `AGENTS.md` (ask it to quote section 1 "Hard rules"). If not, add a pointer file |
| Claude Code ignores `AGENTS.md` | `CLAUDE.md` lost its `@AGENTS.md` line; the consistency test catches this |
| Skill not listed in Codex | `npm run setup:agents`; on Windows the script uses a junction |
| `setup:agents` says "occupied" | `.agents/skills` is a real directory (maybe copies); move it aside and rerun |
| MCP client sees few tools | Medium and sensitive tools are off by default; enable them in Settings -> MCP |
