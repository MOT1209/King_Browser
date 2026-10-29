---
name: secret-management
description: "Handling secrets in King Browser: safeStorage encryption, the MCP bearer token, sync keys, saved passwords, .env, and keeping secrets out of source, logs, approvals and activity history. Use when code stores, transmits, logs or displays a password, token, key or credential, or when touching .env files."
---

# Secret management

## Rules (CLAUDE.md hard rule 3)
- Secrets never go to plain `localStorage`. Use the main-process secure store: `secure-store-set` / `secure-store-get` IPC, which encrypts with Electron `safeStorage` and, when the OS keyring is unavailable, an AES-256-GCM fallback (`electron/main/proxySecurity.ts` `encryptDataWithFallback`) with a warning.
- The MCP bearer token is encrypted at rest and compared with `timingSafeEqual` (`electron/mcpServer.ts`). Never print it, put it in a URL, or include it in test fixtures.
- Sync is end-to-end encrypted (`src/services/syncCrypto.ts`, envelope version 2). Do not change the format without the owner (CLAUDE.md "When unsure").
- `.env` is local and gitignored; `.env.example` only lists empty `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is public by design; service-role keys never belong in this repo.
- Redaction: `redactArgs` / `redactArgsForLog` in `electron/main/policyEngine.ts` strip sensitive fields (`SENSITIVE_SELECTOR_PATTERNS`) from approvals, run history and logs; `redactUrlForLog` in `downloads.ts`; renderer logs go through `src/utils/logger.ts`.
- `src/utils/safeStorage.ts` never writes cleartext backups of sensitive keys.

## Workflow
1. Grep your diff for `console.log`, `logger.`, `localStorage.setItem`, `JSON.stringify` near secret values.
2. Scan staged changes before committing: `git diff --cached | grep -inE '(api[_-]?key|secret|token|password)[^A-Za-z0-9]{1,4}[A-Za-z0-9_/+=-]{16,}'` and check each hit.
3. GitHub secret scanning runs on the public repo; do not rely on it as the only check.

## Verify
`npm test` (`ai_memory_security`, `data_backup_sanitization`, `policy_engine`, `safe_storage_resilience`, `mcp_bridge_config_regressions`).

## Done when
No secret is stored in plaintext, logged, or committed, and redaction tests cover new sensitive fields.
