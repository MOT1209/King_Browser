---
name: ci-cd
description: "Changing King Browser GitHub Actions workflows safely: SHA-pinned actions, least-privilege permissions, which jobs block, adding a check to CI, and reproducing a CI failure locally. Use when editing .github/workflows, adding a validation script to CI, or investigating a red check."
---

# CI/CD

## Purpose
CI is the shared definition of green. A step must fail for a real reason, run the same command a contributor runs locally and not widen the token's permissions.

## Files
`.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`, `docs/engineering/agent-tooling.md` (CI changes section), `package.json` (scripts).

## Workflow
1. Add the check as an npm script first, run it locally, then call that script from the workflow so humans and CI share one command.
2. Pin every action to a commit SHA with the version in a comment; update by hand (Dependabot version updates are off on purpose; only security updates may open pull requests).
3. Keep `permissions: contents: read` at the top; grant more only at job level and only for the job that needs it.
4. New or flaky jobs start with `continue-on-error: true` and are promoted after several passes, as `electron-e2e` and macOS were.
5. To reproduce a failure, run the same command on the same Node major (22) with `npm ci --ignore-scripts`.

## Rules
- Do not change `release.yml` or the version-bump trigger without the owner's explicit request (AGENTS.md section 3).
- Never print secrets; never echo tokens into logs; no `pull_request_target` with a checkout of untrusted code.
- Never skip or delete a failing step to get green.

## Verify
Run each new command locally exactly as the workflow does (`npm ci --ignore-scripts`, then the npm script) and review the workflow diff for permissions and pinned SHAs. The real proof is a green run on the pull request; this environment cannot execute GitHub Actions.

## Common failures
Unpinned action; script works locally only because of a built artifact; Windows job failing on path separators; cache key missing the website lockfile.

## Done when
The step runs the same npm script locally and in CI, permissions are not wider than before and action SHAs are pinned.
