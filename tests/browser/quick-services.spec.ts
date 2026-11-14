import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';
import { addMonth, today } from '../../shared/format';

test('quick services are saved and immediately visible in the selected month', async ({ page }) => {
  await fixture(page);
  const month = addMonth(`${today().slice(0, 7)}-01`, -1).slice(0, 7);
  await page.goto(`/recurrentes?mes=${month}`);
  for (const name of ['YouTube Premium', 'Spotify', 'Netflix', 'Disney+', 'Prime Video', 'Internet']) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agregar recurrente', exact: true });
    await expect(dialog.getByLabel('Nombre del servicio o suscripción')).toHaveValue(name);
    await expect(dialog.getByLabel('Comienza a partir de', { exact: true })).toHaveValue(`${month}-01`);
    await dialog.getByLabel('Importe estimado en ARS', { exact: true }).fill('2500');
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.recurring-item').filter({ hasText: name })).toBeVisible();
  }
  await page.reload();
  for (const name of ['YouTube Premium', 'Spotify', 'Netflix', 'Disney+', 'Prime Video', 'Internet']) {
    await expect(page.locator('.recurring-item').filter({ hasText: name })).toBeVisible();
  }
});

test('YouTube in USD stays visible without changing the primary ARS currency', async ({ page }) => {
  const { usd } = await fixture(page);
  const month = today().slice(0, 7);
  await page.goto(`/recurrentes?mes=${month}`);
  await page.getByRole('button', { name: 'ARS', exact: true }).click();
  await page.getByRole('button', { name: 'YouTube Premium', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar recurrente', exact: true });
  await dialog.getByRole('combobox', { name: 'Cuenta o tarjeta', exact: true }).selectOption(usd);
  await dialog.getByLabel('Importe estimado en USD', { exact: true }).fill('2,49');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'ARS', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const card = page.locator('.recurring-item').filter({ hasText: 'YouTube Premium' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('USD 2,49');
  await page.reload();
  await expect(card).toBeVisible();
  const bootstrap = await (await page.request.get(`/api/bootstrap?month=${month}`)).json();
  const rules = bootstrap.data.recurring.filter((rule: { name: string }) => rule.name === 'YouTube Premium');
  expect(rules).toHaveLength(1);
  expect(rules[0].amount).toBe(249);
  expect(rules[0].accountId).toBe(usd);
});
