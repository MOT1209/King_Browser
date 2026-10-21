# Architecture Decision — King Browser

> Status: **Final** — build gate passed, evidence recorded
> Date: 2026-10-17
> Decision Maker: Engineering research phase (per Master Prompt §4–5)

---

## 1. Decision

**Adopt `unitybtw/nova-browser` (MIT) as the primary code foundation for King Browser.**

- Extract and rebrand the Nova codebase into the King Browser repository structure.
- Reuse its Electron shell, React UI, MCP server/bridge, i18n (Arabic + English), and test infrastructure under MIT attribution.
- Build the following **new subsystems** on top (the King Browser differentiators):
  1. Authoritative execution engine (single state machine)
  2. Approval & policy engine
  3. STOP NOW emergency stop
  4. Execution control panel UI
  5. Prompt-injection boundary for untrusted page content
  6. OpenCode integration adapter (verified against official OpenCode docs)
- BrowserOS → **design reference only** (AGPL-3.0; Chromium build infeasible).
- AgenticBrowser → **concept reference only, clean-room** (no license).

## 2. Evaluation Criteria (Master Prompt §5)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | **Builds successfully** | ✅ PASSED | Clean `npm ci` (600 pkgs) + `npm run build` end-to-end: `tsc` ✓, `vite` 2474 modules ✓ (13m58s), `build:electron` ✓ (`dist-electron/main.cjs` 1.9 MB). Run 2026-10-17 on local machine (Node v24.19.0, Windows). |
| 2 | **Architecture supports the product** | ✅ | Electron main/renderer separation; preload with narrow IPC surface (`electron/preload.ts` exposes `copyMcpToken`, `getMcpTokenStatus`, `rotateMcpToken`, …); React component library (~60 components); MCP server already embedded in main process. |
| 3 | **Browser engine & desktop runtime appropriate** | ✅ | Electron 43.7.7 (Chromium runtime). No custom engine to maintain. No engine duplication needed — respects "one browser lifecycle" rule. |
| 4 | **Automation interface controllable safely** | ✅ (strong) | MCP server binds **loopback-only** (`app.listen(port, '127.0.0.1')`, fallback also loopback); **Bearer-token auth with constant-time SHA-256 comparison**; query-string tokens **strictly rejected**; token stored encrypted, `chmod 600`; token rotation = hard revocation (`cancelPendingMcpActions`); 401 on all unauthenticated routes; clipboard token auto-cleared after 15 s; log redaction of `password|token|secret|apiKey` and `Bearer …`. SSRF guards block open-external to loopback/private hosts; dedicated `agentNavigationGuard.ts`. |
| 5 | **Persistent profiles isolatable** | ✅ (with verification task) | Profile storage handled in main process; persistence across restarts presupposed by design. **Action item:** behavioral test with two profiles (no cross-contamination) in implementation phase — recorded in Reuse Matrix §6. |
| 6 | **OpenCode integration implementable reliably** | ✅ | MCP is OpenCode's preferred integration path. Nova's MCP server/bridge provides the transport; King Browser adds a verified OpenCode adapter against official docs (`https://opencode.ai/docs/`) — no invented config keys. |
| 7 | **Maintainable & distributable** | ✅ (with task) | Very active upstream (pushed 2026-10-16); electron-builder packaging scripts exist (`pack:win/mac/linux`). **Risk accepted:** `electron/main.ts` ~276 KB monolith — decompose before adding King Browser subsystems. |
| 8 | **License obligations acceptable** | ✅ | MIT — compatible with planned MIT distribution. Attribution via `THIRD_PARTY_LICENSES.md` (see `LICENSE_AND_ATTRIBUTION.md`). Dependency sweep for GPL/AGPL/unknown licenses queued as a release gate. |
| 9 | **Development environment fit** | ✅ | Node v24.19.0 satisfies `engines` (`^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`); build verified on this machine; ~78 GB free disk (Electron-scale, no Chromium build). |

## 3. Target Architecture (King Browser)

