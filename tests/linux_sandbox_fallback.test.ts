import assert from 'node:assert/strict';
import { decideLinuxSandbox, isUsableSetuidHelper, setuidHelperPath } from '../electron/main/linuxSandbox';

/**
 * When the kernel disables unprivileged user namespaces, Chromium can still
 * sandbox renderers through its setuid helper (chrome-sandbox, root-owned,
 * mode 4755), which .deb installs ship. main.ts used to switch the sandbox off
 * for every such system. Prevents: running all web pages unsandboxed on a
 * machine where the setuid sandbox was available.
 */

console.log('\n--- Linux sandbox fallback ---');

const helper = (over: Partial<{ uid: number; mode: number; isFile: boolean }> = {}) => ({ uid: 0, mode: 0o104755, isFile: true, ...over });

// Helper validation mirrors Chromium's own check: root-owned, setuid, executable file.
assert.equal(isUsableSetuidHelper(helper()), true, 'root-owned 4755 file is usable');
assert.equal(isUsableSetuidHelper(helper({ mode: 0o100755 })), false, 'no setuid bit');
assert.equal(isUsableSetuidHelper(helper({ uid: 1000 })), false, 'not owned by root (AppImage mounts, npm installs)');
assert.equal(isUsableSetuidHelper(helper({ mode: 0o104644 })), false, 'setuid but not executable');
// The helper runs as the invoking user, not its owner: Chromium requires the
// "others" execute bit. Trusting owner-execute alone (4744) would keep the
// sandbox switch on where Chromium then refuses to start.
assert.equal(isUsableSetuidHelper(helper({ mode: 0o104744 })), false, 'only root can execute it');
assert.equal(isUsableSetuidHelper(helper({ isFile: false })), false, 'not a regular file');
assert.equal(isUsableSetuidHelper(null), false, 'missing helper');

// Root: Chromium refuses to start sandboxed as root, so the switch stays.
assert.deepEqual(
  decideLinuxSandbox({ isRoot: true, usernsCloneSetting: '1', setuidHelper: helper() }),
  { disableSandbox: true, reason: 'root' },
);

// User namespaces available (or the Debian-only sysctl absent): sandbox on.
assert.deepEqual(decideLinuxSandbox({ isRoot: false, usernsCloneSetting: '1', setuidHelper: null }), { disableSandbox: false, reason: 'namespaces' });
assert.deepEqual(decideLinuxSandbox({ isRoot: false, usernsCloneSetting: null, setuidHelper: null }), { disableSandbox: false, reason: 'namespaces' });

// Namespaces disabled: keep the sandbox when the setuid helper is usable...
assert.deepEqual(
  decideLinuxSandbox({ isRoot: false, usernsCloneSetting: '0', setuidHelper: helper() }),
  { disableSandbox: false, reason: 'setuid-helper' },
);
// ...and only fall back when it is not.
assert.deepEqual(
  decideLinuxSandbox({ isRoot: false, usernsCloneSetting: '0', setuidHelper: helper({ uid: 1000 }) }),
  { disableSandbox: true, reason: 'no-namespaces-no-helper' },
);
assert.deepEqual(
  decideLinuxSandbox({ isRoot: false, usernsCloneSetting: '0', setuidHelper: null }),
  { disableSandbox: true, reason: 'no-namespaces-no-helper' },
);
// Whitespace from /proc is tolerated.
assert.equal(decideLinuxSandbox({ isRoot: false, usernsCloneSetting: '0\n', setuidHelper: null }).disableSandbox, true);

// The helper path is the one Chromium itself uses, including its override.
assert.equal(setuidHelperPath('/opt/King Browser/king-browser', {}), '/opt/King Browser/chrome-sandbox');
assert.equal(setuidHelperPath('/opt/King Browser/king-browser', { CHROME_DEVEL_SANDBOX: '/usr/local/sbin/chrome-devel-sandbox' }), '/usr/local/sbin/chrome-devel-sandbox');

console.log('[PASS] Linux sandbox is only disabled as root, or without namespaces AND without a usable setuid helper');
