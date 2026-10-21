import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isSafeAgentNavigationUrl } from '../src/utils/safeNavigation';
import * as mcpActionTiming from '../src/utils/mcpActionTiming';
import { orchestrator } from '../src/services/agentOrchestrator';

// The main-process execution engine approves MCP actions. The renderer must not
// park them in its own approval queue: no UI renders that queue, so with the
// real orchestrator every click/type used to wait until the window expired.

async function run() {
  let request: Function = () => {};
  let cancel: Function = () => {};
  const responses: Array<[string, any]> = [];
  let clicks = 0;
  const url = 'https://example.com/settings';

  const button = {
    tagName: 'BUTTON', innerText: 'Delete   account', textContent: 'Delete account', labels: null,
    getAttribute: (name: string) => ({ 'aria-label': 'Remove my account', type: 'submit', value: 'delete' } as Record<string, string>)[name] ?? null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    click: () => { clicks++; }
  };
  const webview = {
    getURL: () => url, getAttribute: () => 'tab', isLoading: () => false,
    addEventListener: () => {}, removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    executeJavaScript: async (code: string) => vm.runInNewContext(code, {
      window: { location: { href: url } },
      document: { querySelector: (selector: string) => selector === '#btn-3' ? button : null }
    })
  };
  const api = {
    onMcpActionRequest: (fn: Function) => { request = fn; return () => {}; },
    onMcpActionCancel: (fn: Function) => { cancel = fn; return () => {}; },
    respondMcpAction: (id: string, result: any) => responses.push([id, result]),
    reportMcpActionPhase: () => {},
    checkAgentNavigationHost: async () => ({ allowed: true })
  };
  const imports: Record<string, any> = {
    react: { useEffect: (fn: Function) => fn(), useRef: (current: any) => ({ current }) },
    '../services/aiAgent': { aiAgent: { setActionContext: () => {} } },
    '../services/agentOrchestrator': { orchestrator },
    '../utils/safeNavigation': { isSafeAgentNavigationUrl },
    '../utils/mcpActionTiming': mcpActionTiming,
    '../utils/searchHistoryBookmarks': { searchHistoryAndBookmarks: () => [] }
  };
  const module: any = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/useBrowserAgentBridge.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText, { module, exports: module.exports, require: (name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected dependency ${name}`);
    return imports[name];
  }, URL, WeakMap, Map, Set, console, setTimeout, clearTimeout, CustomEvent: class {},
  window: { electronAPI: api, dispatchEvent: () => {} },
  document: { querySelector: () => webview, querySelectorAll: () => [webview] } });

  module.exports.useBrowserAgentBridge({ activeTabId: 'tab', tabs: [{ id: 'tab', url }], history: [], bookmarks: [],
    settingsRef: { current: { mcpServerEnabled: true } }, activeWorkspaceIdRef: { current: 'default' },
    setActiveWorkspaceId: () => {}, setActiveTabId: () => {}, setTabs: () => {}, handleNavigate: () => {},
    handleNewTab: () => {}, handleCloseTab: () => {}, handleSelectTab: () => {} });

  const call = async (id: string, tool: string, args: Record<string, unknown>) => {
    request(id, tool, args, Date.now() + 15000);
    for (let i = 0; i < 100 && !responses.some(([rid]) => rid === id); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const response = responses.find(([rid]) => rid === id);
    if (!response) {
      // Release the stuck action so its timers cannot keep the process alive.
      cancel(id);
      for (const action of orchestrator.getQueue()) if (action.state === 'pending') orchestrator.denyAction(action.id);
    }
    return response?.[1];
  };

  const clicked = await call('click', 'browser_click', { selector: '#btn-3' });
  assert.equal(clicked, 'Successfully clicked element.', 'an engine-approved MCP click must run without a second renderer approval');
  assert.equal(clicks, 1);
  console.log('[PASS] [Single-Approval] engine-approved MCP actions are not re-queued for renderer approval');

  const context = await call('ctx', mcpActionTiming.MCP_POLICY_CONTEXT_ACTION, { selector: '#btn-3' });
  assert.equal(context?.url, url, 'policy context reports the active page');
  assert.equal(context?.elementText, 'Delete account Remove my account submit delete', 'policy context describes the target element');
  assert.equal(clicks, 1, 'describing an element never clicks it');
  const noSelector = await call('ctx-url', mcpActionTiming.MCP_POLICY_CONTEXT_ACTION, {});
  assert.equal(JSON.stringify(noSelector), JSON.stringify({ url }), 'without a selector only the URL is reported');
  console.log('[PASS] [Single-Approval] renderer describes the page and target element for the approval policy');
}

run().catch(error => { console.error('[FAIL] Single approval authority:', error); process.exitCode = 1; });
