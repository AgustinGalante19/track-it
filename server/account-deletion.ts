import { and, eq, inArray, or } from 'drizzle-orm';
import type { Database } from './db/client';
import * as s from './db/schema';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Capture dependent IDs before deleting so mutations and sync use the same scope. */
export async function accountDeletionScope(tx: Executor, userId: string, accountId: string) {
  const rules = await tx.select().from(s.recurring).where(and(eq(s.recurring.userId, userId), eq(s.recurring.accountId, accountId)));
  const plans = await tx.select().from(s.plans).where(and(eq(s.plans.userId, userId), eq(s.plans.accountId, accountId)));
  const recurring = rules.map((row) => row.id), planIds = plans.map((row) => row.id);
  const periods = await tx.select().from(s.occurrences).where(and(eq(s.occurrences.userId, userId), or(
    eq(s.occurrences.accountId, accountId), inArray(s.occurrences.ruleId, recurring),
  )));
  const installments = await tx.select().from(s.installments).where(and(eq(s.installments.userId, userId), inArray(s.installments.planId, planIds)));
  const occurrenceIds = periods.map((row) => row.id), installmentIds = installments.map((row) => row.id);
  const linkedPayments = [...periods, ...installments].flatMap((row) => row.movementId ? [row.movementId] : []);
  const entries = await tx.select().from(s.movements).where(and(eq(s.movements.userId, userId), or(
    eq(s.movements.accountId, accountId), eq(s.movements.destinationId, accountId),
    inArray(s.movements.id, linkedPayments),
    inArray(s.movements.id, tx.select({ id: s.postings.movementId }).from(s.postings).where(eq(s.postings.accountId, accountId))),
    and(eq(s.movements.sourceType, 'recurring'), inArray(s.movements.sourceId, occurrenceIds)),
    and(eq(s.movements.sourceType, 'installment'), inArray(s.movements.sourceId, installmentIds)),
  )));
  const movementIds = entries.map((row) => row.id);
  // A paid period can still belong to another account after a rule was edited.
  // Keep that schedule and reopen its payment rather than leaving a dangling FK.
  const linkedPeriods = await tx.select().from(s.occurrences).where(and(eq(s.occurrences.userId, userId), inArray(s.occurrences.movementId, movementIds)));
  const linkedInstallments = await tx.select().from(s.installments).where(and(eq(s.installments.userId, userId), inArray(s.installments.movementId, movementIds)));
  const lines = await tx.select().from(s.postings).where(inArray(s.postings.movementId, movementIds));
  const accountIds = [...new Set([accountId, ...entries.flatMap((row) => [row.accountId, ...(row.destinationId ? [row.destinationId] : [])]), ...lines.map((row) => row.accountId)])];
  return {
    recurring, plans: planIds, movements: movementIds,
    occurrences: occurrenceIds, installments: installmentIds, accounts: accountIds,
    retainedOccurrences: linkedPeriods.filter((row) => !occurrenceIds.includes(row.id)).map((row) => row.id),
    retainedInstallments: linkedInstallments.filter((row) => !installmentIds.includes(row.id)).map((row) => row.id),
  };
}
