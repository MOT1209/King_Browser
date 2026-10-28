/**
 * The "recently closed tabs" list, kept across restarts.
 *
 * The in-memory stack used to vanish when King closed, so Ctrl+Shift+T only
 * worked within one session. It is now saved in localStorage, which means it is
 * wiped by "clear on exit" along with the rest of the app's stored data.
 *
 * What is written is deliberately small: address, title, icon, pin, workspace
 * and folder. Never a page screenshot, never a private tab, never a tab the
 * agent opened (its own profile), never a blank page or a non-web address.
 * Everything read back is validated, because storage is not trusted input.
 *
 * Pure helpers are exported for unit tests; the store below is the single
 * source of truth for the hook and the tab context menu.
 */
import { useSyncExternalStore } from 'react';
import type { Tab } from '../types/browser';

export const CLOSED_TABS_STORAGE_KEY = 'king_closed_tabs';
export const MAX_CLOSED_TABS = 50;
export const RECENT_LIMIT = 10;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 300;
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

function isRestorableUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url || url.length > MAX_URL_LENGTH) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

function clean(tab: Partial<Tab> & { id: string; url: string }): Tab {
  const result: Tab = {
    id: tab.id,
    url: tab.url,
    title: typeof tab.title === 'string' ? tab.title.slice(0, MAX_TITLE_LENGTH) : '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };
  if (typeof tab.favicon === 'string' && isRestorableUrl(tab.favicon)) result.favicon = tab.favicon;
  if (tab.isPinned === true) result.isPinned = true;
  if (typeof tab.workspaceId === 'string') result.workspaceId = tab.workspaceId.slice(0, 100);
  if (typeof tab.folderId === 'string') result.folderId = tab.folderId.slice(0, 100);
  return result;
}

/** The persisted projection of a tab, or null when it must never be written to disk. */
function persistable(tab: Tab): Tab | null {
  if (!tab || tab.isIncognito || tab.isAgentOwned || tab.agentPersistent) return null;
  if (typeof tab.id !== 'string' || !isRestorableUrl(tab.url)) return null;
  return clean(tab);
}

export function serializeClosedTabs(stack: readonly Tab[]): string {
  const kept: Tab[] = [];
  for (const tab of stack) {
    const projected = persistable(tab);
    if (projected) kept.push(projected);
  }
  return JSON.stringify(kept.slice(-MAX_CLOSED_TABS));
}

export function parseStoredClosedTabs(raw: string | null): Tab[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const tabs: Tab[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 100) continue;
    if (candidate.isIncognito === true || candidate.isAgentOwned === true || candidate.agentPersistent === true) continue;
    if (!isRestorableUrl(candidate.url)) continue;
    tabs.push(clean(candidate as unknown as Tab));
  }
  return tabs.slice(-MAX_CLOSED_TABS);
}

export interface RecentlyClosedEntry {
  /** Position from the most recent (0 = last closed), the argument to reopen it. */
  index: number;
  title: string;
  url: string;
  favicon?: string;
}

/** The menu view: newest first, bounded, untitled tabs shown by address. */
export function recentlyClosedView(stack: readonly Tab[], limit = RECENT_LIMIT): RecentlyClosedEntry[] {
  const view: RecentlyClosedEntry[] = [];
  for (let i = stack.length - 1; i >= 0 && view.length < limit; i--) {
    const tab = stack[i];
    view.push({ index: stack.length - 1 - i, title: tab.title || tab.url, url: tab.url, favicon: tab.favicon });
  }
  return view;
}

/** Removes the entry `indexFromEnd` positions before the end (0 = most recent). */
export function removeFromEnd(stack: readonly Tab[], indexFromEnd: number): { stack: Tab[]; tab: Tab | null } {
  if (!Number.isInteger(indexFromEnd) || indexFromEnd < 0 || indexFromEnd >= stack.length) {
    return { stack: [...stack], tab: null };
  }
  const position = stack.length - 1 - indexFromEnd;
  const next = [...stack.slice(0, position), ...stack.slice(position + 1)];
  return { stack: next, tab: stack[position] };
}

// ------------------------------------------------------------------ store

function readStorage(): Tab[] {
  try {
    return typeof localStorage === 'undefined' ? [] : parseStoredClosedTabs(localStorage.getItem(CLOSED_TABS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStorage(stack: readonly Tab[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const json = serializeClosedTabs(stack);
    if (json === '[]') localStorage.removeItem(CLOSED_TABS_STORAGE_KEY);
    else localStorage.setItem(CLOSED_TABS_STORAGE_KEY, json);
  } catch {
    // Storage unavailable or full: the list simply lasts for this session.
  }
}

let stack: Tab[] = readStorage();
const listeners = new Set<() => void>();

function commit(next: Tab[]): void {
  stack = next;
  writeStorage(stack);
  listeners.forEach(listener => listener());
}

export function getClosedStack(): readonly Tab[] {
  return stack;
}

export function subscribeClosedTabs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function pushClosedTabsToStore(tabs: readonly Tab[]): void {
  const visible = tabs.filter(tab => !tab.isIncognito);
  if (visible.length === 0) return;
  commit([...stack, ...visible].slice(-MAX_CLOSED_TABS));
}

/** Takes the entry `indexFromEnd` positions before the end (0 = most recent) off the list. */
export function takeClosedTab(indexFromEnd: number): Tab | null {
  const { stack: next, tab } = removeFromEnd(stack, indexFromEnd);
  if (tab) commit(next);
  return tab;
}

export function clearClosedTabsInStore(): void {
  commit([]);
}

/** Registered by the hook that knows how to recreate a tab; lets the menu reopen by position. */
let reopenHandler: ((tab: Tab) => void) | null = null;

export function setReopenHandler(handler: ((tab: Tab) => void) | null): void {
  reopenHandler = handler;
}

export function reopenClosedAt(indexFromEnd: number): boolean {
  const tab = takeClosedTab(indexFromEnd);
  if (!tab || !reopenHandler) return false;
  reopenHandler(tab);
  return true;
}

export function useClosedTabsStack(): readonly Tab[] {
  return useSyncExternalStore(subscribeClosedTabs, getClosedStack, getClosedStack);
}

export function useRecentlyClosed(): RecentlyClosedEntry[] {
  const current = useClosedTabsStack();
  return recentlyClosedView(current);
}

/** Test-only: replace the store state without touching storage. */
export function resetClosedTabsStoreForTests(next: Tab[] = []): void {
  stack = next;
  listeners.clear();
  reopenHandler = null;
}
