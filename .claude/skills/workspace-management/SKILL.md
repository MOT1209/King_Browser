---
name: workspace-management
description: "Workspaces, folders and tab groups in King Browser: creating, switching, deleting, tombstones for sync, folder colors and moving tabs between groups. Use when changing useWorkspaces.ts, useFolders.ts, WorkspaceManager.tsx, verticalTabs.ts folder logic or their sync."
---

# Workspace management

## Files
`src/hooks/useWorkspaces.ts` (row stores keep tombstones so deletes sync; UI renders live views), `src/hooks/useFolders.ts`, `src/components/WorkspaceManager.tsx`, `src/utils/verticalTabs.ts` (`getTabWorkspaceId`, `reorderTabsWithinGroup`, `repairTabFolderAssignments`, `canMoveTabToFolder`), `src/utils/folderColors.ts`.

## Invariants
- Tabs without `workspaceId` belong to `default`.
- Deleting a workspace or folder leaves a tombstone row until sync has propagated it; never hard-delete rows that sync may resurrect.
- Folder colors are palette keys only (`normalizeFolderColor`), never CSS from synced data.
- Repair on load: tabs pointing at missing folders are reassigned, not dropped.

## Verify
`npm test` (`workspace_state_management`, `folder_color`, `vertical_tabs`, `backup_tombstone`, `sync_deletion_and_conflict`).

## Done when
Create, switch, delete and sync round-trips keep tabs and tombstones consistent in tests.
