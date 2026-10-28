#!/usr/bin/env node
/**
 * Captures the main screens in Arabic (right-to-left) and English so a layout
 * change can be compared before and after. Run it against `npm run dev:web`:
 *
 *   npm run dev:web                       # in one terminal
 *   node scripts/rtl-screenshots.cjs --out /tmp/rtl-before
 *   (change the code)
 *   node scripts/rtl-screenshots.cjs --out /tmp/rtl-after
 *
 * Then compare the two folders image by image. It needs Playwright, which is
 * not a dependency of this repository: install it yourself or run it where it
 * is already available. It drives the web build, not Electron, with a stubbed
 * agent engine so the control panel and an approval card can be shown.
 *
 * Options: --out <dir> (required), --url <dev server, default http://localhost:5173>,
 *          --langs <comma list, default ar,en>
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Install it (npm i -D playwright) or run this where it is available.');
  process.exit(1);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const outDir = arg('out');
if (!outDir) {
  console.error('Usage: node scripts/rtl-screenshots.cjs --out <dir> [--url http://localhost:5173] [--langs ar,en]');
  process.exit(1);
}
const baseUrl = arg('url', 'http://localhost:5173');
const languages = arg('langs', 'ar,en').split(',').map(s => s.trim()).filter(Boolean);

const LABELS = {
  ar: { skip: 'تخطّي الإعداد', menuSettings: 'الإعدادات' },
  en: { skip: 'Skip setup', menuSettings: 'Settings' },
};

// A fixed clock keeps the new-tab screen identical between runs.
const FIXED_NOW = new Date('2026-10-28T12:00:00Z').valueOf();

async function newPage(browser, lang, settings = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(({ lang, settings, now }) => {
    const RealDate = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    localStorage.setItem('nova_language', lang);
    localStorage.setItem('user_settings', JSON.stringify({ language: lang, ...settings }));

    const approval = {
      actionId: 'a1', toolName: 'browser_type', args: {}, summary: 'Type into a field', domain: 'shop.example.com',
      details: [{ kind: 'type', text: 'hello' }, { kind: 'url', text: 'https://shop.example.com/pay' }],
    };
    let status = { state: 'running', mode: 'auto', queueLength: 0, inFlight: null, actionsUsedThisRun: 3, maxActionsPerRun: 500, pendingApproval: null, takenOver: false, phase: null, stopReason: null };
    const listeners = new Set();
    window.__setApproval = (on) => {
      status = { ...status, state: on ? 'awaiting_approval' : 'running', pendingApproval: on ? approval : null };
      listeners.forEach(l => l(on ? { type: 'approval_needed', approval } : { type: 'approval_resolved', actionId: 'a1', approved: false }));
    };
    const history = [
      { id: '1', toolName: 'browser_navigate', args: {}, risk: 'safe', status: 'completed', requestedAt: now - 120000, endedAt: now - 120000 },
      { id: '2', toolName: 'browser_go_forward', args: {}, risk: 'safe', status: 'failed', requestedAt: now - 3600000, endedAt: now - 3600000 },
    ];
    const engine = {
      getEngineStatus: async () => status, getEngineHistory: async () => history, sendEngineCommand: async () => ({ ok: true }),
      onEngineEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
      respondEngineApproval: async () => {}, exportEngineLog: async () => '[]',
    };
    window.electronAPI = new Proxy(engine, {
      get(t, p) { if (p in t) return t[p]; if (typeof p === 'string' && p.startsWith('on')) return () => () => {}; return undefined; },
    });
  }, { lang, settings, now: FIXED_NOW });
  await page.goto(baseUrl);
  await page.waitForTimeout(1500);
  const skip = page.getByText(LABELS[lang]?.skip ?? LABELS.en.skip);
  if (await skip.count()) await skip.first().click();
  await page.waitForTimeout(1200);
  return page;
}

async function shot(page, lang, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${lang}-${name}.png`) });
}

async function openSettings(page, lang) {
  // The menu button carries a localized title; the settings entry sits inside the menu.
  const titles = { ar: 'خيارات أخرى', en: 'More Options', de: 'Weitere Optionen' };
  await page.locator(`button[title="${titles[lang] ?? titles.en}"]`).first().click();
  await page.waitForTimeout(400);
  await page.getByText(LABELS[lang]?.menuSettings ?? LABELS.en.menuSettings, { exact: true }).first().click();
  await page.waitForTimeout(900);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const lang of languages) {
      // New tab, assistant, agent panel with an approval, help, tab context menu.
      let page = await newPage(browser, lang);
      page.on('pageerror', e => errors.push(`${lang}: ${e.message}`));
      await shot(page, lang, '01-newtab');
      await page.keyboard.press('Control+i');
      await page.waitForTimeout(900);
      await shot(page, lang, '02-assistant');
      await page.keyboard.press('Control+i');
      await page.evaluate(() => window.__setApproval && window.__setApproval(true));
      await page.waitForTimeout(700);
      await page.locator('button[aria-expanded]').last().click({ trial: false }).catch(() => {});
      await shot(page, lang, '03-agent-panel');
      await page.evaluate(() => window.__setApproval && window.__setApproval(false));
      await page.keyboard.press('F1');
      await shot(page, lang, '04-help');
      await page.keyboard.press('Escape');
      await page.locator('[data-tab-id]').first().click({ button: 'right' }).catch(() => {});
      await shot(page, lang, '05-tab-menu');
      await page.keyboard.press('Escape');

      // Settings: every section in the navigation.
      await openSettings(page, lang);
      // The settings navigation is the first column of buttons (class w-64 in SettingsPage).
      const nav = page.locator('div.w-64 button');
      const count = Math.min(await nav.count(), 12);
      for (let i = 0; i < count; i++) {
        await nav.nth(i).click({ timeout: 3000 }).catch(() => {});
        await shot(page, lang, `06-settings-${String(i).padStart(2, '0')}`);
      }
      await page.close();

      // Vertical tabs sidebar.
      page = await newPage(browser, lang, { useVerticalTabs: true });
      await shot(page, lang, '07-vertical-tabs');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (errors.length) console.warn('Page errors:', errors.slice(0, 5));
  console.log(`Saved ${fs.readdirSync(outDir).length} screenshots to ${outDir}`);
})();