```text
┌─────────────────────────────────────────────────────────────┐
│ Renderer (React)                                            │
│  Browser UI (tabs, omnibox, profiles) · Control Panel       │
│  (Next Step · Next Phase · Pause · Resume · STOP NOW ·      │
│   Approve/Reject · Emergency Close) · Activity Log          │
└──────────────── ▲ narrow preload IPC (contextIsolation:true, │
                  │ sandbox:true, nodeIntegration:false)      │
┌─────────────────┴───────────────────────────────────────────┐
│ Electron Main Process                                       │
│  ┌────────────────────────────┐  ┌───────────────────────┐  │
│  │ Browser Lifecycle (single  │  │ Execution Engine      │  │
│  │ authority over webContents │  │ (single state machine │  │
│  │ tabs, sessions, profiles)  │  │  per Master Prompt §11│  │
│  └────────────────────────────┘  │  idle/running/paused/ │  │
│  ┌────────────────────────────┐  │  awaiting_approval/   │  │
│  │ MCP Server (loopback +     │  │  stopping/stopped/    │  │
│  │ token auth) — tool surface │◄─┤  error)               │  │
│  └────────────────────────────┘  └───────────────────────┘  │
│  ┌────────────────────────────┐  ┌───────────────────────┐  │
│  │ Policy & Approval Engine   │  │ Security Boundary     │  │
│  │ (allowlist, domain rules,  │  │ (untrusted page text, │  │
│  │ sensitive-action gates)    │  │  redaction, limits)   │  │
│  └────────────────────────────┘  └───────────────────────┘  │
│  Activity Log (append-only, local)                          │
└─────────────────────────────────────────────────────────────┘
          ▲ HTTPS-local (127.0.0.1) + Bearer token
┌─────────┴─────────┐
│ OpenCode (MCP client) │
└───────────────────┘
```

**Invariants (Master Prompt §5/§11):**
- Exactly **one** authoritative browser lifecycle authority (main process).
- Exactly **one** authoritative execution controller (state machine in main process).
- Backend enforcement: UI buttons are not a security boundary; invalid transitions rejected server-side even if UI is bypassed.
- No duplicate action execution; bounded queues; no hidden background execution after STOP.

## 4. Trade-offs

| Trade-off | Accepted because |
|---|---|
| Inherit Nova's codebase size (~140 MB repo, monolithic main file) | Buys 70+ tests, working shell, MCP layer, Arabic locale — years of features for a refactor cost. |
| Rebranding risk (not a "from scratch" story) | Master Prompt explicitly prioritizes reuse over rewrite ("Do not rewrite working systems without a demonstrated reason"). |
| Deprecated `@cliqz/adblocker-*` deps | Functional now; migration to `@ghostery/*` is a scheduled, low-risk task. |
| Vite production build is slow (~14 min on this machine) | One-time gate cost; dev mode unaffected. CI caching can mitigate. |
| BrowserOS excluded despite best product fit | AGPL-3.0 + 100 GB+ build — both hard blockers, independently sufficient. |
| AgenticBrowser excluded despite relevant concepts | No license file — legally zero reusable code. Concepts re-implemented clean-room. |

## 5. Risks Register (top)

| Risk | Severity | Mitigation |
|---|---|---|
| Monolithic `electron/main.ts` grows further | High (maintainability) | Decompose into modules before adding execution engine; freeze monolith size. |
| Nova security claims unverified by us | High | Run its security test suite; add independent tests for token auth, loopback binding, profile isolation before rebrand ships. |
| Prompt injection via page content | High (new surface) | Provenance-tag all page text; policy engine refuses instruction-like content; dedicated tests. |
| Dependency license contamination | Medium | Automated license sweep pre-release (gate). |
| Upstream drift (Nova keeps evolving) | Medium | Record exact base commit in `docs/UPSTREAM.md`; periodic diff, no auto-merge. |

## 6. Next Steps (execution phase)

1. Record base commit of Nova used as foundation (`docs/UPSTREAM.md`).
2. Scaffold King Browser repo: copy Nova tree, rebrand identifiers, keep LICENSE + attribution.
3. Fetch Electron binary (`electron/install.js`) for runnable verification.
4. Run Nova's test suite as baseline (must pass before changes).
5. Decompose `electron/main.ts`; then implement execution engine + policy engine + STOP NOW (Master Prompt §10–12).
6. Build control panel UI (Arabic/English).
7. OpenCode adapter (per official docs).
8. Security docs: `docs/SECURITY.md`, `docs/THREAT_MODEL.md`, `docs/PRIVACY_AND_DATA.md` (Master Prompt §13).
