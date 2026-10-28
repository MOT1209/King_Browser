---
name: session-management
description: "Sessions, partitions, cookies and storage in King Browser: default profile, per-tab incognito partitions, the agent partition persist:king-agent, privacy headers, adblock per session, and clearing data. Use when touching session.fromPartition, cookies, storage clearing, incognito behaviour or the agent profile."
---

# Session management

## Partitions
| Partition | Used by | Persistence |
| :--- | :--- | :--- |
| default (`''`) | Normal tabs | Persistent profile |
| `incognito-<tabId>` | Each incognito tab | In-memory (`cache: false`), cleared by `clear-incognito-session` |
| `persist:king-agent` (`AGENT_PERSIST_PARTITION`) | Agent profile | Persistent, separate cookies from the user's profile |

Per-session setup in `electron/main.ts`: `applyStrictSecurityToSession`, `applyPrivacyHeadersToSession`, adblock (`applyAdBlockerToSession`), permission handlers, downloads manager (`registerDownloadsManager`). `hardenIncognitoPartition` applies them to new incognito partitions.

## Rules
- A new partition name must be added to the `will-attach-webview` allowlist AND get the same hardening as existing ones; otherwise it is an unhardened profile.
- Popups inherit the opener's session explicitly (`session: contents.session`); keep that for any new window.
- Incognito data never reaches disk, history, closed tabs or sync.
- Clearing data must cover cookies, storage, cache and service workers of the right partition only.
- Renderer storage of the app itself (`localStorage`) is not for secrets (see `secret-management`).

## Verify
`npm test` (`session_isolation`, `incognito_extensions`, `agent_profile_settings`, `security_regression_audit` R1.2 incognito checks).

## Done when
Each partition keeps its hardening and isolation, and tests cover any new partition or clearing path.
