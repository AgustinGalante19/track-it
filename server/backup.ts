import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client';
import * as s from './db/schema';
import { accountInputSchema, recurringInputSchema, planInputSchema, currencySchema, dateSchema, idSchema, signedMoneySchema, moneySchema, monthSchema, today } from '../shared/domain';
import { DomainError } from './service';

const state = { version: z.number().int().min(1) };
const short = z.string().trim().min(1).max(80);
const movementSchema = z.object({
  id: idSchema, kind: z.enum(['expense', 'income', 'transfer', 'adjustment']), concept: z.string().trim().max(80),
  date: dateSchema, amount: moneySchema, currency: currencySchema, accountId: idSchema,
  destinationId: idSchema.nullable(), receivedAmount: moneySchema.nullable(), destinationCurrency: currencySchema.nullable(),
  direction: z.enum(['outgoing', 'incoming']), classification: z.enum(['expense', 'income', 'neutral']),
  counterpart: z.string().max(80), fee: signedMoneySchema.nonnegative(), expenseAmount: signedMoneySchema.nonnegative(),
  category: short, emoji: z.string().min(1).max(16), notes: z.string().max(500),
  sourceType: z.enum(['single', 'installment', 'recurring']), sourceId: z.string().max(80).nullable(),
  ...state, voided: z.boolean(), createdAt: z.string().datetime(),
}).refine((movement) => movement.kind === 'expense' || movement.concept.length > 0, { path: ['concept'], message: 'Escribí un concepto.' });
const backupSchema = z.object({
  format: z.literal('no-gastes-de-mas'), version: z.literal(1), exportedAt: z.string().datetime(),
  accounts: z.array(accountInputSchema.extend({ archived: z.boolean(), ...state })).max(200),
  movements: z.array(movementSchema).max(10000),
  postings: z.array(z.object({ id: idSchema, movementId: idSchema, accountId: idSchema, delta: signedMoneySchema })).max(20000),
  recurring: z.array(recurringInputSchema.extend({ active: z.boolean(), deleted: z.boolean().default(false), ...state, generationFrom: dateSchema.nullable() })).max(500),
  occurrences: z.array(z.object({ id: z.string().max(80), ruleId: idSchema, period: monthSchema, name: short, emoji: z.string().min(1).max(16), category: short, accountId: idSchema, amount: moneySchema, dueDate: dateSchema, status: z.enum(['pending', 'paid', 'skipped']), movementId: idSchema.nullable() })).max(10000),
  plans: z.array(planInputSchema.extend({ active: z.boolean(), ...state })).max(1000),
  installments: z.array(z.object({ id: idSchema, planId: idSchema, number: z.number().int().min(1).max(60), amount: moneySchema, dueDate: dateSchema, status: z.enum(['pending', 'charged', 'historical', 'cancelled']), movementId: idSchema.nullable() })).max(10000),
  categories: z.array(z.object({ id: idSchema, name: short, emoji: z.string().min(1).max(16), budgetArs: signedMoneySchema.nonnegative().default(0), budgetUsd: signedMoneySchema.nonnegative().default(0), version: z.number().int().min(1).default(1) })).max(500),
});
function withoutOwner<T extends { userId: string }>(rows: T[]) { return rows.map(({ userId, ...rest }) => rest); }
export async function exportBackup(db: Database, userId: string) {
  return db.transaction(async (tx) => {
    const accounts = await tx.select().from(s.financeAccounts).where(eq(s.financeAccounts.userId, userId));
    const movements = await tx.select().from(s.movements).where(eq(s.movements.userId, userId));
    const postingRows = await tx.select({ posting: s.postings }).from(s.postings).innerJoin(s.movements, eq(s.movements.id, s.postings.movementId)).where(eq(s.movements.userId, userId));
    return {
      format: 'no-gastes-de-mas', version: 1, exportedAt: new Date().toISOString(), accounts: withoutOwner(accounts), movements: withoutOwner(movements), postings: postingRows.map((p) => p.posting),
      recurring: withoutOwner(await tx.select().from(s.recurring).where(eq(s.recurring.userId, userId))),
      occurrences: withoutOwner(await tx.select().from(s.occurrences).where(eq(s.occurrences.userId, userId))),
      plans: withoutOwner(await tx.select().from(s.plans).where(eq(s.plans.userId, userId))),
      installments: withoutOwner(await tx.select().from(s.installments).where(eq(s.installments.userId, userId))),
      categories: withoutOwner(await tx.select().from(s.categories).where(eq(s.categories.userId, userId))),
    };
  });
}
export async function restoreBackup(db: Database, userId: string, raw: unknown) {
  const b = backupSchema.parse(raw);
  const fail = () => { throw new DomainError('El respaldo tiene relaciones o importes inconsistentes. No se reemplazó ningún dato.'); };
  const accounts = new Map(b.accounts.map((a) => [a.id, a])); const movements = new Map(b.movements.map((m) => [m.id, m]));
  const rules = new Map(b.recurring.map((r) => [r.id, r])); const plans = new Map(b.plans.map((p) => [p.id, p]));
  for (const rows of [b.accounts, b.movements, b.postings, b.recurring, b.occurrences, b.plans, b.installments, b.categories]) if (new Set(rows.map((r) => r.id)).size !== rows.length) fail();
  for (const m of b.movements) {
    const account = accounts.get(m.accountId), destination = m.destinationId ? accounts.get(m.destinationId) : null;
    if (!account || m.currency !== account.currency || m.date > today() || m.destinationId && !destination || destination && (m.destinationCurrency !== destination.currency || m.accountId === m.destinationId)) fail();
    const lines = b.postings.filter((p) => p.movementId === m.id);
    const originLine = lines.find((p) => p.accountId === m.accountId);
    if (!originLine || lines.length !== (destination ? 2 : 1) || m.kind !== 'transfer' && destination) fail();
    const expectedOrigin = m.kind === 'expense' ? account!.type === 'credit' ? m.amount : -m.amount : m.kind === 'income' ? m.amount : (m.direction === 'incoming' ? m.amount : -m.amount) - m.fee;
    if (originLine!.delta !== expectedOrigin) fail();
    if (m.kind === 'expense' && m.expenseAmount !== m.amount || ['income', 'adjustment'].includes(m.kind) && m.expenseAmount !== 0) fail();
    if (m.kind === 'transfer') {
      if (account!.type === 'credit' || m.expenseAmount !== m.fee + (!destination && m.classification === 'expense' ? m.amount : 0)) fail();
      if (destination) {
        if (m.classification !== 'neutral' || m.direction !== 'outgoing' || !m.receivedAmount || destination.currency === m.currency && m.receivedAmount !== m.amount) fail();
        const destinationLine = lines.find((p) => p.accountId === destination.id);
        if (!destinationLine || destinationLine.delta !== (destination.type === 'credit' ? -m.receivedAmount! : m.receivedAmount!)) fail();
      }
    }
  }
  for (const p of b.postings) if (!accounts.has(p.accountId) || !movements.has(p.movementId)) fail();
  for (const r of b.recurring) if (!accounts.has(r.accountId) || r.deleted && r.active) fail();
  for (const p of b.plans) {
    if (!accounts.has(p.accountId)) fail();
    const rows = b.installments.filter((i) => i.planId === p.id);
    if (rows.length !== p.count || rows.reduce((sum, i) => sum + i.amount, 0) !== p.total || new Set(rows.map((i) => i.number)).size !== rows.length || rows.some((i) => i.number > p.count)) fail();
  }
  const uniquePeriods = new Set<string>();
  for (const o of b.occurrences) {
    if (!rules.has(o.ruleId) || rules.get(o.ruleId)?.deleted && o.status === 'pending' || !accounts.has(o.accountId) || o.period !== o.dueDate.slice(0, 7) || uniquePeriods.has(`${o.ruleId}:${o.period}`)) fail();
    uniquePeriods.add(`${o.ruleId}:${o.period}`);
    const m = o.movementId ? movements.get(o.movementId) : null;
    if ((o.status === 'paid') !== !!o.movementId || o.movementId && !m || m && (m.voided || m.sourceId !== o.id || m.sourceType !== 'recurring' || m.accountId !== o.accountId)) fail();
  }
  for (const i of b.installments) {
    if (!plans.has(i.planId)) fail(); const m = i.movementId ? movements.get(i.movementId) : null;
    if ((i.status === 'charged') !== !!i.movementId || i.movementId && !m || m && (m.voided || m.sourceId !== i.id || m.sourceType !== 'installment' || m.amount !== i.amount)) fail();
  }
  // Remapear todos los identificadores permite restaurar en otra cuenta personal sin colisiones ni acceso ajeno.
  const ids = new Map<string, string>();
  for (const rows of [b.accounts, b.movements, b.postings, b.recurring, b.plans, b.installments, b.categories]) for (const row of rows) ids.set(row.id, randomUUID());
  for (const o of b.occurrences) ids.set(o.id, `${ids.get(o.ruleId)}:${o.period}`);
  const id = (old: string) => { const result = ids.get(old); if (!result) fail(); return result!; };
  await db.transaction(async (tx) => {
    await tx.delete(s.occurrences).where(eq(s.occurrences.userId, userId)); await tx.delete(s.installments).where(eq(s.installments.userId, userId));
    const oldMovements = await tx.select({ id: s.movements.id }).from(s.movements).where(eq(s.movements.userId, userId));
    for (let n = 0; n < oldMovements.length; n += 100) await tx.delete(s.postings).where(inArray(s.postings.movementId, oldMovements.slice(n, n + 100).map((m) => m.id)));
    await tx.delete(s.movements).where(eq(s.movements.userId, userId)); await tx.delete(s.recurring).where(eq(s.recurring.userId, userId));
    await tx.delete(s.plans).where(eq(s.plans.userId, userId)); await tx.delete(s.categories).where(eq(s.categories.userId, userId)); await tx.delete(s.financeAccounts).where(eq(s.financeAccounts.userId, userId));
    // Inserciones en lotes pequeños para respetar el límite de variables de SQLite.
    const batches = async <T,>(rows: T[], insert: (rows: T[]) => Promise<unknown>) => { for (let n = 0; n < rows.length; n += 20) await insert(rows.slice(n, n + 20)); };
    await batches(b.accounts.map((a) => ({ ...a, id: id(a.id), userId })), async (rows) => tx.insert(s.financeAccounts).values(rows));
    await batches(b.recurring.map((r) => ({ ...r, id: id(r.id), accountId: id(r.accountId), userId })), async (rows) => tx.insert(s.recurring).values(rows));
    await batches(b.plans.map((p) => ({ ...p, id: id(p.id), accountId: id(p.accountId), userId })), async (rows) => tx.insert(s.plans).values(rows));
    await batches(b.movements.map((m) => ({ ...m, id: id(m.id), accountId: id(m.accountId), destinationId: m.destinationId ? id(m.destinationId) : null, sourceId: m.sourceId ? id(m.sourceId) : null, userId })), async (rows) => tx.insert(s.movements).values(rows));
    await batches(b.postings.map((p) => ({ ...p, id: id(p.id), movementId: id(p.movementId), accountId: id(p.accountId) })), async (rows) => tx.insert(s.postings).values(rows));
    await batches(b.occurrences.map((o) => ({ ...o, id: id(o.id), ruleId: id(o.ruleId), accountId: id(o.accountId), movementId: o.movementId ? id(o.movementId) : null, userId })), async (rows) => tx.insert(s.occurrences).values(rows));
    await batches(b.installments.map((i) => ({ ...i, id: id(i.id), planId: id(i.planId), movementId: i.movementId ? id(i.movementId) : null, userId })), async (rows) => tx.insert(s.installments).values(rows));
    await batches(b.categories.map((c) => ({ ...c, id: id(c.id), userId })), async (rows) => tx.insert(s.categories).values(rows));
    await tx.insert(s.categoryState).values({ userId }).onConflictDoNothing();
  });
  return { ok: true };
}
