# Repository Comparison — King Browser Research Phase

> Status: **Complete** (evidence-based)
> Date: 2026-10-17
> Scope: The three repositories named in the King Browser Master Prompt
> Method: GitHub REST API metadata + full local clone inspection + build verification attempt

---

## 1. Summary Table

| Criterion | BrowserOS | AgenticBrowser | Nova Browser |
|---|---|---|---|
| Repository | `browseros-ai/BrowserOS` | `tushar-alt/AgenticBrowser` | `unitybtw/nova-browser` |
| Stars | 13,962 | 9 | 5 |
| Size | 205.2 MB | 9.1 MB | 140.7 MB |
| License | **AGPL-3.0** | **NONE** (no license file) | **MIT** |
| License risk | High (copyleft) | **Blocking** (all rights reserved) | Low (permissive) |
| Last push | 2026-10-16 (active) | 2026-09-06 (stale ~6 weeks) | 2026-10-16 (active) |
| Language | TypeScript | TypeScript | TypeScript |
| Architecture | Chromium fork (ungoogled) | Electron + React | Electron + React |
| Tests | N/A (Chromium fork) | 1 test file | **~70 test files** incl. security tests |
| MCP support | Not applicable | Custom MCP server module | **Built-in MCP server** (`electron/mcpServer.ts`) |
| Arabic locale | No | No | **Yes** (`src/locales/ar.json`) |
| Buildable locally | **No** (Chromium build, 100 GB+ disk) | Unverified | **YES — build gate PASSED 2026-10-17** (see §2.3) |
| Local clone | Not cloned (size) | Cloned to temp | Cloned to temp |

---

## 2. Per-Repository Analysis

### 2.1 BrowserOS (`browseros-ai/BrowserOS`)

**Verified facts:**
- Chromium fork based on ungoogled-chromium; contains `LICENSE.ungoogled_chromium` and `CLA.md` alongside `LICENSE` (AGPL-3.0).
- 205.2 MB repository; monorepo layout (`packages/`).
- Extremely active (last push 2026-10-16), 13,962 stars.
- Building requires the full Chromium toolchain (modern Chromium builds need ~100 GB free disk and hours of compile time; this machine has ~78 GB free).

**Assessment:**
- **Cannot be used as the code foundation** on this machine, and its AGPL-3.0 license would impose copyleft obligations on the entire King Browser distribution if code were reused.
- Valuable as a **design reference only**: its product-level ideas about an AI-integrated browser, agent UI, and Chromium-level integration can inform architecture decisions without copying code.

**Verdict: Reference only (documentation-level). No code reuse.**

---

### 2.2 AgenticBrowser (`tushar-alt/AgenticBrowser`)

**Verified facts:**
- **No license file exists in the repository** (confirmed via GitHub API: `license` field empty; confirmed in local clone: no LICENSE/LICENCE/COPYING file).
- `package.json` declares `"license": "MIT"` — but a package.json field without an actual license text/copyright notice is **not a license grant**. Default copyright law applies: all rights reserved.
- 9.1 MB, Electron + React application.
- 9 stars; last pushed 2026-09-06 (~6 weeks before research date).
- Test coverage: **one** test file (`tests/regression-snapshot-refs.cjs`).
- Notable modules (from clone): `src/main/services/MCPServer.ts`, `AgentOrchestrator.ts`, `CDPController.ts`, `src/renderer/components/Supervisor/Supervisor.tsx`, `src/cli/`.

**Assessment:**
- **Legally unusable as a code source.** The absence of a license means no permission is granted to copy, modify, or redistribute the code — regardless of what `package.json` claims.
- Valuable as a **conceptual reference**: the Supervisor/approval UX concept, agent orchestration flow, and CDP-based control approach may be studied and **re-implemented clean-room** (ideas and patterns are not copyrightable; expression is).

**Verdict: Conceptual reference only. Clean-room re-implementation allowed for ideas. No code reuse.**

---

### 2.3 Nova Browser (`unitybtw/nova-browser`)

**Verified facts:**
- **MIT license confirmed** in `LICENSE` file: "MIT License — Copyright (c) 2026 Nova Browser (unitybtw)".
- Version 1.5.1; Electron 43.7.7; React 18; 140.7 MB repo.
- Very active (last push 2026-10-16, research date 2026-10-17).
- **~70 test files** including dedicated security/adversarial tests.
- **Built-in MCP server** (`electron/mcpServer.ts`, ~47 KB) plus an `mcp-bridge` layer.
- **Arabic localization already present** (`src/locales/ar.json`).
- `main: dist-electron/main.cjs`; `engines.node: ^22.22.2 || ^24.15.0 || >=26.0.0` (local Node v24.19.0 satisfies).
- Build pipeline: `tsc && vite build && npm run build:electron`.
- Known maintainability concern: `electron/main.ts` is ~276 KB in a single file (monolithic main process — will need careful handling in forks/patches).
- **Build verification: PASSED (2026-10-17).** Clean `npm ci` (600 packages) → `npm run build` succeeded end-to-end:
  - `tsc` — no type errors ✓
  - `vite build` — 2474 modules transformed, built in 13m 58s (slow machine factor; one-time gate cost) ✓
  - `build:electron` — `dist-electron/main.cjs` (1.9 MB) + 3 preload bundles produced via esbuild ✓
  - Environment note: the first install attempt was corrupted by a bad local npm cache (3.3 GB garbage, since collected); after cache cleanup the clean reinstall and build succeeded. This was an environment issue, not a repo issue.
  - `electron.exe` binary is not yet downloaded (`electron/install.js` postinstall skipped by npm allow-scripts policy) — needed to *run* the app, not to *build* it. Fetching it is a next-phase step.

