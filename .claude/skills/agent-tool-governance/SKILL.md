---
name: agent-tool-governance
description: "Human approval governance for agent actions in King Browser: policy engine risk classification, approval triggers, strict and balanced modes, site rules, prompt-injection gating, the execution engine state machine and the activity log. Use when changing what an agent may do automatically, approval UI, policyEngine.ts, approvalMode.ts, siteRules.ts, injectionDetector.ts or executionEngine.ts."
---

# Agent tool governance

## Non-negotiable (CLAUDE.md hard rule 5)
The approval gate cannot be weakened. No mode disables approval for sensitive actions. Unknown tools, unreadable page context and ambiguous destinations are `sensitive`. Ask the owner before changing the approval policy.

## Components
- `electron/main/policyEngine.ts`: `classifyAction` -> `safe` or `sensitive` with triggers (`send`, `purchase`, `delete`, `security_settings`, `publish`, `share_private`, `grant_permission`, `dangerous_download`, `sensitive_input`, `consequential_form`, `arbitrary_code`, `login`, `site_rule`, `prompt_injection`, `strict_mode`); `buildApprovalSummary`; redaction.
- `electron/main/approvalMode.ts`: `balanced` (default) and `strict` (everything except `STRICT_EXEMPT_TOOLS` needs approval). Stored in main, not synced.
- `electron/main/siteRules.ts`: per-host ask/block.
- `electron/main/injectionDetector.ts`: page text hits raise a `prompt_injection` approval; corpus in `tests/injection_corpus.test.ts`.
- `electron/main/executionEngine.ts`: one action in flight, bounded queue, pause/resume/stop, every action settles exactly once; `engineIpc.ts` exposes allowlisted commands to the control panel.
- Activity log: `electron/main/activityLog.ts`, `activityStore.ts`; UI `src/components/AgentControlPanel.tsx`, `AssistantApprovalCard.tsx`.

## Rules
- Changes may only make the gate stricter unless the owner explicitly asks otherwise.
- An action that was rejected must not be retried, rephrased or split by the agent code path.
- Approval summaries show what will happen in user terms and never include secrets.

## Verify
`npm test` (`policy_engine`, `approval_mode`, `site_rules`, `injection_detector`, `injection_corpus`, `execution_engine`, `engine_ipc`, `engine_takeover`, `mcp_single_approval_authority`, `approval_details`, `approval_attention`, `activity_log`).

## Done when
Sensitive actions still require a human in every mode, and tests prove the new rule.
