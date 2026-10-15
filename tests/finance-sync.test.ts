import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { financeChangesSchema, financeRecordSchemas, parseFinanceSyncResponse } from '../shared/finance-sync';
import { buildInfo } from '../src/lib/build-info';
import { getUpdateBlocked, setUpdateBlocked, subscribeUpdateSafety } from '../src/lib/update-safety';

const account = { id: 'account', userId: 'owner', name: 'PCACHE-Bank', type: 'bank', currency: 'ARS',
  emoji: 'B', color: null, archived: false, version: 2 };
const movement = { id: 'movement', userId: 'owner', kind: 'expense', concept: 'PCACHE-Expense', date: '2026-10-13',
  amount: 12345, currency: 'ARS', accountId: 'account', destinationId: null, receivedAmount: null,
  destinationCurrency: null, direction: 'outgoing', classification: 'expense', counterpart: '', fee: 0,
  expenseAmount: 12345, category: 'General', emoji: 'E', notes: '', sourceType: 'single', sourceId: null,
  version: 1, voided: false, createdAt: '2026-10-13T12:00:00.000Z' };
const changes = { version: 1, collections: { accounts: { upserts: [account], removes: [] },
  movements: { upserts: [movement], removes: [] } }, historyAccountIds: ['account'] };

describe('financial synchronization wire contract', () => {
  it('preserves complete canonical records and independently validates the legacy result', () => {
    const parsed = parseFinanceSyncResponse({ result: { ok: true }, changes }, z.object({ ok: z.literal(true) }));
    expect(parsed.changes).toEqual(changes);
    expect(() => parseFinanceSyncResponse({ result: {}, changes }, z.object({ ok: z.literal(true) }))).toThrow();
  });
  it('accepts empty changes, deletes and category reassignment', () => {
    expect(financeChangesSchema.parse({ version: 1, collections: {}, historyAccountIds: [] }).collections).toEqual({});
    expect(financeChangesSchema.parse({ version: 1, collections: {
      recurring: { upserts: [], removes: ['rule'] }, occurrences: { upserts: [], removes: ['period1', 'period2'] },
    }, historyAccountIds: ['account'] }).collections.recurring?.removes).toEqual(['rule']);
    const renamed = { ...changes, collections: { ...changes.collections,
      movements: { upserts: [{ ...movement, category: 'PCACHE-Renamed', version: 2 }], removes: [] },
      categories: { upserts: [{ id: 'category', userId: 'owner', name: 'PCACHE-Renamed', emoji: 'E',
        budgetArs: 0, budgetUsd: 0, version: 2 }], removes: [] },
    } };
    expect(financeChangesSchema.parse(renamed)).toEqual(renamed);
  });
  it.each([
    { ...changes, version: 2 },
    { ...changes, historyAccountIds: ['account', 'account'] },
    { ...changes, collections: { postings: { upserts: [], removes: [] } } },
    { ...changes, collections: { accounts: { upserts: [account, account], removes: [] } } },
    { ...changes, collections: { accounts: { upserts: [account], removes: ['account'] } } },
    { ...changes, collections: { accounts: { upserts: [], removes: ['account', 'account'] } } },
    { ...changes, collections: { accounts: { upserts: [{ id: 'account' }], removes: [] } } },
    { ...changes, collections: { movements: { upserts: [{ ...movement, amount: 1.5 }], removes: [] } } },
  ])('rejects invalid envelopes', (value) => { expect(financeChangesSchema.safeParse(value).success).toBe(false); });
  it('requires every returned record field and accepts persisted resume dates', () => {
    for (const key of Object.keys(movement)) {
      const incomplete = { ...movement } as Record<string, unknown>;
      delete incomplete[key];
      expect(financeRecordSchemas.movements.safeParse(incomplete).success).toBe(false);
    }
    expect(financeRecordSchemas.recurring.parse({ id: 'rule', userId: 'owner', name: 'PCACHE-Service', emoji: 'E',
      category: 'General', accountId: 'account', kind: 'service', amount: 12500, dueDay: 15, startDate: '2026-10-01',
      active: true, deleted: false, version: 2, generationFrom: '2026-11-01' }).generationFrom).toBe('2026-11-01');
  });
  it('keeps ownership enforcement separate from structural validation', () => {
    expect(financeRecordSchemas.accounts.parse({ ...account, userId: 'other' }).userId).toBe('other');
  });
});
it('exposes stable update safety interfaces with subscription cleanup', () => {
  expect(buildInfo.id).toBeTruthy();
  const values: boolean[] = [];
  const unsubscribe = subscribeUpdateSafety(() => values.push(getUpdateBlocked()));
  setUpdateBlocked(true); setUpdateBlocked(true); setUpdateBlocked(false);
  unsubscribe(); setUpdateBlocked(true); setUpdateBlocked(false);
  expect(values).toEqual([true, false]); expect(getUpdateBlocked()).toBe(false);
});
