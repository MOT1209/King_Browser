---
name: dependency-management
description: "Rules for adding, upgrading or removing npm dependencies in King Browser: audit first, prefer existing packages, devDependency versus runtime dependency, lockfile discipline, licences and the Network connections table. Use before any npm install, version bump or removal."
---

# Dependency management

## Purpose
Every package is code that ships to users or runs in CI with their trust. Add one only when it pays for itself.

## Facts
- npm with a committed `package-lock.json`; CI installs with `npm ci --ignore-scripts`.
- `dependencies` holds only what the packaged main process loads at runtime and esbuild leaves external (`@ghostery/*`, `express`, `jsdom`, `electron-updater`, ...). Everything bundled by Vite or esbuild is a `devDependency`, including React.
- `overrides` pins transitive versions (`sprintf-js`, `playwright-core`).
- Dependabot version updates are deliberately disabled (`.github/dependabot.yml`); do not re-enable them without the owner.
- The decision record for tooling packages is `docs/engineering/agent-tooling.md` ("Dependency decisions").

## Before adding a package, record
Name, purpose, whether something in the tree already does it (`npm ls <name>`, grep `package.json`), Node/Electron compatibility, last release and maintenance, known advisories (`npm view <pkg> time`, `npm audit`), dev or runtime, bundle impact, licence (`npm view <pkg> license`), verification command, and why existing deps are not enough. Put the record in the decision doc.

## Workflow
1. `npm ls <pkg>`: maybe it is already a transitive dependency you can use (but list it explicitly if you import it).
2. Pick a version at least two weeks old; constrain with `~` for tools with frequent breaking minors.
3. `npm install -D --ignore-scripts <pkg>@<range>`; check `git diff package-lock.json` for duplicate copies (`npm ls <pkg>`) and dedupe with `overrides` if needed.
4. If the renderer or main process will contact a new host, add it to README "Network connections" and to the CSP (CLAUDE.md rule 8); see `content-security-policy`.
5. Removing: prove it is unused (grep `electron/ src/ tests/ scripts/ video/ website/`, config files, `vite.config.ts` manualChunks). Tools such as `npx knip` report false positives here because they do not know the esbuild entry points.

## Safety
Never add analytics or crash-reporting SDKs (CLAUDE.md rule 8). Never commit an install that ran with `--force` or `--legacy-peer-deps` without saying so.

## Verify
`npm ci --ignore-scripts` from a clean tree, `npm run audit:prod`, `npm run verify`.

## Done when
The lockfile changed only for the intended packages, `npm run audit:prod` passes, and the decision is recorded.
