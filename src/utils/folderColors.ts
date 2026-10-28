/**
 * Tab folder colors.
 *
 * A folder stores a palette KEY, never a CSS color. Folder rows travel through
 * sync and backup import, so whatever arrives is mapped back to a known key or
 * ignored; the key selects literal Tailwind classes below. Older folders have
 * no color and render as before.
 */
import type { Folder } from '../types/browser';

export const FOLDER_COLOR_KEYS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
export type FolderColorKey = (typeof FOLDER_COLOR_KEYS)[number];

/** Literal class names (Tailwind only generates classes it can see in the source). */
export const FOLDER_COLOR_CLASSES: Record<FolderColorKey, { dot: string; icon: string; border: string }> = {
  red: { dot: 'bg-red-500', icon: 'text-red-500', border: 'border-s-red-500' },
  orange: { dot: 'bg-orange-500', icon: 'text-orange-500', border: 'border-s-orange-500' },
  amber: { dot: 'bg-amber-500', icon: 'text-amber-500', border: 'border-s-amber-500' },
  green: { dot: 'bg-emerald-500', icon: 'text-emerald-500', border: 'border-s-emerald-500' },
  teal: { dot: 'bg-teal-500', icon: 'text-teal-500', border: 'border-s-teal-500' },
  blue: { dot: 'bg-blue-500', icon: 'text-blue-500', border: 'border-s-blue-500' },
  violet: { dot: 'bg-violet-500', icon: 'text-violet-500', border: 'border-s-violet-500' },
  pink: { dot: 'bg-pink-500', icon: 'text-pink-500', border: 'border-s-pink-500' },
};

export function normalizeFolderColor(value: unknown): FolderColorKey | undefined {
  return typeof value === 'string' && (FOLDER_COLOR_KEYS as readonly string[]).includes(value)
    ? (value as FolderColorKey)
    : undefined;
}

/** A new folder list with `color` set (or cleared with undefined); unknown ids and colors change nothing. */
export function setFolderColor(folders: Folder[], folderId: string, color: unknown): Folder[] {
  const target = folders.find(f => f.id === folderId);
  if (!target) return folders;
  const next = normalizeFolderColor(color);
  if (color !== undefined && next === undefined) return folders;
  if (target.color === next) return folders;
  return folders.map(f => {
    if (f !== target) return f;
    const { color: _previous, ...rest } = f;
    return next ? { ...rest, color: next } : rest;
  });
}
