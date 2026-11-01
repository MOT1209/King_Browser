# Code signing policy

Status: **draft, not in effect.** King Browser builds are not code-signed yet. This policy describes how Windows builds will be signed once the project's application to the SignPath Foundation is approved. Until then, every download is unsigned (see [README: Download a Release](README.md#option-a-download-a-release)).

Free code signing on Windows provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## What is signed

- Only the Windows installers and executables built from this repository (`MOT1209/King_Browser`) by the GitHub Actions workflow `.github/workflows/release.yml`, from a commit on `main` or a `v*` tag.
- Nothing built on a personal computer, and nothing from a fork or an unmerged pull request, is ever submitted for signing.
- Third-party binaries shipped inside the app (Electron and the npm packages listed in `package-lock.json`) are signed only as part of the King Browser package; they are not signed separately under the King Browser name.

## Team roles

| Role | Who | Responsibility |
| :--- | :--- | :--- |
| Committers and reviewers | [MOT1209](https://github.com/MOT1209) | May merge changes into `main`. Every change reaches `main` through a pull request that passes the required CI checks. |
| Approvers | [MOT1209](https://github.com/MOT1209) | Approve each signing request in SignPath before a release is signed. |

Some changes are written with the help of AI coding agents (the pull request and the commit trailer say so). These changes go through the same pull request, CI and approval steps as any other change, and a human with the role above decides whether they are merged and whether a build is signed.

Everyone with a role in this table uses multi-factor authentication on GitHub and on SignPath.

## How a release is signed

1. A change that raises `version` in `package.json` is merged into `main` after CI passes (typecheck, lint, the test suites on Linux, Windows and macOS, the production dependency audit and CodeQL).
2. `release.yml` builds the Windows artifacts on a GitHub-hosted runner from that commit. The actions it uses are pinned to commit SHAs.
3. The unsigned artifacts are submitted to SignPath. An approver checks that the request comes from that workflow run and that commit, then approves it.
4. The signed artifacts, together with `SHA256SUMS.txt`, are published on the [Releases page](https://github.com/MOT1209/King_Browser/releases).

The rolling `nightly` pre-release is not signed.

## Privacy

King Browser is a web browser, so it connects to the sites you open. Apart from that, it contacts only the services listed under [README: Network connections](README.md#network-connections), each at the moment the table describes. It ships no analytics or crash-reporting SDK. Some of those connections happen without an action from you: the update check (GitHub), ad-block filter list downloads, interface fonts and the new-tab wallpaper. Others run only when you use the feature or turn it on: search suggestions while typing, page translation, local model downloads, King Sync and your own custom MCP tools.

## Reporting a problem

If you find a signed King Browser binary that was not produced by the process above, or a security problem in a signed release, report it privately through [GitHub Security Advisories](https://github.com/MOT1209/King_Browser/security/advisories/new) (see [SECURITY.md](SECURITY.md)).
