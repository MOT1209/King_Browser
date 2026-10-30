---
name: element-targeting
description: "How the agent names and acts on page elements in King Browser: snapshot refs (e12), selector fallback, covered-element errors, native trusted input and field verification. Use when changing browser_snapshot, ref resolution, click or type behaviour, or debugging an action that hit the wrong element."
---

# Element targeting and trusted input

## Purpose
Actions use refs stamped by `browser_snapshot` and real input events, so pages react as they do for a person and the policy engine sees the same target it will act on.

## Files
`src/utils/elementSnapshot.ts` (page-side snapshot script), `electron/main/elementRefs.ts` (ref to selector, `REF_TOOLS`), `src/utils/trustedInput.ts` (key parsing, locate script, native events), `src/hooks/useBrowserAgentBridge.ts`, `tests/element_refs.test.ts`, `tests/trusted_input.test.ts`.

## Workflow
1. Refs are `e<number>` only, cleared by navigation and every new snapshot; resolve them in the main process before classification so approvals and site rules see the real target.
2. A new tool that targets an element is added to `REF_TOOLS` and tested with a stale ref and an invented ref (both must fail clearly).
3. Locate scripts check visibility, scroll into view and detect a covering element at the click point; the error names the cover.
4. `browser_type` reads the field back and reports a mismatch; keep that check when changing input paths.
5. Password fields are marked in snapshots, never listed with their value.

## Rules
- Do not add DOM shortcuts (`el.value =`, synthetic `KeyboardEvent`); use the native input pipeline.
- Nothing here may touch fingerprint or bot-detection signals; the module comment states this on purpose.
- Typed text is redacted from logs and approvals (`redactArgsForLog`).

## Verify
`npm test` (`element_refs`, `trusted_input`, `policy_engine`, `agent_browser_tools`); `npm run build && xvfb-run -a npm run test:electron` for real-page behaviour.

## Common failures
Ref reused after navigation; element in an iframe or shadow root not found; click lands on a sticky banner; typing into a React input that ignores synthetic events.

## Done when
A stale ref fails with a clear message, the covered-element path is tested, and no secret value appears in snapshot output or logs.
