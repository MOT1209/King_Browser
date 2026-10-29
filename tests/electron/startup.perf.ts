/**
 * Repeatable startup, tab and memory measurements for the built app.
 *
 * Opt-in: `npm run benchmark:startup` (Playwright project `perf`). Numbers are
 * written to test-results/electron/startup-perf.json together with the
 * machine and runtime they came from. They describe this machine only; do not
 * quote them as a comparison with other browsers (see README "Performance").
 *
 * Workload, per run:
 *   cold start   fresh profile: launch -> first window -> React root rendered
 *   warm start   same profile relaunched: launch -> address bar visible
 *   tab open     Ctrl/Cmd+T until the tab strip grows, 10 times
 *   memory       sum of app.getAppMetrics() working sets after warm start,
 *                after 20 navigations of one tab, and after closing the extra tabs
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  addressBar,
  createProfileDir,
  launchKing,
  navigateActiveTab,
  skipOnboarding,
  startFixtureServer,
  tabCount,
} from './kingApp';
import type { ElectronApplication } from '@playwright/test';

const RUNS = Math.max(1, Number(process.env.KING_PERF_RUNS) || 3);

async function workingSetMb(app: ElectronApplication): Promise<number> {
  const kb = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0),
  );
  return Math.round((kb / 1024) * 10) / 10;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

test('startup, tab and memory baseline', async () => {
  test.setTimeout(RUNS * 180_000);
  const fixtures = await startFixtureServer();
  const runs: Array<Record<string, number>> = [];

  try {
    for (let run = 0; run < RUNS; run++) {
      const profileDir = createProfileDir();

      let t0 = Date.now();
      const cold = await launchKing(profileDir);
      const coldStartMs = Date.now() - t0;
      await skipOnboarding(cold.window);
      await cold.app.close();

      t0 = Date.now();
      const warm = await launchKing(profileDir);
      await addressBar(warm.window).waitFor({ state: 'visible', timeout: 30_000 });
      const warmStartMs = Date.now() - t0;
      await warm.window.waitForTimeout(2_000);
      const memAfterStartMb = await workingSetMb(warm.app);

      const tabOpenMs: number[] = [];
      for (let i = 0; i < 10; i++) {
        const before = await tabCount(warm.window);
        const start = Date.now();
        await warm.window.keyboard.press('ControlOrMeta+t');
        await expect.poll(() => tabCount(warm.window), { intervals: [10] }).toBe(before + 1);
        tabOpenMs.push(Date.now() - start);
      }

      for (let i = 0; i < 20; i++) {
        await navigateActiveTab(warm.window, fixtures.url(`/nav${run}x${i}`));
      }
      await warm.window.waitForTimeout(2_000);
      const memAfterNavigationMb = await workingSetMb(warm.app);

      for (let i = 0; i < 10; i++) await warm.window.keyboard.press('ControlOrMeta+w');
      await warm.window.waitForTimeout(3_000);
      const memAfterCloseMb = await workingSetMb(warm.app);

      await warm.app.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
      runs.push({ coldStartMs, warmStartMs, tabOpenMedianMs: median(tabOpenMs), memAfterStartMb, memAfterNavigationMb, memAfterCloseMb });
    }
  } finally {
    await fixtures.close();
  }

  const keys = Object.keys(runs[0]);
  const summary = Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const report = {
    measuredAt: new Date().toISOString(),
    kingVersion: pkg.version,
    environment: {
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpus: `${os.cpus().length} x ${os.cpus()[0]?.model ?? 'unknown'}`,
      totalMemGb: Math.round(os.totalmem() / 1024 ** 3),
      node: process.version,
      ci: Boolean(process.env.CI),
      display: process.env.DISPLAY ?? null,
    },
    runs,
    median: summary,
  };
  const outFile = path.join(REPO_ROOT, 'test-results', 'electron', 'startup-perf.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
