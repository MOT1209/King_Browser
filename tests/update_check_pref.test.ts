import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createUpdateCheckPrefStore, sanitizeAutoUpdateCheck } from '../electron/main/updateCheckPref';

console.log('\n--- Update Check Preference Test Suite ---');

{
  assert.equal(sanitizeAutoUpdateCheck(false), false);
  for (const other of [true, 'false', 0, '', null, undefined, {}]) {
    assert.equal(sanitizeAutoUpdateCheck(other), true, `value ${String(other)} keeps the default (on)`);
  }
  console.log('[PASS] Update check pref — only an explicit false turns the background check off');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-upd-'));
  const file = path.join(dir, 'pref.json');
  const store = createUpdateCheckPrefStore(file);
  assert.equal(store.get(), true, 'default is on');
  assert.equal(store.set(false), false);
  assert.equal(createUpdateCheckPrefStore(file).get(), false, 'the choice survives a restart');
  assert.equal(store.set(true), true);
  assert.equal(createUpdateCheckPrefStore(file).get(), true);
  fs.writeFileSync(file, '{ not json');
  assert.equal(createUpdateCheckPrefStore(file).get(), true, 'a corrupt file yields the default');
  assert.doesNotThrow(() => createUpdateCheckPrefStore(path.join(dir, 'missing', 'p.json')).set(false));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[PASS] Update check pref — store persists, tolerates corruption and write failures');
}

{
  // Regression: the background timers must read the stored choice, otherwise the
  // toggle would be cosmetic and King would keep contacting api.github.com.
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  assert.match(main, /createUpdateCheckPrefStore\(/, 'main.ts creates the store');
  const startup = main.slice(main.indexOf('const startupTimer'), main.indexOf('const updateInterval'));
  const periodic = main.slice(main.indexOf('const updateInterval'), main.indexOf('updateInterval.unref'));
  assert.ok(periodic.length > 0 && startup.length > 0, 'both timer blocks were located');
  assert.match(startup, /updateCheckPref\.get\(\)/, 'startup check honours the preference');
  assert.match(periodic, /updateCheckPref\.get\(\)/, 'periodic check honours the preference');
  console.log('[PASS] Update check pref — startup and periodic checks are gated on the stored choice');
}