**Assessment:**
- The only candidate that is **both legally reusable (MIT) and technically viable** on this machine.
- Already contains the hardest infrastructure pieces for King Browser: Electron shell, MCP server, browser automation surface, i18n framework with Arabic, and an existing test culture.

**Verdict: Primary foundation candidate (pending successful build verification).**

---

## 2.5 Required Comparison Dimensions (Master Prompt §4)

| Dimension | BrowserOS | AgenticBrowser | Nova Browser |
|---|---|---|---|
| **Browser engine & rendering** | Chromium fork (ungoogled) — full engine ownership, massive build | Electron (Chromium runtime) — standard, no custom engine | Electron 43.7.7 — standard, no custom engine |
| **Desktop shell** | Custom Chromium shell + monorepo packages | Electron + React app | Electron + React app (mature shell, workspaces, downloads) |
| **Profiles & persistent sessions** | Chromium profile/session management (in-engine) | Basic Electron sessions (unverified isolation) | Profile handling present (`main.ts` domain); isolation **requires behavioral verification** (see Reuse Matrix §6) |
| **Automation interfaces** | Browser-control interfaces tied to its agent platform; MCP tools advertised | CDP-based controller (`CDPController.ts`), CLI with structured output | Built-in MCP server + bridge (`electron/mcpServer.ts`, `mcp-bridge`) |
| **MCP & OpenCode integration** | MCP tools exist but coupled to its stack; AGPL | Custom MCP server module (no license to reuse) | MCP server ready to adapt; OpenCode adapter is **new build** in all cases |
| **User approval & execution control** | Agent session UI concepts | Supervisor/approval UX concept (single-file component, 1 test) | No dedicated approval/execution-control engine found → **new build** (all repos) |
| **UI & accessibility** | Product-grade but Chromium-embedded UI stack | Minimal UI, small codebase, unclear a11y | ~60 React components, existing a11y patterns; Arabic locale preinstalled |
| **Security & privacy** | AGPL networking; undocumented for external reuse | No security tests; 1 test file total | ~70 tests incl. dedicated security/adversarial tests; **verify claims on run** (Master Prompt §3 warning) |
| **Tests & build reliability** | Engine-scale (not app tests) | 1 test file; build unverified | ~70 test files; build verification **in progress**; first install had cache corruption (environment issue, fixed) |
| **Maintenance & platform support** | Very active (pushed 2026-10-16); heavy maintenance burden | Stale (last push 2026-09-06); 9 stars | Very active (pushed 2026-10-16); Windows/macOS/Linux Electron reach |
| **License compatibility** | AGPL-3.0 — blocks inclusion in MIT app | NONE — blocks all code reuse | **MIT — compatible with planned MIT distribution** |
| **Implementation effort & integration risk** | Highest: engine + license + resources | Medium if licensed (it is not); smallest codebase | Lowest: reuse shell + MCP + tests, build the control engine on top |

## 3. Decision Drivers

1. **License compatibility is a hard gate.** AGPL-3.0 (BrowserOS) and no-license (AgenticBrowser) both fail the "technically and legally appropriate" principle in the Master Prompt for code reuse.
2. **Build feasibility is a hard gate.** Chromium-fork builds are not possible with ~78 GB free disk.
3. **Reuse value.** Nova Browser provides an Electron + MCP + i18n + tests baseline that maps directly to King Browser requirements (visible browser, agent control, Arabic/English).
4. **Active maintenance.** Nova and BrowserOS are actively developed (pushed within ~1 day of research); AgenticBrowser is stale.

## 4. Evidence Sources

| Evidence | Where |
|---|---|
| GitHub API metadata (stars, size, license, pushed_at) | Fetched 2026-10-17 via `api.github.com/repos/...` |
| License file absence in AgenticBrowser | GitHub API (`license: null`) + local clone file check |
| Nova LICENSE text | Local clone `LICENSE` file |
| Module/test inventories | Local clones at `%TEMP%\opencode\kb-research\` |
| Toolchain/disk | Local verification (Node v24.19.0, npm 11.17.0, git 2.45.1, ~78 GB free on C:) |
