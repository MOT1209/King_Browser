# CLAUDE.md

Guidance for Claude Code in this repository. The rules shared with every coding agent (project overview, architecture, hard rules, commands, workflow, skill index, definition of done) live in AGENTS.md, imported here so Claude Code loads them; visual rules live in [DESIGN.md](DESIGN.md). Read DESIGN.md before UI changes.

@AGENTS.md

## Claude Code specifics

- Skills in `.claude/skills/` load automatically; the table in AGENTS.md says which applies to which task. Edit a skill there, never a copy elsewhere.
- On cloud sessions, use the branch the session assigns instead of the `feature/`, `fix/`, `security/`, `chore/` prefixes.
- Electron checks in a Linux container: `npm run build && xvfb-run -a npm run test:electron`. If the Electron binary is missing (installed with `--ignore-scripts`), run `node node_modules/electron/install.js` first.

## When unsure

Say what you verified and what you did not (for example, "tests pass, not run on Windows"). Ask before changing the approval policy, the IPC trust model, the sync encryption format or the release workflow.
