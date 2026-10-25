# DESIGN.md

Design system for the King Browser application UI (`src/`). Related sources, in order of authority:

1. `src/index.css` - the tokens actually shipped.
2. `docs/brand-guidelines.md` - logo, voice and brand colors.
3. `docs/design/changelog/DESIGN.md` - the changelog surface's own tokens (cobalt journal palette).
4. `website/DESIGN.md` - marketing site (separate system: warm white, ink, electric blue, Manrope).

Do not mix the website system into the app. Where sources disagree, `src/index.css` wins; say so in the PR if you change a token.

## Principles

- **Sovereign, precise, restrained.** The browser chrome stays calm; page content is the star. No glows, drop shadows, bevels or decoration without a job.
- **Control is visible.** When an agent acts, the human sees what, where and why: the AI cursor overlay, the approval card (page, element, intended action, consequences, uncertainty) and the activity log. Never hide agent state behind a modal the user must hunt for.
- **Concrete text.** Say what happens. Avoid "supercharge", "magic", "blazing fast"; prefer numbers and nouns ("capped at 6 live tabs").
- **Follow the user's theme.** Light and dark are both first class; a feature is not done until both look right.
- **Three languages.** English, Arabic (RTL) and German. Layouts must survive 30-40% longer German strings and mirrored Arabic.

## Color

App tokens (from `src/index.css`; use the CSS variables or Tailwind classes, not raw hex):

| Role | Light | Dark |
| :--- | :--- | :--- |
| Frame / header / sidebar | `#f1f5f9` (slate-100) | `--nova-slate-950` |
| Toolbar, card, active tab | `#ffffff` | `--nova-slate-800` |
| Background | `#ffffff` | `--nova-slate-900` |
| Foreground | `#09090b` | `#fafafa` |
| Primary (neutral button) | `#18181b` on `#fafafa` | `#fafafa` on `#18181b` |
| Border | `#e4e4e7` | `--nova-slate-700` |
| Subtle border | `rgba(0,0,0,0.08)` | token `--nova-border-subtle` |

Accent: `--color-accent` (user-selectable via `--nova-accent`, default blue-500, with `-hover`, `-light`, `-dark`, `-text` variants). Always use the accent variables so the user's choice applies.

Brand and semantic colors (`docs/brand-guidelines.md`):

| Meaning | Hex |
| :--- | :--- |
| Brand cyan (logo, focus ring) | `#06B6D4`, pressed `#0891B2` |
| Highlight | `#38BDF8` |
| Success (verified, sync active) | `#10B981` |
| Warning (permission requested, memory limit) | `#F59E0B` |
| Error (blocked host, network failure) | `#EF4444` |

Rules:

- Status is never color alone: pair with an icon or text.
- Text contrast at least 4.5:1 (3:1 for large text and UI borders), in both themes. New-tab wallpapers need a contrast scrim (see `tests/newtab_wallpaper_contrast.test.ts`).
- Approval and risk surfaces use warning/error colors sparingly, so that they stay noticeable.
- No rainbow, violet or multi-stop gradients on the logo or brand surfaces.

## Typography

- UI: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (Tailwind `font-sans`). `index.html` also loads Inter and Lora; Lora is for reader-style content only.
- Code and tokens: `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`.
- Body 14px / 1.6; secondary 12-13px; headings 20-27px, weight 400-500 with slight negative tracking; buttons 12-13px weight 600.
- Arabic uses the system Arabic fallback in the same stack; do not set letter-spacing on Arabic text.

## Spacing, shape, elevation

- 4px base grid. Common steps: 6, 8, 12, 16, 24, 42, 64.
- Radius: 6px compact (chips, tabs), 8px controls (buttons, inputs), 12px media and cards, 50% circular icons.
- Elevation: borders first, shadow only for floating layers (popovers, toasts, modals). One soft shadow per layer, no stacking.
- Min hit target 32x32px in toolbars, 24px inside dense lists; keep 8px between adjacent targets.

## Components

Primitives live in `src/components/ui/` (`ai-chat-input`, `KingAssistantIcon`) and are configured by `components.json` (shadcn-style). Check there and in `src/components/` before adding a new one.

- **TopBar / tabs:** horizontal and vertical layouts must both work (`src/utils/verticalTabs.ts`). Active tab uses the card color; hover uses `--nova-inactive-tab-hover-bg`.
- **Popovers and modals:** use `useDialogA11y` / `useModalFocusTrap`: focus moves in, Escape closes, focus returns. Destructive buttons are never the default focus.
- **Approval card (`AssistantApprovalCard`):** shows website domain, target element, intended action, affected resource, consequences and uncertainty. Approve and Reject are equally reachable by keyboard; Reject is the safe default. Passwords and sensitive input are redacted, never shown.
- **Agent surfaces (`AgentControlPanel`, `AICursorOverlay`):** run state (running, paused, waiting for approval, stopped) is always readable; Pause and Stop are one click away.
- **Toasts (`UpdateToast`, `DownloadToast`):** non-blocking, dismissible, no auto-dismiss for errors that need action.
- **Empty and error states:** one line saying what happened, one action. No illustrations that outweigh the message.

## Motion

- 120-200ms for hover and focus, 200-300ms for panels. Ease-out. Animate opacity and transform only.
- No perpetual loops except real progress (loading, recording). Respect `prefers-reduced-motion`: replace movement with fades or nothing.
- Motion must carry meaning: the AI cursor moving to a target shows where the agent acts; do not animate for decoration.

## Accessibility

- Every interactive element is reachable and operable by keyboard with a visible focus ring (brand cyan or accent, 2px, offset).
- Icon-only buttons have `aria-label` (through `t()`); dialogs have role, label and focus trap.
- Respect system text scaling and zoom (`useZoom`); layouts do not clip at 200%.
- Announce agent state changes and approval requests with a polite live region.

## Internationalization and RTL

- No literal strings in `.tsx` (`npm run check:strings`). Add the key to `en.json`, `ar.json` and `de.json` (`npm run check:i18n`); placeholders must match.
- Use logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start`, `end`) instead of left/right. Mirror directional icons (back, forward, chevrons) in RTL; do not mirror logos, media controls or numerals.
- Test each new screen in English, Arabic and German, in light and dark.

## Assets and brand

- Logo: celestial compass in an obsidian squircle. Masters: `public/logo.svg`, `build/icon.*`. Min sizes 16px (mark), 24px (app icon). Do not rotate, stretch, glow or recolor.
- Real product screenshots only for docs and the website; capture them with the scripts in `scripts/capture_*`.
- Do not add fonts, icon packs or image dependencies without checking the CSP in `index.html` and the license table in `THIRD_PARTY_LICENSES.md`.

## Review checklist

Before shipping a UI change:

- [ ] Uses existing tokens and accent variables; no new raw colors.
- [ ] Light and dark verified; contrast checked.
- [ ] English, Arabic (RTL) and German verified; i18n scripts pass.
- [ ] Keyboard path, focus ring, labels and Escape behavior verified.
- [ ] Reduced-motion behavior verified.
- [ ] Horizontal and vertical tab layouts and split view still work.
- [ ] Agent state and approval visibility not reduced.
- [ ] No emojis in code, strings or docs.
