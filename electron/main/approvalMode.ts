/**
 * Approval mode (plan.md, WP3).
 *
 *   balanced - the policy engine decides which actions need the user (default)
 *   strict   - every agent action needs the user, except a few that only read
 *              the tab list, the URL or wait
 *
 * There is deliberately no looser mode: nothing here can switch the approval
 * gate for sensitive actions off. Stored in the main process (not in the
 * synced renderer settings), so a remote device cannot change it.
 *
 * Dependency-free apart from node:fs (no Electron imports).
 */

import * as fs from 'node:fs';

export type ApprovalMode = 'balanced' | 'strict';

/** Tools that stay unprompted in strict mode: they reveal no page content and change nothing. */
export const STRICT_EXEMPT_TOOLS: ReadonlySet<string> = new Set([
  'king_browser_info',
  'browser_status',
  'browser_list_tabs',
  'browser_get_url',
  'browser_wait'
]);

export function sanitizeApprovalMode(value: unknown): ApprovalMode {
  return value === 'strict' ? 'strict' : 'balanced';
}

/** Whether strict mode turns an otherwise unprompted action into one that asks. */
export function strictModeRequiresApproval(mode: ApprovalMode, toolName: string): boolean {
  return mode === 'strict' && !STRICT_EXEMPT_TOOLS.has(toolName);
}

export interface ApprovalModeStore {
  get(): ApprovalMode;
  set(value: unknown): ApprovalMode;
}

export function createApprovalModeStore(filePath: string): ApprovalModeStore {
  let cache: ApprovalMode | null = null;
  return {
    get() {
      if (cache === null) {
        try {
          cache = sanitizeApprovalMode((JSON.parse(fs.readFileSync(filePath, 'utf8')) as { mode?: unknown }).mode);
        } catch {
          cache = 'balanced';
        }
      }
      return cache;
    },
    set(value) {
      cache = sanitizeApprovalMode(value);
      try {
        fs.writeFileSync(filePath, JSON.stringify({ mode: cache }), { encoding: 'utf8', mode: 0o600 });
      } catch {
        /* the in-memory choice still applies for this run */
      }
      return cache;
    }
  };
}
