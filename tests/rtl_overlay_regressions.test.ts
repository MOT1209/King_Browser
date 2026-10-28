import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// index.css used to mirror physical offset utilities under [dir="rtl"] (for example
// `.right-2 { right: auto; left: 0.5rem }`). Floating elements positioned with
// those classes moved in Arabic onto other controls. These checks pin the fixes.
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

// 1. The agent status pill sat bottom-right with `right-4`; in Arabic the
// mirror rule moved it bottom-left, over the King Assistant chat input.
const panel = read('src/components/AgentControlPanel.tsx');
assert.ok(!/className="fixed[^"]*\bright-4\b/.test(panel), 'agent pill must not be placed with the mirrored right-4 utility');
assert.ok(!/className="fixed[^"]*"\s+dir="ltr"/.test(panel), 'agent panel must follow the interface direction instead of forcing LTR');
assert.ok(panel.includes('style={{ left: placed.x, top: placed.y }}'), 'agent pill is placed with physical pixel offsets');

// 2. The omnibox actions box had an inline `right` only; the mirror rule added
// `left: 0.5rem`, so in Arabic the box spanned the whole address bar and swallowed
// clicks meant for the input. The mirror rules are gone (see rtl_logical_classes);
// the address bar is physical by design, so its badge and action box use literal
// left/right classes together with its physical input padding.
const omnibox = read('src/components/topbar/OmniboxBar.tsx');
assert.ok(/className="absolute left-2 top-1\/2[^"]*"/.test(omnibox), 'site-info badge is placed on the physical left, next to the input padding');
assert.ok(/king-omnibox-actions absolute inset-y-0 right-2/.test(omnibox), 'the action box is placed on the physical right');
assert.ok(!omnibox.includes("left: 'auto'") && !omnibox.includes("style={{ left: '0.5rem'"), 'no inline pins are needed once nothing rewrites left/right');

console.log('[PASS] [RTL-Overlay] agent pill and omnibox overlays are not moved by the RTL mirror rules.');
