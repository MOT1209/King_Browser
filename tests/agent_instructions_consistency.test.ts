import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AGENTS.md is the single source of instructions. An adapter file that copies
 * rules from it drifts and then tells one agent the opposite of another, and a
 * doc that links to a moved file sends an agent nowhere. Prevents: copied or
 * oversized adapters, adapters that do not point at AGENTS.md, stale skill
 * counts in docs and broken relative links in the instruction documents.
 */

console.log('\n--- Agent instruction consistency ---');

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const problems: string[] = [];

// 1. CLAUDE.md imports AGENTS.md and stays an adapter, not a second copy.
const claude = read('CLAUDE.md');
if (!/^@AGENTS\.md$/m.test(claude)) problems.push('CLAUDE.md must import AGENTS.md with a line "@AGENTS.md"');
if (claude.split('\n').length > 40) problems.push('CLAUDE.md is longer than 40 lines; move shared rules to AGENTS.md');
if (/isTrustedSender|nodeIntegration|safeStorage/.test(claude)) problems.push('CLAUDE.md repeats hard rules that live in AGENTS.md');

// 2. Any other agent adapter that exists points at AGENTS.md and is small.
const ADAPTERS = ['GEMINI.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md', '.cursor/rules', '.windsurf/rules'];
for (const rel of ADAPTERS) {
  if (!exists(rel)) continue;
  const files = fs.statSync(path.join(root, rel)).isDirectory()
    ? fs.readdirSync(path.join(root, rel)).map((f) => path.join(rel, f))
    : [rel];
  for (const file of files) {
    const text = read(file);
    if (!/AGENTS\.md/.test(text)) problems.push(`${file}: adapter must point to AGENTS.md`);
    if (text.split('\n').length > 30) problems.push(`${file}: adapter longer than 30 lines; do not copy AGENTS.md`);
  }
}

// 3. Skills are stored once. A second copy under another agent's folder would drift.
for (const dir of ['.cursor/skills', '.windsurf/skills', '.github/skills', '.opencode/skills']) {
  if (exists(dir)) problems.push(`${dir}: skills must live only in .claude/skills (link or document, do not copy)`);
}
if (exists('.agents/skills') && !fs.lstatSync(path.join(root, '.agents/skills')).isSymbolicLink() && fs.readdirSync(path.join(root, '.agents/skills')).some((n) => exists(`.claude/skills/${n}`))) {
  problems.push('.agents/skills holds a copy of a project skill; use the symlink from scripts/setup-agent-skills.cjs');
}

// 4. Claims about the number of skills match the directory.
const skillCount = fs.readdirSync(path.join(root, '.claude/skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).length;
for (const doc of ['docs/engineering/agent-tooling.md', 'docs/engineering/agent-ecosystem.md', 'docs/engineering/skills-guide.md']) {
  if (!exists(doc)) continue;
  for (const m of read(doc).matchAll(/\b(\d+) (?:task )?skills\b/g)) {
    if (Number(m[1]) !== skillCount && Number(m[1]) > 20) problems.push(`${doc}: says ${m[1]} skills, directory has ${skillCount}`);
  }
}

// 5. Relative markdown links in the instruction documents resolve.
const docs = ['AGENTS.md', 'CLAUDE.md', ...['docs/engineering', 'docs/audits', 'docs/reports'].flatMap((d) =>
  exists(d) ? fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`) : [])];
for (const doc of docs) {
  const text = read(doc).replace(/```[\s\S]*?```/g, '');
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    if (!clean) continue;
    const resolved = path.normalize(path.join(path.dirname(doc), clean));
    if (!exists(resolved)) problems.push(`${doc}: broken link ${target}`);
  }
}

assert.deepEqual(problems, [], 'agent instruction files are consistent and their links resolve');
console.log(`[PASS] agent instructions consistent (${docs.length} documents, ${skillCount} skills)`);
