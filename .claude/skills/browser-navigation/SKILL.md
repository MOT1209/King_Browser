---
name: browser-navigation
description: "Navigation features of King Browser: address bar and omnibox, search engines and suggestions, back/forward/reload, history recording, redirects, internal king:// pages and downloads. Use when changing how a URL or query becomes a page load, history, suggestions or the download flow."
---

# Browser navigation

## Files
- Address bar: `src/components/topbar/OmniboxBar.tsx`, `src/components/SpotlightOmnibox.tsx`; query vs URL: `src/utils/searchEngine.ts`; suggestions IPC `get-suggestions` in `electron/main/suggestions.ts` with `src/utils/suggestionCache.ts`.
- Validation: `src/utils/safeNavigation.ts` (see `url-navigation-security`).
- Webview navigation: `src/hooks/useWebviewNavigation.ts`, `src/components/BrowserView.tsx`.
- History: `src/hooks/useHistoryRecorder.ts`, search in `src/utils/searchHistoryBookmarks.ts`, page `src/components/HistoryPage.tsx`.
- Internal pages: `king://newtab|settings|history|downloads|changelog|whats-new`, rendered by React, not loaded into the privileged window.
- Downloads: `electron/main/downloads.ts` (safe URL, filename sanitizing, open confirmation), UI `src/hooks/useDownloads.ts`, `DownloadsPage.tsx`, `DownloadsPopover.tsx`, `DownloadToast.tsx`.
- Site zoom: `src/utils/siteZoom.ts`, `src/hooks/useZoom.ts`.

## Rules
- Every navigation entry point validates through the shared helper; the agent path uses the stricter agent validators.
- History is not recorded for incognito; redirects must not record intermediate auth URLs with tokens.
- Suggestions requests go through main (CSP) and never include incognito queries.

## Verify
`npm test` (`search_engine_formatting`, `history_bookmarks_search`, `history_recorder_lifecycle`, `download_open_policy`, `search_localization_captcha`, `site_zoom`), then `xvfb-run -a npm run test:electron` (address bar navigation to a loopback fixture).

## Done when
Typed URLs, searches, back/forward and downloads behave as tested, with no new unvalidated entry point.
