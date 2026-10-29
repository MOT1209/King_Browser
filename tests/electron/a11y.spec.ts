/**
 * Automated accessibility scan (axe-core) of the first two screens a user
 * sees: onboarding and the browser shell with a new tab.
 *
 * Rules that already fail are listed in KNOWN_VIOLATIONS with the place they
 * are tracked, so the scan blocks NEW kinds of violations without pretending
 * the existing ones are fixed. Remove an entry once its issue is fixed; never
 * add one to get a red run green without recording why in the tracking doc.
 *
 * axe cannot judge keyboard flow, focus order or screen-reader output. This
 * is a floor, not an accessibility sign-off (see the accessibility-testing skill).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeKing, launchKing, skipOnboarding, type KingLaunch } from './kingApp';

// Tracked in docs/engineering/quality-baseline.md ("Accessibility").
const KNOWN_VIOLATIONS: Record<string, string> = {
  'color-contrast': 'small muted labels (setup header, AI pill, task counter) below 4.5:1',
  region: 'onboarding content is not inside a landmark',
};

let king: KingLaunch;

test.beforeEach(async () => {
  king = await launchKing();
});

test.afterEach(async () => {
  await closeKing(king);
});

async function scan(page: Page) {
  // Entrance animations start at opacity 0, which axe reads as near-invisible
  // text; let them settle so contrast is measured on the final frame.
  await page.waitForTimeout(2_000);
  // Legacy mode runs axe inside the page. The default mode opens a helper
  // page, which an Electron app does not allow (Target.createTarget).
  const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
  const unexpected = results.violations
    .filter((v) => !(v.id in KNOWN_VIOLATIONS))
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  const known = results.violations.filter((v) => v.id in KNOWN_VIOLATIONS).map((v) => v.id);
  test.info().annotations.push({ type: 'known axe violations', description: known.join(', ') || 'none' });
  return unexpected;
}

test('onboarding has no new axe violations', async () => {
  expect(await scan(king.window)).toEqual([]);
});

test('browser shell with a new tab has no new axe violations', async () => {
  await skipOnboarding(king.window);
  expect(await scan(king.window)).toEqual([]);
});
