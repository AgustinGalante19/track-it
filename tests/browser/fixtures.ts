import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { today } from '../../shared/format';
const origin = 'http://127.0.0.1:5174';
const date = today();
const month = date.slice(0, 7);
export async function fixture(page: Page) {
  await page.request.post('/api/__pcache/delay', { data: { delay: 0 } });
  await page.request.post('/api/__pcache/reset-rate-limit');
  const username = `pcache${randomUUID().replaceAll('-', '').slice(0, 15)}`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: origin }, data: { username, email: `${username}@example.invalid`, name: 'PCACHE-Person', password: 'PCACHE-Fictional-2026!' },
  });
  expect(signup.ok(), `Fictional signup status ${signup.status()}`).toBeTruthy();
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
  return { bank, credit, usd };
}

