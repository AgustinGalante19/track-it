import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';
import { today } from '../../shared/format';

test('bank logos appear in accounts, editor preview, history and expense metadata', async ({ page }) => {
  const { bank } = await fixture(page);
  const bootstrap = await (await page.request.get(`/api/bootstrap?month=${today().slice(0, 7)}`)).json();
  const version = bootstrap.data.accounts.find((account: { id: string }) => account.id === bank).version;
  const response = await page.request.patch(`/api/accounts/${bank}`, {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: { name: 'Galicia ARS', emoji: 'B', archived: false, color: '#7256cf', version },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto(`/cuentas?mes=${today().slice(0, 7)}`);
  const card = page.getByRole('article', { name: 'Galicia ARS', exact: true });
  await expect(card.locator('[data-bank=banco-galicia] img')).toBeVisible();
  await expect(page.getByRole('article', { name: 'PCACHE-Credit' }).locator('.account-visual svg')).toBeVisible();
  await card.getByRole('button', { name: 'Editar Galicia ARS' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar cuenta', exact: true });
  await expect(dialog.locator('[data-bank=banco-galicia] img')).toBeVisible();
  await dialog.getByLabel('Nombre de la cuenta', { exact: true }).fill('Ualá USD');
  await expect(dialog.locator('[data-bank=uala] img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  for (const theme of ['light', 'dark']) for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/account-logos-${theme}-${width}.png`, fullPage: true });
  }
  await card.getByRole('link', { name: 'Ver historial de Galicia ARS' }).click();
  await expect(page.locator('h1 [data-bank=banco-galicia] img')).toBeVisible();
  await expect(page.locator('.movement-row [data-bank=banco-galicia] img').first()).toBeVisible();
  await page.context().setOffline(true);
  expect(await page.locator('h1 .account-visual img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('AstroPay and ARQ use local logos in both themes', async ({ page }) => {
  await fixture(page);
  for (const name of ['Astro Pay ARS', 'ARQ USD']) {
    const response = await page.request.post('/api/accounts', {
      headers: { Origin: 'http://127.0.0.1:5174' },
      data: { id: crypto.randomUUID(), name, type: 'wallet', currency: name.endsWith('USD') ? 'USD' : 'ARS', emoji: 'B', color: null },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/cuentas');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const brand of ['astropay', 'arq']) {
      const img = page.locator(`[data-bank=${brand}] img`);
      await expect(img).toBeVisible();
      expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `test-results/bank-additions-${theme}.png`, fullPage: true });
  }
});
