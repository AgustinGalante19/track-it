import { accountDeletionScope } from './account-deletion';
import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from './db/client';
import * as s from './db/schema';
import { financeChangesSchema, type FinanceChanges, type FinanceSyncResponse } from '../shared/finance-sync';
import { today, type Snapshot } from '../shared/domain';
import { materializeOccurrences } from './service';
import { timedTransaction } from './timing';

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];
type Key = keyof Snapshot;
export type SyncOperation = 'createAccount' | 'editAccount' | 'deleteAccount' | 'createExpense' | 'editExpense'
  | 'createIncome' | 'voidMovement' | 'createRecurring' | 'updateRecurring' | 'deleteRecurring'
  | 'chargeOccurrence' | 'skipOccurrence' | 'createPlan' | 'chargeInstallment' | 'cancelPlan'
  | 'createCategory' | 'editCategory' | 'deleteCategory';
const requestScope = new AsyncLocalStorage<{ month: string }>();
export const withFinanceSync = <T>(month: string, next: () => Promise<T>) => requestScope.run({ month }, next);
export const getSyncMonth = () => requestScope.getStore()?.month;
const tables = { accounts: s.financeAccounts, movements: s.movements, recurring: s.recurring,
  occurrences: s.occurrences, plans: s.plans, installments: s.installments, categories: s.categories };
const keys = Object.keys(tables) as Key[];
const primary: Record<SyncOperation, Key> = {
  createAccount: 'accounts', editAccount: 'accounts', deleteAccount: 'accounts', createExpense: 'movements',
  editExpense: 'movements', createIncome: 'movements', voidMovement: 'movements', createRecurring: 'recurring',
  updateRecurring: 'recurring', deleteRecurring: 'recurring', chargeOccurrence: 'occurrences', skipOccurrence: 'occurrences',
  createPlan: 'plans', chargeInstallment: 'installments', cancelPlan: 'plans',
  createCategory: 'categories', editCategory: 'categories', deleteCategory: 'categories',
};
type Row = Snapshot[Key][number];

