import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Prevents: the portable Windows build being mistaken for the installer. It
 * was published as King-Browser-<version>-x64.exe, next to
 * King-Browser-Setup-<version>-x64.exe, so the name gave no hint that it runs
 * without installing and creates no shortcuts. Users who ran it could not find
 * the app again after closing it.
 */

console.log('\n--- Windows artifact names ---');

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = pkg.build;

assert.ok(build.win.target.some((t: { target: string }) => t.target === 'portable'), 'the portable target is still built');
assert.equal(
  build.portable?.artifactName,
  'King-Browser-Portable-${version}-${arch}.exe',
  'the portable build says Portable in its file name'
);
assert.match(build.nsis.artifactName, /^King-Browser-Setup-/, 'the installer says Setup in its file name');
console.log('[PASS] [Artifact-Names] portable and installer builds are named for what they are');

const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
const step = release.slice(release.indexOf('- name: Stable Windows download names'), release.indexOf('- name: SHA256SUMS'));
assert.ok(step.length > 0, 'the stable-name step exists');
assert.match(step, /portable=\$\(ls King-Browser-Portable-\*-x64\.exe/, 'the stable portable copy is taken from the Portable-named build');
assert.doesNotMatch(step, /grep -v -- '-Setup-'/, 'no longer guesses the portable build by excluding Setup');
console.log('[PASS] [Artifact-Names] release workflow copies the Portable-named build');
