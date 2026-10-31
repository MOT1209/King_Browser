/**
 * Smoke checks against the real Electron app: the security baseline that
 * CLAUDE.md hard rule 2 requires, verified at runtime rather than by reading
 * source, plus the tab lifecycle a user touches first.
 */
import { expect, test } from '@playwright/test';
import {
  closeKing,
  launchKing,
  navigateActiveTab,
  readWebContentsSecurity,
  skipOnboarding,
  startFixtureServer,
  tabCount,
  type FixtureServer,
  type KingLaunch,
} from './kingApp';

let king: KingLaunch;
let fixtures: FixtureServer;

test.beforeEach(async () => {
  fixtures = await startFixtureServer();
  king = await launchKing();
});

test.afterEach(async () => {
  await closeKing(king);
  await fixtures.close();
});

test('main window keeps sandbox, context isolation and no Node integration', async () => {
  const windows = (await readWebContentsSecurity(king.app)).filter((c) => c.type === 'window');
  expect(windows.length).toBeGreaterThan(0);
  for (const contents of windows) {
    expect(contents, contents.url).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  }

  const globals = await king.window.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: typeof (window as unknown as { electronAPI?: unknown }).electronAPI,
  }));
  expect(globals).toEqual({ require: 'undefined', process: 'undefined', bridge: 'object' });
});

test('production renderer CSP allows no inline or eval script', async () => {
  const csp = await king.window.evaluate(
    () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '',
  );
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? '';
  expect(scriptSrc).not.toBe('');
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
});

test('a web page runs in a sandboxed, isolated guest with no app bridge', async () => {
  await skipOnboarding(king.window);
  const url = fixtures.url('/guest');
  await navigateActiveTab(king.window, url);

  await expect
    .poll(async () => (await readWebContentsSecurity(king.app)).find((c) => c.url === url), { timeout: 20_000 })
    .toMatchObject({ type: 'webview', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });

  // executeJavaScript runs in the guest's main world, which is where page
  // scripts live: nothing privileged may be visible there.
  const exposed = await king.app.evaluate(async ({ webContents }, target) => {
    const guest = webContents.getAllWebContents().find((c) => c.getURL() === target);
    if (!guest) return null;
    return guest.executeJavaScript(
      '({ electronAPI: typeof window.electronAPI, require: typeof require, process: typeof process })',
    );
  }, url);
  expect(exposed).toEqual({ electronAPI: 'undefined', require: 'undefined', process: 'undefined' });

  await expect(king.window.locator('[data-tab-id]:not(webview)', { hasText: 'Fixture guest' })).toHaveCount(1);
});

test('keyboard shortcuts open and close tabs', async () => {
  await skipOnboarding(king.window);
  const before = await tabCount(king.window);
  expect(before).toBeGreaterThan(0);

  await king.window.keyboard.press('ControlOrMeta+t');
  await expect.poll(() => tabCount(king.window)).toBe(before + 1);

  await king.window.keyboard.press('ControlOrMeta+w');
  await expect.poll(() => tabCount(king.window)).toBe(before);
});

test('a webview cannot attach to an unauthorized partition, but an allowed one loads', async () => {
  await skipOnboarding(king.window);
  const evilUrl = fixtures.url('/evilpartition');
  const goodUrl = fixtures.url('/goodpartition');

  // The renderer is untrusted by main: even code running in it must not be able
  // to attach a guest to an arbitrary persistent profile such as persist:admin.
  // The incognito guest is the positive control, so a pass cannot just mean
  // that no webview ever loads in this environment.
  await king.window.evaluate(([evil, good]) => {
    for (const [src, partition] of [[evil, 'persist:admin'], [good, 'incognito-e2e-probe']]) {
      const view = document.createElement('webview');
      view.setAttribute('partition', partition);
      view.setAttribute('src', src);
      view.style.cssText = 'position:fixed;width:200px;height:200px;left:0;top:0;';
      document.body.appendChild(view);
    }
  }, [evilUrl, goodUrl]);

  await expect
    .poll(async () => (await readWebContentsSecurity(king.app)).some((c) => c.url === goodUrl), { timeout: 20_000 })
    .toBe(true);
  const loaded = await readWebContentsSecurity(king.app);
  expect(loaded.some((c) => c.url === evilUrl)).toBe(false);
});
