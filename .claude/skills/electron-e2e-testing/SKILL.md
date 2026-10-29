---
name: electron-e2e-testing
description: "End-to-end tests of the real Electron app with Playwright (tests/electron): launching the built app with an isolated profile, loopback fixtures, runtime security checks, tab flows, axe scans, CI job and troubleshooting. Use when adding a user-flow test, a runtime security assertion, or debugging the electron-e2e CI job."
---

# Electron E2E testing

## Setup
- Playwright `@playwright/test` ~1.63 with its experimental `_electron` launcher (works with Electron 43 here; it attaches over the inspector, which the packaged app disables through fuses, so it tests the unpackaged build).
- Needs the Electron binary (`node node_modules/electron/install.js` if installed with `--ignore-scripts`) and `npm run build`.
- Linux needs a display: `xvfb-run -a`. Ubuntu 24.04 also needs the setuid sandbox helper (`sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`). Never add `--no-sandbox` to make it start.

## Files
`tests/electron/playwright.config.ts` (projects `smoke` and `perf`, one worker, output `test-results/electron/`), `kingApp.ts` (launch with temp HOME/XDG_CONFIG_HOME/APPDATA, `skipOnboarding`, `navigateActiveTab`, `readWebContentsSecurity`, loopback fixture server), `smoke.spec.ts`, `a11y.spec.ts`, `startup.perf.ts`.

## Commands
- `npm run test:electron` (smoke project; prefix `xvfb-run -a` on Linux).
- One test: `npx playwright test --config tests/electron/playwright.config.ts --project=smoke -g "keyboard shortcuts"`.
- Failure artefacts: `test-results/electron/**` (trace: `npx playwright show-trace <zip>`).

## Writing a test
Launch per test (the app holds a single-instance lock), use role/label selectors, loopback fixtures, `expect.poll` instead of sleeps, and close the app in `afterEach`.

## CI
Job `electron-e2e` in `.github/workflows/ci.yml`, Linux only, `continue-on-error` until it has passed a few times.

## Verify
`npm run build && xvfb-run -a npm run test:electron` (Linux) or `npm run test:electron` (macOS/Windows); all smoke tests pass.

## Done when
The test passes locally three times in a row and in CI, without network access or timing hacks.
