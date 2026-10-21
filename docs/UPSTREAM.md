# Upstream Record — Nova Browser

> Purpose: Track exactly which upstream code King Browser was derived from, so future maintainers can diff, audit, and honor license obligations.

## Base

| Field | Value |
|---|---|
| Upstream repository | https://github.com/unitybtw/nova-browser |
| Branch | `main` |
| Base commit | `778503ca29ae5496119ac59efb73a2abd6caff8a` |
| Snapshot date | 2026-10-17 |
| Upstream version at snapshot | 1.5.1 |
| License | MIT (see `licenses/nova-browser-LICENSE`) |

## What was taken

The King Browser repository was scaffolded from the upstream commit above, including (full tree copy, then rebranded):

- `electron/` — main process, preloads, MCP server (`mcpServer.ts`), security guards
- `src/` — React renderer (~60 components), locales (`ar.json`, `en.json`), styles
- `tests/` — full test suite (~70 files)
- `scripts/`, `build/`, `public/`, config files
- `mcp-bridge.ts` / `mcp-bridge.mjs` — MCP bridge layer

## What was changed at scaffold time

- `package.json`: name, description, author, version (0.1.0), license field, appId, productName, artifact names, shortcut names; removed upstream GitHub publish config.
- Root `LICENSE` replaced with King Browser's MIT; upstream MIT text preserved at `licenses/nova-browser-LICENSE`.
- Added `THIRD_PARTY_LICENSES.md`, `docs/UPSTREAM.md` (this file), `docs/research/*`.

## Rules for future updates

1. **No automatic merges from upstream.** Pull upstream changes deliberately, review diffs, re-verify build + tests.
2. If a sync happens, update this file with the new base commit and date.
3. Never remove or alter `licenses/nova-browser-LICENSE` or upstream copyright notices.
4. Upstream rebranding in progress: internal identifiers containing "nova" remain in code until the rename pass (tracked as a task); the legal attribution above always applies regardless of internal naming.
