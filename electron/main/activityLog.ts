/**
 * Exportable agent activity log (plan.md, Phase 1).
 *
 * Turns the execution engine's action history into a JSON or CSV document:
 * every command, whether it ran / was rejected / failed, and why. Arguments
 * are redacted again here (§13) so an export can never leak a typed secret even
 * if a record was stored unredacted.
 *
 * Dependency-free (no Electron imports).
 */

import type { ActionRecord } from './executionEngine.js';
import { redactArgs } from './policyEngine.js';

export type ActivityLogFormat = 'json' | 'csv';

export interface ActivityLogEntry {
  id: string;
  tool: string;
  domain: string;
  risk: ActionRecord['risk'];
  status: ActionRecord['status'];
  summary: string;
  args: Record<string, unknown>;
  requestedAt: string;
  durationMs: number | null;
  reason: string;
}

const CSV_COLUMNS: Array<keyof ActivityLogEntry> = [
  'requestedAt', 'tool', 'domain', 'risk', 'status', 'durationMs', 'reason', 'summary', 'args', 'id'
];

function toIso(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function reasonFor(record: ActionRecord): string {
  if (record.error) return record.error;
  if (record.stoppedBy) return `stopped by ${record.stoppedBy}`;
  if (record.status === 'rejected') return 'rejected by the user or the policy';
  return '';
}

export function buildActivityLog(history: readonly ActionRecord[]): ActivityLogEntry[] {
  return history.map(record => ({
    id: record.id,
    tool: record.toolName,
    domain: record.domain ?? '',
    risk: record.risk,
    status: record.status,
    summary: record.summary ?? '',
    args: redactArgs(record.toolName, record.args ?? {}),
    requestedAt: toIso(record.requestedAt),
    durationMs:
      record.startedAt !== undefined && record.endedAt !== undefined
        ? Math.max(0, record.endedAt - record.startedAt)
        : null,
    reason: reasonFor(record)
  }));
}

/**
 * RFC 4180 quoting, plus a leading apostrophe on cells that start with a
 * spreadsheet formula character: page-controlled text (summaries, errors)
 * must not run as a formula when the CSV is opened in Excel.
 */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportActivityLog(history: readonly ActionRecord[], format: ActivityLogFormat = 'json'): string {
  const entries = buildActivityLog(history);
  if (format === 'csv') {
    const rows = entries.map(entry => CSV_COLUMNS.map(column => csvCell(entry[column])).join(','));
    return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: entries.length, entries }, null, 2);
}
