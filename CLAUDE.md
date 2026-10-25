# CLAUDE.md

Guidance for Claude Code when working in this repository. Rules shared with every coding agent live in [AGENTS.md](AGENTS.md); visual rules live in [DESIGN.md](DESIGN.md). Read both before large changes.

## Project

King Browser is an open-source desktop browser (Electron 43, React 18, TypeScript, Vite) that lets a coding agent such as OpenCode drive a real, visible browser while the human keeps the decision. Its differentiator is precise human control: every idea is judged by whether it makes that control stronger, easier or more reliable. Current version: see `package.json` (pre-release 0.0.x). Longer-term direction: `plan.md`. Product summary: `PRODUCT.md`.

## Commands

```bash
npm install                  # Node ^22.22.2 or ^24.15.0
npm run dev:web              # renderer only, in Vite (no Electron)
npm run dev                  # build Electron bundles, then Vite + Electron
npx tsc --noEmit             # typecheck
npm run lint                 # eslint --quiet
npm run check:i18n           # en/ar/de dictionaries complete and placeholder-safe
npm run check:strings        # no literal UI strings in .tsx
npm test                     # builds artifacts (pretest), then runs tests/runAll.ts
npm run build:electron       # typecheck + esbuild main/preload/mcp-bridge bundles
npm run build:website        # marketing site in website/
npm --prefix website test    # website tests
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, `npm test`, website build and tests on Linux, plus Windows and macOS jobs. Run the same locally before pushing: `npx tsc --noEmit && npm run lint && npm test`.

## Layout

- `electron/main.ts` - app entry, windows, webContents lifecycle, IPC handlers.
- `electron/main/*.ts` - main-process modules, mostly dependency-free so tests can import them in plain Node (policy engine, approval mode, site rules, injection detector, activity log, SSRF/IP policy, update and CRX handling).
- `electron/mcpServer.ts` - loopback MCP server (port 3020, bearer token): Streamable HTTP `/mcp` and legacy SSE `/sse` + `/message`, both answered by `electron/main/mcpProtocol.ts`; `mcpStreamableHttp.ts` holds the `/mcp` session and Origin logic. `mcp-bridge.ts` and `mcp-bridge.mjs` are the stdio bridge for clients.
- `electron/preload.ts`, `guest-preload.ts`, `webstore-preload.ts` - context bridges; `electron/security/trustedSender.ts` validates IPC senders.
- `src/` - React renderer: `components/`, `hooks/` (state, one concern per hook), `services/` (sync crypto, AI agent, i18n), `utils/`, `locales/{en,ar,de}.json`, `types/`.
- `tests/` - one file per concern plus `tests/e2e/tier1..5`; every test file must be imported in `tests/runAll.ts` or it does not run.
- `website/` - separate Vite site with its own `DESIGN.md`, `package.json` and tests. `video/` - Remotion promo videos.
- `docs/` - audits, research, plans and specs. `docs/design/` holds feature-level design notes.

## Hard rules

1. Every privileged `ipcMain.handle` / `ipcMain.on` handler validates the sender with `isTrustedSender(event)`.
2. Never set `nodeIntegration: true`. Keep `contextIsolation: true` and `sandbox: true`.
3. Secrets (passwords, keys, tokens) never go to plain `localStorage`; use Electron `safeStorage`.
4. Paths, URLs and commands are canonicalized and validated before use. Fail closed.
5. The agent approval gate cannot be weakened: there is no mode that disables approval for sensitive actions. Unknown tools and ambiguous destinations default to `sensitive`.
6. All user-facing text goes through `t()` / `l()` and exists in `en.json`, `ar.json` and `de.json`. Arabic must work right-to-left.
7. No emojis in code, comments, commits, PR titles or docs.
8. Do not add analytics or crash-reporting SDKs. New network destinations must be added to the "Network connections" table in `README.md` and to the CSP in `index.html` if the renderer uses them.

## Conventions

- Match surrounding code: comment density, naming, idiom. Existing main-process files carry a header comment saying what the module decides and why; keep that style for new modules.
- Prefer small dependency-free modules in `electron/main/` over logic inside `main.ts`, so it can be unit-tested.
- Add or change behavior test-first. Regression tests name the failure they prevent. Register the file in `tests/runAll.ts`.
- Conventional Commits: `feat|fix|security|perf|refactor|docs|test|chore(scope): imperative description`. Branches: `feature/`, `fix/`, `security/`, `chore/` prefixes (on this cloud setup, use the branch the session assigns).
- Do not open a pull request unless asked. Use `.github/PULL_REQUEST_TEMPLATE.md` when you do.
- Release: bumping `version` in `package.json` on `main` triggers the Release workflow. Do not bump it casually.

## Facts and claims

Docs in this repo separate verified facts from opinions and unknowns (see `plan.md`). Keep that discipline: do not claim a benchmark, audit or real-site result that has not been run. README states that King has not been benchmarked against other browsers and has had no independent security audit; do not contradict that.

## When unsure

Say what you verified and what you did not (for example, "tests pass, not run on Windows"). Ask before changing the approval policy, the IPC trust model, the sync encryption format or the release workflow.
