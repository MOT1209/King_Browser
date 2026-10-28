import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Agent skills (.claude/skills/<name>/SKILL.md) are read by several coding
 * agents as instructions. A skill that names a renamed file, a script that no
 * longer exists, or that AGENTS.md does not index sends an agent to the wrong
 * place with full confidence. Prevents: stale skills and broken frontmatter
 * (which makes Claude Code and OpenCode silently skip the skill).
 */

console.log('\n--- Agent skills integrity ---');

const root = process.cwd();
const skillsDir = path.join(root, '.claude', 'skills');
const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts);

// Backticked repo paths: "electron/main/policyEngine.ts", "tests/electron/kingApp.ts", "docs/engineering/x.md".
const PATH_ROOTS = ['electron/', 'src/', 'tests/', 'scripts/', 'docs/', '.github/', '.claude/', 'public/', 'build/', 'website/', 'video/'];
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'README.md', 'PRODUCT.md', 'plan.md', 'package.json', 'vite.config.ts', 'index.html', 'tsconfig.json', 'eslint.config.mjs', 'mcp-bridge.ts', 'mcp-bridge.mjs', '.env.example'];
// Paths that skills mention as outputs or local-only locations, not repo files.
const NOT_IN_REPO = [/^test-results\//, /^dist/, /^\.agents\//, /^src\/locales\/\{/];

const names = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
assert.ok(names.length >= 40, `expected the skill collection, found ${names.length}`);

const problems: string[] = [];
for (const name of names) {
  const file = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(file)) { problems.push(`${name}: missing SKILL.md`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const fm = /^---\nname: ([^\n]+)\ndescription: ("(?:[^"\\]|\\.)*")\n---\n/.exec(text);
  if (!fm) { problems.push(`${name}: frontmatter must be name + double-quoted description`); continue; }
  if (fm[1] !== name) problems.push(`${name}: frontmatter name "${fm[1]}" differs from directory`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) problems.push(`${name}: name must be lowercase words joined by single hyphens`);
  const description = JSON.parse(fm[2]) as string;
  if (description.length < 40 || description.length > 1024) problems.push(`${name}: description length ${description.length} outside 40..1024`);
  if (!/\bUse (when|before|after|for)\b/.test(description)) problems.push(`${name}: description must say when to use the skill`);
  const body = text.slice(fm[0].length);
  for (const section of ['## Verify', '## Done when']) {
    if (!body.includes(section) && !(section === '## Verify' && body.includes('## Automated'))) problems.push(`${name}: missing "${section}" section`);
  }
  if (!agentsMd.includes(`\`${name}\``)) problems.push(`${name}: not indexed in AGENTS.md`);

  for (const [, span] of body.matchAll(/`([^`\n]+)`/g)) {
    for (const cmd of span.matchAll(/npm run ([a-z][\w:-]*)/g)) {
      const script = cmd[1].replace(/[:-]$/, '');
      if (!scripts.includes(script) && !/<|\|/.test(span)) problems.push(`${name}: "npm run ${script}" is not a package.json script`);
    }
    const candidate = span.split(/\s/)[0].replace(/[),.;:]+$/, '');
    const isRepoPath = PATH_ROOTS.some((r) => candidate.startsWith(r)) || ROOT_FILES.includes(candidate);
    if (!isRepoPath || NOT_IN_REPO.some((re) => re.test(candidate)) || /[*<>{}]/.test(candidate)) continue;
    const clean = candidate.replace(/#.*$/, '').replace(/\/$/, '');
    if (!fs.existsSync(path.join(root, clean))) problems.push(`${name}: references missing path ${clean}`);
  }
}

// AGENTS.md must not index a skill that does not exist.
for (const [, indexed] of agentsMd.matchAll(/\| `([a-z0-9-]+)` \|/g)) {
  if (!names.includes(indexed)) problems.push(`AGENTS.md indexes unknown skill ${indexed}`);
}

assert.deepEqual(problems, [], 'agent skills are well-formed, indexed and reference real files');
console.log(`[PASS] ${names.length} skills: frontmatter valid, indexed in AGENTS.md, referenced paths and npm scripts exist`);
