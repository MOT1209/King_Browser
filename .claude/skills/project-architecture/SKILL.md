---
name: project-architecture
description: "Map of King Browser: Electron main process, preloads, React renderer, MCP server, IPC boundaries and where each concern lives. Use before any change that spans more than one file, when you do not yet know where a feature is implemented, or when deciding which process a new piece of logic belongs in."
---

# Project architecture

## Purpose
Put a change in the right process and module the first time, and know which other files and tests move with it.

## When to use
- You are starting a task and do not yet know which files own the behaviour.
- You are adding logic and must decide between main process, preload and renderer.
- A change touches IPC, the MCP server, tabs or persistence.

## The four layers
| Layer | Files | Trust | Notes |
| :--- | :--- | :--- | :--- |
| Main process | `electron/main.ts` (composition root, ~6.8k lines), `electron/main/*.ts` | Privileged (Node + Electron) | Window creation, sessions, IPC handlers, downloads, extensions, updater, adblock, MCP server. Pure policy lives in `electron/main/*.ts` so tests import it without Electron. |
| Preloads | `electron/preload.ts` (main window, exposes `window.electronAPI`), `electron/guest-preload.ts` (every web page, no API exposed, `sendToHost` only), `electron/webstore-preload.ts` (Chrome Web Store pages only) | Bridge | Sandboxed, contextIsolation on. Adding an API here widens the attack surface: see the `preload-security` skill. |
| Renderer | `src/` (React 18, Vite). `App.tsx`, `components/`, `hooks/` (one concern per hook), `services/`, `utils/` | Untrusted by main | Talks to main only through `window.electronAPI` (`src/utils/electronBridge.ts`). Web pages render in `<webview>` tags inside it. |
| Guests | `<webview>` per tab, partitions `''` (default), `incognito-*`, `persist:king-agent` | Untrusted | Hardened in `will-attach-webview` in `electron/main.ts`. |

Out-of-process pieces: `electron/mcpServer.ts` (Express on 127.0.0.1:3020, bearer token) and the stdio bridge `mcp-bridge.ts` -> generated `mcp-bridge.mjs` (CI fails if they drift: `npm run build:bridge && git diff --exit-code mcp-bridge.mjs`).

## Where things go
The routing table in `AGENTS.md` ("Where things go") is authoritative. Rules of thumb:
- Security decisions (is this URL/sender/path allowed) -> a pure function in `electron/main/` or `src/utils/` with a unit test, called from `main.ts`.
- New renderer state -> a new hook in `src/hooks/`, not more code in `App.tsx`.
- New user-visible text -> `src/locales/{en,ar,de}.json` (see `localization-rtl`).

## Workflow
1. Read `AGENTS.md`, then grep for the feature name across `electron/` and `src/`.
2. Read the module header comment: main-process modules state what they decide and why.
3. List the tests that import the module (`grep -l <module> tests/*.ts`).
4. Write down the files you will touch before editing.

## Verify
`npm run typecheck`, then the targeted tests, then `npm test`. For main/preload changes also `npm run build:electron`.

## Done when
The change lives in the layer that owns it, no new logic was added to `main.ts` that could be a tested module, and every touched module's tests pass.
