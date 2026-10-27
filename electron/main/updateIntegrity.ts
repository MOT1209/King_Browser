/**
 * King Browser - what "the update was integrity-checked" means.
 *
 * electron-updater downloads the installer through a digest stream and throws
 * on a mismatch, but only when the release metadata (latest*.yml) carried a
 * digest for that file: with no `sha512` or `sha2` it downloads without any
 * check and still emits `update-downloaded`. The UI used to be told
 * `integrityVerified: true` for every download, so a release without a digest
 * looked exactly like a checked one and its warning could never show.
 *
 * This module decides, from the metadata electron-updater hands us, whether a
 * digest was available to check the downloaded file against. It proves the
 * download matches the release metadata, not who published the release; that
 * stays the job of code signing.
 *
 * Dependency-free (no Electron imports).
 */

export interface UpdateIntegrity {
  verified: boolean;
  algorithm: 'sha512' | 'sha256' | null;
}

interface UpdateFileLike {
  url?: unknown;
  sha512?: unknown;
  sha2?: unknown;
}

export interface UpdateInfoLike {
  files?: unknown;
  path?: unknown;
  sha512?: unknown;
  sha2?: unknown;
  downloadedFile?: unknown;
}

// electron-builder writes sha512 as base64 (88 characters, "==" padded); the
// download code also accepts the 128-character hex form.
const SHA512_BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const SHA512_HEX = /^[a-fA-F0-9]{128}$/;
const SHA256_HEX = /^[a-fA-F0-9]{64}$/;

function fileName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  const last = value.split(/[\\/]/).pop() || '';
  try {
    return decodeURIComponent(last);
  } catch (_) {
    return last;
  }
}

function digestOf(entry: UpdateFileLike): UpdateIntegrity['algorithm'] {
  if (typeof entry.sha512 === 'string' && (SHA512_BASE64.test(entry.sha512) || SHA512_HEX.test(entry.sha512))) {
    return 'sha512';
  }
  if (typeof entry.sha2 === 'string' && SHA256_HEX.test(entry.sha2)) return 'sha256';
  return null;
}

/**
 * True when every file the download could have been matched to carries a
 * well-formed digest. The entry for the downloaded file is used when it can be
 * identified by name; otherwise all entries must carry one, so a release that
 * mixes checked and unchecked files is reported as unverified.
 */
export function assessUpdateIntegrity(info: UpdateInfoLike | null | undefined): UpdateIntegrity {
  const unverified: UpdateIntegrity = { verified: false, algorithm: null };
  if (!info || typeof info !== 'object') return unverified;

  let entries: UpdateFileLike[] = [];
  if (Array.isArray(info.files)) {
    entries = (info.files as unknown[]).filter((f): f is UpdateFileLike => typeof f === 'object' && f !== null);
  }
  // Metadata written by older electron-builder versions has no `files` list.
  if (entries.length === 0) entries = [{ url: info.path, sha512: info.sha512, sha2: info.sha2 }];

  const downloaded = fileName(info.downloadedFile);
  const matched = downloaded ? entries.filter((e) => fileName(e.url) === downloaded) : [];
  const candidates = matched.length > 0 ? matched : entries;

  const algorithms = candidates.map(digestOf);
  if (algorithms.length === 0 || algorithms.some((a) => a === null)) return unverified;
  return { verified: true, algorithm: algorithms.every((a) => a === 'sha512') ? 'sha512' : 'sha256' };
}
