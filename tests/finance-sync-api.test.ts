import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { addMonth, today, type Snapshot } from '../shared/domain';
import { parseFinanceSyncResponse, type FinanceChanges } from '../shared/finance-sync';
import type { app as Application } from '../server/app';
import type { client as Client, db as Database } from '../server/db/client';

let app: typeof Application, client: typeof Client, db: typeof Database;
let owner = '', other = '', userId = '';
const origin = 'http://127.0.0.1:5174';
const month = addMonth(`${today().slice(0, 7)}-01`, 2).slice(0, 7);
const request = (path: string, method = 'GET', input?: unknown, cookie = owner) => app.request(`/api${path}`, {
  method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
  ...(input === undefined ? {} : { body: JSON.stringify(input) }),
});
const snapshot = async () => (await (await request(`/snapshot?month=${month}`)).json()) as Snapshot;
function normalized(data: Snapshot) {
  return Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, [...rows].sort((a, b) => a.id.localeCompare(b.id))]));
}
function apply(before: Snapshot, changes: FinanceChanges): Snapshot {
  return Object.fromEntries(Object.entries(before).map(([key, rows]) => {
    const delta = changes.collections[key as keyof Snapshot];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of delta?.removes ?? []) byId.delete(id);
    for (const row of delta?.upserts ?? []) byId.set(row.id, row);
    return [key, [...byId.values()]];
  })) as Snapshot;
}
async function sync(path: string, method: string, input: unknown, status = 200) {
  const before = await snapshot();
  const response = await request(`${path}?sync=1&month=${month}`, method, input);
  const raw = await response.json();
  expect(response.status, JSON.stringify(raw)).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const envelope = parseFinanceSyncResponse(raw, z.unknown());
  expect(normalized(apply(before, envelope.changes))).toEqual(normalized(await snapshot()));
  for (const delta of Object.values(envelope.changes.collections)) for (const row of delta!.upserts) {
    if ('userId' in row) expect(row.userId).toBe(userId);
  }
  const allowed = new Set([...before.accounts, ...(await snapshot()).accounts].map((row) => row.id));
  for (const id of envelope.changes.historyAccountIds) expect(allowed.has(id)).toBe(true);
  return envelope;
}
beforeAll(async () => {
  for (const [key, value] of Object.entries({ DATABASE_URL: ':memory:', DATABASE_AUTH_TOKEN: '', OWNER_EMAIL: '',
    OWNER_USERNAME: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', BETTER_AUTH_API_KEY: '',
    BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: 'PCACHE-Fictional-API-Test-Secret-2026' })) vi.stubEnv(key, value);
  ({ db, client } = await import('../server/db/client'));
  await (await import('../server/migrate')).migrateDatabase();
  ({ app } = await import('../server/app'));
  async function signUp(username: string) {
    const response = await request('/auth/sign-up/email', 'POST', { username, email: `${username}@example.invalid`,
      name: 'PCACHE-Person', password: 'PCACHE-Fictional-2026!' }, '');
    expect(response.status).toBe(200);
    return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  }
  owner = await signUp('pcacheowner'); other = await signUp('pcacheother');
  userId = (await (await request('/bootstrap')).json()).userId;
});
afterAll(() => { client?.close(); vi.unstubAllEnvs(); });

