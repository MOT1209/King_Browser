---
name: tab-management
description: "Tab lifecycle in King Browser: creating, switching, closing, pinning, reordering, hibernating and restoring tabs, the live-webview LRU pool, recently closed tabs and session restore. Use when changing tab state, the tab strip or vertical tabs, hibernation, closed-tab history or tab persistence."
---

# Tab management

## Files
- State and operations: `src/hooks/useTabOperations.ts`, `src/App.tsx`, types in `src/types/browser.ts` (`Tab`).
- Live versus suspended webviews: `src/utils/tabManager.ts` `computeLiveAndSuspendedTabs` (default `maxLive` 6; keeps active, split partner, audio, pinned, loading).
- Idle hibernation: `src/hooks/useTabHibernation.ts` (30 s tick, `hibernationTimeoutMinutes` setting).
- Persistence: `src/hooks/useSessionPersistence.ts` (which fields trigger a `session_tabs` write and which are runtime-only; incognito tabs are filtered out).
- Recently closed: `src/hooks/useClosedTabs.ts`, `src/services/closedTabsStore.ts`.
- UI: `src/components/TopBar.tsx` (horizontal strip, `data-tab-id`, framer-motion `Reorder`), `src/components/SidebarTabs.tsx` (vertical, `role="tab"`), `src/utils/verticalTabs.ts` (reorder within a workspace/folder group), `src/components/TabContextMenu.tsx`.
- Shortcuts: `src/utils/keyboardShortcuts.ts`, `src/utils/shortcutCatalog.ts`, main-menu accelerators `electron/main/shortcutAccelerators.ts`.

## Rules
- Closing a tab must release its webview and, for incognito, its partition (`clear-incognito-session`).
- Runtime-only fields (`isLoading`, `webContentsId`, `blockedAdsCount`, `thumbnail`) must not trigger disk writes; add new fields to the right list in `useSessionPersistence.ts`.
- Incognito tabs are never persisted or put in closed-tab history.
- Keep the agent tab marker and approval state consistent when an agent-controlled tab closes (`tests/agent_tab_marker.test.ts`).

## Verify
`npm test` (`tab_operations_deep`, `vertical_tabs`, `closed_tabs_persistence`, `performance_optimization_audit`, `local_persistence_data_safety`, `tab_download_lifecycle_regressions`), then `xvfb-run -a npm run test:electron` (Ctrl/Cmd+T and Ctrl/Cmd+W in `tests/electron/smoke.spec.ts`).

## Done when
Open, close, switch, restore and hibernate behave as before for normal and incognito tabs, and tests cover the change.