/** Collect only operation-related rows, within the mutation's transaction. Never call bootstrap. */
export async function synchronize<T>(db: Database, userId: string, operation: SyncOperation,
  args: readonly unknown[], month: string, execute: (tx: Executor) => Promise<T>,
  beforeCommit?: () => void | Promise<void>): Promise<FinanceSyncResponse<T>> {
  return timedTransaction(db, async (tx) => {
    const ids = Object.fromEntries(keys.map((key) => [key, new Set<string>()])) as Record<Key, Set<string>>;
    const input = (typeof args[0] === 'object' ? args[0] : args[1]) as { id?: string; accountId?: string } | undefined;
    const id = typeof args[0] === 'string' ? args[0] : input?.id;
    const collection = primary[operation];
    if (id) ids[collection].add(id);
    if (input?.accountId) ids.accounts.add(input.accountId);
    const history = new Set<string>();
    const categoryCreate = operation === 'createCategory';
    async function read<K extends Key>(key: K, condition?: SQL): Promise<Snapshot[K]> {
      if (!condition) return [] as unknown as Snapshot[K];
      const table = tables[key];
      const visible = key === 'recurring' ? eq(s.recurring.deleted, false)
        : key === 'occurrences' ? inArray(s.occurrences.ruleId,
          tx.select({ id: s.recurring.id }).from(s.recurring).where(and(eq(s.recurring.userId, userId), eq(s.recurring.deleted, false)))) : undefined;
      return await tx.select().from(table).where(and(eq(table.userId, userId), visible, condition)) as unknown as Snapshot[K];
    }
    function selection(key: Key): SQL | undefined {
      const conditions: (SQL | undefined)[] = [ids[key].size ? inArray(tables[key].id, [...ids[key]]) : undefined];
      if (collection === 'recurring' && key === 'occurrences' && id) conditions.push(eq(s.occurrences.ruleId, id));
      if (collection === 'plans' && key === 'installments' && id) conditions.push(eq(s.installments.planId, id));
      if (categoryCreate && key === 'categories') conditions.push(sql`1 = 1`);
      return or(...conditions);
    }
    if (operation === 'deleteAccount' && id) {
      // Scope only an owned account, including both sides of legacy transfers.
      if ((await read('accounts', eq(s.financeAccounts.id, id))).length) {
        const scope = await accountDeletionScope(tx, userId, id);
        for (const key of ['accounts', 'movements', 'recurring', 'plans', 'occurrences', 'installments'] as const) {
          for (const rowId of scope[key]) ids[key].add(rowId);
        }
        for (const rowId of scope.retainedOccurrences) ids.occurrences.add(rowId);
        for (const rowId of scope.retainedInstallments) ids.installments.add(rowId);
      }
    }
    // Reassignment keeps the old IDs, so canonical rereads use IDs after names change.
    if (collection === 'categories' && id) {
      const [category] = await read('categories', eq(s.categories.id, id));
      if (category) for (const key of ['movements', 'recurring', 'occurrences', 'plans'] as const) {
        for (const row of await read(key, eq(tables[key].category, category.name))) ids[key].add(row.id);
      }
    }
    async function expandReferences() {
      const movements = await read('movements', selection('movements'));
      for (const row of movements) {
        if (row.sourceId && row.sourceType === 'recurring') ids.occurrences.add(row.sourceId);
        if (row.sourceId && row.sourceType === 'installment') ids.installments.add(row.sourceId);
      }
      const periods = await read('occurrences', selection('occurrences'));
      const installments = await read('installments', selection('installments'));
      for (const row of [...periods, ...installments]) if (row.movementId) ids.movements.add(row.movementId);
      // Plans are read here only to identify history accounts; unchanged plans aren't emitted.
      const planIds = [...new Set(installments.map((row) => row.planId))];
      const relatedPlans = await read('plans', planIds.length ? inArray(s.plans.id, planIds) : undefined);
      const rules = await read('recurring', selection('recurring'));
      const plans = await read('plans', selection('plans'));
      for (const row of [...movements, ...periods, ...relatedPlans, ...rules, ...plans]) ids.accounts.add(row.accountId);
      if (ids.movements.size) {
        const lines = await tx.select({ accountId: s.postings.accountId }).from(s.postings)
          .innerJoin(s.movements, eq(s.movements.id, s.postings.movementId))
          .where(and(eq(s.movements.userId, userId), inArray(s.movements.id, [...ids.movements])));
        for (const row of lines) ids.accounts.add(row.accountId);
      }
      // Ownership-filter history IDs even when a request names another user's account.
      for (const row of await read('accounts', selection('accounts'))) history.add(row.id);
    }
    await expandReferences();
    const before = new Map<Key, Row[]>();
    for (const key of keys) before.set(key, await read(key, selection(key)));
    const result = await execute(tx);
    if ((operation === 'createRecurring' || operation === 'updateRecurring') && id) {
      await materializeOccurrences(tx, userId, month > today().slice(0, 7) ? month : today().slice(0, 7), id);
    }
    await expandReferences();
    const changes: FinanceChanges = { version: 1, collections: {}, historyAccountIds: [] };
    const forcePayment = operation === 'chargeOccurrence' || operation === 'chargeInstallment';
    const forceRetry = ['createAccount', 'createExpense', 'createIncome', 'voidMovement', 'createRecurring', 'createPlan'].includes(operation);
    for (const key of keys) {
      const after = await read(key, selection(key));
      const previous = new Map(before.get(key)!.map((row) => [row.id, row]));
      const currentIds = new Set(after.map((row) => row.id));
      const upserts = after.filter((row) => JSON.stringify(previous.get(row.id)) !== JSON.stringify(row)
        || (forcePayment && (key === 'movements' || key === 'accounts' || key === collection))
        || (forceRetry && (key === collection || key === 'accounts'
          || (operation === 'createPlan' && key === 'installments') || (operation === 'createRecurring' && key === 'occurrences'))));
      const removes = [...previous.keys()].filter((rowId) => !currentIds.has(rowId));
      if (upserts.length || removes.length) {
        // Each scoped query is typed by its collection; this assignment bridges mapped-type indexing.
        Object.assign(changes.collections, { [key]: { upserts, removes } });
      }
    }
    // Category operations invalidate only histories containing reassigned movements.
    if (collection === 'categories') {
      history.clear();
      for (const row of changes.collections.movements?.upserts ?? []) {
        history.add(row.accountId);
        if (row.destinationId) history.add(row.destinationId);
      }
    }
    changes.historyAccountIds = [...history];
    const validated = financeChangesSchema.parse(changes);
    await beforeCommit?.();
    return { result, changes: validated };
  });
}
