# Windows code signing: application and integration plan

Status: **not started on SignPath's side.** No application has been submitted and no signing is wired into the release workflow. This page holds what can be verified from the repository, what only the maintainer can do, and the integration that follows an approval. The policy shown to users is `CODE_SIGNING.md`.

Facts below marked "verified" were read from this repository. SignPath's own eligibility rules and form could not be read from the environment that prepared this page (the host was unreachable), so everything about their side is marked **unverified**: read their current terms before applying.

## Verified from the repository

| Item | Value |
| :--- | :--- |
| Repository | `https://github.com/MOT1209/King_Browser` (public) |
| Licence | MIT (`LICENSE`); parts derived from Nova Browser, listed in `THIRD_PARTY_LICENSES.md` |
| First commit | 2026-10-24; 137 commits on `main` at the time of writing |
| Latest release | `0.0.11` (pre-release 0.0.x series) |
| Signing policy page | `CODE_SIGNING.md` (draft, "not in effect") |
| Security reporting | `SECURITY.md`, GitHub Security Advisories |
| CI | typecheck, lint, tests on Linux, Windows and macOS, Electron smoke, production dependency audit, CodeQL; actions pinned to commit SHAs |
| Build | `.github/workflows/release.yml`, Windows job `pack:win` on a GitHub-hosted runner |
| Privacy | No analytics or crash-reporting SDK; outbound connections listed in README "Network connections" |
| Artifacts to sign | NSIS installer and portable `.exe` (`King-Browser-<version>-x64.exe`); the `.zip` is not an executable signature target |

## Points to weigh before applying

- **Project age.** The project is days old and at version 0.0.x. **Unverified:** whether SignPath Foundation requires an established project with a track record. If it does, an application now may be declined; applying later costs nothing.
- **AI-assisted code.** Part of the code is written with coding agents under human review. `CODE_SIGNING.md` already says so; say it in the application as well.
- **Derived project.** The code descends from Nova Browser (MIT). Say so, with the licence file.
- **Single maintainer.** One person holds every role in `CODE_SIGNING.md`. **Unverified:** whether the Foundation accepts that.

## What only the maintainer can do

1. Read the current SignPath Foundation terms and application form (`https://signpath.org/`), then decide whether to apply.
2. Create the SignPath account and enable multi-factor authentication on SignPath and GitHub (the policy promises it).
3. Submit the application using the facts above. The project description can reuse the README summary; do not claim an audit or benchmarks (the README says there is none).
4. After approval, record the organization id, project slug and signing policy slug, and create the API token as a repository secret. Never commit any of them.
5. Change `CODE_SIGNING.md` from "draft, not in effect" only when the first signed release is published.

## Integration after approval (not done; needs a decision)

Changing the release workflow is on the list of things that need an explicit request, and it cannot be tested before an approved SignPath project exists. The plan:

1. **Upload the unsigned Windows installers as a workflow artifact** (already done by the existing `upload-artifact` step) and submit that artifact with SignPath's GitHub action, pinned to a commit SHA. SignPath's trusted build system verifies that the request comes from this repository and workflow run.
2. **Wait for the approver (the maintainer) in SignPath**, then download the signed files.
3. **Regenerate the update metadata.** Signing changes the bytes of the installer, so the `sha512` in `latest.yml` and the blockmap computed at build time no longer match. `electron/main/updateIntegrity.ts` refuses an update whose digest does not match, so shipping the old `latest.yml` would break auto-update for every Windows user. The step after signing must recompute `sha512` and `size` for each signed file and rewrite `latest.yml` (and drop or rebuild the `.blockmap`). Test this against the updater before the first signed release.
4. **Regenerate `SHA256SUMS.txt`** from the signed files (the release job already does this from whatever artifacts it downloads, so order the jobs so signing comes first).
5. **Keep the unsigned path working.** Make signing conditional on the SignPath secrets so forks and local runs still build unsigned, as the current certificate-based opt-in does.
6. **Check on a real Windows machine:** the installer and portable exe show a valid signature and publisher, SmartScreen behaves, and an update from the previous signed version installs.

## Interim: what users can do today

Downloads are unsigned. `SHA256SUMS.txt` is published with each release so a user can compare the hash. Windows SmartScreen will warn on first run; that is expected until signing is in place.
