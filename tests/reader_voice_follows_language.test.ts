/**
 * Reader mode read-aloud follows a language change made during playback.
 *
 * Failures this prevents: speakSentence chained each next sentence from the
 * closure of the render that started playback, so after the user picked
 * another language mid-read the label showed the new voice while every later
 * sentence was still requested in the old language and voice. Also, the
 * player row's "n / m sentences" counter was English in every language.
 *
 * Renders the real ReaderMode in jsdom with a mocked electronAPI and records
 * what nativeTtsSpeak is asked for.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { lockTestGlobals } from './jsdom_suite_lock';

const nodeRequire = createRequire(join(process.cwd(), 'noop.js'));
const { JSDOM } = nodeRequire('jsdom') as typeof import('jsdom');

console.log('\n--- Reader Voice Follows Language Test Suite ---');
let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`[PASS] [ReaderVoice] ${name}`);
  } else {
    console.log(`[FAIL] [ReaderVoice] ${name} ${extra}`);
    process.exitCode = 1;
  }
}

function setGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

/** Same reason as in agent_control_panel.test.ts: real MessagePorts keep node alive. */
function installStubMessageChannel() {
  class StubPort {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    peer: StubPort | null = null;
    postMessage(data: unknown) {
      const target = this.peer;
      if (target && target.onmessage) queueMicrotask(() => target.onmessage!({ data }));
    }
    close() { this.peer = null; this.onmessage = null; }
    start() {}
  }
  class StubMessageChannel {
    port1 = new StubPort();
    port2 = new StubPort();
    constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; }
  }
  setGlobal('MessageChannel', StubMessageChannel);
}

const ARTICLE_HTML = `<!doctype html><html><head><title>Garden notes</title></head><body>
<article><h1>Garden notes</h1>
<p>The first sentence talks about the garden in the early morning light. The second sentence is about the tomatoes that grew this year. The third sentence describes the small pond behind the old house.</p>
<p>The fourth sentence is about the birds that come to the feeder every day. The fifth sentence ends the short story about the garden and the house.</p>
</article></body></html>`;

