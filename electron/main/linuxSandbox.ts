import * as fs from 'fs';
import * as path from 'path';

/**
 * Whether King must switch the Chromium sandbox off on Linux.
 *
 * Chromium sandboxes renderers with unprivileged user namespaces and, when the
 * kernel disables those, with its setuid helper (`chrome-sandbox` next to the
 * executable, owned by root, mode 4755). A .deb install ships that helper; an
 * AppImage or an npm checkout cannot (a squashfs mount or a user-owned file
 * cannot carry a root setuid bit). If neither works, Chromium refuses to start,
 * which is why main.ts falls back to --no-sandbox with a warning.
 *
 * That fallback used to fire for every system with
 * `kernel.unprivileged_userns_clone = 0`, even where the setuid helper would
 * have kept every web page sandboxed. Here it fires only when it must:
 *   - running as root (Chromium will not start sandboxed as root), or
 *   - namespaces disabled AND no usable setuid helper.
 *
 * Pure decision plus a thin reader, dependency-free apart from fs/path, so it
 * is unit-tested in plain Node (tests/linux_sandbox_fallback.test.ts).
 */

export interface SetuidHelperStat {
  uid: number;
  mode: number;
  isFile: boolean;
}

export interface LinuxSandboxInput {
  isRoot: boolean;
  /** Contents of /proc/sys/kernel/unprivileged_userns_clone, or null when the sysctl does not exist. */
  usernsCloneSetting: string | null;
  setuidHelper: SetuidHelperStat | null;
}

export type LinuxSandboxReason = 'root' | 'namespaces' | 'setuid-helper' | 'no-namespaces-no-helper';

export interface LinuxSandboxDecision {
  disableSandbox: boolean;
  reason: LinuxSandboxReason;
}

const SETUID_BIT = 0o4000;
const OWNER_EXECUTE = 0o100;

/** The same conditions Chromium checks before it uses the helper. */
export function isUsableSetuidHelper(stat: SetuidHelperStat | null): boolean {
  if (!stat || !stat.isFile) return false;
  return stat.uid === 0 && (stat.mode & SETUID_BIT) !== 0 && (stat.mode & OWNER_EXECUTE) !== 0;
}

export function decideLinuxSandbox(input: LinuxSandboxInput): LinuxSandboxDecision {
  if (input.isRoot) return { disableSandbox: true, reason: 'root' };
  if (input.usernsCloneSetting === null || input.usernsCloneSetting.trim() !== '0') {
    return { disableSandbox: false, reason: 'namespaces' };
  }
  if (isUsableSetuidHelper(input.setuidHelper)) return { disableSandbox: false, reason: 'setuid-helper' };
  return { disableSandbox: true, reason: 'no-namespaces-no-helper' };
}

const USERNS_CLONE_SYSCTL = '/proc/sys/kernel/unprivileged_userns_clone';

/** Reads the real system state; any read error counts as "not available". */
export function readLinuxSandboxInput(execPath: string): LinuxSandboxInput {
  let usernsCloneSetting: string | null = null;
  try {
    usernsCloneSetting = fs.readFileSync(USERNS_CLONE_SYSCTL, 'utf-8');
  } catch {
    usernsCloneSetting = null;
  }
  let setuidHelper: SetuidHelperStat | null = null;
  try {
    const stat = fs.statSync(path.join(path.dirname(execPath), 'chrome-sandbox'));
    setuidHelper = { uid: stat.uid, mode: stat.mode, isFile: stat.isFile() };
  } catch {
    setuidHelper = null;
  }
  return {
    isRoot: typeof process.getuid === 'function' && process.getuid() === 0,
    usernsCloneSetting,
    setuidHelper,
  };
}
