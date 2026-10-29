---
name: split-view
description: "Split view in King Browser: pairing two tabs side by side, drag to split, layout persistence and unsplitting on close. Use when changing useSplitView.ts, the split layout, tab pairing via splitWith, or split behaviour with hibernation and workspaces."
---

# Split view

## Files
`src/hooks/useSplitView.ts` (pairs tabs through `Tab.splitWith`, derives the split partner of the active tab, clears both sides on unsplit), layout in `src/App.tsx` / `src/components/BrowserView.tsx`, drag-to-split in `src/components/TopBar.tsx`.

## Invariants
- Pairing is symmetric: if A.splitWith = B then B.splitWith = A; closing either side clears the other.
- The split partner counts as on screen: `tabManager.ts` keeps it live, hibernation skips it.
- Reordering keeps the pair adjacent (`onReorder` in TopBar re-inserts partners).
- Persisted split state survives restart without referencing tabs that no longer exist.

## Verify
`npm test` (`split_view_mechanics`, `split_view_drag_persistence`, `tab_operations_deep`). Visual layout in RTL: see `localization-rtl`.

## Done when
Invariants hold in tests, including close, reorder and restore paths.
