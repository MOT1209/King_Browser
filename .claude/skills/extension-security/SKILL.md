---
name: extension-security
description: "Chrome extension installation security in King Browser: Web Store ID validation, CRX download, safe zip extraction, manifest permission review, incognito access. Use when touching crxInstaller.ts, webstore-preload.ts, incognitoExtensions.ts, the extensions UI, or extension IPC."
---

# Extension security

## Flow
1. Web Store page (with `webstore-preload.ts`) or King UI calls `install-from-webstore`.
2. `installFromWebstore` (`electron/main/crxInstaller.ts`): sender must be the main window or the top-level `https://chromewebstore.google.com` / `chrome.google.com/webstore/` frame; ID must be 32 chars `[a-p]` or parsed from a Web Store URL.
3. CRX is downloaded, the zip payload extracted to a staging dir by `extractSafeCrxZip` (zip-slip and size checks), manifest parsed (`parseExtensionPermissions`), permissions shown for review (`review-extension-permissions`), then loaded.
4. Incognito access is off by default and per extension (`electron/main/incognitoExtensions.ts`).

## Rules
- Extraction: reject entries with absolute paths, `..`, backslash tricks, symlinks; cap entry count and total size; extract to staging, move only after validation.
- Never auto-grant permissions; host permissions and `<all_urls>` must be shown to the user.
- Extensions are not loaded into the agent partition or incognito unless allowed.
- Toggle/remove/install handlers stay guarded (`toggle-extension`, `remove-extension`, `install-extension` are in the critical list of `tests/security_regression_audit.test.ts`).

## Verify
`npm test` (`extension_archive_extraction`, `incognito_extensions`, `security_regression_audit`). Real installs need internet and a display: follow `extension-compatibility`.

## Done when
Hostile archives are refused by tests, permissions are reviewed by the user, and IPC guards are intact.
