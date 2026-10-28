/**
 * Which tab the agent is working in, so the tab strip and the page frame can
 * mark it. The human must always be able to see where the agent acts.
 *
 * The MCP bridge reports the tab of every action it executes; the agent
 * control panel reports the engine state. A tab is marked only while the
 * engine is in an active state (see `agentTabToMark`), so a stopped or idle
 * agent leaves no stale marker behind.
 */
import { useSyncExternalStore } from 'react';

export const ACTIVE_ENGINE_STATES: ReadonlySet<string> = new Set([
  'running',
  'paused',
  'awaiting_approval',
  'stopping',
]);

/** The tab to mark, or null when nothing should be marked. */
export function agentTabToMark(
  lastTabId: string | null,
  engineState: string | null,
  openTabIds: readonly string[]
): string | null {
  if (!lastTabId || !engineState || !ACTIVE_ENGINE_STATES.has(engineState)) return null;
  return openTabIds.includes(lastTabId) ? lastTabId : null;
}

interface AgentTabSnapshot {
  tabId: string | null;
  engineState: string | null;
  /** The human has taken the browser; the marker turns from the agent's color to the human's. */
  takenOver: boolean;
}

let snapshot: AgentTabSnapshot = { tabId: null, engineState: null, takenOver: false };
const listeners = new Set<() => void>();

function update(next: Partial<AgentTabSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.tabId === snapshot.tabId && merged.engineState === snapshot.engineState && merged.takenOver === snapshot.takenOver) return;
  snapshot = merged;
  listeners.forEach(listener => listener());
}

export function markAgentTab(tabId: string | null | undefined): void {
  if (typeof tabId === 'string' && tabId) update({ tabId });
}

export function setAgentEngineState(engineState: string | null, takenOver = false): void {
  update({ engineState, takenOver });
}

export function getAgentTabSnapshot(): AgentTabSnapshot {
  return snapshot;
}

export function subscribeAgentTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The id of the tab the agent is working in right now, or null. */
export function useAgentTabId(openTabIds: readonly string[]): string | null {
  const current = useSyncExternalStore(subscribeAgentTab, getAgentTabSnapshot, getAgentTabSnapshot);
  return agentTabToMark(current.tabId, current.engineState, openTabIds);
}

/** True while the human drives the browser (the agent is paused and waits). */
export function useAgentTakenOver(): boolean {
  return useSyncExternalStore(subscribeAgentTab, () => getAgentTabSnapshot().takenOver, () => getAgentTabSnapshot().takenOver);
}

/** Test-only: reset module state between cases. */
export function resetAgentTabStoreForTests(): void {
  snapshot = { tabId: null, engineState: null, takenOver: false };
  listeners.clear();
}
