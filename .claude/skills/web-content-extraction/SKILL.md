---
name: web-content-extraction
description: "Extracting readable content from pages in King Browser safely: reader mode sanitising, agent read tools, page translation text, size limits and treating extracted text as untrusted data. Use when changing ReaderMode, browser_read_page or get_element_text output, translation text extraction, or adding any feature that copies page content elsewhere."
---

# Web content extraction

## Purpose
Everything extracted from a page is attacker-controlled. It is bounded in size, sanitised before rendering, scanned before it reaches an agent and never executed.

## Files
`src/components/ReaderMode.tsx`, `electron/main/translationText.ts`, `src/utils/elementSnapshot.ts`, `electron/main/injectionDetector.ts`, `electron/main/mcpContent.ts`, `tests/reader_mode_sanitization.test.ts`, `tests/translation_text.test.ts`, `tests/agent_document_boundary.test.ts`.

## Workflow
1. Pick the output form: plain text for agents and translation, sanitised HTML only for Reader Mode.
2. Bound the output (element count, character count) and say in the result when it was truncated.
3. Sanitise with the existing DOMPurify path before any HTML reaches React; do not add a second sanitiser.
4. Route text returned to an agent through the injection scan (`prompt-injection-defense`).
5. Do not extract password values, hidden inputs or cookies; snapshots mark sensitive fields instead of listing values.

## Rules
- No `innerHTML` of page content in the renderer without sanitising.
- Extraction runs in the guest through a script string built in `src/utils`; the guest preload exposes nothing.
- Screenshots are returned as image blocks (`mcpContent.ts`), not as base64 text.

## Verify
`npm test` (`reader_mode_sanitization`, `translation_text`, `agent_document_boundary`).

## Common failures
Script or `javascript:` URLs surviving in reader output; unbounded text blowing the MCP response; extracted text trusted as an instruction.

## Done when
Sanitisation and truncation are tested with hostile input and new extraction output is scanned.
