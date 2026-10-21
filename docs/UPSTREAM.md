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

- `package.json`: name, description, author, version (0.0.1), license field, appId, productName, artifact names, shortcut names; GitHub publish config repointed to `MOT1209/King_Browser` (the updater only accepts releases from this repository).
- Root `LICENSE` replaced with King Browser's MIT; upstream MIT text preserved at `licenses/nova-browser-LICENSE`.
- Added `THIRD_PARTY_LICENSES.md`, `docs/UPSTREAM.md` (this file), `docs/research/*`.

## Rules for future updates

1. **No automatic merges from upstream.** Pull upstream changes deliberately, review diffs, re-verify build + tests.
2. If a sync happens, update this file with the new base commit and date.
3. Never remove or alter `licenses/nova-browser-LICENSE` or upstream copyright notices.
4. Rebranding is done for user-visible text, the website, code identifiers, CSS names, IPC/event names and assets. These upstream identifiers are **kept on purpose** because they are stored data formats; renaming them would lose local data or make encrypted sync vaults undecryptable:
   - `nova_*` localStorage / secure-store keys (e.g. `nova_session_tabs`, `nova_e2ee_master_key`)
   - the `nova-secure-salt` key-derivation salt
   - the Supabase tables `nova_sync_vaults`, `nova_pairing_invitations` and the function `consume_nova_pairing_invitation`
   - the legacy `nova-` / `nova:` sync-code prefixes accepted by `normalizeSyncCode`
   The website tour video and its captions still narrate "Nova"; they need a new recording. The legal attribution above applies regardless of naming.
