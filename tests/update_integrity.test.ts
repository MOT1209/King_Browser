import { assessUpdateIntegrity } from '../electron/main/updateIntegrity';
import fs0 from 'node:fs';

/**
 * Update-package integrity.
 *
 * electron-updater verifies the downloaded installer against the digest in the
 * release metadata (latest*.yml), but only when the metadata has one: with no
 * digest it downloads unchecked and still reports success. The app used to tell
 * the UI `integrityVerified: true` for every download. These tests pin the real
 * module that now decides it, and check that electron/main.ts uses it.
 *
 * (An earlier version of this suite tested a hand-copied mirror of a function
 * nested in main.ts that computed a SHA-256 which nothing ever compared. That
 * function and its mirror are gone.)
 */

console.log('\n--- Update Integrity (digest availability) ---');

// Shapes copied from electron-builder output: base64 sha512 is 88 characters.
const SHA512_B64 = 'Zm9v'.repeat(21) + 'Zg==';          // 86 base64 chars + "=="
const SHA512_B64_2 = 'YmFy'.repeat(21) + 'Yg==';
const SHA512_HEX = 'a'.repeat(128);
const SHA256_HEX = 'b'.repeat(64);
const EXE = 'King-Browser-0.0.9-x64.exe';

let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`[PASS] [Update-Integrity] ${name}`);
  } else {
    console.log(`[FAIL] [Update-Integrity] ${name} ${extra}`);
    process.exitCode = 1;
  }
}

check('test fixtures have the documented lengths', SHA512_B64.length === 88 && SHA512_B64_2.length === 88);

// 1. a digest for the downloaded file means it was checked
{
  const r = assessUpdateIntegrity({ files: [{ url: EXE, sha512: SHA512_B64 }], downloadedFile: `/tmp/pending/${EXE}` });
  check('base64 sha512 for the downloaded file -> verified', r.verified && r.algorithm === 'sha512', JSON.stringify(r));
}
check('hex sha512 is accepted (electron-updater accepts it too)',
  assessUpdateIntegrity({ files: [{ url: EXE, sha512: SHA512_HEX }] }).algorithm === 'sha512');
check('sha2 (sha256 hex) counts and is reported as sha256',
  assessUpdateIntegrity({ files: [{ url: EXE, sha2: SHA256_HEX }] }).algorithm === 'sha256');

// 2. no digest -> unverified, never assumed verified
check('no files and no digest -> unverified', !assessUpdateIntegrity({}).verified);
check('null and non-object inputs -> unverified', !assessUpdateIntegrity(null).verified && !assessUpdateIntegrity(undefined).verified);
check('a file entry without any digest -> unverified', !assessUpdateIntegrity({ files: [{ url: EXE }] }).verified);
check('empty files list and no top-level digest -> unverified', !assessUpdateIntegrity({ files: [] }).verified);

// 3. a malformed digest is not a digest
for (const bad of ['', 'short', 'z'.repeat(88), SHA512_B64.slice(0, 87), SHA512_B64 + 'x', 'a'.repeat(127), 42, null, {}]) {
  check(`malformed sha512 rejected: ${JSON.stringify(bad).slice(0, 20)}`,
    !assessUpdateIntegrity({ files: [{ url: EXE, sha512: bad }] }).verified);
}
check('malformed sha2 rejected', !assessUpdateIntegrity({ files: [{ url: EXE, sha2: 'b'.repeat(63) }] }).verified);

// 4. which entry counts
{
  const files = [{ url: 'other.dmg', sha512: SHA512_B64_2 }, { url: EXE }];
  check('the downloaded file has no digest even though another file does -> unverified',
    !assessUpdateIntegrity({ files, downloadedFile: `C:\\cache\\${EXE}` }).verified);
  const files2 = [{ url: 'other.dmg' }, { url: EXE, sha512: SHA512_B64 }];
  check('the downloaded file has a digest although another file has none -> verified',
    assessUpdateIntegrity({ files: files2, downloadedFile: `/cache/${EXE}` }).verified);
  check('downloaded file unknown: every entry must carry a digest',
    !assessUpdateIntegrity({ files: files2 }).verified && assessUpdateIntegrity({ files: [{ url: 'a', sha512: SHA512_B64 }, { url: 'b', sha512: SHA512_B64_2 }] }).verified);
  check('url-encoded file names are matched',
    assessUpdateIntegrity({ files: [{ url: 'King%20Browser%20Setup.exe', sha512: SHA512_B64 }], downloadedFile: '/c/King Browser Setup.exe' }).verified);
  check('mixed sha512 and sha256 is reported as the weaker algorithm',
    assessUpdateIntegrity({ files: [{ url: 'a', sha512: SHA512_B64 }, { url: 'b', sha2: SHA256_HEX }] }).algorithm === 'sha256');
}

