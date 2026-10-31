import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The rolling nightly release replaces same-named assets only, so installers
// named after an old version (King-Browser-0.0.9-x64.exe) piled up on it. The
// release workflow now prunes assets that the current build did not produce.
// Prevents: stale assets accumulating, and the prune running before the
// publish succeeded, on the versioned release, or against an empty file set.

console.log('\n--- Release workflow: nightly cleanup ---');

const workflow = fs.readFileSync(path.join(process.cwd(), '.github/workflows/release.yml'), 'utf8');
const stepStart = workflow.indexOf('      - name: Remove stale nightly assets');
assert.ok(stepStart > 0, 'the workflow has a "Remove stale nightly assets" step');
const next = workflow.indexOf('\n      - ', stepStart + 10);
const step = workflow.slice(stepStart, next === -1 ? undefined : next);

assert.ok(workflow.indexOf('- name: Publish nightly') < stepStart, 'pruning runs after the nightly publish step');
assert.ok(stepStart < workflow.indexOf('- name: Publish v-release'), 'pruning sits before the versioned release step');
assert.match(step, /if: needs\.check\.outputs\.nightly == 'true'/, 'only nightly runs prune');
assert.doesNotMatch(step.replace(/nightly/g, ''), /\$\{\{ steps\.tag/, 'the step never targets the versioned tag');
assert.ok(!/delete-asset\s+(?!nightly)/.test(step), 'delete-asset only addresses the nightly release');

// Run the real script body against a stub gh and a fake release-files folder.
const script = /run: \|\n((?: {10}.*\n?)+)/.exec(step)?.[1].replace(/^ {10}/gm, '');
assert.ok(script, 'the step has a run script');

function prune(files: string[], remote: string[]): { deleted: string[]; status: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-nightly-'));
  fs.mkdirSync(path.join(dir, 'release-files'));
  for (const f of files) fs.writeFileSync(path.join(dir, 'release-files', f), 'x');
  fs.mkdirSync(path.join(dir, 'bin'));
  const log = path.join(dir, 'deleted.txt');
  fs.writeFileSync(path.join(dir, 'bin', 'gh'), [
    '#!/bin/sh',
    `if [ "$2" = "view" ] || [ "$1 $2" = "release view" ]; then printf '%s\\n' ${remote.map((r) => `'${r}'`).join(' ')}; exit 0; fi`,
    `if [ "$2" = "delete-asset" ]; then echo "$4" >> '${log}'; exit 0; fi`,
    'exit 1',
  ].join('\n'), { mode: 0o755 });
  let status = 0;
  try {
    execFileSync('bash', ['-eo', 'pipefail', '-c', script as string], { cwd: dir, env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` }, stdio: 'pipe' });
  } catch (error) {
    status = (error as { status?: number }).status ?? 1;
  }
  return { deleted: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).sort() : [], status };
}

const current = ['King-Browser-0.0.10-x64.exe', 'King-Browser-Setup-x64.exe', 'latest.yml', 'SHA256SUMS.txt'];
const stale = ['King-Browser-0.0.9-x64.exe', 'King-Browser-Setup-0.0.9-x64.exe', 'King-Browser-0.0.8-x64.zip'];
const result = prune(current, [...current, ...stale]);
assert.equal(result.status, 0);
assert.deepEqual(result.deleted, [...stale].sort(), 'exactly the stale assets are deleted');

assert.deepEqual(prune(current, current).deleted, [], 'nothing is deleted when the release matches the build');
const empty = prune([], current);
assert.notEqual(empty.status, 0, 'an empty file set aborts instead of deleting everything');
assert.deepEqual(empty.deleted, [], 'an empty file set deletes nothing');

console.log('[PASS] nightly prune: ordered after publish, nightly-only, deletes only stale assets, refuses an empty set');
