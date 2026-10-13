import { z } from 'zod';
import type { Snapshot } from './domain';
import type { AuthUser } from './auth';
import { currencySchema, accountTypeSchema, dateSchema, monthSchema } from './domain';

export type CollectionDelta<T> = { upserts: T[]; removes: string[] };
export type FinanceChanges = {
  version: 1;
  collections: { [K in keyof Snapshot]?: CollectionDelta<Snapshot[K][number]> };
  historyAccountIds: string[];
};
export type FinanceSyncResponse<T> = { result: T; changes: FinanceChanges };
export type FinanceBootstrap = { data: Snapshot; user: AuthUser; userId: string };

// Persisted records differ from form inputs: never default a missing wire field.
const id = z.string().min(1);
const integer = z.number().int().safe();
const version = integer.min(1);
const owned = { id, userId: id };
const named = { name: z.string(), emoji: z.string(), category: z.string(), accountId: id };
export const financeRecordSchemas = {
  accounts: z.object({ ...owned, name: z.string(), type: accountTypeSchema, currency: currencySchema,
    emoji: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(), archived: z.boolean(), version }),
  movements: z.object({ ...owned, kind: z.enum(['expense', 'income', 'transfer', 'adjustment']),
    concept: z.string(), date: dateSchema, amount: integer, currency: currencySchema, accountId: id,
    destinationId: id.nullable(), receivedAmount: integer.nullable(), destinationCurrency: currencySchema.nullable(),
    direction: z.enum(['outgoing', 'incoming']), classification: z.enum(['expense', 'income', 'neutral']),
    counterpart: z.string(), fee: integer, expenseAmount: integer, category: z.string(), emoji: z.string(),
    notes: z.string(), sourceType: z.enum(['single', 'installment', 'recurring']), sourceId: id.nullable(),
    version, voided: z.boolean(), createdAt: z.string().min(1) }),
  recurring: z.object({ ...owned, ...named, kind: z.enum(['subscription', 'service']), amount: integer,
    dueDay: integer.min(1).max(31), startDate: dateSchema, active: z.boolean(), deleted: z.boolean(),
    version, generationFrom: dateSchema.nullable() }),
  occurrences: z.object({ ...owned, ...named, ruleId: id, period: monthSchema, amount: integer,
    dueDate: dateSchema, status: z.enum(['pending', 'paid', 'skipped']), movementId: id.nullable() }),
  plans: z.object({ ...owned, ...named, total: integer, count: integer.min(2).max(60), firstDate: dateSchema,
    historicalCount: integer.min(0), active: z.boolean(), version }),
  installments: z.object({ ...owned, planId: id, number: integer.min(1), amount: integer, dueDate: dateSchema,
    status: z.enum(['pending', 'charged', 'historical', 'cancelled']), movementId: id.nullable() }),
  // Category rows currently include userId even though Category's public type omits it.
  categories: z.object({ id, userId: id.optional(), name: z.string(), emoji: z.string(),
    budgetArs: integer.nonnegative(), budgetUsd: integer.nonnegative(), version }),
};
const uniqueIds = z.array(id).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs');
function delta<T extends z.ZodType<{ id: string }>>(record: T) {
  return z.strictObject({ upserts: z.array(record), removes: uniqueIds }).superRefine((value, ctx) => {
    const ids = value.upserts.map((row) => row.id);
    if (new Set(ids).size !== ids.length || value.removes.some((item) => ids.includes(item))) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate or overlapping IDs' });
    }
  });
}
export const financeChangesSchema = z.strictObject({
  version: z.literal(1),
  collections: z.strictObject({
    accounts: delta(financeRecordSchemas.accounts).optional(), movements: delta(financeRecordSchemas.movements).optional(),
    recurring: delta(financeRecordSchemas.recurring).optional(), occurrences: delta(financeRecordSchemas.occurrences).optional(),
    plans: delta(financeRecordSchemas.plans).optional(), installments: delta(financeRecordSchemas.installments).optional(),
    categories: delta(financeRecordSchemas.categories).optional(),
  }),
  historyAccountIds: uniqueIds,
});
export function parseFinanceSyncResponse<T>(value: unknown, resultSchema: z.ZodType<T>): FinanceSyncResponse<T> {
  return z.strictObject({ result: resultSchema, changes: financeChangesSchema }).parse(value);
}
