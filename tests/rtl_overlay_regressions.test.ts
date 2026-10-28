import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// index.css mirrors physical offset utilities under [dir="rtl"] (for example
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
// `left: 0.5rem`, so in Arabic the box spanned the whole address bar and
// swallowed clicks meant for the input.
const omnibox = read('src/components/topbar/OmniboxBar.tsx');
const actions = omnibox.slice(omnibox.indexOf('king-omnibox-actions'), omnibox.indexOf('king-omnibox-actions') + 600);
assert.ok(/left: 'auto'/.test(actions), 'omnibox actions must pin left: auto against the RTL mirror rule');
assert.ok(omnibox.includes("style={{ left: '0.5rem', right: 'auto' }}"), 'site-info badge stays on the unmirrored padding side');

console.log('[PASS] [RTL-Overlay] agent pill and omnibox overlays are not moved by the RTL mirror rules.');
