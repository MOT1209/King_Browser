#!/usr/bin/env node
// Makes the project skills visible to agents that look in .agents/skills
// (OpenAI Codex and the `npx skills` installer) without copying them: it links
// .agents/skills to ../.claude/skills. .agents/ is gitignored, so the link is
// local to your checkout. Skills are never copied, so they cannot drift.
//
//   node scripts/setup-agent-skills.cjs          create the link
//   node scripts/setup-agent-skills.cjs --check  report only, exit 1 if missing
//
// On Windows a directory junction is used (no administrator rights needed).
const fs = require('node:fs');
const path = require('node:path');

function describe(root) {
  const source = path.join(root, '.claude', 'skills');
  const dir = path.join(root, '.agents');
  const link = path.join(dir, 'skills');
  let state = 'missing';
  try {
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink()) {
      state = fs.realpathSync(link) === fs.realpathSync(source) ? 'linked' : 'wrong-target';
    } else {
      state = 'occupied';
    }
  } catch { /* not present */ }
  return { source, dir, link, state };
}

function setup(root, { check = false } = {}) {
  const info = describe(root);
  if (!fs.existsSync(info.source)) return { ...info, state: 'no-source', changed: false };
  if (check || info.state !== 'missing') return { ...info, changed: false };
  fs.mkdirSync(info.dir, { recursive: true });
  fs.symlinkSync(path.join('..', '.claude', 'skills'), info.link, process.platform === 'win32' ? 'junction' : 'dir');
  return { ...describe(root), changed: true };
}

module.exports = { setup, describe };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const result = setup(path.resolve(__dirname, '..'), { check });
  const messages = {
    linked: result.changed ? 'Linked .agents/skills -> .claude/skills' : '.agents/skills already links to .claude/skills',
    missing: '.agents/skills is not set up (run without --check to create it)',
    'wrong-target': '.agents/skills links somewhere other than .claude/skills; remove it and rerun',
    occupied: '.agents/skills exists and is not a link; it may hold copies. Move it aside and rerun',
    'no-source': '.claude/skills was not found; run from a King Browser checkout',
  };
  console.log(messages[result.state]);
  process.exit(result.state === 'linked' ? 0 : 1);
}
