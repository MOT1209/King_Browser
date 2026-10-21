/**
 * §10 Agent Control Panel — render-level checks in jsdom.
 *
 * The panel is the human control surface over the execution engine, so its
 * contracts are: state is visible, STOP NOW reaches the engine, approval
 * decisions carry the exact action id (binding), and a rejected action can
 * never be approved accidentally. The electronAPI bridge is mocked; the real
 * component and the real i18n strings are rendered.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { lockTestGlobals } from './jsdom_suite_lock';

const nodeRequire = createRequire(join(process.cwd(), 'noop.js'));
const { JSDOM } = nodeRequire('jsdom') as typeof import('jsdom');

console.log('\n--- Agent Control Panel (§10) Test Suite ---');
let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`[PASS] [AgentPanel] ${name}`);
  } else {
    console.log(`[FAIL] [AgentPanel] ${name} ${extra}`);
    process.exitCode = 1;
  }
}

function setGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    state: 'running',
    mode: 'auto',
    queueLength: 0,
    inFlight: null,
    pendingApproval: null,
    phase: null,
    actionsUsedThisRun: 0,
    maxActionsPerRun: 50,
    stopReason: null,
    lastFinalState: null,
    ...overrides
  };
}

/**
 * A MessageChannel that delivers through the microtask queue instead of a real
 * port. React's `act` builds one per call and never closes the ports, and in
 * node an open MessagePort is a live libuv handle, so without this the test
 * process never exits.
 */
