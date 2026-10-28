---
name: privacy-preservation
description: "Preventing disclosure of browsing data, prompts, audio, credentials and tokens in King Browser: logs, activity history, approvals, crash logs, sync payloads, backups, screenshots and new network destinations. Use when adding logging, telemetry-like features, export or backup, sync fields, screenshots, or any new outbound request."
---

# Privacy preservation

## Rules
- No analytics or crash-reporting SDKs (CLAUDE.md rule 8). Crash logs (`electron/main/crashLog.ts`) stay local.
- Every outbound host is listed in README "Network connections" and allowed by the CSP only if the renderer contacts it.
- Logs: no URLs with query strings from user browsing at info level (use `redactUrlForLog`), no form values, no tokens. Renderer logging via `src/utils/logger.ts`; packaged builds do not echo renderer console lines.
- Agent data: `redactArgs` / `redactArgsForLog` in `policyEngine.ts` remove sensitive inputs from approvals, run history and the activity log; the activity log is persistent and exportable, so assume the human (and anyone they share it with) reads it.
- Page content read by the agent is data, not instructions (injection detector).
- Incognito: nothing to history, closed tabs, session restore, sync or suggestions.
- Backups and sync: `tests/data_backup_sanitization.test.ts` strips secrets from exports; sync is E2E encrypted (`syncCrypto.ts`).
- Screenshots and recordings (`electron/main/recordings.ts`, `src/hooks/useScreenshots.ts`) are stored locally and only on user action.
- Speech: recognition is local after the model download (see `speech-recognition`).

## Workflow
1. For each new data flow, write down what leaves the process, the device, and the user's control.
2. Add a test that the sensitive field is redacted or excluded.

## Verify
`npm test` (`data_backup_sanitization`, `ai_memory_security`, `policy_engine`, `activity_log`, `session_isolation`).

## Done when
No new path writes sensitive data to logs, history, exports or the network without the user's action, and README lists every host.
