---
name: extension-compatibility
description: "Testing Chrome extension install and management in King Browser: Web Store installs, enable/disable, removal, options pages, incognito access, and known Electron extension API gaps. Use when verifying that an extension works, changing the extensions UI, or investigating an extension bug report."
---

# Extension compatibility

## Facts
- Electron implements a subset of the Chrome extension APIs; many extensions that rely on unsupported APIs load but do not work. Say so in bug reports rather than promising support.
- UI: `src/components/ExtensionsModal.tsx`, `src/hooks/useExtensions.ts`, Settings `#extensions` (`king://settings#extensions` is a trusted internal page).
- Install path and security: see `extension-security`.

## Manual test procedure (needs internet and a display)
1. `npm run build && npm run dev` (or a packaged build).
2. Open `https://chromewebstore.google.com`, pick a simple extension (a content-script-only one first), install, review the permission dialog.
3. Check: it appears in the extensions list; disable/enable takes effect without restart where Electron allows; remove deletes it; incognito tab does not run it until allowed.
4. Repeat with an extension that has an options page and one with a popup.
5. Record extension name, version, OS and result; unknown APIs show up in the main-process console.

## Automated coverage
`npm test` covers archive safety, permission parsing and incognito rules (`extension_archive_extraction`, `incognito_extensions`), not real installs.

## Done when
Results are recorded per extension with OS and King version, and unverified cases are listed as unverified.
