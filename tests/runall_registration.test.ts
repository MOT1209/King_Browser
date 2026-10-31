import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * tests/runAll.ts is a hand-maintained list of imports, and a test file that is
 * not imported there never runs and never fails. Prevents: a new or renamed
 * test file that silently stops being executed.
 */

console.log('\n--- runAll.ts registers every test file ---');

const testsDir = path.join(process.cwd(), 'tests');
// Helpers imported by other tests or opt-in tools, not suites of their own.
const NOT_SUITES = new Set(['runAll.ts', 'benchmark_suite.ts', 'jsdom_suite_lock.ts']);
// tests/electron holds Playwright specs run by `npm run test:electron`.
const SKIP_DIRS = new Set(['electron']);

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.relative(testsDir, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  }
  return out;
}

const runAll = fs.readFileSync(path.join(testsDir, 'runAll.ts'), 'utf8');
const imported = new Set(
  Array.from(runAll.matchAll(/(?:import\s+|from\s+)['"]\.\/([^'"]+)['"]/g), (m) => m[1].replace(/\.(ts|tsx)$/, ''))
);

const unregistered = collect(testsDir)
  .filter((file) => !NOT_SUITES.has(file))
  .filter((file) => !imported.has(file.replace(/\.(ts|tsx)$/, '')));

assert.deepEqual(unregistered, [], `test files not imported by tests/runAll.ts (they would never run): ${unregistered.join(', ')}`);

console.log('[PASS] every test file is registered in runAll.ts');
