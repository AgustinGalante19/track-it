import { randomUUID } from 'node:crypto';
import { and, eq, getTableColumns, gt, lte, sql } from 'drizzle-orm';
import type { Database } from './db/client';
import * as s from './db/schema';
import { addMonth, monthDate, splitInstallments, today, MAX_MONEY } from '../shared/domain';
import { initializeCategories } from './categories';
import type { AccountInput, ExpenseInput, RecurringInput, PlanInput, Movement, Snapshot } from '../shared/domain';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
function checkDate(date: string) { if (date > today()) throw new DomainError('La fecha de un movimiento registrado no puede ser futura.'); }
async function ownedAccount(tx: Executor, userId: string, id: string, includeArchived = false) {
  const [account] = await tx.select().from(s.financeAccounts).where(and(eq(s.financeAccounts.id, id), eq(s.financeAccounts.userId, userId)));
  if (!account) throw new DomainError('No se encontró la cuenta.', 404);
  if (account.archived && !includeArchived) throw new DomainError('La cuenta está archivada.');
  return account;
}
function baseMovement(userId: string, input: { id: string; concept: string; accountId: string; amount: number; date: string; notes?: string }, currency: 'ARS' | 'USD'): Movement {
  checkDate(input.date);
  return { ...input, userId, currency, kind: 'expense', destinationId: null, destinationCurrency: null, receivedAmount: null,
    direction: 'outgoing', classification: 'expense', counterpart: '', fee: 0, expenseAmount: input.amount, category: 'General', emoji: '🛍️', notes: input.notes || '',
    sourceType: 'single', sourceId: null, version: 1, voided: false, createdAt: new Date().toISOString() };
}
async function existingMovement(tx: Executor, userId: string, id: string) {
  const [movement] = await tx.select().from(s.movements).where(eq(s.movements.id, id));
  if (movement && movement.userId !== userId) throw new DomainError('Identificador no disponible.', 409);
  return movement;
}
function verifyRetry(existing: Movement, input: Record<string, unknown>, kind: Movement['kind']) {
  if (existing.voided || existing.kind !== kind || Object.entries(input).some(([key, value]) => key in existing && (existing as unknown as Record<string, unknown>)[key] !== value)) throw new DomainError('Este envío ya se guardó con otros datos. Actualizá para revisar el movimiento antes de crear uno nuevo.', 409);
  return existing;
}
async function insertMovement(tx: Executor, movement: Movement, lines: { accountId: string; delta: number }[]) {
  const combined = new Map<string, number>();
  for (const line of lines) combined.set(line.accountId, (combined.get(line.accountId) || 0) + line.delta);
  if (Math.abs(movement.expenseAmount) > MAX_MONEY || [...combined.values()].some((v) => !Number.isSafeInteger(v) || Math.abs(v) > MAX_MONEY)) throw new DomainError('El importe supera el máximo permitido.');
  await tx.insert(s.movements).values(movement);
  await tx.insert(s.postings).values([...combined].map(([accountId, delta]) => ({ id: randomUUID(), movementId: movement.id, accountId, delta })));
  for (const accountId of combined.keys()) {
    await ownedAccount(tx, movement.userId, accountId);
    await tx.update(s.financeAccounts).set({ version: sql`${s.financeAccounts.version} + 1` }).where(eq(s.financeAccounts.id, accountId));
  }
  return movement;
}
export async function createAccount(db: Database, userId: string, input: AccountInput) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(s.financeAccounts).where(eq(s.financeAccounts.id, input.id));
    if (existing) { if (existing.userId !== userId) throw new DomainError('Identificador no disponible.', 409); return existing; }
    const [account] = await tx.insert(s.financeAccounts).values({ ...input, userId }).returning();
    return account;
  });
}
export async function editAccount(db: Database, userId: string, id: string, input: { name: string; emoji: string; color?: string | null; archived: boolean; version: number }) {
  return db.transaction(async (tx) => {
    const account = await ownedAccount(tx, userId, id, true);
    if (account.version !== input.version) throw new DomainError('La cuenta cambió en otro dispositivo. Actualizá antes de editar.', 409);
    if (input.archived) {
      const pending = await tx.select({ id: s.installments.id }).from(s.installments).innerJoin(s.plans, eq(s.plans.id, s.installments.planId)).where(and(eq(s.plans.accountId, id), eq(s.installments.status, 'pending'))).limit(1);
      const activeRules = await tx.select({ id: s.recurring.id }).from(s.recurring).where(and(eq(s.recurring.accountId, id), eq(s.recurring.active, true))).limit(1);
      const pendingRules = await tx.select({ id: s.occurrences.id }).from(s.occurrences).where(and(eq(s.occurrences.accountId, id), eq(s.occurrences.status, 'pending'))).limit(1);
      if (pending.length || activeRules.length || pendingRules.length) throw new DomainError('Resolvé las cuotas y recurrentes pendientes antes de archivar esta cuenta.');
    }
    return (await tx.update(s.financeAccounts).set({ ...input, version: account.version + 1 }).where(eq(s.financeAccounts.id, id)).returning())[0];
  });
}
export async function deleteAccount(db: Database, userId: string, id: string, version: number) {
  return db.transaction(async (tx) => {
    const account = await ownedAccount(tx, userId, id, true);
    if (account.version !== version) throw new DomainError('La cuenta cambió en otro dispositivo. Actualizá antes de eliminar.', 409);
    const references = await Promise.all([
      tx.select({ id: s.movements.id }).from(s.movements).where(sql`${s.movements.accountId} = ${id} OR ${s.movements.destinationId} = ${id}`).limit(1),
      tx.select({ id: s.postings.id }).from(s.postings).where(eq(s.postings.accountId, id)).limit(1),
      tx.select({ id: s.recurring.id }).from(s.recurring).where(eq(s.recurring.accountId, id)).limit(1),
      tx.select({ id: s.occurrences.id }).from(s.occurrences).where(eq(s.occurrences.accountId, id)).limit(1),
      tx.select({ id: s.plans.id }).from(s.plans).where(eq(s.plans.accountId, id)).limit(1),
    ]);
    if (references.some((rows) => rows.length)) throw new DomainError('Esta cuenta tiene movimientos, cuotas o recurrentes. Archivala para conservar su historial.');
    await tx.delete(s.financeAccounts).where(and(eq(s.financeAccounts.id, id), eq(s.financeAccounts.userId, userId)));
    return { ok: true };
  });
}
export async function createExpense(db: Database, userId: string, input: ExpenseInput) {
  return db.transaction(async (tx) => {
    const existing = await existingMovement(tx, userId, input.id); if (existing) return verifyRetry(existing, input, 'expense');
    const account = await ownedAccount(tx, userId, input.accountId);
    const movement = { ...baseMovement(userId, input, account.currency), category: input.category, emoji: input.emoji };
    return insertMovement(tx, movement, [{ accountId: account.id, delta: account.type === 'credit' ? input.amount : -input.amount }]);
  });
}
export async function editExpense(db: Database, userId: string, id: string, input: ExpenseInput & { version: number }) {
  return db.transaction(async (tx) => {
    const existing = await existingMovement(tx, userId, id);
    if (!existing || existing.voided) throw new DomainError('No se encontró el gasto.', 404);
    if (existing.version !== input.version) throw new DomainError('El gasto cambió. Actualizá antes de volver a editar.', 409);
    if (existing.kind !== 'expense' || existing.sourceType !== 'single') throw new DomainError('Para corregir este cargo, anulalo y volvé a registrarlo desde su cuota o servicio.');
    const account = await ownedAccount(tx, userId, input.accountId);
    const updated = { ...baseMovement(userId, { ...input, id }, account.currency), category: input.category, emoji: input.emoji, version: existing.version + 1, createdAt: existing.createdAt };
    await tx.delete(s.postings).where(eq(s.postings.movementId, id));
    await tx.update(s.movements).set(updated).where(eq(s.movements.id, id));
    await tx.insert(s.postings).values({ id: randomUUID(), movementId: id, accountId: account.id, delta: account.type === 'credit' ? input.amount : -input.amount });
    for (const accountId of new Set([existing.accountId, account.id])) {
      await ownedAccount(tx, userId, accountId, true);
      await tx.update(s.financeAccounts).set({ version: sql`${s.financeAccounts.version} + 1` }).where(eq(s.financeAccounts.id, accountId));
    }
    return updated;
  });
}
export async function createIncome(db: Database, userId: string, input: { id: string; concept: string; accountId: string; amount: number; date: string; notes: string }) {
  return db.transaction(async (tx) => {
    const existing = await existingMovement(tx, userId, input.id); if (existing) return verifyRetry(existing, input, 'income');
    const account = await ownedAccount(tx, userId, input.accountId);
    if (account.type === 'credit') throw new DomainError('Elegí un banco, billetera o efectivo para registrar el ingreso.');
    return insertMovement(tx, { ...baseMovement(userId, input, account.currency), kind: 'income', classification: 'income', expenseAmount: 0, emoji: '💸', category: 'Ingreso', direction: 'incoming' }, [{ accountId: account.id, delta: input.amount }]);
  });
}
export async function voidMovement(db: Database, userId: string, id: string, version: number) {
  return db.transaction(async (tx) => {
    const movement = await existingMovement(tx, userId, id);
    if (!movement) throw new DomainError('No se encontró el movimiento.', 404);
    if (movement.voided) return movement;
    if (movement.version !== version) throw new DomainError('El movimiento cambió. Actualizá antes de anularlo.', 409);
    await tx.update(s.movements).set({ voided: true, version: version + 1 }).where(eq(s.movements.id, id));
    const lines = await tx.select().from(s.postings).where(eq(s.postings.movementId, id));
    for (const line of lines) await tx.update(s.financeAccounts).set({ version: sql`${s.financeAccounts.version} + 1` }).where(eq(s.financeAccounts.id, line.accountId));
    if (movement.sourceType === 'recurring') {
      const [period] = await tx.select().from(s.occurrences).where(and(eq(s.occurrences.id, movement.sourceId!), eq(s.occurrences.userId, userId)));
      const [rule] = await tx.select().from(s.recurring).where(eq(s.recurring.id, period.ruleId));
      await tx.update(s.occurrences).set({ status: rule.deleted ? 'skipped' : 'pending', movementId: null }).where(eq(s.occurrences.id, period.id));
    }
    if (movement.sourceType === 'installment') {
      const [installment] = await tx.select().from(s.installments).where(eq(s.installments.id, movement.sourceId!));
      const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, installment.planId));
      await tx.update(s.installments).set({ status: plan.active ? 'pending' : 'cancelled', movementId: null }).where(eq(s.installments.id, installment.id));
    }
    return { ...movement, voided: true };
  });
}
export async function createRecurring(db: Database, userId: string, input: RecurringInput) {
  return db.transaction(async (tx) => {
    await ownedAccount(tx, userId, input.accountId);
    const [existing] = await tx.select().from(s.recurring).where(eq(s.recurring.id, input.id));
    if (existing) { if (existing.userId !== userId) throw new DomainError('Identificador no disponible.', 409); return existing; }
    return (await tx.insert(s.recurring).values({ ...input, userId }).returning())[0];
  });
}
export async function updateRecurring(db: Database, userId: string, id: string, input: RecurringInput & { active: boolean; version: number }) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.select().from(s.recurring).where(and(eq(s.recurring.id, id), eq(s.recurring.userId, userId), eq(s.recurring.deleted, false)));
    if (!rule) throw new DomainError('No se encontró el recurrente.', 404);
    if (rule.version !== input.version) throw new DomainError('El recurrente cambió. Actualizá antes de editarlo.', 409);
    await ownedAccount(tx, userId, input.accountId);
    const updated = { ...input, id, startDate: rule.startDate, generationFrom: input.active && !rule.active ? `${today().slice(0, 7)}-01` : rule.generationFrom, version: rule.version + 1 };
    await tx.update(s.recurring).set(updated).where(eq(s.recurring.id, id));
    const future = await tx.select().from(s.occurrences).where(and(eq(s.occurrences.ruleId, id), eq(s.occurrences.status, 'pending'), gt(s.occurrences.period, today().slice(0, 7))));
    for (const period of future) {
      if (!input.active) await tx.delete(s.occurrences).where(eq(s.occurrences.id, period.id));
      else await tx.update(s.occurrences).set({ name: input.name, emoji: input.emoji, category: input.category, accountId: input.accountId, amount: input.amount, dueDate: monthDate(period.period, input.dueDay) }).where(eq(s.occurrences.id, period.id));
    }
    return { ...rule, ...updated };
  });
}
export async function deleteRecurring(db: Database, userId: string, id: string, version: number) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.select().from(s.recurring).where(and(eq(s.recurring.id, id), eq(s.recurring.userId, userId)));
    if (!rule) throw new DomainError('No se encontró el recurrente.', 404);
    if (rule.deleted) return { ok: true };
    if (rule.version !== version) throw new DomainError('El recurrente cambió. Actualizá antes de eliminarlo.', 409);
    // Conservar la regla y sus períodos mantiene las relaciones del historial y los respaldos.
    await tx.update(s.recurring).set({ deleted: true, active: false, version: version + 1 }).where(eq(s.recurring.id, id));
    await tx.update(s.occurrences).set({ status: 'skipped' }).where(and(eq(s.occurrences.ruleId, id), eq(s.occurrences.userId, userId), eq(s.occurrences.status, 'pending')));
    return { ok: true };
  });
}
async function materializeOccurrences(db: Executor, userId: string, throughMonth: string) {
  const rules = await db.select().from(s.recurring).where(and(eq(s.recurring.userId, userId), eq(s.recurring.active, true), eq(s.recurring.deleted, false)));
  if (!rules.length) return;
  const existing = new Set((await db.select({ id: s.occurrences.id }).from(s.occurrences).where(and(eq(s.occurrences.userId, userId), lte(s.occurrences.period, throughMonth)))).map((row) => row.id));
  const values: (typeof s.occurrences.$inferInsert)[] = [];
  for (const rule of rules) {
    // Materializar hasta el mes consultado. Limitar cada pasada evita solicitudes desproporcionadas.
    let month = (rule.generationFrom && rule.generationFrom > rule.startDate ? rule.generationFrom : rule.startDate).slice(0, 7);
    for (let n = 0; month <= throughMonth && n < 1212; n++, month = addMonth(`${month}-01`, 1).slice(0, 7)) {
      const dueDate = monthDate(month, rule.dueDay);
      if (dueDate < rule.startDate || existing.has(`${rule.id}:${month}`)) continue;
      values.push({ id: `${rule.id}:${month}`, userId, ruleId: rule.id, period: month, name: rule.name, emoji: rule.emoji, category: rule.category, accountId: rule.accountId, amount: rule.amount, dueDate, status: 'pending' });
    }
  }
  for (let i = 0; i < values.length; i += 40) await db.insert(s.occurrences).values(values.slice(i, i + 40)).onConflictDoNothing();
}
export async function chargeOccurrence(db: Database, userId: string, occurrenceId: string, input: { id: string; date: string; amount?: number }) {
  return db.transaction(async (tx) => {
    const [period] = await tx.select().from(s.occurrences).where(and(eq(s.occurrences.id, occurrenceId), eq(s.occurrences.userId, userId)));
    if (!period) throw new DomainError('No se encontró el período.', 404);
    if (period.status === 'paid') return period;
    if (period.status !== 'pending') throw new DomainError('El período fue omitido.');
    const existing = await existingMovement(tx, userId, input.id); if (existing) throw new DomainError('Usá una nueva operación para registrar este cargo.', 409);
    const account = await ownedAccount(tx, userId, period.accountId);
    const amount = input.amount ?? period.amount;
    const movement: Movement = { ...baseMovement(userId, { ...input, concept: period.name, accountId: account.id, amount }, account.currency), category: period.category, emoji: period.emoji, sourceType: 'recurring', sourceId: period.id };
    await insertMovement(tx, movement, [{ accountId: account.id, delta: account.type === 'credit' ? amount : -amount }]);
    await tx.update(s.occurrences).set({ status: 'paid', movementId: input.id }).where(eq(s.occurrences.id, period.id));
    return movement;
  });
}
export async function skipOccurrence(db: Database, userId: string, id: string) {
  const changed = await db.update(s.occurrences).set({ status: 'skipped' }).where(and(eq(s.occurrences.id, id), eq(s.occurrences.userId, userId), eq(s.occurrences.status, 'pending'))).returning();
  if (!changed.length) throw new DomainError('El período ya no está pendiente.', 409);
  return changed[0];
}
export async function createPlan(db: Database, userId: string, input: PlanInput) {
  return db.transaction(async (tx) => {
    await ownedAccount(tx, userId, input.accountId);
    const [existing] = await tx.select().from(s.plans).where(eq(s.plans.id, input.id));
    if (existing) { if (existing.userId !== userId) throw new DomainError('Identificador no disponible.', 409); return existing; }
    if (input.historicalCount && addMonth(input.firstDate, input.historicalCount - 1) > today()) throw new DomainError('Las cuotas ya pagadas deben tener una fecha de hoy o anterior.');
    const schedule = splitInstallments(input.total, input.count);
    const plan = (await tx.insert(s.plans).values({ ...input, userId }).returning())[0];
    await tx.insert(s.installments).values(schedule.map((amount, index) => ({ id: randomUUID(), userId, planId: input.id, number: index + 1, amount, dueDate: addMonth(input.firstDate, index), status: index < input.historicalCount ? 'historical' as const : 'pending' as const })));
    return plan;
  });
}
export async function chargeInstallment(db: Database, userId: string, id: string, input: { id: string; date: string }) {
  return db.transaction(async (tx) => {
    const [installment] = await tx.select().from(s.installments).where(and(eq(s.installments.id, id), eq(s.installments.userId, userId)));
    if (!installment) throw new DomainError('No se encontró la cuota.', 404);
    if (installment.status === 'charged') return installment;
    if (installment.status !== 'pending') throw new DomainError('La cuota no está pendiente.');
    const existing = await existingMovement(tx, userId, input.id); if (existing) throw new DomainError('Usá una nueva operación para registrar este cargo.', 409);
    const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, installment.planId));
    const account = await ownedAccount(tx, userId, plan.accountId);
    const movement: Movement = { ...baseMovement(userId, { ...input, concept: `${plan.name} · cuota ${installment.number}/${plan.count}`, accountId: account.id, amount: installment.amount }, account.currency), category: plan.category, emoji: plan.emoji, sourceType: 'installment', sourceId: id };
    await insertMovement(tx, movement, [{ accountId: account.id, delta: account.type === 'credit' ? installment.amount : -installment.amount }]);
    await tx.update(s.installments).set({ status: 'charged', movementId: input.id }).where(eq(s.installments.id, id));
    return movement;
  });
}
export async function cancelPlan(db: Database, userId: string, id: string, version: number) {
  return db.transaction(async (tx) => {
    const [plan] = await tx.select().from(s.plans).where(and(eq(s.plans.id, id), eq(s.plans.userId, userId)));
    if (!plan) throw new DomainError('No se encontró la compra.', 404);
    if (plan.version !== version) throw new DomainError('La compra cambió. Actualizá antes de cancelar.', 409);
    await tx.update(s.plans).set({ active: false, version: version + 1 }).where(eq(s.plans.id, id));
    await tx.update(s.installments).set({ status: 'cancelled' }).where(and(eq(s.installments.planId, id), eq(s.installments.status, 'pending')));
    return { ok: true };
  });
}
export async function getSnapshot(db: Database, userId: string, month: string): Promise<Snapshot> {
  await db.transaction(async (tx) => {
    await initializeCategories(tx, userId);
    await materializeOccurrences(tx, userId, month > today().slice(0, 7) ? month : today().slice(0, 7));
  });
  const [accounts, movements, recurring, occurrences, plans, installments, categories] = await db.batch([
    db.select().from(s.financeAccounts).where(eq(s.financeAccounts.userId, userId)),
    db.select().from(s.movements).where(eq(s.movements.userId, userId)),
    db.select().from(s.recurring).where(and(eq(s.recurring.userId, userId), eq(s.recurring.deleted, false))),
    db.select(getTableColumns(s.occurrences)).from(s.occurrences).innerJoin(s.recurring, eq(s.recurring.id, s.occurrences.ruleId)).where(and(eq(s.occurrences.userId, userId), eq(s.recurring.deleted, false))),
    db.select().from(s.plans).where(eq(s.plans.userId, userId)),
    db.select().from(s.installments).where(eq(s.installments.userId, userId)),
    db.select().from(s.categories).where(eq(s.categories.userId, userId)),
  ]);
  return { accounts, movements, recurring, occurrences, plans, installments, categories };
}
export async function accountHistory(db: Database, userId: string, id: string) {
  await ownedAccount(db, userId, id, true);
  return db.select({ posting: s.postings, movement: s.movements }).from(s.postings).innerJoin(s.movements, eq(s.movements.id, s.postings.movementId)).where(and(eq(s.postings.accountId, id), eq(s.movements.userId, userId)));
}