// 5. metadata from older electron-builder versions has only top-level fields
check('legacy top-level sha512 with path -> verified', assessUpdateIntegrity({ path: EXE, sha512: SHA512_B64 }).verified);
check('legacy metadata without sha512 -> unverified', !assessUpdateIntegrity({ path: EXE }).verified);

// 6. main.ts reports what happened instead of a constant
{
  const main = fs0.readFileSync('electron/main.ts', 'utf8');
  check('main.ts no longer hardcodes integrityVerified: true', !/integrityVerified:\s*true/.test(main));
  check('main.ts derives integrityVerified from assessUpdateIntegrity', /integrityVerified:\s*integrity\.verified/.test(main) && /assessUpdateIntegrity\(info\)/.test(main));
  check('an unchecked package is not installed silently on quit', /autoInstallOnAppQuit\s*=\s*integrity\.verified/.test(main));
  check('the unused expected-hash plumbing is gone', !/extractExpectedSha256|expectedSha256|targetExpectedSha/.test(main));
}

console.log(`\n${passed} update-integrity checks passed\n`);

// ---------------------------------------------------------------------------
// Model cache disk budget
// ---------------------------------------------------------------------------
import { planEviction, enforceModelCacheBudget, MAX_MODEL_CACHE_TOTAL_BYTES } from '../electron/main/modelCacheQuota';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

console.log('--- Model Cache Budget ---');

