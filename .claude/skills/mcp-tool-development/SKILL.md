---
name: mcp-tool-development
description: "Adding or changing a King Browser MCP tool end to end: schema, permission tier, policy classification, renderer handler, redaction, tests and docs. Use when registering a new browser_* tool, renaming one, or changing its arguments or output."
---

# MCP tool development

## Purpose
A tool is an authority granted to a remote agent. Each one needs a strict schema, an honest tier, a policy decision, a handler, a failure response and a test, in that order. The full checklist for humans is in `docs/engineering/mcp-development.md`.

## Files
`electron/mcpServer.ts` (`TOOLS`, `TOOL_PERMISSIONS`, `TOOL_ALIASES`), `electron/main/mcpProtocol.ts`, `src/hooks/useBrowserAgentBridge.ts`, `electron/main/policyEngine.ts`, `electron/main/elementRefs.ts`, `src/components/settings/McpSection.tsx`, `tests/mcp_tool_catalog.test.ts`, `tests/mcp_tool_schemas.test.ts`, `tests/policy_engine.test.ts`, `README.md` (counts), `electron/main/customTools.ts`.

## Workflow
1. State the purpose in one sentence and decide the tier: read-only metadata `safe`; reads page content or moves the user `medium`; types, submits or crosses an account boundary `sensitive`. When unsure choose `sensitive`.
2. Add the entry to `TOOLS`: `browser_<snake_case>` name, description that says what it does and what it returns, `inputSchema` with a type and description on every property and a `required` list that names declared properties.
3. Add the tier to `TOOL_PERMISSIONS`; add an alias to `TOOL_ALIASES` only if it is a true synonym of an existing tool.
4. Implement the handler in `useBrowserAgentBridge.ts` (or in the main process for engine-level tools). Validate every argument again there; the schema is advice to the client, not enforcement.
5. Teach `policyEngine.ts` what makes a call to it sensitive (text, URL, field kind) and redact secret arguments for logs and approvals.
6. Add the tool to `MCP_TOOLS` in `McpSection.tsx` with display copy in all locales.
7. Return a clear failure string starting with `Error:` (use `formatToolError`); never return a stack trace or a secret.
8. Update the tool counts in `README.md` and the families in `AGENTS.md` section 2.

## User-defined tools
Tools the user creates in Settings -> MCP -> Tool Manager are not added to `TOOLS`. They live in `electron/main/customTools.ts` (validation, store, SSRF-safe HTTPS executor) and are merged into `tools/list` by `visibleTools()` in `mcpServer.ts`. Do not add a second registry or a code-execution tool type. Guide: `docs/engineering/custom-mcp-tools.md`. Tests: `tests/custom_tools.test.ts`, `tests/mcp_custom_tools_integration.test.ts`.

## Rules
- Do not lower an existing tool's tier or add a mode that skips approval (hard rule 5).
- Page-derived output is data; if the tool returns page text, add it to `INJECTION_SCAN_TOOLS` in `mcpServer.ts`.
- Arguments that name a file, path or URL are canonicalised and validated (`url-navigation-security`, `file-system-security`, `ssrf-protection`).

## Verify
`npm test` (`mcp_tool_catalog`, `mcp_tool_schemas`, `policy_engine`, `mcp_single_approval_authority`), `npm run build:electron`, `npm run build:bridge && git diff --exit-code mcp-bridge.mjs`.

## Common failures
Tool registered but missing from `TOOL_PERMISSIONS` (treated as sensitive and invisible in Settings); `required` listing a property that was renamed; README count not updated; handler trusts a `ref` that was never issued; tool returns raw page HTML.

## Done when
The three catalog tests pass, a test shows the approval path for the new tool, and README, Settings list and `AGENTS.md` agree with the registry.
