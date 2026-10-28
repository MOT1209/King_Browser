---
name: url-navigation-security
description: "URL and navigation validation in King Browser: allowed schemes, internal king:// pages, will-navigate, open-external, agent navigation, redirects and protocol handlers. Use when code navigates a tab, opens a URL outside the app, handles king:// links, or parses a user- or page-supplied URL."
---

# URL and navigation security

## Facts
- `src/utils/safeNavigation.ts`: `isSafeNavigationUrl` (http/https plus exact internal pages; rejects control characters and `DANGEROUS_PROTOCOLS`), `isSafeAgentNavigationUrl` (also closes every non-public IP literal), `isNonPublicHost`.
- `electron/main/agentNavigationGuard.ts`: DNS-resolving second layer for agent navigation (a public name resolving to 127.0.0.1 is refused).
- `electron/main.ts`: main window `will-navigate` keeps it on the app origin; guest `will-navigate` handling (search `contents.on('will-navigate'`); `open-external` IPC allows only `https:` to public hosts; `king` protocol client registration (`setAsDefaultProtocolClient('king')`).
- `electron/security/trustedSender.ts` accepts only exact internal pages (`king://settings`, `#extensions`, `#mcp`, ...), never arbitrary `king:` URLs.
- `src/utils/securityUtils.ts`: phishing and homograph classification for the address bar.
- Tests: `safe_navigation_comprehensive`, `agent_navigation_guard`, `ssrf_ip_policy`, `security_utils_classification`, `window_open_policy`, `search_engine_formatting`.

## Rules
- Parse with `new URL()`, compare `protocol` and `hostname` exactly; never `startsWith('https://example.com')` (matches `https://example.com.evil`).
- Reject, do not repair, URLs with control characters, credentials (`user:pass@`) where not expected, or unknown schemes.
- User text goes through the search formatter before the URL check.
- `shell.openExternal` only after the same checks as `open-external`.

## Workflow
1. Reuse the helpers above; do not write a new URL check.
2. Add cases to `tests/safe_navigation_comprehensive.test.ts` for any new accepted or rejected form.

## Verify
`npm test`.

## Done when
Every new navigation entry point calls the shared validator, and tests cover both accepted and rejected inputs.
