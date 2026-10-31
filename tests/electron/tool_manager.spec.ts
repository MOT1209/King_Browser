/**
 * Tool Manager against the real Electron app: the renderer form, the real IPC
 * handlers and the real main-process store. Covers what the Node suites cannot:
 * that the UI is wired to working handlers, and that a custom tool survives a
 * real application restart (same profile directory). Network is not used: the
 * tool points at a public name that is only ever validated, never called.
 */
import { expect, test } from '@playwright/test';
import { addressBar, closeKing, createProfileDir, launchKing, skipOnboarding, type KingLaunch } from './kingApp';

let king: KingLaunch | undefined;

test.afterEach(async () => {
  if (king) await closeKing(king);
  king = undefined;
});

async function openToolManager(launch: KingLaunch) {
  await addressBar(launch.window).click();
  await addressBar(launch.window).fill('king://settings#mcp');
  await addressBar(launch.window).press('Enter');
  const manager = launch.window.getByTestId('mcp-tool-manager');
  await manager.waitFor({ state: 'visible', timeout: 20_000 });
  return manager;
}

const registry = (launch: KingLaunch) =>
  launch.window.evaluate(() => (window as unknown as { electronAPI: { getMcpToolRegistry: () => Promise<{ builtIn: unknown[]; custom: Array<Record<string, any>> }> } }).electronAPI.getMcpToolRegistry());

test('add, reject unsafe, disable, restart, delete a custom tool', async () => {
  const profileDir = createProfileDir();
  king = await launchKing(profileDir);
  await skipOnboarding(king.window);
  let manager = await openToolManager(king);

  expect((await registry(king)).custom).toHaveLength(0);
  await expect(manager.getByText('No tools match.').or(manager.getByRole('listitem').first())).toBeVisible();

  // The two primary fields come first; advanced configuration is collapsed.
  await manager.getByRole('button', { name: 'Add tool' }).click();
  const dialog = king.window.getByRole('dialog', { name: 'Add tool' });
  await expect(dialog.getByLabel('Tool name')).toBeVisible();
  await expect(dialog.getByLabel('Tool description')).toBeVisible();
  await expect(dialog.getByLabel('Web address')).toHaveCount(0);

  await dialog.getByLabel('Tool name').fill('e2e_lookup');
  await dialog.getByLabel('Tool description').fill('Looks up an item by its identifier. Use it when the user asks about an item.');
  await dialog.getByRole('button', { name: 'Advanced configuration' }).click();
  await expect(dialog.getByText('do not make a working tool')).toBeVisible();

  // An internal destination is refused by the main process, and nothing is saved.
  await dialog.getByLabel('Web address').fill('https://localhost/items/{id}');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(/placeholder|declared parameter|Local and internal/);
  expect((await registry(king)).custom).toHaveLength(0);

  // A valid definition is saved.
  await dialog.getByLabel('Web address').fill('https://api.example.com/items/{id}');
  await dialog.getByRole('button', { name: 'Add parameter' }).click();
  await dialog.getByLabel('Parameter name').fill('id');
  await dialog.getByLabel('Parameter description').fill('Identifier of the item');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(manager.getByText('custom_e2e_lookup')).toBeVisible();
  let custom = (await registry(king)).custom;
  expect(custom).toHaveLength(1);
  expect(custom[0]).toMatchObject({ name: 'custom_e2e_lookup', enabled: true, hasSecret: false, valid: true });

  // Disable it; the backend agrees, not just the switch.
  await manager.getByRole('switch', { name: 'Enable custom_e2e_lookup' }).click();
  await expect.poll(async () => (await registry(king!)).custom[0]?.enabled).toBe(false);

  // Restart with the same profile: the tool and its state persist.
  // Close the app but keep the profile directory (closeKing would delete it).
  await king.app.close();
  king = await launchKing(profileDir);
  await king.window.getByRole('button', { name: /skip setup/i }).click({ timeout: 4_000 }).catch(() => undefined);
  manager = await openToolManager(king);
  custom = (await registry(king)).custom;
  expect(custom).toHaveLength(1);
  expect(custom[0]).toMatchObject({ name: 'custom_e2e_lookup', enabled: false });
  await expect(manager.getByText('custom_e2e_lookup')).toBeVisible();

  // Delete: the native confirmation is answered "Delete" by replacing the dialog in the main process.
  await king.app.evaluate(({ dialog }) => { dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox; });
  await manager.getByRole('button', { name: 'Delete custom_e2e_lookup' }).click();
  await expect.poll(async () => (await registry(king!)).custom.length).toBe(0);
  // The row is gone (the confirmation notice also names the tool, so look at list items only).
  await expect(manager.getByRole('listitem').filter({ hasText: 'custom_e2e_lookup' })).toHaveCount(0);
  await expect(manager.getByText('Deleted custom_e2e_lookup.')).toBeVisible();
});
