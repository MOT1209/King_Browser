---
name: typescript-engineering
description: "TypeScript practice for King Browser: strict mode, typing IPC payloads and untrusted input as unknown, avoiding unsafe assertions and any. Use when adding types, touching IPC or preload signatures, parsing JSON or storage, or fixing type errors."
---

# TypeScript engineering

## Purpose
Use the compiler to catch mistakes at trust boundaries instead of papering over them.

## Facts
- `tsconfig.json`: `strict: true`, `moduleResolution: bundler`, `noEmit`, includes `src`, `electron`, `mcp-bridge.ts`. `tests/` is NOT typechecked by `tsc`; tests are bundled by esbuild, which strips types without checking them.
- TypeScript `~5.6`. ESLint uses `typescript-eslint` recommended; `no-explicit-any` is a warning, so existing `any` is tolerated but new code should not add more.
- Shared renderer types: `src/types/browser.ts`, `src/types/index.ts`.

## Rules
- Data crossing a trust boundary (IPC args in main, `JSON.parse`, `localStorage`, MCP tool arguments, page messages) is `unknown` until validated. Validate shape, type and length, then narrow. Example: `permission-response` in `electron/main.ts` checks `typeof requestId === 'string'` and length before use.
- No `as` casts to silence an error on untrusted data. A cast is acceptable for Electron API gaps (`(webPreferences as any).partition`) with a comment.
- Prefer discriminated unions and `as const` arrays (`ENGINE_IPC_CHANNELS`, `SUPPORTED_PROTOCOL_VERSIONS`) for allowlists, so the allowlist is also the type.
- Do not widen `tsconfig.json` (no `skipLibCheck` changes, no `strict: false`) to make an error go away.

## Workflow
1. Run `npm run typecheck` first to know the baseline.
2. Fix the type at its source rather than at each use.
3. For test files, since `tsc` does not see them, run `npx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target es2020 --jsx react-jsx <file>` when you want type feedback (expect noise from loosely typed mocks).

## Verify
`npm run typecheck` (about 16 s) and `npm run lint`.

## Done when
Typecheck passes with no new `any`, casts or `@ts-ignore` on untrusted data.
