/**
 * Launches the real, built King Browser under Playwright for the Electron
 * smoke, accessibility and startup checks in this folder.
 *
 * Why a separate runner from tests/runAll.ts: that suite runs in plain Node
 * with no Electron binary and no display, which is what keeps it fast and
 * portable. These checks need the real main process, real webContents and a
 * display (xvfb on Linux CI), so they can only run where the Electron binary is
 * installed. Run `npm run build` first; the app loads dist/index.html.
 *
 * Every launch gets a throwaway profile directory so a run never reads or
 * writes the developer's own King profile, and pages under test are served
 * from a loopback server so no check depends on the internet.
 */
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface KingLaunch {
  app: ElectronApplication;
  window: Page;
  profileDir: string;
}

export function createProfileDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'king-e2e-profile-'));
}

/**
 * appData is derived from HOME / XDG_CONFIG_HOME (Linux, macOS) and APPDATA
 * (Windows), so pointing all three at the temp dir isolates userData on every
 * platform without adding a test-only switch to the app.
 */
export async function launchKing(profileDir = createProfileDir()): Promise<KingLaunch> {
  const distHtml = path.join(REPO_ROOT, 'dist', 'index.html');
  const mainBundle = path.join(REPO_ROOT, 'dist-electron', 'main.cjs');
  if (!fs.existsSync(distHtml) || !fs.existsSync(mainBundle)) {
    throw new Error('Build artifacts missing: run `npm run build` before `npm run test:electron`.');
  }
  const app = await _electron.launch({
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOME: profileDir,
      XDG_CONFIG_HOME: path.join(profileDir, '.config'),
      APPDATA: path.join(profileDir, 'AppData', 'Roaming'),
    },
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  await window.waitForSelector('#root > *', { timeout: 30_000 });
  return { app, window, profileDir };
}

/** A fresh profile starts in onboarding; skip it to reach the browser shell. */
export async function skipOnboarding(window: Page): Promise<void> {
  await window.getByRole('button', { name: /skip setup/i }).click();
  await addressBar(window).waitFor({ state: 'visible' });
}

export function addressBar(window: Page) {
  return window.getByLabel('Address and search bar').first();
}

/** Tab strip entries; the guest <webview> carries the same data attribute. */
export async function tabCount(window: Page): Promise<number> {
  return window.locator('[data-tab-id]:not(webview)').count();
}

export interface FixtureServer {
  url: (pathname?: string) => string;
  close: () => Promise<void>;
}

/** Serves a tiny HTML page on 127.0.0.1 with an ephemeral port. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server = http.createServer((req, res) => {
    const name = (req.url || '/').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'root';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><title>Fixture ${name}</title><main><h1>Fixture ${name}</h1></main></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (pathname = '/page') => `http://127.0.0.1:${port}${pathname}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Types a URL into the address bar and waits for the guest to load it. */
export async function navigateActiveTab(window: Page, url: string): Promise<void> {
  const bar = addressBar(window);
  await bar.click();
  await bar.fill(url);
  await bar.press('Enter');
  await window.locator(`webview[src="${url}"]`).waitFor({ state: 'attached', timeout: 20_000 });
}

export interface WebContentsSecurity {
  type: string;
  url: string;
  nodeIntegration: boolean | undefined;
  contextIsolation: boolean | undefined;
  sandbox: boolean | undefined;
  webSecurity: boolean | undefined;
}

/** Reads the effective webPreferences of every live webContents from the main process. */
export async function readWebContentsSecurity(app: ElectronApplication): Promise<WebContentsSecurity[]> {
  return app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((contents) => {
      const prefs = contents.getLastWebPreferences() ?? {};
      return {
        type: contents.getType(),
        url: contents.getURL(),
        nodeIntegration: prefs.nodeIntegration,
        contextIsolation: prefs.contextIsolation,
        sandbox: prefs.sandbox,
        webSecurity: prefs.webSecurity,
      };
    }),
  );
}

export async function closeKing(launch: KingLaunch): Promise<void> {
  await launch.app.close().catch(() => {});
  fs.rmSync(launch.profileDir, { recursive: true, force: true });
}
