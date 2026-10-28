---
name: code-quality
description: "Code quality rules for King Browser: small focused changes, matching the surrounding style, module header comments, no dead code, no duplicated helpers. Use when writing or reviewing any diff in this repository, and before committing."
---

# Code quality

## Purpose
Keep a large Electron + React codebase readable and reviewable by humans and agents alike.

## When to use
Every code change, and every review of your own diff before committing.

## Rules
- Smallest change that solves the task. No drive-by reformatting; there is no Prettier in this repo, so reformatting shows up as noise in the diff.
- Match the file you are in: naming, comment density, idiom. Main-process modules open with a header comment explaining what the module decides and why; new modules do the same.
- Search before writing a helper: `src/utils/` and `electron/main/` already hold URL validation (`safeNavigation.ts`, `securityUtils.ts`), storage (`safeStorage.ts`), id generation (`idGenerator.ts`), formatting (`formatBytes.ts`), logging (`logger.ts`).
- Pure logic out of `electron/main.ts` and `src/App.tsx` into a module with a test.
- No emojis in code, comments, commits or docs (CLAUDE.md rule 7).
- User-facing text only through `t()` / `l()` (rule 6).
- Delete code only with proof it is unused (grep the whole repo, including `tests/`, `scripts/`, `website/`, `video/`).

## Review checklist (run on your own diff)
1. `git diff` - is every hunk needed for the task?
2. Any `any`, `as unknown as`, non-null `!` you added - justified? (see `typescript-engineering`)
3. Any new IPC, preload API, network host, file path or URL handling? Load the matching security skill.
4. New behaviour has a test registered in `tests/runAll.ts`.
5. Comments explain why, not what.

## Verify
`npm run typecheck && npm run lint` (ESLint reports errors only with `--quiet`; warnings for `any` and unused vars still appear without it: run `npx eslint <files>` on what you touched).

## Done when
The diff contains only task-related changes, lint and typecheck pass, and new behaviour is tested.
