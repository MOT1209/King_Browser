---
name: documentation
description: "Keeping King Browser documentation true to the code: README, AGENTS.md, CLAUDE.md, DESIGN.md, docs/, skills. Use when behaviour, commands, tool counts, network hosts or security properties change, or when writing any doc or skill."
---

# Documentation

## Purpose
Docs that agents and humans can act on, and that never claim more than was verified.

## Where docs live
- `AGENTS.md`: authoritative rules for all coding and driver agents. `CLAUDE.md` imports it and adds Claude-specific notes.
- `README.md`: user-facing; includes "Network connections" (must list every host), MCP tool list and count, Testing section.
- `DESIGN.md`: visual rules. `PRODUCT.md`, `plan.md`: direction.
- `docs/engineering/`: agent tooling, dependency decisions, quality baseline, security review notes.
- `.claude/skills/*/SKILL.md`: task skills (see `cross-agent-compatibility`).

## Rules
- Separate verified facts from opinions and unknowns (`plan.md` discipline). Write "not run on Windows" rather than implying it was.
- README states King has not been benchmarked against other browsers and has had no independent security audit; never contradict that.
- Update docs in the same commit as the behaviour change.
- Commands in docs must exist in `package.json`; file paths must exist.
- No emojis.

## Workflow
1. `grep -rn "<old name or command>" README.md AGENTS.md CLAUDE.md docs .claude/skills` before and after renaming anything.
2. For MCP tool changes, update README tool list and count and the `AGENTS.md` tool families.
3. Check links: `grep -o "](\([^)]*\))" <file>` and confirm each relative path exists.

## Verify
Every command you documented runs; every path you referenced exists (`ls`).

## Done when
No doc describes behaviour the code does not have, and new claims carry how they were verified.
