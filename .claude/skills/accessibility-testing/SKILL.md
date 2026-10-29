---
name: accessibility-testing
description: "Testing King Browser accessibility: the axe-core scan in tests/electron/a11y.spec.ts, the known-violations list, dialog focus tests, string checks, and the manual keyboard and screen reader pass that automation cannot replace. Use when verifying UI changes for accessibility or updating the axe baseline."
---

# Accessibility testing

## Automated
- `tests/electron/a11y.spec.ts`: axe-core (`@axe-core/playwright`, legacy mode because Electron forbids the helper page) on onboarding and the browser shell with a new tab. Fails on any rule not in `KNOWN_VIOLATIONS`; known ones are tracked in `docs/engineering/quality-baseline.md`.
- `tests/dialog_a11y.test.ts`, `tests/hover_only_controls.test.ts` in `npm test`.
- `npm run check:strings`: labels go through i18n.

## Updating the baseline
- Fixed a known violation: remove it from `KNOWN_VIOLATIONS` and the doc in the same commit.
- New violation: fix it. Adding it to the known list needs a written reason and a tracking entry; never to get a red run green silently.
- New screen worth scanning: add a test that navigates there and calls `scan(page)`.

## Manual pass (automation cannot judge these)
1. Keyboard only: Tab/Shift+Tab through the changed UI; every control reachable, visible focus, logical order, Escape closes popovers and returns focus.
2. Screen reader (NVDA on Windows, VoiceOver on macOS, Orca on Linux): names and roles are announced sensibly.
3. Arabic RTL: order and focus still make sense.
4. 200% zoom and reduced motion.

## Verify
`npm run build && xvfb-run -a npm run test:electron`, plus the manual pass with the OS and assistive technology recorded.

## Done when
No new axe rule fails and the manual pass is recorded (or explicitly listed as not done).
