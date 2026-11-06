import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decideSecondInstance } from '../electron/main/secondInstance';

/**
 * Prevents: launching King Browser from the Start menu or a shortcut doing
 * nothing. The single-instance lock makes every new launch quit and hand over
 * to the running process. When that process had no window left (closed but
 * still alive), the handler only focused an existing window, so the launch was
 * silently swallowed and the app "could not be opened" until the stray process
 * was killed.
 * Also prevents: development runs (electron.exe, whose icon is the Electron
 * atom) registering the installed app's Windows AppUserModelID, which made
 * Windows show the atom for the installed app's taskbar entry.
 */

console.log('\n--- Second launch and Windows app identity ---');

const base = { hasLiveWindow: true, isMinimized: false, appReady: true, quitting: false };

assert.equal(decideSecondInstance(base), 'focus', 'a visible window is focused');
assert.equal(decideSecondInstance({ ...base, isMinimized: true }), 'restore-focus', 'a minimized window is restored, then focused');
assert.equal(
  decideSecondInstance({ ...base, hasLiveWindow: false }),
  'create',
  'no window left: a second launch must open a new one instead of doing nothing'
);
assert.equal(
  decideSecondInstance({ ...base, hasLiveWindow: false, appReady: false }),
  'ignore',
  'before ready the startup path creates the window itself'
);
assert.equal(
  decideSecondInstance({ ...base, hasLiveWindow: false, quitting: true }),
  'ignore',
  'a window is never resurrected while the app is quitting'
);
console.log('[PASS] [Second-Instance] a launch with no window left opens a new one');

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
const handlerStart = main.indexOf("app.on('second-instance'");
assert.ok(handlerStart > 0, 'second-instance handler exists');
const handler = main.slice(handlerStart, main.indexOf('\n});', handlerStart));
assert.match(handler, /decideSecondInstance\(/, 'the handler uses the tested decision');
assert.match(handler, /createWindow\(\)/, 'the handler can create a window');
console.log('[PASS] [Second-Instance] main.ts routes second launches through the decision');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appId: string = pkg.build.appId;
const aumid = /app\.setAppUserModelId\(\s*app\.isPackaged\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\s*\)/.exec(main);
assert.ok(aumid, 'setAppUserModelId distinguishes packaged and development runs');
assert.equal(aumid[1], appId, 'the packaged AppUserModelID matches build.appId, which the installer shortcuts carry');
assert.notEqual(aumid[2], appId, 'development runs use their own AppUserModelID');
assert.equal((main.match(/setAppUserModelId\(/g) || []).length, 1, 'there is exactly one setAppUserModelId call');
console.log('[PASS] [Windows-Identity] development runs no longer claim the installed app identity');
