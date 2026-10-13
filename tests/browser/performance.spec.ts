import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { today } from '../../shared/format';

const origin = 'http://127.0.0.1:5174';
const date = today();
const month = date.slice(0, 7);
const viewports = [{ width: 1440, height: 900 }, { width: 360, height: 800 }, { width: 390, height: 844 }];
type Sample = { endToEnd: number; receiptToRender: number; response: number; writes: number; bootstraps: number; bytes: number };
async function fixture(page: Page) {
  await page.request.post('/api/__pcache/delay', { data: { delay: 0 } });
  const username = `pcache${randomUUID().replaceAll('-', '').slice(0, 15)}`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: origin }, data: { username, email: `${username}@example.invalid`, name: 'PCACHE-Person', password: 'PCACHE-Fictional-2026!' },
  });
  expect(signup.ok()).toBeTruthy();
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`/api${path}`, { headers: { Origin: origin }, data });
    expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
    return response.json();
  }
  const bank = randomUUID(), credit = randomUUID(), usd = randomUUID();
  for (const [id, name, type, currency] of [[bank, 'Bank', 'bank', 'ARS'], [credit, 'Credit', 'credit', 'ARS'], [usd, 'USD', 'bank', 'USD']]) {
    await post('/accounts', { id, name: `PCACHE-${name}`, type, currency, emoji: 'B', color: null });
  }
  for (let index = 0; index < 30; index++) await post('/expenses', {
    id: randomUUID(), concept: `PCACHE-Seed-${index}`, accountId: bank, amount: 1000, date, category: 'General', emoji: 'E', notes: '',
  });
  for (const kind of ['service', 'subscription']) await post('/recurring', {
    id: randomUUID(), name: `PCACHE-${kind}`, kind, accountId: bank, amount: 12500, dueDay: 15,
    startDate: `${month}-01`, category: 'General', emoji: 'R',
  });
  await post('/plans', { id: randomUUID(), name: 'PCACHE-Plan', accountId: credit, total: 30000, count: 3,
    firstDate: `${month}-01`, historicalCount: 0, category: 'General', emoji: 'P' });
  return { bank };
}
for (const viewport of viewports) for (const delayed of [false, true]) {
  test(`${viewport.width}x${viewport.height} ${delayed ? '400ms-4x' : 'normal'}`, async ({ page, browser }, info) => {
    await page.setViewportSize(viewport);
    const { bank } = await fixture(page);
    const cdp = await page.context().newCDPSession(page);
    if (delayed) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // Delay at the isolated API so browser routing does not disable HTTP cache.
      await page.request.post('/api/__pcache/delay', { data: { delay: 400 } });
    }
    await page.addInitScript(() => {
      const samples: { name: string; duration: number }[] = [];
      Object.assign(window, { pcacheMeasurements: samples });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.name.startsWith('finance-')) samples.push({ name: entry.name, duration: entry.duration });
      }).observe({ entryTypes: ['measure'] });
    });
    const coldStart = performance.now();
    await page.goto(`/?mes=${month}`);
    await expect(page.getByRole('button', { name: 'Agregar gasto', exact: true })).toBeVisible();
    const coldLoad = performance.now() - coldStart;
    const samples: Sample[] = [];
    for (let index = 0; index < 12; index++) {
      await page.getByRole('button', { name: 'Agregar gasto', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Concepto', { exact: true }).fill(`PCACHE-Expense-${index}`);
      await dialog.getByRole('combobox', { name: /^Cuenta o tarjeta/ }).selectOption(bank);
      await dialog.getByLabel('Importe en ARS', { exact: true }).fill('123,45');
      let writes = 0, bootstraps = 0, bytes = 0;
      const bodies: Promise<void>[] = [];
      const listener = (response: import('@playwright/test').Response) => {
        const path = new URL(response.url()).pathname;
        if (path === '/api/expenses') writes++;
        if (path === '/api/bootstrap') bootstraps++;
        if (path === '/api/expenses' || path === '/api/bootstrap') bodies.push(response.body().then((body) => { bytes += body.length; }));
      };
      page.on('response', listener);
      const start = performance.now();
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(page.locator('.movement-row').filter({ has: page.getByText(`PCACHE-Expense-${index}`, { exact: true }) })).toBeVisible();
      await expect(page.locator('.summary .stat-accent .stat-value')).toContainText(((30000 + 12345 * (index + 1)) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }));
      await expect.poll(() => page.evaluate(() => (window as unknown as { pcacheMeasurements: { name: string }[] }).pcacheMeasurements.filter((entry) => entry.name === 'finance-end-to-end').length)).toBe(index + 1);
      page.off('response', listener);
      await Promise.all(bodies);
      const measurements = await page.evaluate(() => (window as unknown as { pcacheMeasurements: { name: string; duration: number }[] }).pcacheMeasurements.slice(-3));
      samples.push({ endToEnd: measurements.find((e) => e.name === 'finance-end-to-end')!.duration,
        receiptToRender: measurements.find((e) => e.name === 'finance-receipt-to-render')!.duration,
        response: measurements.find((e) => e.name === 'finance-response')!.duration, writes, bootstraps, bytes });
      expect(performance.now() - start).toBeLessThan(15_000);
    }
    // Baseline edit uses the existing UI and observes the new amount after revalidation.
    await page.getByRole('button', { name: 'Opciones de PCACHE-Expense-11', exact: true }).click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Importe en ARS', { exact: true }).fill('234,56');
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('.movement-row').filter({ has: page.getByText('PCACHE-Expense-11', { exact: true }) })).toContainText('234,56');
    await page.goto(`/recurrentes?mes=${month}`);
    await page.getByRole('button', { name: 'Agregar recurrente', exact: true }).click();
    const recurringDialog = page.getByRole('dialog');
    await recurringDialog.getByLabel('Nombre del servicio o suscripción', { exact: true }).fill('PCACHE-New-Service');
    await recurringDialog.getByRole('combobox', { name: /^Cuenta o tarjeta/ }).selectOption(bank);
    await recurringDialog.getByRole('combobox', { name: /^Tipo/ }).selectOption('service');
    await recurringDialog.getByLabel('Importe estimado en ARS', { exact: true }).fill('125,00');
    await recurringDialog.getByLabel('Día mensual de vencimiento', { exact: true }).fill('15');
    await recurringDialog.getByLabel('Comienza a partir de', { exact: true }).fill(`${month}-01`);
    await recurringDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    const recurringRow = page.locator('.recurring-item').filter({ hasText: 'PCACHE-New-Service' });
    await expect(recurringRow).toBeVisible();
    await recurringRow.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Importe real en ARS', { exact: true }).fill('149,99');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pago', exact: true }).click();
    await expect(recurringRow).toContainText('149,99');
    await expect(recurringRow).toContainText('Pagado');
    const warm = samples.slice(2);
    const percentile = (key: keyof Sample, p: number) => [...warm].sort((a, b) => a[key] - b[key])[Math.ceil(warm.length * p) - 1][key];
    const report = { fixture: 'PCACHE-v1', month, browser: browser.version(), viewport, mode: process.env.PCACHE_PREVIEW === '1' ? 'preview' : 'development',
      cache: 'fresh browser context per condition; normal HTTP cache and service worker behavior; two save warmups',
      condition: delayed ? '400ms response delay + 4x CPU' : 'normal', coldLoad, warmups: samples.slice(0, 2), samples: warm,
      median: percentile('endToEnd', .5), p95: percentile('endToEnd', .95),
      receiptToRenderMedian: percentile('receiptToRender', .5), receiptToRenderP95: percentile('receiptToRender', .95) };
    const reportPath = info.outputPath('sanitized-baseline.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await info.attach('sanitized-baseline.json', { path: reportPath, contentType: 'application/json' });
    const screenshotPath = info.outputPath('fictional-recurring.png');
    await page.screenshot({ path: screenshotPath });
    await info.attach('fictional-recurring.png', { path: screenshotPath, contentType: 'image/png' });
  });
}
