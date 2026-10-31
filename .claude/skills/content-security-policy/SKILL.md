---
name: content-security-policy
description: "Content Security Policy for the King Browser renderer: the production meta CSP in vite.config.ts, the identical header in electron/main.ts, the dev policy in index.html, and how to add a host. Use when the renderer needs a new network host, font, worker or script source, or when touching index.html, vite.config.ts or onHeadersReceived."
---

# Content Security Policy

## Facts
- Production policy is defined twice and must be byte-identical: `HARDENED_PROD_CSP` in `vite.config.ts` (written into `dist/index.html` at build) and the prod branch of the `Content-Security-Policy` header in `electron/main.ts` (`onHeadersReceived`). The page enforces the intersection.
- `index.html` carries a looser dev policy (`'unsafe-inline' 'unsafe-eval'`, localhost) that the build replaces.
- `script-src 'self' 'wasm-unsafe-eval'` only. `style-src` keeps `'unsafe-inline'` deliberately (inline styles and `-webkit-app-region`); the reason is documented in `vite.config.ts`.
- `tests/csp_parity.test.ts` fails when the two copies differ, when `script-src` gains inline/eval/remote sources, or when the built `dist/index.html` differs. `tests/electron/smoke.spec.ts` re-checks the CSP of the running app.

## Adding a host (for example a new API)
1. Prefer doing the request in the main process behind a guarded IPC (as `fetch-page-html` does), so the renderer CSP does not grow.
2. If the renderer must connect directly: add the narrowest origin to `connect-src` in BOTH copies, and to the dev policy in `index.html`.
3. Add the host to README "Network connections" (CLAUDE.md rule 8).
4. Never add `'unsafe-eval'`, `'unsafe-inline'`, `blob:`, `data:` or wildcards to `script-src`.

## Verify
`npm test` (parity test), `npm run build`, then `xvfb-run -a npm run test:electron`.

## Done when
Both copies match, the README table lists the host, and the parity and smoke tests pass.