async function renderSuite() {
  const g = globalThis as any;
  const keys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'DOMParser',
    'HTMLImageElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLAnchorElement',
    'localStorage', 'IS_REACT_ACT_ENVIRONMENT',
  ] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const k of keys) saved.set(k, Object.getOwnPropertyDescriptor(g, k));

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });
  const w = dom.window as any;
  for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent',
    'MutationObserver', 'DOMParser', 'HTMLImageElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLAnchorElement']) {
    setGlobal(k, w[k]);
  }
  setGlobal('window', w);
  setGlobal('document', w.document);
  setGlobal('navigator', w.navigator);
  setGlobal('localStorage', w.localStorage);
  setGlobal('getComputedStyle', w.getComputedStyle.bind(w));
  setGlobal('requestAnimationFrame', w.requestAnimationFrame.bind(w));
  setGlobal('cancelAnimationFrame', w.cancelAnimationFrame.bind(w));
  if (!w.matchMedia) {
    w.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  setGlobal('matchMedia', w.matchMedia);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  w.HTMLElement.prototype.focus = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  // jsdom has no layout, so no innerText; the reader reads sentences from it.
  if (!('innerText' in w.HTMLElement.prototype)) {
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() { return this.textContent; },
    });
  }

  // Each nativeTtsSpeak call waits until the test releases it, so the test can
  // change the language while a sentence is "being spoken".
  const speakCalls: Array<{ voice: string; lang: string; release: () => void }> = [];
  w.electronAPI = {
    fetchPageHtml: async () => ({ html: ARTICLE_HTML }),
    nativeTtsGetVoices: async () => [],
    nativeTtsSpeak: (_text: string, voice: string, _rate: number, lang: string) =>
      new Promise(resolve => speakCalls.push({ voice, lang, release: () => resolve({ success: true }) })),
    nativeTtsStop: async () => true,
    storeGet: async () => null,
    storeSet: async () => true,
  };

  const realError = console.error;
  const realWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  let root: any = null;
  let container: any = null;
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react-dom/test-utils');
  // Other suites import ReaderMode statically, before any DOM exists, and
  // DOMPurify's default instance binds to the window present at import time
  // (none: it then has no sanitize). Point it at this suite's window for the
  // render and put it back afterwards.
  const DOMPurify = (await import('dompurify')).default as any;
  const purifyBefore = { sanitize: DOMPurify.sanitize, isSupported: DOMPurify.isSupported };
  const boundPurify = DOMPurify(w);
  DOMPurify.sanitize = boundPurify.sanitize.bind(boundPurify);
  DOMPurify.isSupported = boundPurify.isSupported;
  try {
    const { ReaderMode } = await import('../src/components/ReaderMode');

    const wait = async (until: () => boolean) => {
      for (let i = 0; i < 80; i++) {
        if (until()) return true;
        await act(async () => { await new Promise(r => setTimeout(r, 15)); });
      }
      return until();
    };

    container = w.document.createElement('div');
    w.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ReaderMode, { url: 'https://example.com/garden', tabId: 't1', isActive: true, onClose: () => {} }));
    });
    const loaded = await wait(() => (container.textContent || '').includes('tomatoes'));
    check('article renders', loaded, (container.textContent || '').slice(0, 200));

    const playButton = () => Array.from(container.querySelectorAll('button'))
      .find((b: any) => (b.getAttribute('title') || '').includes('Read Aloud')) as any;
    await act(async () => { playButton().click(); });
    await wait(() => speakCalls.length >= 1);
    check('first sentence is spoken in the detected language', speakCalls[0]?.lang === 'en-US', JSON.stringify(speakCalls[0]));

    // Open the reader settings popover and switch the language to German
    // while the first sentence is still being spoken.
    const settingsButton = Array.from(container.querySelectorAll('button'))
      .find((b: any) => b.querySelector('svg') && (b.getAttribute('title') || '').match(/Reader Settings|Appearance|Settings/i)) as any;
    if (settingsButton) await act(async () => { settingsButton.click(); });
    const languageSelect = Array.from(container.querySelectorAll('select'))
      .find((s: any) => Array.from(s.options).some((o: any) => o.value === 'de-DE')) as any;
    check('language picker is reachable', Boolean(languageSelect));
    if (languageSelect) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value')!.set!;
        setter.call(languageSelect, 'de-DE');
        languageSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
      });
    }

    await act(async () => { speakCalls[0]?.release(); });
    await wait(() => speakCalls.length >= 2);
    check('next sentence uses the newly picked language', speakCalls[1]?.lang === 'de-DE', JSON.stringify(speakCalls[1]));
    check('next sentence uses that language\'s default voice', speakCalls[1]?.voice === 'Anna', JSON.stringify(speakCalls[1]));

    // The player row's sentence counter was English in every interface language.
    const { getLanguage, setLanguage } = await import('../src/services/i18n');
    const previousLanguage = getLanguage();
    try {
      await act(async () => { setLanguage('de'); });
      const counterTranslated = await wait(() => /\d+ \/ \d+ Sätze/.test(container.textContent || ''));
      check('sentence counter is translated', counterTranslated, (container.textContent || '').match(/\d+ \/ \d+ \S+/)?.[0] || '');
    } finally {
      await act(async () => { setLanguage(previousLanguage); });
    }
  } finally {
    try { await act(async () => { root?.unmount(); }); } catch (_) {}
    DOMPurify.sanitize = purifyBefore.sanitize;
    DOMPurify.isSupported = purifyBefore.isSupported;
    container?.remove();
    console.error = realError;
    console.warn = realWarn;
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(g, k, desc);
      else delete g[k];
    }
    dom.window.close();
  }
}

(async () => {
  await lockTestGlobals(async () => {
    const realMessageChannel = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');
    installStubMessageChannel();
    try {
      await renderSuite();
    } finally {
      if (realMessageChannel) Object.defineProperty(globalThis, 'MessageChannel', realMessageChannel);
    }
  });
  console.log(`\n${passed} reader voice checks passed\n`);
})().catch(err => {
  console.error('[FAIL] [ReaderVoice] suite crashed:', err);
  process.exitCode = 1;
});
