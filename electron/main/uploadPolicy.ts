/**
 * Which local files the agent may attach to a page's `<input type=file>`
 * (plan.md, WP10 phase 2).
 *
 * Attaching a file hands its contents to a website, so the path is canonicalized
 * (symlinks resolved) and checked before anything is read: it must be an
 * absolute path to a regular file of bounded size, outside the app's own data
 * folder and outside folders and file names that hold credentials. Failing any
 * check refuses the upload; nothing falls back to a less checked path. The human
 * still approves every call (policyEngine.ts); this module only removes the
 * files that no approval should be asked about.
 *
 * Dependency-free (no Electron imports); the file system is injected for tests.
 */

import * as nodePath from 'path';

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_PATH_LENGTH = 1024;

export interface UploadFs {
  realpath(p: string): string;
  stat(p: string): { isFile(): boolean; size: number };
}

export interface UploadContext {
  fs: UploadFs;
  platform: NodeJS.Platform;
  /** The app's userData folder (secure store, cookies, tokens). */
  userDataDir: string;
  homeDir: string;
}

export type UploadVerdict = { ok: true; path: string } | { ok: false; error: string };

/** Folders directly under the home folder that hold keys or credentials. */
const SECRET_HOME_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config/gcloud', '.npmrc', '.netrc'];
const SECRET_FILE_NAME = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|key|p12|pfx|kdbx|keystore)|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$/i;

function inside(parent: string, child: string, p: typeof nodePath.posix, caseInsensitive: boolean): boolean {
  const a = caseInsensitive ? parent.toLowerCase() : parent;
  const b = caseInsensitive ? child.toLowerCase() : child;
  const rel = p.relative(a, b);
  return rel === '' || (!rel.startsWith('..') && !p.isAbsolute(rel));
}

export function validateUploadPath(raw: unknown, ctx: UploadContext): UploadVerdict {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Missing or invalid "path" parameter.' };
  if (raw.length > MAX_PATH_LENGTH || raw.includes('\0')) return { ok: false, error: 'The path is invalid.' };
  const p = ctx.platform === 'win32' ? nodePath.win32 : nodePath.posix;
  if (!p.isAbsolute(raw)) return { ok: false, error: 'The path must be absolute.' };
  if (ctx.platform === 'win32' && /^\\\\/.test(raw)) return { ok: false, error: 'Network paths are not allowed.' };

  let real: string;
  try {
    real = ctx.fs.realpath(raw);
  } catch (_) {
    return { ok: false, error: 'The file does not exist or cannot be read.' };
  }
  const ci = ctx.platform === 'win32' || ctx.platform === 'darwin';
  const stat = (() => { try { return ctx.fs.stat(real); } catch (_) { return null; } })();
  if (!stat || !stat.isFile()) return { ok: false, error: 'The path is not a regular file.' };
  if (stat.size > MAX_UPLOAD_BYTES) return { ok: false, error: `The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` };

  if (ctx.userDataDir && inside(ctx.userDataDir, real, p, ci)) {
    return { ok: false, error: "Files in King Browser's own data folder cannot be uploaded." };
  }
  for (const rel of SECRET_HOME_DIRS) {
    if (ctx.homeDir && inside(p.join(ctx.homeDir, rel), real, p, ci)) {
      return { ok: false, error: 'Files in credential folders cannot be uploaded.' };
    }
  }
  if (SECRET_FILE_NAME.test(p.basename(real))) {
    return { ok: false, error: 'Files that look like keys or credentials cannot be uploaded.' };
  }
  return { ok: true, path: real };
}
