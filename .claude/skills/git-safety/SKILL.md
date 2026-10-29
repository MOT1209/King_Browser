---
name: git-safety
description: "Safe Git use in King Browser: inspect status first, preserve changes made by other people and agents, no destructive commands, Conventional Commits, no PR unless asked. Use before any git command that changes state, when the working tree is dirty, or when another agent may be editing."
---

# Git safety

## Purpose
Never lose work that is not yours, and keep history reviewable.

## Before you start
1. `git status --short` and `git branch --show-current`. Uncommitted changes you did not make belong to someone else: do not stage, stash, reset or overwrite them.
2. `git log --oneline -5` to see where you are.
3. If another agent is active (unexpected files changing between reads), edit only files you own and say so.

## Never without explicit user approval
`git reset --hard`, `git checkout -- <file>` / `git restore` on files you did not change, `git clean -f`, `git stash drop`, force push, rebase or amend of someone else's branch, deleting branches, `git push` to `main`.

## Committing
- Stage paths explicitly (`git add <paths>`), never `git add -A` on a tree with foreign changes.
- Conventional Commits: `feat|fix|security|perf|refactor|docs|test|chore(scope): imperative description`. No emojis.
- Do not bump `version` in `package.json`: on `main` that triggers the Release workflow.
- Do not commit `.env`, build output (`dist*`, `test-results/`), or anything under `electron/keys/*private*`.
- Open a pull request only when the user asks; use `.github/PULL_REQUEST_TEMPLATE.md`.

## Verify
`git diff --cached --stat` shows only your files before each commit; `git status` is clean of your work after it.

## Done when
Your changes are committed on the intended branch, nothing foreign was touched, and the push (if requested) succeeded.
