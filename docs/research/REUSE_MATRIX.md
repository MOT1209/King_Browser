# Reuse Matrix — King Browser

> Status: **Complete** (build-gate items flagged as "requires further investigation" until verified)
> Date: 2026-10-17
> Purpose: Map every reuse candidate to the Master Prompt's required categories, with evidence.

---

## Categories (as required by the Master Prompt)

1. Reuse directly
2. Reuse after adaptation
3. Use as a design reference only
4. Do not reuse
5. Requires legal review
6. Requires further investigation

---

## 1. Reuse Directly (MIT — Nova Browser)

Evidence: `unitybtw/nova-browser` LICENSE = MIT (verified). Code reuse permitted with attribution.

| Item | Location in Nova | Notes |
|---|---|---|
| Electron + React + TypeScript app shell | repo root, `electron/`, `src/` | Baseline desktop application structure. |
| Tab strip, tab context menu, tab hover preview | `src/components/TopBar.tsx`, `TabContextMenu.tsx`, `TabHoverPreview.tsx` | ~60 React components available overall. |
| Omnibox / address bar | `src/components/topbar/OmniboxBar.tsx` | Extend for King Browser branding. |
| Site info, downloads, workspace UI | `src/components/SiteInfoPopover.tsx`, `DownloadsPopover.tsx`, `WorkspaceManager.tsx` | Prune features King Browser will not ship. |
| i18n framework + Arabic locale | `src/locales/ar.json` | Arabic + English target confirmed. |
| Test infrastructure (~70 test files incl. security tests) | `tests/` | Kept as regression baseline. |
| MCP bridge skeleton | `mcp-bridge` (bridge layer) | To be ADAPTED for auth hardening (see §2). |

## 2. Reuse After Adaptation (MIT — Nova Browser)

| Item | Location | Required adaptation |
|---|---|---|
| MCP server | `electron/mcpServer.ts` (~47 KB) | Enforce loopback-only binding, token auth, explicit tool allowlist, bounded outputs. |
| Browser automation tool surface | MCP tool definitions in Nova | Rename/align to King Browser tool names (`browser_status`, `browser_open`, `browser_click`, …), add policy gates + redaction. |
| Ad blocking | `@cliqz/adblocker-*` (deprecated → renamed `@ghostery/*`) | Plan dependency migration; functional now but upstream renamed. |
| Persistent profile handling | Nova profile/storage code | Verify isolation guarantees against Master Prompt §7.2; add data-location documentation UI. |
| Main process architecture | `electron/main.ts` (~276 KB monolithic) | Decompose into modules before extending; do not grow the monolith. |

## 3. Use as a Design Reference Only

| Item | Source | Reason |
|---|---|---|
| Chromium-level AI browser architecture; agent-platform/browser split; session monitoring & replay concepts | BrowserOS | AGPL-3.0 + 100 GB+ build; ideas only. |
| AI browser product UX concepts | BrowserOS | Same. |
| Supervisor / approval UX concept; agent orchestration flow; natural-language workflow patterns; CLI structured output idea | AgenticBrowser | No license — concepts only, clean-room re-implementation. |

## 4. Do Not Reuse

| Item | Source | Reason |
|---|---|---|
| All code | BrowserOS | AGPL-3.0 copyleft incompatible with intended MIT distribution of combined work. |
| All code | AgenticBrowser | No license file = all rights reserved. `package.json: "license": "MIT"` is metadata, not a grant. |
| Chromium fork / CEF / engine replacement | BrowserOS | Build infeasible locally (~78 GB free vs 100 GB+ needed) and unnecessary (Electron runtime is the chosen shell). |
| VPN, cloud sync, accounts, telemetry features | Nova Browser | Outside King Browser scope; remove or disable to minimize attack surface. |

## 5. Requires Legal Review

| Item | Why |
|---|---|
| Third-party dependency set inherited from Nova | Automated license generation (e.g., `license-checker`) must run post-install; any GPL/AGPL/SSPL/unknown-license dependency flagged before distribution. |
| Any future code contribution from AgenticBrowser authors | Only if upstream adds a real license file; re-evaluate then. |
| King Browser's own final license text (LICENSE + THIRD_PARTY_LICENSES.md) | Must reflect actual included code, not the preferred license. |

## 6. Requires Further Investigation (blocked on build gate / next phase)

| Item | What to verify | Gate |
|---|---|---|
| Nova Browser builds in this environment | Clean `npm ci` + `npm run build` (in progress) | Build gate |
| Nova's advertised security tests actually pass and verify what they claim | Run test suite; inspect assertions (Master Prompt: "do not assume advertised guarantees") | Build gate + test run |
| Profile isolation behavior (no cross-contamination, correct storage paths) | Behavioral test with two profiles | Implementation phase |
| Secure IPC / preload usage (contextIsolation, sandbox flags) | Code inspection of `electron/` preload and `webPreferences` | Implementation phase |
| Electron binary availability on this machine | `electron/install.js` postinstall fetch (currently NOT downloaded) | Build gate |
| Playwright vs. existing automation library compatibility with Electron runtime | Compatibility experiment before adding any new automation dependency | Implementation phase |
| Packaging (NSIS/portable) on Windows | `npm run build:electron` output + packaging config review | Release phase |
