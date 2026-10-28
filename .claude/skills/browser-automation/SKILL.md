---
name: browser-automation
description: "Driving King Browser deterministically as an agent or in tests: MCP tools, snapshot refs (e12), waiting, run control, Playwright against the Electron app, and safe automation habits. Use when writing an agent workflow over MCP, adding automation to tests, or debugging flaky agent actions."
---

# Browser automation

## Two ways to automate
1. As a driver agent through MCP (rules in AGENTS.md section 2): `king_browser_info`, `browser_status`, then `browser_snapshot` for refs, act by ref, re-snapshot after page changes. Refs (`e<number>`) come from `electron/main/elementRefs.ts` / `src/utils/elementSnapshot.ts` and are cleared by navigation and each new snapshot.
2. As a test harness with Playwright: `tests/electron/kingApp.ts` launches the built app with a throwaway profile and a loopback fixture server.

## Determinism rules
- Wait for a condition (`browser_wait_for`, Playwright `expect.poll`, `locator.waitFor`), never a fixed sleep, except where a comment explains why (axe waits for entrance animations).
- Use loopback fixtures, not live sites, in automated tests.
- Select by accessible role/label or stable data attributes (`data-tab-id`), not CSS classes.
- One action at a time; respect `awaiting_approval`, pause and stop. Never route around an approval.
- Agent navigation to private addresses is refused by design (see `ssrf-protection`); use the human address bar path in tests.

## Running the Electron harness
`npm run build` then `xvfb-run -a npm run test:electron` on Linux (no `xvfb-run` on macOS/Windows). Traces and screenshots of failures land in `test-results/electron/`.

## Verify
`npm run build && xvfb-run -a npm run test:electron` three times in a row without failures; for MCP workflows, `npm run test:integration` against a running app.

## Done when
The workflow passes repeatedly without timing hacks and never bypasses the approval gate.
