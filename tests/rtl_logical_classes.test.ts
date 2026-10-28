import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The interface mirrors itself with logical utilities (ms/me/ps/pe, start/end,
// border-s/border-e, text-start/text-end). There used to be a global block of
// [dir="rtl"] rules that rewrote physical left/right classes; it broke the agent
// pill and the address bar and was removed. A physical left/right class is now
// literal, so a new one is almost always a right-to-left bug. The few that are
// correct are listed below with the reason. Add to the list only for a surface
// that is physical by design.
console.log('\n--- Logical direction classes (RTL) ---');

const root = process.cwd();

// 1. The global mirror rules must not come back.
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const mirror = css.match(/\[dir="rtl"\]\s+\.(?:-?ml-|-?mr-|pl-|pr-|left-|right-|-right-|border-[lr]|text-left|text-right|-translate-x)[^{]*\{/g);
assert.equal(mirror, null, `src/index.css must not rewrite physical classes under [dir="rtl"]: ${mirror?.slice(0, 3).join(' | ')}`);

// 2. Physical direction classes outside the allowlist.
const STR = /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
const PHYSICAL = /(?<![\w:\-/[.])(-?(?:ml|mr|pl|pr|left|right)-[\w./[\]%()+-]+|border-[lr](?:-\w+)?|text-left|text-right)(?![\w.\-/[])/g;

const CENTERING = 'centering: left-1/2 with -translate-x-1/2 is symmetric in both directions';
const SPAN = 'full-width span: left-0 right-0 stretches to both edges';
const ADDRESS_BAR = 'address bar: reads left to right in every language; its input padding and overlays are physical together';
const DECORATION = 'decorative background shape placed by position, not by reading direction';
const WINDOW = 'window chrome: the traffic lights and drag area are physical';
const LEGACY = 'physical placement that was never mirrored before the migration; behavior unchanged, migrate when the component is next touched';

const ALLOWED: Record<string, Record<string, string>> = {
  'src/App.tsx': { 'left-[82px]': WINDOW, 'left-2.5': WINDOW, 'left-0': SPAN, 'right-0': SPAN, '-ml-[3px]': LEGACY },
  'src/components/AICursorOverlay.tsx': { 'left-1/2': CENTERING },
  'src/components/BrowserView.tsx': { 'left-0': SPAN, 'right-0': SPAN },
  'src/components/FindInPage.tsx': { 'left-1/2': CENTERING },
  'src/components/NewTabPage.tsx': {
    'pl-5': LEGACY, 'pr-8': LEGACY, 'right-1.5': LEGACY, 'left-6': LEGACY, 'left-1/2': CENTERING, 'left-0': SPAN, 'right-0': SPAN,
    'left-[10%]': DECORATION, 'right-[10%]': DECORATION, '-left-[10%]': DECORATION, '-right-[10%]': DECORATION,
    'right-[20%]': DECORATION, 'left-[-50%]': DECORATION, 'right-[-50%]': DECORATION,
  },
  'src/components/Onboarding.tsx': { 'pl-20': LEGACY },
  'src/components/PermissionPromptPopover.tsx': { '-mr-1': LEGACY },
  'src/components/ReaderMode.tsx': { 'left-1/2': CENTERING },
  'src/components/SidePanel.tsx': { 'left-1/2': CENTERING },
  'src/components/TopBar.tsx': { 'left-0': SPAN, 'right-0': SPAN, 'right-0.5': LEGACY },
  'src/components/settings/BackgroundPreviewCard.tsx': {
    'left-1/2': CENTERING, 'left-[-50%]': DECORATION, 'right-[-50%]': DECORATION, '-left-6': DECORATION, '-right-6': DECORATION, 'right-1/4': DECORATION,
  },
  'src/components/topbar/OmniboxBar.tsx': {
    'left-2': ADDRESS_BAR, 'right-2': ADDRESS_BAR, 'left-10': ADDRESS_BAR, 'left-28': ADDRESS_BAR, '-right-0.5': ADDRESS_BAR,
    'pl-11': ADDRESS_BAR, 'pl-28': ADDRESS_BAR, 'pl-34': ADDRESS_BAR, 'pl-52': ADDRESS_BAR, 'pr-24': ADDRESS_BAR,
    'left-0': SPAN, 'right-0': SPAN,
  },
  'src/components/ui/ai-chat-input.tsx': { 'left-0': SPAN, 'right-0': SPAN },
};

function listTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

const found: Record<string, Set<string>> = {};
for (const file of listTsx(path.join(root, 'src'))) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  for (const literal of source.matchAll(STR)) {
    for (const match of literal[0].matchAll(PHYSICAL)) {
      const token = match[1];
      if (token === 'right-click') continue; // prose, not a class
      (found[relative] ??= new Set()).add(token);
    }
  }
}

const unexpected: string[] = [];
for (const [file, tokens] of Object.entries(found)) {
  for (const token of tokens) {
    if (!ALLOWED[file]?.[token]) unexpected.push(`${file}: ${token}`);
  }
}
assert.deepEqual(unexpected, [], `Physical direction classes are literal now. Use ms/me/ps/pe, start/end, border-s/border-e or text-start/text-end, or add the class to ALLOWED with a reason:\n  ${unexpected.join('\n  ')}`);

// The list must stay honest: an entry for a class that is gone is dead weight.
const stale: string[] = [];
for (const [file, tokens] of Object.entries(ALLOWED)) {
  for (const token of Object.keys(tokens)) {
    if (!found[file]?.has(token)) stale.push(`${file}: ${token}`);
  }
}
assert.deepEqual(stale, [], `ALLOWED lists classes that no longer exist:\n  ${stale.join('\n  ')}`);

console.log(`[PASS] [RTL-Logical] no mirror rules in index.css; ${Object.values(found).reduce((n, s) => n + s.size, 0)} physical classes remain, each with a reason.`);
