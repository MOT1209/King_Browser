import assert from 'node:assert/strict';
import {
  MAX_CLOSED_TABS,
  RECENT_LIMIT,
  parseStoredClosedTabs,
  serializeClosedTabs,
  recentlyClosedView,
  removeFromEnd,
  CLOSED_TABS_STORAGE_KEY,
  pushClosedTabsToStore,
  reopenClosedAt,
  setReopenHandler,
  getClosedStack,
  clearClosedTabsInStore,
  resetClosedTabsStoreForTests,
  subscribeClosedTabs,
} from '../src/services/closedTabsStore';
import type { Tab } from '../src/types/browser';

console.log('\n--- Recently closed tabs (persisted) ---');

const tab = (over: Partial<Tab> = {}): Tab => ({
  id: 't1', url: 'https://example.com/a', title: 'Example', isLoading: false, canGoBack: false, canGoForward: false, ...over,
});

assert.equal(CLOSED_TABS_STORAGE_KEY, 'king_closed_tabs');

// What is persisted: a small, private-safe projection.
{
  const json = serializeClosedTabs([
    tab({ id: 'a', thumbnail: 'data:image/png;base64,AAAA', webContentsId: 7, splitWith: 'b', isLoading: true, zoomFactor: 1.5, favicon: 'https://example.com/f.ico', isPinned: true, workspaceId: 'w1', folderId: 'f1' }),
    tab({ id: 'p', isIncognito: true, url: 'https://private.example/' }),
    tab({ id: 'g', isAgentOwned: true, url: 'https://agent.example/' }),
    tab({ id: 'n', url: 'king://newtab' }),
    tab({ id: 'x', url: 'javascript:alert(1)' }),
    tab({ id: 'd', url: 'data:text/html,<b>x</b>' }),
  ]);
  const stored = JSON.parse(json);
  assert.deepEqual(stored.map((t: Tab) => t.id), ['a'], 'private, agent-owned, blank and unsafe tabs are never written to disk');
  assert.equal(stored[0].thumbnail, undefined, 'thumbnails (page screenshots) are not persisted');
  assert.equal(stored[0].webContentsId, undefined);
  assert.equal(stored[0].splitWith, undefined);
  assert.equal(stored[0].isPinned, true);
  assert.equal(stored[0].workspaceId, 'w1');
  assert.equal(stored[0].folderId, 'f1');
  assert.equal(stored[0].url, 'https://example.com/a');
}

// Cap.
{
  const many = Array.from({ length: MAX_CLOSED_TABS + 20 }, (_, i) => tab({ id: `t${i}`, url: `https://e.test/${i}` }));
  assert.equal(JSON.parse(serializeClosedTabs(many)).length, MAX_CLOSED_TABS);
  assert.equal(JSON.parse(serializeClosedTabs(many))[MAX_CLOSED_TABS - 1].id, `t${MAX_CLOSED_TABS + 19}`, 'the most recent are kept');
}

// Reading back: untrusted storage is validated, never trusted.
assert.deepEqual(parseStoredClosedTabs(null), []);
assert.deepEqual(parseStoredClosedTabs('not json'), [], 'corrupt storage means an empty list');
assert.deepEqual(parseStoredClosedTabs('{"a":1}'), [], 'a non-array is ignored');
{
  const restored = parseStoredClosedTabs(JSON.stringify([
    { id: 'ok', url: 'https://example.com/', title: 'Ok' },
    { id: 'evil', url: 'javascript:alert(1)', title: 'x' },
    { id: 5, url: 'https://e.test/', title: 'bad id' },
    { url: 'https://e.test/', title: 'no id' },
    { id: 'file', url: 'file:///etc/passwd', title: 'f' },
    { id: 'long', url: 'https://e.test/' + 'a'.repeat(5000), title: 't'.repeat(5000) },
    null, 'str', 7,
    { id: 'priv', url: 'https://p.test/', title: 'p', isIncognito: true },
    { id: 'agent', url: 'https://a.test/', title: 'a', isAgentOwned: true, agentPersistent: true },
  ]));
  assert.deepEqual(restored.map(t => t.id), ['ok'], 'only safe, well-formed entries come back');
  assert.equal(restored[0].isLoading, false);
  assert.equal(restored[0].canGoBack, false);
  assert.ok(restored.every(t => !t.isIncognito && !t.isAgentOwned), 'stored flags cannot smuggle a private or agent tab back');
}
{
  const [oversized] = parseStoredClosedTabs(JSON.stringify([{ id: 'x', url: 'https://e.test/ok', title: 'T'.repeat(5000) }]));
  assert.ok(oversized.title.length <= 300, 'titles are bounded');
}
assert.equal(parseStoredClosedTabs(JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, url: 'https://e.test/', title: 'x' })))).length, MAX_CLOSED_TABS, 'a bloated store is capped on load');

