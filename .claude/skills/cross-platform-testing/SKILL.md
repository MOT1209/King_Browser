---
name: cross-platform-testing
description: "Verifying King Browser on Windows, macOS and Linux: what CI covers per OS, how to run the suites locally on each, packaged-build checks, and how to report untested platforms. Use when a change has platform-specific code, before a release, or when a bug is reported on one OS."
---

# Cross-platform testing

## CI coverage (`.github/workflows/ci.yml`)
| Job | OS | Runs | Blocking |
| :--- | :--- | :--- | :--- |
| `test` | ubuntu-latest | typecheck, lint, i18n, bridge drift, prod audit, `npm test`, website build and tests | yes |
| `test-windows` | windows-latest | typecheck, `npm test` | yes |
| `test-macos` | macos-latest | typecheck, `npm test` | no (`continue-on-error`) |
| `electron-e2e` | ubuntu-latest | real Electron smoke + axe | no (new) |
None of them run a packaged installer.

## Local runs
- All OS: `npm ci --ignore-scripts`, `node node_modules/electron/install.js`, `npm run verify`.
- Electron E2E: Linux `xvfb-run -a npm run test:electron`; macOS and Windows `npm run test:electron` with a logged-in desktop session.
- Packaged: `npm run pack:win|pack:mac|pack:linux` on the matching OS, install, then smoke-test: first run, onboarding, new tab, navigation, download, extension install, MCP connect, update check.

## What to look for per OS
Windows: path case, long paths, NSIS install/uninstall, SmartScreen on unsigned builds. macOS: titlebar insets, menu roles, Gatekeeper on unsigned builds, Keychain prompts. Linux: sandbox fallback warning, Wayland vs X11, AppImage vs deb, libsecret availability.

## Reporting
State per OS what ran and what did not ("tests pass on Linux; not run on macOS").

## Verify
`npm run verify` on each OS you claim; `npm run test:electron` where a desktop session exists; CI jobs `test`, `test-windows`, `test-macos`, `electron-e2e` on the pushed commit.

## Done when
Each platform affected by the change is either verified or explicitly listed as unverified with the command to verify it.
