---
name: cross-agent-compatibility
description: "How King Browser instructions and skills are shared across coding agents (Claude Code, OpenAI Codex, OpenCode, Cursor, Windsurf, GitHub Copilot): AGENTS.md as the single source, CLAUDE.md as an adapter, skills in .claude/skills, and how to add or change a skill. Use when editing AGENTS.md, CLAUDE.md, any SKILL.md, or agent configuration files."
---

# Cross-agent compatibility

## Layout
- `AGENTS.md`: the single authoritative instruction file (architecture, rules, commands, workflow, skill index, definition of done).
- `CLAUDE.md`: imports `@AGENTS.md` and adds only Claude Code specifics. Claude Code does not read `AGENTS.md` on its own.
- `.claude/skills/<name>/SKILL.md`: one directory per skill, YAML frontmatter `name` (lowercase, hyphenated, equal to the directory name) and `description` (what and when, under 1024 characters), Markdown body.
- Details and per-agent status: `docs/engineering/agent-tooling.md`.

## Who loads what (per vendor documentation; not every agent was tested here)
| Agent | Reads AGENTS.md | Loads skills natively |
| :--- | :--- | :--- |
| Claude Code | via `@AGENTS.md` import in CLAUDE.md | yes, `.claude/skills/` |
| OpenCode | yes | yes, `.claude/skills/` is one of its skill paths |
| OpenAI Codex | yes | from `.agents/skills/`; that folder is gitignored here, so link it locally (`ln -s ../.claude/skills .agents/skills`) or read skills via the AGENTS.md index |
| Cursor, Windsurf, GitHub Copilot coding agent | yes | no; they read a skill file when AGENTS.md points to it |

## Rules for skills
- Every skill is actionable: purpose, when to use, the real files, workflow, safety, verify commands, done-when. No placeholders.
- Reference only files, scripts and tests that exist; update the skill in the same commit when you rename them.
- Do not copy rules between AGENTS.md, CLAUDE.md and skills; link to the authoritative place.
- Do not add per-agent rule files that duplicate AGENTS.md. Add an adapter only for a documented convention that cannot read AGENTS.md.

## Verify
Frontmatter and references are checked by `tests/agent_skills_integrity.test.ts` (part of `npm test`): names match directories, descriptions are present and short enough, every skill is listed in AGENTS.md, and referenced repo paths exist.

## Done when
The integrity test passes and AGENTS.md lists the skill under the right task.
