import { test, expect } from '@playwright/test';
import { fixture } from './fixtures';

test('production worker precaches lazy styles and never financial responses', async ({ page, context }) => {
  test.skip(process.env.PCACHE_PREVIEW !== '1', 'Service worker is enabled in production builds only.');
  await fixture(page);
  await page.goto('/ajustes');
  await expect(page.locator('.settings-version')).not.toContainText('development');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const urls = await page.evaluate(async () => {
    const requests = await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  expect(urls.some((url) => url.startsWith('/api'))).toBe(false);
  for (const prefix of ['forms-', 'AccountsPage-', 'CategoriesPage-', 'index-']) {
    expect(urls.some((url) => url.startsWith(`/assets/${prefix}`) && url.endsWith('.css'))).toBe(true);
  }
  for (const url of urls.filter((url) => /\.(css|js)$/.test(url))) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(url.endsWith('.css') ? /text\/css/ : /javascript/);
  }
  await context.setOffline(true);
  const offline = await page.evaluate(async () => {
    const shell = await fetch('/index.html');
    let apiFailed = false;
    try { const response = await fetch('/api/bootstrap'); apiFailed = !response.ok; } catch { apiFailed = true; }
    return { shell: shell.ok, apiFailed };
  });
  expect(offline).toEqual({ shell: true, apiFailed: true });
  await context.setOffline(false);
});
