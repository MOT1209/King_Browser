/**
 * Plain-text release name and notes from an electron-updater UpdateInfo.
 *
 * electron-updater types releaseNotes as `string | ReleaseNoteInfo[] | null`
 * (a list when `updater.fullChangelog` is on). The renderer's update toast and
 * the download result expect a string, so a list is flattened here instead of
 * being passed through an `as any` cast.
 *
 * Dependency-free (no Electron imports).
 */

interface ReleaseNoteLike {
  version?: unknown;
  note?: unknown;
}

export interface UpdateInfoLike {
  version?: unknown;
  releaseName?: unknown;
  releaseNotes?: unknown;
}

export function releaseNotesText(notes: unknown): string {
  if (typeof notes === 'string') return notes;
  if (!Array.isArray(notes)) return '';
  return notes
    .map((entry: ReleaseNoteLike) => {
      if (!entry || typeof entry !== 'object') return '';
      const note = typeof entry.note === 'string' ? entry.note.trim() : '';
      if (!note) return '';
      const version = typeof entry.version === 'string' ? entry.version.trim() : '';
      return version ? `${version}\n${note}` : note;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function releaseNameText(info: UpdateInfoLike | null | undefined): string {
  const name = info?.releaseName;
  if (typeof name === 'string' && name.trim()) return name;
  const version = typeof info?.version === 'string' ? info.version : '';
  return `v${version}`;
}