(async () => {
let budgetPassed = 0;
function bcheck(name: string, cond: boolean, extra = '') {
  if (cond) { budgetPassed++; console.log(`[PASS] [ModelCache-Budget] ${name}`); }
  else { console.log(`[FAIL] [ModelCache-Budget] ${name} ${extra}`); process.exitCode = 1; }
}

const BUDGET = 1000;
const files = (sizes: number[], base = 1000) => sizes.map((size, i) => ({ name: `f${i}`, size, mtimeMs: base + i }));

bcheck('well under budget -> no eviction', planEviction(files([10, 10, 10]), 10, BUDGET).evict.length === 0);
bcheck('exactly at budget -> no eviction', planEviction(files([10, 10]), 10, BUDGET).evict.length === 0);

{
  // 400+300+200 = 900; +100 lands exactly on the 1000 budget, so nothing to drop.
  const plan = planEviction(files([400, 300, 200]), 100, BUDGET);
  bcheck('a write that lands exactly on the budget causes no eviction', plan.evict.length === 0, plan.evict.join(','));
  const plan2 = planEviction(files([400, 300, 200]), 600, BUDGET);
  bcheck('over budget evicts oldest first', plan2.evict.join(',') === 'f0,f1', plan2.evict.join(','));
  bcheck('projected total lands within budget', plan2.projectedTotal <= BUDGET, String(plan2.projectedTotal));
  bcheck('never evicts more than needed', plan2.evict.length === 2, `evicted ${plan2.evict.length}`);
}
{
  // Newest-first order must NOT be chosen: a full disk should drop the coldest data.
  const plan = planEviction(files([100, 100, 100, 100, 100]), 800, BUDGET);
  bcheck('eviction is least-recently-modified first', plan.evict.join(',') === 'f0,f1,f2', plan.evict.join(','));
}
{
  // Re-caching an already-cached model must not double count its own bytes.
  const entries = files([500, 400]);
  const plan = planEviction(entries, 500, BUDGET, 'f0');
  bcheck('replacing a cached file does not count its old size', plan.projectedTotal === 900, String(plan.projectedTotal));
  bcheck('replacing a file never evicts that same file', !plan.evict.includes('f0'), plan.evict.join(','));
}
{
  const plan = planEviction(files([100]), 2000, BUDGET);
  bcheck('a single file larger than the whole budget is impossible', plan.impossible === true);
}
{
  const plan = planEviction(files([100]), 2000, BUDGET, 'f0');
  bcheck('impossible stays impossible when replacing the only file', plan.impossible === true, plan.evict.join(','));
}
bcheck('empty cache + oversized write is impossible', planEviction([], 5000, BUDGET).impossible === true);
bcheck('real default budget is a sane ceiling', MAX_MODEL_CACHE_TOTAL_BYTES === 1024 * 1024 * 1024);
{
  // Ties on mtime must be broken deterministically, not by readdir order.
  const tied = [{ name: 'b', size: 500, mtimeMs: 5 }, { name: 'a', size: 500, mtimeMs: 5 }];
  const p1 = planEviction(tied, 600, BUDGET);
  const p2 = planEviction([...tied].reverse(), 600, BUDGET);
  bcheck('mtime ties are broken deterministically', p1.evict.join(',') === p2.evict.join(','), `${p1.evict} vs ${p2.evict}`);
}
bcheck('negative/NaN sizes cannot produce a negative projection',
  planEviction([{ name: 'x', size: NaN, mtimeMs: 1 }], 10, BUDGET).projectedTotal >= 0);

// The filesystem layer, against a real directory. The pure policy above cannot
// catch a broken scan, a bad unlink, or the .tmp skip.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novacache-'));
  const write = (name: string, size: number, mtimeMs: number) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, Buffer.alloc(size, 1));
    fs.utimesSync(f, mtimeMs / 1000, mtimeMs / 1000);
    return f;
  };
  const names = () => fs.readdirSync(dir).sort();
  const sizeOf = (n: string) => fs.statSync(path.join(dir, n)).size;

  try {
    const a = write('old.bin', 600, 1000);
    const b = write('new.bin', 300, 9000);
    // A crashed write: ancient .tmp, must be reclaimed.
    const crashed = path.join(dir, 'crashed.tmp');
    fs.writeFileSync(crashed, Buffer.alloc(999));
    const ancient = Date.now() - 10 * 60 * 60 * 1000;
    fs.utimesSync(crashed, ancient / 1000, ancient / 1000);
    // An in-flight write: fresh .tmp, must be left alone.
    const inflight = path.join(dir, 'inflight.bin.123.tmp');
    fs.writeFileSync(inflight, Buffer.alloc(999));

    // 600 + 300 = 900; a 400-byte write needs 1300, so the 600-byte file must go.
    const ok = await enforceModelCacheBudget(dir, 400, path.join(dir, 'incoming.bin'), 1000);
    bcheck('fs: write is allowed after making room', ok === true);
    bcheck('fs: the oldest file was actually deleted', !fs.existsSync(a));
    bcheck('fs: the newer file was kept', fs.existsSync(b));
    bcheck('fs: a crashed .tmp is reclaimed', !fs.existsSync(crashed), names().join(','));
    bcheck('fs: an in-flight .tmp is NOT deleted', fs.existsSync(inflight), names().join(','));
    bcheck('fs: neither .tmp counts toward the budget', sizeOf('new.bin') + 400 <= 1000);
    bcheck('fs: remaining total is within budget', sizeOf('new.bin') + 400 <= 1000);

    // Re-caching new.bin must not evict new.bin itself.
    const ok2 = await enforceModelCacheBudget(dir, 250, b, 1000);
    bcheck('fs: re-caching a file does not evict that file', ok2 === true && fs.existsSync(b));

    // A file bigger than the entire budget is refused rather than thrashing.
    const ok3 = await enforceModelCacheBudget(dir, 5000, path.join(dir, 'huge.bin'), 1000);
    bcheck('fs: a file larger than the whole budget is refused', ok3 === false);
    bcheck('fs: refusing does not delete the existing cache', fs.existsSync(b), names().join(','));

    // A missing directory is not an error: nothing is cached yet.
    const ok4 = await enforceModelCacheBudget(path.join(dir, 'nope'), 10, path.join(dir, 'x.bin'), 1000);
    bcheck('fs: a missing cache directory is not a failure', ok4 === true);

    // Evicting everything still must not fail when the incoming file fits alone.
    const ok5 = await enforceModelCacheBudget(dir, 900, path.join(dir, 'solo.bin'), 1000);
    bcheck('fs: frees the whole cache when that is what it takes', ok5 === true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

  console.log(`\n${budgetPassed} model-cache-budget checks passed\n`);
})();
