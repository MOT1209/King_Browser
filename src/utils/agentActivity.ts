/**
 * Pure helpers for the live agent activity strip: keep the newest records, one
 * line each. Arguments are never shown (they may hold typed secrets); only the
 * tool, the site and the outcome.
 */
import type { ElectronEngineActionRecord } from '../vite-env';

export const ACTIVITY_LIMIT = 6;

export function mergeActivity(
  list: readonly ElectronEngineActionRecord[],
  record: ElectronEngineActionRecord,
  limit: number = ACTIVITY_LIMIT
): ElectronEngineActionRecord[] {
  const next = list.filter(item => item.id !== record.id);
  next.push(record);
  next.sort((a, b) => a.requestedAt - b.requestedAt);
  return next.slice(-limit);
}

export interface ActivityLine {
  id: string;
  label: string;
  site: string;
  status: ElectronEngineActionRecord['status'];
}

export function toActivityLine(record: ElectronEngineActionRecord): ActivityLine {
  return {
    id: record.id,
    label: record.toolName.replace(/^browser_/, '').replace(/_/g, ' '),
    site: record.domain ?? '',
    status: record.status
  };
}
