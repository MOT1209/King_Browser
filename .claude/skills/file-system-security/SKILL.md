---
name: file-system-security
description: "File system safety in King Browser: path canonicalization, containment in userData and Downloads, atomic writes, temp files, archive extraction, filenames from the web. Use when main-process code reads, writes, opens, deletes or extracts files, or builds a path from any external value."
---

# File system security

## Patterns already in the code
- Containment: `resolveContainedDownloadPath` in `electron/main/downloads.ts` uses `realpathSync` on both the target and the Downloads folder (symlinks resolved), lowercases on Windows, then checks the prefix. `open-download` and `show-download-in-folder` only accept contained or registered paths, and `requiresOpenConfirmation` asks before opening HTML/script-like documents.
- Names from the web: `sanitizeDownloadFilename`.
- Derived names: the model cache stores files under `userData/models` named by `sha256(url)` (`modelCachePathFor` in `main.ts`), never by the URL itself; disk budget in `electron/main/modelCacheQuota.ts`.
- Atomic writes: secure store writes go to a temp file then rename, serialized by a mutex (`secure-store-set`); stale temp files are reclaimed only when older than an age gate (`STALE_TEMP_FILE_AGE_MS`).
- Archives: `extractSafeCrxZip` / `loadSafeCrxZip` in `electron/main/crxInstaller.ts` (see `extension-security`).

## Rules
- Never join an external string into a path without `path.resolve` + `realpath` + containment check. Reject `..`, absolute paths, NUL bytes, and on Windows drive letters, UNC paths and reserved names.
- Check, then use, the same resolved path (avoid time-of-check/time-of-use by not re-resolving the original string).
- Write atomically (temp + rename) for files that must not be half-written; keep temp names unique (pid + uuid).
- Fail closed: on any error, do not fall back to a less checked path.

## Verify
`npm test` (`download_open_policy`, `tab_download_lifecycle_regressions`, `extension_archive_extraction`, `local_persistence_data_safety`, `safe_storage_resilience`). Add traversal cases (`../`, symlink out of the folder, `C:\`, `\\server\share`) for new code.

## Done when
Every external path is canonicalized and contained, writes are atomic where needed, and traversal tests exist.
