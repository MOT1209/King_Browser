/**
 * Durable agent activity log (plan.md, Phase 1).
 *
 * The execution engine keeps its history in memory, so a restart lost the audit
 * trail. This appends every finished action as one JSON line to a file, with
 * arguments redacted before they are written, and rotates the file so it can
 * never grow without bound.
 *
 * Dependency-free apart from node:fs (no Electron imports).
 */

import * as fs from 'node:fs';
import type { ActionRecord, ActionStatus } from './executionEngine.js';
import { redactArgs } from './policyEngine.js';

const TERMINAL_STATUSES: ReadonlySet<ActionStatus> = new Set(['completed', 'failed', 'cancelled', 'rejected']);
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export interface ActivityStore {
  /** Record a finished action; non-terminal updates are ignored. Never throws. */
  append(record: ActionRecord): void;
  /** Every stored record, oldest first (current file after the rotated one). */
  readAll(): ActionRecord[];
}

function parseLines(filePath: string): ActionRecord[] {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const records: ActionRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as ActionRecord;
      if (parsed && typeof parsed.id === 'string' && typeof parsed.toolName === 'string') records.push(parsed);
    } catch {
      /* a torn last line after a crash must not hide the rest */
    }
  }
  return records;
}

export function createActivityStore(filePath: string, maxBytes: number = DEFAULT_MAX_BYTES): ActivityStore {
  const rotatedPath = `${filePath}.1`;
  return {
    append(record) {
      if (!TERMINAL_STATUSES.has(record.status)) return;
      try {
        try {
          if (fs.statSync(filePath).size >= maxBytes) fs.renameSync(filePath, rotatedPath);
        } catch {
          /* no file yet */
        }
        const safe: ActionRecord = { ...record, args: redactArgs(record.toolName, record.args ?? {}) };
        fs.appendFileSync(filePath, JSON.stringify(safe) + '\n', { encoding: 'utf8', mode: 0o600 });
      } catch {
        /* the audit file must never break the agent */
      }
    },
    readAll() {
      return [...parseLines(rotatedPath), ...parseLines(filePath)];
    }
  };
}

/** Stored records from earlier runs plus the live history, de-duplicated by id (live wins). */
export function mergeHistory(stored: readonly ActionRecord[], live: readonly ActionRecord[]): ActionRecord[] {
  const liveIds = new Set(live.map(record => record.id));
  return [...stored.filter(record => !liveIds.has(record.id)), ...live];
}
