---
name: accessibility
description: "Accessibility work in King Browser: keyboard navigation, focus management in dialogs and popovers, ARIA semantics, labels through i18n, contrast and reduced motion. Use when building or changing any interactive UI component, dialog, menu, popover or keyboard shortcut."
---

# Accessibility

## Existing building blocks
- Dialogs: `src/hooks/useDialogA11y.ts`, `src/hooks/useModalFocusTrap.ts` (focus trap, Escape, focus restore); tested by `tests/dialog_a11y.test.ts`.
- Controls that only appear on hover must also appear on keyboard focus: `tests/hover_only_controls.test.ts`.
- Vertical tabs use `role="tab"` / `aria-selected` (`SidebarTabs.tsx`); the horizontal strip is a `div` group of `div` items (`TopBar.tsx`).
- Labels (`aria-label`, `title`, `alt`, `placeholder`) go through `t()` / `l()`; `npm run check:strings` rejects literals.
- Visual rules and contrast tokens: `DESIGN.md`.

## Rules
- Every interactive element is reachable and operable by keyboard, has a visible focus style and an accessible name.
- Use native elements (`button`, `a`, `input`) before ARIA roles; do not put `li` outside `ul`/`ol` (axe `listitem`).
- Opening a dialog moves focus in; closing returns it to the trigger.
- Respect `prefers-reduced-motion` for new animations.
- Text contrast at least 4.5:1 (3:1 for large text).

## Verify
`npm run check:strings && npm test`, then `npm run build && xvfb-run -a npm run test:electron` (axe scan, see `accessibility-testing`), then a manual keyboard pass.

## Done when
Keyboard-only use works for the changed UI, labels are translated, and axe reports no new violation kinds.
