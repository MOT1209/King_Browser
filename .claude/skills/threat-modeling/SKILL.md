---
name: threat-modeling
description: "Threat modeling for King Browser features: assets, trust boundaries (pages, extensions, MCP clients, synced devices, the agent), attacker capabilities and mitigations. Use when designing a new feature that crosses a trust boundary, adds a network listener, IPC surface, agent tool or sync field, or when asked for a security assessment."
---

# Threat modeling

## Assets
Browsing data (history, cookies, sessions per partition), saved passwords and secure store, MCP bearer token, sync vault and keys, local files (Downloads, userData), the human approval decision, the OS (via openExternal, downloads, extensions).

## Actors and boundaries
| Actor | Can | Boundary that stops it |
| :--- | :--- | :--- |
| Web page in a tab | Run JS in a sandboxed guest, request permissions, open popups, start downloads, inject text an agent reads | webview hardening, guest preload, permission handlers, popup rate limit, download policy, injection detector |
| Extension | Run in a session with granted permissions | install review, incognito opt-in, partition rules |
| MCP client on localhost | Call tools with the token | Host/Origin checks, token, tool tiers (safe/medium/sensitive, medium off by default), policy engine, approval gate |
| The AI agent itself (possibly prompt-injected) | Ask for any tool call | `policyEngine.ts`, `approvalMode.ts` (no mode disables approval), site rules, agent navigation guard |
| A synced device | Push settings and data | E2E encryption, approval mode stored only in main (not synced) |
| Local malware as the same user | Read userData | Out of scope beyond safeStorage; state this explicitly |

## Workflow (per feature)
1. Draw the data flow: which process, which IPC/HTTP edge, which storage.
2. For each edge, list STRIDE-style threats that apply (spoofing a sender, tampering a payload, leaking data into logs, denial by flooding, elevation via a new API).
3. Map each threat to an existing control above or a new one; new controls get a test.
4. Write the result in the PR description or `docs/engineering/security-review.md`, with unknowns marked as unknown.

## Rules
Do not weaken the approval gate (CLAUDE.md rule 5). Do not describe King as audited or fully secure.

## Verify
Each mitigation in the model maps to a test that `npm test` or `npm run test:electron` runs; list any mitigation without a test as residual risk.

## Done when
Every new edge has a named control and a test, and residual risks are written down.
