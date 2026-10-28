---
name: release-validation
description: "Validating a King Browser release before and after the version bump: green CI, packaged builds, fuses, update integrity, checksums, signing status and smoke tests. Use when preparing a release, changing packaging, electron-builder config, fuses or the updater, or checking a nightly."
---

# Release validation

## How releases happen (`.github/workflows/release.yml`)
- Every push to `main` (except docs-only paths) rebuilds the rolling `nightly` pre-release.
- Raising `version` in `package.json` on `main` publishes `v<version>` once. Do not bump the version unless the owner asked (CLAUDE.md).
- Signing is optional (repository secrets); unsigned builds trigger Gatekeeper/SmartScreen warnings.
- Do not change the release workflow without the owner's request.

## Checklist
1. CI green on the release commit, including Windows; check macOS and `electron-e2e` reports even though they do not block.
2. `npm run audit:prod` passes.
3. Packaged build per OS (`npm run pack:<os>`); `scripts/apply-fuses.cjs` ran (look for its log line in the build output).
4. Updater: `electron/main/updateIntegrity.ts` reports whether the release metadata carried a digest; a release without `sha512` must show the "not integrity-checked" warning (`tests/update_integrity.test.ts`).
5. Checksums: README "Binary Verification" commands match the published files. Optional `npm run scan:vt` needs a VirusTotal key from the environment, never committed.
6. Smoke test the installed app (see `cross-platform-testing`).
7. Release notes: changelog sources in `src/components/changelog` / `public/changelog` describe only shipped, verified changes.

## Verify
`npm run verify`, `npm run audit:prod`, `npm run pack:<os>` on each target OS, then the installed-app smoke test.

## Done when
Every checklist item is PASS, FAIL with a decision, or explicitly not run, and no release was published without the owner's go-ahead.
