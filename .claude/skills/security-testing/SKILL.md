---
name: security-testing
description: "Running King Browser security checks: the security test suites, runtime Electron checks, production dependency audit, CodeQL, optional electronegativity, and manual adversarial checks of IPC, navigation, downloads and MCP. Use before merging security-sensitive changes or when asked to assess security posture."
---

# Security testing

## Automated
| Check | Command / location | Blocking in CI |
| :--- | :--- | :--- |
| Security unit and regression suites | `npm test` (see `security-regression-testing` for the list) | yes |
| IPC guard coverage and CSP parity | part of `npm test` | yes |
| Runtime webPreferences, guest isolation, CSP | `npm run test:electron` | reports only (new job) |
| Production dependency advisories | `npm run audit:prod` | yes |
| Static analysis | CodeQL workflow `.github/workflows/codeql.yml` | results in Security tab |
| Electron misconfiguration scan | `npx -y @doyensec/electronegativity@1 -i electron` (manual) | no |

## Manual adversarial checklist (for the area you changed)
- IPC: can a guest page or extension frame reach the handler? (sender check first)
- Navigation: `javascript:`, `file:`, `data:`, credentials in URL, IDN homographs, `127.1`, `[::ffff:7f00:1]`.
- Downloads: `../` in filenames, HTML/SVG files that execute on open, symlinked Downloads.
- MCP: request without token, wrong Host header, foreign Origin, unknown tool, tool needing approval.
- Agent: page text that tries to redirect the agent (injection corpus).

## Rules
Validate every scanner finding against the source; record false positives with reasons in `docs/engineering/security-review.md`. Passing checks do not make King "secure" or "audited".

## Done when
All automated checks pass, the manual checklist for the touched area is done, and findings are recorded.
