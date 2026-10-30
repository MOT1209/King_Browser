---
name: download-management
description: "Downloads in King Browser: save path handling, filename sanitising, dangerous and script-capable types, ask-before-open, progress and the downloads UI. Use when changing electron/main/downloads.ts, useDownloads.ts, DownloadsPage, or the open-file flow."
---

# Download management

## Purpose
A downloaded file is attacker-chosen content with an attacker-chosen name. Saving is allowed; opening an executable or script-capable file is a separate decision that asks the person first.

## Files
`electron/main/downloads.ts`, `src/hooks/useDownloads.ts`, `src/components/DownloadsPage.tsx`, `src/components/DownloadToast.tsx`, `src/components/DownloadsPopover.tsx`, `tests/download_open_policy.test.ts`, `tests/tab_download_lifecycle_regressions.test.ts`, `tests/security_utils_classification.test.ts`.

## Workflow
1. Derive the filename from the response, strip path separators and reserved names, and resolve the final path inside the Downloads folder (`file-system-security`).
2. Classify the type: dangerous extensions are refused or confirmed; script-capable types (HTML, SVG, scripts, shortcuts) ask before opening.
3. Keep the extension lists in step with the open-external check in `main.ts` (the module comment explains why they are duplicated).
4. Track progress and cancellation per download id; remove listeners when the item completes or is cancelled.
5. Agent-triggered downloads stay under the `dangerous_download` approval trigger in the policy engine.

## Rules
- Never open a file because the page asked; only a user action opens it.
- Never write outside the Downloads folder; no overwrite without a unique-suffix scheme.
- Do not log full local paths into the activity log.

## Verify
`npm test` (`download_open_policy`, `tab_download_lifecycle_regressions`); manual check on a real OS that the open prompt appears for an `.html` download.

## Common failures
Windows reserved names and trailing dots; case-insensitive extension bypass (`.EXE`); double extensions; progress listener left attached; a new extension added to one list only.

## Done when
Traversal and dangerous-type tests pass and both extension lists agree.
