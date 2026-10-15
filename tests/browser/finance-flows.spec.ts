import { test, expect, type Page } from '@playwright/test';
import { fixture } from './fixtures';
import { today } from '../../shared/format';

const month = today().slice(0, 7);
// These failure injections must reach browser routes rather than a service worker.
test.use({ serviceWorkers: 'block' });
async function expense(page: Page, bank: string, concept: string) {
  await page.getByRole('button', { name: 'Agregar gasto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar gasto', exact: true });
  await dialog.getByLabel('Concepto', { exact: true }).fill(concept);
  await dialog.getByRole('combobox', { name: /^Cuenta o tarjeta/ }).selectOption(bank);
  await dialog.getByLabel('Importe en ARS', { exact: true }).fill('123,45');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
}

test('confirmed legacy save reconciles once; failed reconciliation never repeats the write', async ({ page }) => {
  const { bank } = await fixture(page);
  await page.goto(`/?mes=${month}`);
  await expect(page.getByRole('button', { name: 'Agregar gasto', exact: true })).toBeVisible();
  let writes = 0, reads = 0, failRead = false;
  await page.route('**/api/expenses?*', async (route) => {
    writes++;
    const response = await route.fetch();
    const envelope = await response.json();
    await route.fulfill({ response, json: envelope.result });
  });
  await page.route('**/api/bootstrap?*', async (route) => {
    reads++;
    if (failRead) await route.fulfill({ status: 503, json: { error: 'PCACHE unavailable' } });
    else await route.continue();
  });
  await expense(page, bank, 'PCACHE-Legacy');
  await expect(page.locator('.movement-row').filter({ hasText: 'PCACHE-Legacy' })).toBeVisible();
  expect([writes, reads]).toEqual([1, 1]);
  failRead = true;
  await expense(page, bank, 'PCACHE-Saved-Stale');
  await expect(page.getByText('Guardado. No pudimos actualizar las vistas. Volvé a actualizar.', { exact: true })).toBeVisible();
  expect([writes, reads]).toEqual([2, 2]);
  await expect(page.locator('.movement-row').filter({ hasText: 'PCACHE-Saved-Stale' })).toHaveCount(0);
  failRead = false;
  await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
  await expect(page.locator('.movement-row').filter({ hasText: 'PCACHE-Saved-Stale' })).toBeVisible();
  expect([writes, reads]).toEqual([2, 3]);
});

test('account history failure preserves confirmed save and retries only history', async ({ page }) => {
  const { bank } = await fixture(page);
  await page.goto(`/cuentas/${bank}?mes=${month}`);
  await expect(page.getByRole('button', { name: 'Registrar ingreso', exact: true })).toBeVisible();
  let writes = 0, reads = 0, history = 0, failHistory = true;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/incomes') writes++;
    if (path === '/api/bootstrap') reads++;
  });
  await page.route(`**/api/accounts/${bank}/history`, async (route) => {
    history++;
    if (failHistory) await route.fulfill({ status: 503, json: { error: 'PCACHE unavailable' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Registrar ingreso', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar ingreso', exact: true });
  await dialog.getByLabel('Concepto', { exact: true }).fill('PCACHE-Income');
  await dialog.getByLabel('Importe en ARS', { exact: true }).fill('50,00');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('No pudimos actualizar el historial.', { exact: false })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect([writes, reads, history]).toEqual([1, 0, 1]);
  failHistory = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('PCACHE-Income', { exact: true })).toBeVisible();
  expect([writes, reads, history]).toEqual([1, 0, 2]);
});

test('fictional backup restoration uses one write and one full reconciliation', async ({ page }) => {
  await fixture(page);
  const backup = await (await page.request.get('/api/backup')).body();
  await page.goto(`/ajustes?mes=${month}`);
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  let writes = 0, reads = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/backup/restore') writes++;
    if (path === '/api/bootstrap') reads++;
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'PCACHE.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Reemplazar mis datos', exact: true }).click();
  await expect(page.getByText('Respaldo restaurado. Vistas actualizadas.', { exact: true })).toBeVisible();
  expect([writes, reads]).toEqual([1, 1]);
});
