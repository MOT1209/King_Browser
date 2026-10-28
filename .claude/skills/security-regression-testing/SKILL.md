---
name: security-regression-testing
description: "Writing and running security regression tests in King Browser: reproduce a confirmed weakness as a failing test, fix, keep the test; static guards for IPC and CSP; runtime Electron checks; validating scanner findings. Use after confirming any vulnerability, when changing a security control, or when triaging CodeQL, npm audit or electronegativity output."
---

# Security regression testing

## Existing suites (all run by `npm test` via `tests/runAll.ts`)
`security_regression_audit`, `securityHardening`, `adversarial_hacker_security`, `m1_adversarial_security`, `permission_boundary_regressions`, `trusted_sender_policy`, `ipc_sender_guard_coverage`, `csp_parity`, `ssrf_ip_policy`, `agent_navigation_guard`, `safe_navigation_comprehensive`, `extension_archive_extraction`, `update_integrity`, `session_isolation`, `injection_detector`, `injection_corpus`, `policy_engine`, `mcp_single_approval_authority`, `codex_security_findings_remediation`.
Runtime: `tests/electron/smoke.spec.ts` (webPreferences, guest isolation, CSP of the running app).

## Workflow for a confirmed weakness
1. Write the smallest test that demonstrates it and FAILS on the current code. Name the failure it prevents in a comment (house style: see the header of `tests/csp_parity.test.ts`).
2. Fix with the smallest change; the test turns green.
3. Prove the test is not vacuous: revert the fix locally (or mutate a copy) and watch it fail.
4. Register the file in `tests/runAll.ts`.

## Triage of tool findings
- CodeQL (`.github/workflows/codeql.yml`, Security > Code scanning), `npm run audit:prod`, electronegativity: each finding is a claim. Trace a real path from an attacker-controlled input to the sink. Record verdicts, including false positives and why, in `docs/engineering/security-review.md`.
- Dev-only advisories (Remotion, build tools) do not ship; record them, do not block on them.

## Rules
Never delete, skip or loosen a security test to get green. Never claim King is audited.

## Verify
`npm test`; for runtime controls `npm run build && xvfb-run -a npm run test:electron`.

## Done when
The weakness has a test that failed before and passes after, and the finding is recorded.