// The menu view: newest first, bounded, with the index to reopen.
{
  const stack = Array.from({ length: 15 }, (_, i) => tab({ id: `t${i}`, title: `Tab ${i}`, url: `https://e.test/${i}` }));
  const view = recentlyClosedView(stack);
  assert.equal(view.length, RECENT_LIMIT);
  assert.equal(view[0].title, 'Tab 14', 'the most recently closed is first');
  assert.equal(view[0].index, 0);
  assert.equal(view[RECENT_LIMIT - 1].title, 'Tab 5');
  assert.equal(recentlyClosedView([tab({ title: '', url: 'https://e.test/x' })])[0].title, 'https://e.test/x', 'an untitled tab shows its address');
  assert.deepEqual(recentlyClosedView([]), []);
}

// Reopening by position removes exactly that entry.
{
  const stack = ['a', 'b', 'c', 'd'].map(id => tab({ id }));
  const { stack: next, tab: picked } = removeFromEnd(stack, 1);
  assert.equal(picked?.id, 'c', 'index 1 from the end is the second most recent');
  assert.deepEqual(next.map(t => t.id), ['a', 'b', 'd']);
  assert.equal(removeFromEnd(stack, 0).tab?.id, 'd');
  assert.equal(removeFromEnd(stack, 9).tab, null, 'an index past the list picks nothing');
  assert.equal(removeFromEnd(stack, -1).tab, null);
  assert.equal(removeFromEnd(stack, 1.5).tab, null);
  assert.deepEqual(removeFromEnd(stack, 9).stack, stack, 'and changes nothing');
}

// The store: writes through to storage, reopens by position, notifies, and clears.
{
  // Suites share one process: put back whatever localStorage was there, never delete it.
  const hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previousStorage = (globalThis as any).localStorage;
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  resetClosedTabsStoreForTests([]);
  let notifications = 0;
  subscribeClosedTabs(() => { notifications++; });
  const reopened: string[] = [];
  setReopenHandler(t => reopened.push(t.id));

  pushClosedTabsToStore([tab({ id: 'a', url: 'https://e.test/a' }), tab({ id: 'b', url: 'https://e.test/b' }), tab({ id: 'p', isIncognito: true, url: 'https://p.test/' })]);
  assert.deepEqual(getClosedStack().map(t => t.id), ['a', 'b'], 'private tabs never enter the list');
  assert.deepEqual(JSON.parse(data.get(CLOSED_TABS_STORAGE_KEY)!).map((t: Tab) => t.id), ['a', 'b'], 'the list is written through to storage');
  assert.equal(notifications, 1);

  pushClosedTabsToStore([tab({ id: 'g', isAgentOwned: true, url: 'https://agent.test/' })]);
  assert.deepEqual(getClosedStack().map(t => t.id), ['a', 'b', 'g'], 'an agent tab can still be reopened in this session');
  assert.deepEqual(JSON.parse(data.get(CLOSED_TABS_STORAGE_KEY)!).map((t: Tab) => t.id), ['a', 'b'], 'but is never written to disk');

  assert.equal(reopenClosedAt(1), true, 'reopening by position works');
  assert.deepEqual(reopened, ['b']);
  assert.deepEqual(getClosedStack().map(t => t.id), ['a', 'g']);
  assert.equal(reopenClosedAt(0), true);
  assert.deepEqual(reopened, ['b', 'g'], 'index 0 is the most recently closed');
  assert.equal(reopenClosedAt(5), false, 'an unknown position reopens nothing');
  assert.deepEqual(reopened, ['b', 'g']);

  setReopenHandler(null);
  assert.equal(reopenClosedAt(0), false, 'without a handler nothing is reopened');

  clearClosedTabsInStore();
  assert.equal(data.has(CLOSED_TABS_STORAGE_KEY), false, 'clearing removes the stored list');
  assert.deepEqual(getClosedStack(), []);

  // A storage that throws must never break closing a tab.
  (globalThis as any).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => pushClosedTabsToStore([tab({ id: 'z', url: 'https://e.test/z' })]));
  assert.deepEqual(getClosedStack().map(t => t.id), ['z'], 'the list still works in memory');
  if (hadStorage) (globalThis as any).localStorage = previousStorage;
  else delete (globalThis as any).localStorage;
  resetClosedTabsStoreForTests([]);
}

console.log('[PASS] [Closed-Tabs] persisted recently-closed list excludes private/agent tabs and validates what it reads.');

// Wiring guards (source scans).
import fs from 'node:fs';
{
  const menu = fs.readFileSync('src/components/TabContextMenu.tsx', 'utf8');
  assert.ok(menu.includes('useRecentlyClosed()') && menu.includes('reopenClosedAt(entry.index)'), 'the tab menu lists recently closed tabs and reopens by position');
  assert.ok(menu.includes('dir="auto"'), 'page titles render as text with automatic direction');
  assert.ok(!menu.includes('dangerouslySetInnerHTML'), 'titles are never rendered as HTML');
  const hook = fs.readFileSync('src/hooks/useClosedTabs.ts', 'utf8');
  assert.ok(hook.includes('setReopenHandler('), 'the hook registers how to recreate a tab');
}
console.log('[PASS] [Closed-Tabs] the tab menu lists and reopens recently closed tabs.');
