---
name: cross-platform
description: "Windows, macOS and Linux differences in King Browser: paths and case-insensitivity, sandbox and user namespaces on Linux, keychain and safeStorage, menus and accelerators, titlebar insets, packaging targets. Use when writing platform-dependent code, file path logic, shortcuts, window chrome or packaging changes."
---

# Cross-platform behaviour

## Known differences in this codebase
- Paths: Windows comparisons are case-insensitive (`trustedSender.ts`, `downloads.ts` lowercase on `win32`); use `path` functions, never string concatenation with `/`.
- Linux sandbox: `electron/main/linuxSandbox.ts` decides; the app falls back to `--no-sandbox` (with a user warning) only as root, or when unprivileged user namespaces are disabled AND `chrome-sandbox` is not a root-owned setuid helper. Ubuntu 24.04 restricts user namespaces through AppArmor; CI configures the setuid `chrome-sandbox` helper instead of disabling the sandbox.
- Secrets: `safeStorage` uses DPAPI (Windows), Keychain (macOS), libsecret/kwallet (Linux, may be unavailable -> AES-GCM fallback with warning). Dev builds use `--use-mock-keychain` and `password-store=basic`.
- Window chrome: frameless title bar, `-webkit-app-region` drag areas, `src/hooks/useTitlebarInsets.ts` reserves space for native window controls (Window Controls Overlay geometry differs per OS).
- Shortcuts: `ControlOrMeta`; macOS menu roles differ (`electron/main/shortcutAccelerators.ts`, `tests/menu_accelerators.test.ts`).
- Updates: auto-update only on Windows installer builds; manual on Linux, macOS and portable (`isManualUpdateOnly` in `main.ts`).
- Packaging: `package.json` `build` (NSIS/portable/zip on Windows, dmg/zip x64+arm64 on macOS with hardened runtime, AppImage/deb on Linux), fuses applied after pack.

## Workflow
1. Branch on `process.platform` only in main-process code; keep the decision in a pure function with the platform injected so tests cover all three.
2. State which OS you ran on; CI covers Linux and Windows (blocking) and macOS (non-blocking).

## Verify
`npm test` locally; CI jobs `test`, `test-windows`, `test-macos`. See `cross-platform-testing` for manual checks.

## Done when
Platform branches are tested with each value, and the report says which OS each check actually ran on.
