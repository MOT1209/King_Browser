import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// scripts/setup-agent-skills.cjs links .agents/skills to .claude/skills for
// Codex. It must create a link (never a copy), be idempotent, and refuse to
// touch a directory that is not its own link.

console.log('\n--- Agent skills setup script ---');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setup } = require('../scripts/setup-agent-skills.cjs') as {
  setup: (root: string, options?: { check?: boolean }) => { state: string; changed: boolean; link: string };
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'king-agents-'));
fs.mkdirSync(path.join(root, '.claude', 'skills', 'demo'), { recursive: true });
fs.writeFileSync(path.join(root, '.claude', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n');

assert.equal(setup(root, { check: true }).state, 'missing', 'check mode reports a missing link');
assert.equal(fs.existsSync(path.join(root, '.agents')), false, 'check mode creates nothing');

const first = setup(root);
assert.equal(first.state, 'linked');
assert.equal(first.changed, true);
assert.ok(fs.lstatSync(first.link).isSymbolicLink(), 'a link is created, not a copy');
assert.ok(fs.existsSync(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md')), 'skills are visible through the link');

const second = setup(root);
assert.equal(second.state, 'linked');
assert.equal(second.changed, false, 'second run changes nothing');

const other = fs.mkdtempSync(path.join(os.tmpdir(), 'king-agents-occupied-'));
fs.mkdirSync(path.join(other, '.claude', 'skills'), { recursive: true });
fs.mkdirSync(path.join(other, '.agents', 'skills'), { recursive: true });
const occupied = setup(other);
assert.equal(occupied.state, 'occupied', 'a real directory is left alone');
assert.equal(occupied.changed, false);

assert.equal(setup(fs.mkdtempSync(path.join(os.tmpdir(), 'king-agents-empty-'))).state, 'no-source');
console.log('[PASS] setup-agent-skills links once, is idempotent and does not overwrite a real directory');
