/**
 * Background update-check preference.
 *
 * King checks GitHub for a new release shortly after start and every four
 * hours. Code-signing programmes (SignPath Foundation) require that a transfer
 * to an outside service can be switched off, so this stores the user's choice:
 * true (default, unchanged behaviour) or false. Only the automatic background
 * check obeys it; the "Check for updates" button and menu entries always work.
 * Stored in the main process, not in the synced renderer settings.
 *
 * Dependency-free apart from node:fs (no Electron imports).
 */

import * as fs from 'node:fs';

/** Anything other than an explicit `false` keeps the default (checks on). */
export function sanitizeAutoUpdateCheck(value: unknown): boolean {
  return value !== false;
}

export interface UpdateCheckPrefStore {
  get(): boolean;
  set(value: unknown): boolean;
}

export function createUpdateCheckPrefStore(filePath: string): UpdateCheckPrefStore {
  let cache: boolean | null = null;
  return {
    get() {
      if (cache === null) {
        try {
          cache = sanitizeAutoUpdateCheck((JSON.parse(fs.readFileSync(filePath, 'utf8')) as { enabled?: unknown }).enabled);
        } catch {
          cache = true;
        }
      }
      return cache;
    },
    set(value) {
      cache = sanitizeAutoUpdateCheck(value);
      try {
        fs.writeFileSync(filePath, JSON.stringify({ enabled: cache }), { encoding: 'utf8', mode: 0o600 });
      } catch {
        /* the in-memory choice still applies for this run */
      }
      return cache;
    }
  };
}