describe('transactional synchronization matrix', () => {
  it('covers all 18 routes, versions, retries, reassignment, hidden periods and histories', async () => {
    const bank = randomUUID(), bankB = randomUUID(), credit = randomUUID(), disposable = randomUUID();
    const account = (id: string, type = 'bank') => ({ id, name: 'PCACHE-Bank', type, currency: 'ARS', emoji: 'B', color: null });
    for (const [id, type] of [[bank, 'bank'], [bankB, 'bank'], [credit, 'credit'], [disposable, 'bank']]) {
      await sync('/accounts', 'POST', account(id, type), 201);
    }
    await sync(`/accounts/${bank}`, 'PATCH', { name: 'PCACHE-Edited', emoji: 'B', color: '#123456', archived: false, version: 1 });
    await sync(`/accounts/${disposable}`, 'DELETE', { version: 1 });
    const category = await sync('/categories', 'POST', { name: 'PCACHE-Category', emoji: 'C', budgetArs: 0, budgetUsd: 0 }, 201);
    const categoryId = (category.result as { id: string }).id;
    const expense = { id: randomUUID(), concept: 'PCACHE-Expense', accountId: bank, amount: 12345, date: today(), category: 'PCACHE-Category', emoji: 'E', notes: '' };
    await sync('/expenses', 'POST', expense, 201);
    await sync('/expenses', 'POST', expense, 201);
    const edited = await sync(`/expenses/${expense.id}`, 'PUT', { ...expense, accountId: bankB, amount: 23456, version: 1 });
    expect(edited.changes.historyAccountIds.sort()).toEqual([bank, bankB].sort());
    const voided = await sync(`/movements/${expense.id}/void`, 'POST', { version: 2 });
    expect((voided.result as { version: number }).version).toBe(2);
    expect(voided.changes.collections.movements!.upserts[0].version).toBe(3);
    await sync(`/movements/${expense.id}/void`, 'POST', { version: 2 });
    await sync('/incomes', 'POST', { id: randomUUID(), concept: 'PCACHE-Income', accountId: bank, amount: 10000, date: today(), notes: '' }, 201);
    const rule = { id: randomUUID(), name: 'PCACHE-Service', kind: 'service', accountId: bank, amount: 12500,
      dueDay: 15, startDate: `${today().slice(0, 7)}-01`, category: 'PCACHE-Category', emoji: 'R' };
    await sync('/recurring', 'POST', rule, 201);
    let periods = (await snapshot()).occurrences.filter((row) => row.ruleId === rule.id).sort((a, b) => a.period.localeCompare(b.period));
    expect(periods).toHaveLength(3);
    const charge = { id: randomUUID(), date: today(), amount: 14999 };
    await sync(`/occurrences/${encodeURIComponent(periods[0].id)}/charge`, 'POST', charge, 201);
    const retry = await sync(`/occurrences/${encodeURIComponent(periods[0].id)}/charge`, 'POST', charge, 201);
    expect(retry.changes.collections.movements?.upserts.map((row) => row.id)).toEqual([charge.id]);
    expect(retry.changes.collections.accounts?.upserts).toHaveLength(1);
    await sync(`/recurring/${rule.id}`, 'PUT', { ...rule, amount: 17500, active: true, version: 1 });
    periods = (await snapshot()).occurrences.filter((row) => row.ruleId === rule.id).sort((a, b) => a.period.localeCompare(b.period));
    expect(periods[0].amount).toBe(12500); expect(periods[1].amount).toBe(17500);
    await sync(`/recurring/${rule.id}`, 'PUT', { ...rule, active: false, version: 2 });
    await sync(`/recurring/${rule.id}`, 'PUT', { ...rule, active: true, version: 3 });
    periods = (await snapshot()).occurrences.filter((row) => row.ruleId === rule.id).sort((a, b) => a.period.localeCompare(b.period));
    await sync(`/occurrences/${encodeURIComponent(periods[1].id)}/skip`, 'POST', {});
    expect((await request(`/occurrences/${encodeURIComponent(periods[1].id)}/skip?sync=1`, 'POST', {})).status).toBe(409);
    const plan = { id: randomUUID(), name: 'PCACHE-Plan', accountId: credit, total: 30000, count: 3,
      historicalCount: 1, firstDate: `${today().slice(0, 7)}-01`, category: 'PCACHE-Category', emoji: 'P' };
    await sync('/plans', 'POST', plan, 201);
    const installments = (await snapshot()).installments.filter((row) => row.planId === plan.id).sort((a, b) => a.number - b.number);
    expect(installments[0].movementId).toBeNull();
    const installmentCharge = { id: randomUUID(), date: today() };
    await sync(`/installments/${installments[1].id}/charge`, 'POST', installmentCharge, 201);
    const installmentRetry = await sync(`/installments/${installments[1].id}/charge`, 'POST', installmentCharge, 201);
    expect(installmentRetry.changes.collections.movements?.upserts[0].id).toBe(installmentCharge.id);
    await sync(`/plans/${plan.id}/cancel`, 'POST', { version: 1 });
    await sync(`/movements/${installmentCharge.id}/void`, 'POST', { version: 1 });
    expect((await snapshot()).installments.find((row) => row.id === installments[1].id)?.status).toBe('cancelled');
    // A second, deleted rule exercises reassignment without hidden-row resurrection.
    const hidden = { ...rule, id: randomUUID() };
    await sync('/recurring', 'POST', hidden, 201);
    await sync(`/recurring/${hidden.id}`, 'DELETE', { version: 1 });
    const renamed = await sync(`/categories/${categoryId}`, 'PATCH', { name: 'PCACHE-Renamed', emoji: 'C', budgetArs: 10, budgetUsd: 0, version: 1 });
    expect(renamed.changes.collections.recurring?.upserts.map((row) => row.id)).toEqual([rule.id]);
    await sync(`/categories/${categoryId}`, 'DELETE', { version: 2, replacementId: null });
    const currentRule = (await snapshot()).recurring.find((row) => row.id === rule.id)!;
    const deletion = await sync(`/recurring/${rule.id}`, 'DELETE', { version: currentRule.version });
    expect(deletion.changes.collections.occurrences?.removes).toHaveLength(3);
    expect((await snapshot()).movements.some((row) => row.id === charge.id)).toBe(true);
    const hiddenVoid = await sync(`/movements/${charge.id}/void`, 'POST', { version: (await snapshot()).movements.find((row) => row.id === charge.id)!.version });
    expect(hiddenVoid.changes.collections.occurrences).toBeUndefined();
    expect((await snapshot()).occurrences).toEqual([]);
    expect((await request(`/accounts/${bank}?sync=1`, 'DELETE', { version: (await snapshot()).accounts.find((row) => row.id === bank)!.version })).status).toBe(400);
  }, 30_000);
  it('initializes category defaults in the same sync response and preserves the legacy API', async () => {
    const response = await request('/categories?sync=1', 'POST', { name: 'PCACHE-New', emoji: 'C', budgetArs: 0, budgetUsd: 0 }, other);
    expect(response.status).toBe(201);
    const body = parseFinanceSyncResponse(await response.json(), z.unknown());
    expect(body.changes.collections.categories?.upserts).toHaveLength(10);
    const legacy = await request('/accounts?month=invalid', 'POST', { id: randomUUID(), name: 'PCACHE-Legacy', type: 'bank', currency: 'ARS', emoji: 'B' });
    expect(legacy.status).toBe(201);
    expect(await legacy.json()).not.toHaveProperty('changes');
  });
  it('rejects invalid sync metadata before writing and retains unwrapped ownership errors', async () => {
    const before = await snapshot();
    for (const invalid of ['bad', '1999-12', '2101-01']) {
      const response = await request(`/accounts?sync=1&month=${invalid}`, 'POST', { id: randomUUID(), name: 'PCACHE-Invalid', type: 'bank', currency: 'ARS', emoji: 'B' });
      expect(response.status).toBe(400); expect(await response.json()).toHaveProperty('error');
    }
    expect(normalized(await snapshot())).toEqual(normalized(before));
    const denied = await request(`/accounts/${before.accounts[0].id}?sync=1`, 'PATCH', { name: 'PCACHE-Other', emoji: 'B', archived: false, version: before.accounts[0].version }, other);
    expect(denied.status).toBe(404); expect(await denied.json()).not.toHaveProperty('changes');
    expect((await request('/accounts?sync=1', 'POST', {}, '')).status).toBe(401);
    for (const valid of ['2000-01', '2100-12']) {
      expect((await request(`/accounts?sync=1&month=${valid}`, 'POST', { id: randomUUID(), name: 'PCACHE-Boundary', type: 'bank', currency: 'USD', emoji: 'B' })).status).toBe(201);
    }
  });
  it('rolls back writes, postings and account versions when collection fails before commit', async () => {
    const { synchronize } = await import('../server/finance-sync');
    const { createExpenseInTransaction } = await import('../server/service');
    const before = await snapshot();
    const postings = await client.execute('SELECT * FROM posting ORDER BY id');
    const input = { id: randomUUID(), concept: 'PCACHE-Rollback', accountId: before.accounts.find((row) => row.type === 'bank')!.id,
      amount: 12345, date: today(), category: 'General', emoji: 'E', notes: '' };
    await expect(synchronize(db, userId, 'createExpense', [input], month,
      (tx) => createExpenseInTransaction(tx, userId, input), () => { throw new Error('PCACHE-fault'); })).rejects.toThrow('PCACHE-fault');
    expect(normalized(await snapshot())).toEqual(normalized(before));
    expect((await client.execute('SELECT * FROM posting ORDER BY id')).rows).toEqual(postings.rows);
  });
});
