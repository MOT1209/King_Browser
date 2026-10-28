---
name: localization-rtl
description: "Localization and right-to-left support in King Browser: t() and l(), en/ar/de dictionaries, plurals, placeholders, dir=\"rtl\", logical CSS utilities and main-process UI strings. Use when adding or changing any user-visible text, layout direction, date/number formatting or Arabic-specific behaviour."
---

# Localization and RTL

## Facts
- Dictionaries: `src/locales/en.json`, `ar.json`, `de.json`. Runtime: `src/services/i18n.ts` (`t`, `isRTL`, `formatDate`, `formatTime`, `setLanguage`; sets `document.documentElement.dir`), language state in `src/hooks/useThemeLanguage.ts`.
- `l({ en, ar, de }, params)` is used for inline strings in components (see `TopBar.tsx`).
- Main-process strings (dialogs, menus): `electron/main/uiStrings.ts`.
- Checks: `npm run check:i18n` (every English key in ar/de, no stray keys except Arabic CLDR plural forms, no empty values, matching `{placeholders}`), `npm run check:strings` (no literal UI text in `.tsx`; `i18n-ignore` opts a line out).
- RTL layout uses logical Tailwind utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), enforced by `tests/rtl_logical_classes.test.ts`; overlays by `tests/rtl_overlay_regressions.test.ts`. Screenshots: `node scripts/rtl-screenshots.cjs` (needs Electron and a display).

## Rules
- New text: add the key to all three files in the same commit. Arabic needs plural forms (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) where counts appear.
- No `left`/`right`/`ml-`/`mr-`/`pl-`/`pr-` for direction-dependent layout.
- Format dates and numbers through the i18n helpers, not hard-coded locales.
- Directional icons (back/forward arrows) mirror in RTL; logos and media do not.

## Verify
`npm run check:i18n && npm run check:strings && npm test`. Manual: switch to Arabic in Settings and check the changed screen.

## Done when
All three dictionaries are complete, checks pass, and the screen reads correctly in Arabic RTL.
