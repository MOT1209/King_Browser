---
name: adblock-engineering
description: "Ad and tracker blocking in King Browser with @ghostery/adblocker-electron: filter engine setup, per-session enablement, the user whitelist, CAPTCHA and streaming allowlist, blocked-count reporting. Use when changing adblockManager.ts, adblockWhitelist.ts, the shield popover or filter behaviour, or when a site breaks because of blocking."
---

# Adblock engineering

## Files
- `electron/main/adblockManager.ts`: engine init (`initAdBlocker`), per-session apply, `CAPTCHA_WHITELIST_RULES` (CAPTCHA, verification and critical streaming domains that must never be blocked), `updateAdblockWhitelist` (validates each host again).
- `src/utils/adblockWhitelist.ts`: user list under `adblocker_whitelist`, normalisation of entries; UI `src/components/AdBlockerPopover.tsx`, Settings > Privacy.
- Blocked counts reach the renderer in batches (`ad-blocked-batch`), deliberately not persisted.

## Rules
- A site breakage fix goes into a narrow allow rule with a comment naming the site and symptom, never a global disable.
- Whitelist entries are hostnames only; never pass raw user text into filter syntax.
- Blocking applies to default, incognito and agent sessions consistently.
- Filter list downloads are network destinations: keep README "Network connections" accurate.

## Verify
`npm test` (`adblock_filter_engine`, `adblock_whitelist`, `search_localization_captcha`). Real-site behaviour needs internet: state that it was not run if you could not.

## Done when
The fix is scoped, whitelist input is validated, and filter tests pass.
