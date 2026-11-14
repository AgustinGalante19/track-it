import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';
import { today } from '../../shared/format';

test('category inheritance, quick service setup and responsive cards', async ({ page }) => {
  await fixture(page);
  await page.goto(`/recurrentes?mes=${today().slice(0, 7)}`);
  await page.getByRole('button', { name: 'Spotify', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar recurrente', exact: true });
  await expect(dialog.getByLabel('Nombre del servicio o suscripción', { exact: true })).toHaveValue('Spotify');
  await expect(dialog.getByLabel('Importe estimado en ARS', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Spotify', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('Importe estimado en ARS', { exact: true }).fill('3500');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator('.recurring-item').filter({ hasText: 'Spotify' });
  await expect(card.locator('[data-icon=spotify]')).toBeVisible();
  await page.reload();
  await expect(card.locator('[data-icon=spotify]')).toBeVisible();
  await card.getByRole('button', { name: 'Editar regla futura' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar recurrente', exact: true });
  await edit.getByLabel('Nombre del servicio o suscripción', { exact: true }).fill('Spotify familiar para música y podcasts compartidos en casa');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(card.locator('[data-icon=spotify]')).toBeVisible();
  // Current occurrences retain their name; the explicit icon belongs to the rule.
  await page.context().setOffline(true);
  expect(await card.locator('.visual-icon img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.context().setOffline(false);

  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await expect(card).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/icons-recurring-${theme}-${width}.png`, fullPage: true });
    }
  }

  await page.goto('/categorias');
  await page.getByLabel('Filtrar por moneda').selectOption('ARS');
  await page.getByRole('button', { name: 'Editar General', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar categoría', exact: true });
  await editor.getByLabel('Buscar íconos', { exact: true }).fill('café');
  await editor.getByRole('button', { name: 'Café', exact: true }).click();
  await editor.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.goto(`/?mes=${today().slice(0, 7)}`);
  await expect(page.locator('.stat-accent .stat-count')).toHaveText('30 gastos registrados');
  await expect(page.locator('.stat-accent .lucide-wallet')).toBeVisible();
  await expect(page.locator('.stat-pending .lucide-clock-3')).toBeVisible();
  await expect(page.locator('.movement-row [data-icon=coffee]').first()).toBeVisible();
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/icons-expenses-${theme}-${width}.png`, fullPage: true });
    }
  }
});