function installStubMessageChannel() {
  class StubPort {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    peer: StubPort | null = null;
    postMessage(data: unknown) {
      const target = this.peer;
      if (target && target.onmessage) queueMicrotask(() => target.onmessage!({ data }));
    }
    close() {
      this.peer = null;
      this.onmessage = null;
    }
    start() {}
  }
  class StubMessageChannel {
    port1 = new StubPort();
    port2 = new StubPort();
    constructor() {
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  }
  setGlobal('MessageChannel', StubMessageChannel);
}

async function renderSuite() {
  const g = globalThis as any;
  const keys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'DOMParser',
    'HTMLImageElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLAnchorElement',
    'IS_REACT_ACT_ENVIRONMENT',
  ] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const k of keys) saved.set(k, Object.getOwnPropertyDescriptor(g, k));

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });
  const w = dom.window as any;
  setGlobal('window', w);
  setGlobal('document', w.document);
  setGlobal('navigator', w.navigator);
  setGlobal('HTMLElement', w.HTMLElement);
  setGlobal('Element', w.Element);
  setGlobal('Node', w.Node);
  setGlobal('Event', w.Event);
  setGlobal('MouseEvent', w.MouseEvent);
  setGlobal('KeyboardEvent', w.KeyboardEvent);
  setGlobal('CustomEvent', w.CustomEvent);
  setGlobal('MutationObserver', w.MutationObserver);
  setGlobal('getComputedStyle', w.getComputedStyle.bind(w));
  setGlobal('requestAnimationFrame', w.requestAnimationFrame.bind(w));
  setGlobal('cancelAnimationFrame', w.cancelAnimationFrame.bind(w));
  setGlobal('DOMParser', w.DOMParser);
  setGlobal('HTMLImageElement', w.HTMLImageElement);
  setGlobal('HTMLTextAreaElement', w.HTMLTextAreaElement);
  setGlobal('HTMLButtonElement', w.HTMLButtonElement);
  setGlobal('HTMLAnchorElement', w.HTMLAnchorElement);
  if (!w.matchMedia) {
    w.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  setGlobal('matchMedia', w.matchMedia);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  w.HTMLElement.prototype.focus = () => {};

  let statusPayload: Record<string, unknown> = makeStatus();
  let historyPayload: unknown[] = [];
  const commands: Array<{ command: string; payload?: unknown }> = [];
  const approvals: Array<{ actionId: string; approved: boolean }> = [];
  const engineEventListeners: Array<(event: unknown) => void> = [];

  w.electronAPI = {
    getEngineStatus: async () => statusPayload,
    getEngineHistory: async () => historyPayload,
    sendEngineCommand: async (command: string, payload?: unknown) => {
      commands.push({ command, payload });
      return { ok: true, command, detail: {}, state: statusPayload.state, mode: statusPayload.mode };
    },
    respondEngineApproval: async (actionId: string, approved: boolean) => {
      approvals.push({ actionId, approved });
      return { ok: true, resolved: true };
    },
    onEngineEvent: (callback: (event: unknown) => void) => {
      engineEventListeners.push(callback);
      return () => {
        const index = engineEventListeners.indexOf(callback);
        if (index >= 0) engineEventListeners.splice(index, 1);
      };
    }
  };

  const realError = console.error;
  console.error = () => {};
  const mounted: Array<{ root: any; container: any }> = [];
  try {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react-dom/test-utils');
    const { AgentControlPanel } = await import('../src/components/AgentControlPanel');

    const settle = async (container: any, until: (html: string) => boolean) => {
      for (let i = 0; i < 40; i++) {
        await act(async () => { await new Promise(r => setTimeout(r, 15)); });
        if (until(container.innerHTML)) return true;
      }
      return until(container.innerHTML);
    };

    const mount = async () => {
      const container = w.document.createElement('div');
      w.document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(React.createElement(AgentControlPanel));
      });
      await settle(container, html => html.includes('Running'));
      mounted.push({ root, container });
      return container;
    };

    const findButton = (container: any, text: string): any =>
      Array.from(container.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes(text)
      );

    const emitEngineEvent = async (container: any) => {
      await act(async () => {
        for (const listener of engineEventListeners.slice()) listener({ type: 'action_updated' });
        await new Promise(r => setTimeout(r, 5));
      });
    };

    // 1. Collapsed pill shows the live engine state.
    {
      statusPayload = makeStatus({ state: 'running' });
      const container = await mount();
      check('collapsed pill shows the engine state', container.textContent.includes('Running'), container.innerHTML.slice(0, 200));
    }

    // 2. Expanded controls reach the engine: STOP NOW sends the stop command.
    {
      const container = mounted[mounted.length - 1].container;
      const pill = container.querySelector('button[aria-expanded]');
      await act(async () => { pill.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
      await settle(container, html => html.includes('STOP NOW'));

      const stopButton = findButton(container, 'STOP NOW');
      check('expanded panel shows STOP NOW', Boolean(stopButton));
      await act(async () => { stopButton.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
      await settle(container, () => commands.length > 0);
      check('STOP NOW sends the stop command', commands.some(c => c.command === 'stop'), JSON.stringify(commands));
    }

    // 3. Approval decision binds to the exact action id.
    {
      const container = mounted[mounted.length - 1].container;
      statusPayload = makeStatus({
        state: 'awaiting_approval',
        pendingApproval: {
          actionId: 'act_42',
          toolName: 'browser_submit_form',
          args: {},
          summary: 'Submit the checkout form',
          domain: 'example.com'
        }
      });
      await emitEngineEvent(container);
      await settle(container, html => html.includes('Approve'));

      check('approval request auto-surfaces', container.textContent.includes('browser_submit_form'), container.textContent.slice(0, 300));
      check('approval shows the target domain', container.textContent.includes('example.com'));

      const approveButton = findButton(container, 'Approve');
      await act(async () => { approveButton.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
      await settle(container, () => approvals.length > 0);
      check(
        'approve carries the exact action id',
        approvals.some(a => a.actionId === 'act_42' && a.approved === true),
        JSON.stringify(approvals)
      );
    }

    // 4. Reject carries the exact action id and refuses the binding.
    {
      const container = mounted[mounted.length - 1].container;
      statusPayload = makeStatus({
        state: 'awaiting_approval',
        pendingApproval: {
          actionId: 'act_43',
          toolName: 'browser_click',
          args: {},
          summary: 'Click the pay button',
          domain: 'example.com'
        }
      });
      await emitEngineEvent(container);
      await settle(container, html => html.includes('Reject'));

      const rejectButton = findButton(container, 'Reject');
      const before = approvals.length;
      await act(async () => { rejectButton.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
      await settle(container, () => approvals.length > before);
      check(
        'reject carries the exact action id',
        approvals.some(a => a.actionId === 'act_43' && a.approved === false),
        JSON.stringify(approvals)
      );
    }

    // 5. Stopped state reports the stop reason honestly.
    {
      const container = mounted[mounted.length - 1].container;
      statusPayload = makeStatus({ state: 'stopped', stopReason: 'Panel test stop', pendingApproval: null });
      historyPayload = [
        {
          id: 'act_1', toolName: 'browser_navigate', args: {}, risk: 'safe', status: 'cancelled',
          requestedAt: Date.now() - 5000, endedAt: Date.now() - 4000, error: 'Cancelled by STOP NOW'
        }
      ];
      await emitEngineEvent(container);
      await settle(container, html => html.includes('Panel test stop'));

      check('stop reason is shown verbatim', container.textContent.includes('Panel test stop'));
      check('resume requirement is stated', container.textContent.includes('explicit resume is required'), container.textContent.slice(0, 300));
      check('recent activity lists the cancelled action', container.textContent.includes('browser_navigate'));
    }

    // 6. Panel toggle shortcut hint exists on the pill.
    {
      const container = mounted[mounted.length - 1].container;
      const pill = container.querySelector('button[aria-expanded]');
      check('pill exposes the keyboard shortcut hint', (pill.getAttribute('title') || '').includes('Ctrl+Shift+.'));
    }
  } finally {
    for (const { root, container } of mounted) {
      try {
        await act(async () => { root.unmount(); });
      } catch (_) {}
      container.remove();
    }
    console.error = realError;
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(g, k, desc);
      else delete g[k];
    }
    dom.window.close();
  }
}

(async () => {
  await lockTestGlobals(async () => {
    installStubMessageChannel();
    const realMessageChannel = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');
    try {
      await renderSuite();
    } finally {
      if (realMessageChannel) Object.defineProperty(globalThis, 'MessageChannel', realMessageChannel);
    }
  });
  console.log(`\n${passed} agent panel checks passed\n`);
})().catch(err => {
  console.error('[FAIL] [AgentPanel] suite crashed:', err);
  process.exitCode = 1;
});
