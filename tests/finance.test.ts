import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../server/db/schema';
import * as service from '../server/service';
import { insertLegacyTransfer } from './fixtures/legacy-transfer';
import { exportBackup, restoreBackup } from '../server/backup';
import { addMonth, today, MAX_MONEY, expenseInputSchema } from '../shared/domain';
import type { Database } from '../server/db/client';

let client: Client, db: Database;
const owner = 'owner', other = 'other'; const date = today(); const month = date.slice(0, 7);
beforeEach(async () => {
  client = createClient({ url: ':memory:' }); db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' }); await client.execute('PRAGMA foreign_keys = ON');
  await db.insert(schema.user).values([owner, other].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: new Date(), updatedAt: new Date() })));
});
afterEach(() => client.close());
async function account(type: 'bank' | 'credit' | 'wallet' = 'bank', currency: 'ARS' | 'USD' = 'ARS') {
  return service.createAccount(db, owner, { id: randomUUID(), name: type, type, currency, emoji: '🏦' });
}
const expense = (accountId: string, amount = 20000) => ({ id: randomUUID(), concept: 'Compra', accountId, amount, date, category: 'General', emoji: '🛒', notes: '' });
const transfer = (accountId: string, destinationId: string | null, amount = 20000) => ({ id: randomUUID(), concept: 'Transferencia', accountId, destinationId, amount, receivedAmount: null, direction: 'outgoing' as const, classification: 'neutral' as const, counterpart: destinationId ? '' : 'Persona', fee: 0, date, notes: '' });
const snapshot = () => service.getSnapshot(db, owner, month);
const recurring = (accountId: string) => ({ id: randomUUID(), name: 'Suscripción', kind: 'subscription' as const, accountId, amount: 20000, dueDay: 1, startDate: `${month}-01`, emoji: '📺', category: 'Servicios' });

it('borra pagos, períodos y cuotas de una cuenta y conserva registros ajenos y respaldos válidos', async () => {
  const bank = await account(), keep = await account('wallet');
  await service.createExpense(db, owner, expense(bank.id));
  const keptExpense = await service.createExpense(db, owner, expense(keep.id));
  const rule = await service.createRecurring(db, owner, recurring(bank.id));
  const period = (await snapshot()).occurrences.find((row) => row.ruleId === rule.id)!;
  await service.chargeOccurrence(db, owner, period.id, { id: randomUUID(), date, amount: 10000 });
  const plan = await service.createPlan(db, owner, { id: randomUUID(), name: 'Compra', emoji: 'P', category: 'General', accountId: bank.id, total: 10000, count: 2, firstDate: date, historicalCount: 0 });
  const installment = (await snapshot()).installments.find((row) => row.planId === plan.id)!;
  await service.chargeInstallment(db, owner, installment.id, { id: randomUUID(), date });
  const foreign = await service.createAccount(db, other, { id: randomUUID(), name: 'Ajena', type: 'bank', currency: 'ARS', emoji: 'B' });
  const current = (await snapshot()).accounts.find((row) => row.id === bank.id)!;
  await expect(service.deleteAccount(db, other, bank.id, current.version)).rejects.toMatchObject({ status: 404 });
  const beforeDeletion = await snapshot();
  const { synchronize } = await import('../server/finance-sync');
  const response = await synchronize(db, owner, 'deleteAccount', [bank.id, current.version], month,
    (tx) => service.deleteAccountInTransaction(tx, owner, bank.id, current.version));
  const after = await snapshot();
  for (const key of Object.keys(beforeDeletion) as (keyof typeof beforeDeletion)[]) {
    const merged = new Map<string, unknown>(beforeDeletion[key].map((row) => [row.id, row]));
    for (const removed of response.changes.collections[key]?.removes ?? []) merged.delete(removed);
    for (const row of response.changes.collections[key]?.upserts ?? []) merged.set(row.id, row);
    expect(Object.fromEntries(merged)).toEqual(Object.fromEntries(after[key].map((row) => [row.id, row])));
  }
  expect(after.accounts.map((row) => row.id)).toEqual([keep.id]);
  expect(after.movements.map((row) => row.id)).toEqual([keptExpense.id]);
  for (const key of ['recurring', 'occurrences', 'plans', 'installments'] as const) expect(after[key]).toEqual([]);
  expect((await service.getSnapshot(db, other, month)).accounts[0].id).toBe(foreign.id);
  const backup = await exportBackup(db, owner);
  expect(backup.postings).toHaveLength(1);
  await expect(restoreBackup(db, owner, backup)).resolves.toEqual({ ok: true });
  expect(await client.execute('PRAGMA foreign_key_check')).toMatchObject({ rows: [] });
});

it('elimina transferencias antiguas en ambos historiales sin borrar la otra cuenta', async () => {
  const bank = await account(), keep = await account('wallet');
  const keptExpense = await service.createExpense(db, owner, expense(keep.id));
  await insertLegacyTransfer(db, owner, transfer(bank.id, keep.id));
  const before = (await snapshot()).accounts.find((row) => row.id === keep.id)!;
  await service.deleteAccount(db, owner, bank.id, bank.version);
  expect((await snapshot()).movements.map((row) => row.id)).toEqual([keptExpense.id]);
  const history = await service.accountHistory(db, owner, keep.id);
  expect(history.map((row) => row.movement.id)).toEqual([keptExpense.id]);
  expect((await snapshot()).accounts[0].version).toBe(before.version + 1);
});

it('revierte toda la eliminación si falla antes de confirmar la transacción', async () => {
  const bank = await account();
  await service.createExpense(db, owner, expense(bank.id));
  const before = await snapshot();
  const { synchronize } = await import('../server/finance-sync');
  await expect(synchronize(db, owner, 'deleteAccount', [bank.id, before.accounts[0].version], month,
    (tx) => service.deleteAccountInTransaction(tx, owner, bank.id, before.accounts[0].version),
    () => { throw new Error('rollback'); })).rejects.toThrow('rollback');
  expect(await snapshot()).toEqual(before);
});

describe('Cuentas y movimientos informativos', () => {
  it('conserva colores en respaldos y acepta respaldos anteriores sin color', async () => {
    const bank = await service.createAccount(db, owner, { id: randomUUID(), name: 'Galicia', type: 'bank', currency: 'ARS', emoji: '🏦', color: '#ffcc00' });
    await service.editAccount(db, owner, bank.id, { name: 'Otro nombre', emoji: bank.emoji, archived: false, version: bank.version });
    expect((await snapshot()).accounts[0].color).toBe('#ffcc00');
    const backup = await exportBackup(db, owner);
    await restoreBackup(db, owner, backup);
    expect((await snapshot()).accounts[0].color).toBe('#ffcc00');
    const restored = (await snapshot()).accounts[0];
    await service.editAccount(db, owner, restored.id, { name: restored.name, emoji: restored.emoji, archived: false, version: restored.version, color: null });
    expect((await snapshot()).accounts[0].color).toBeNull();
    await restoreBackup(db, owner, { ...backup, accounts: backup.accounts.map(({ color, ...rest }) => rest) });
    expect((await snapshot()).accounts[0].color).toBeNull();
  });
  it('elimina solo cuentas propias y con la versión vigente', async () => {
    const bank = await account();
    await expect(service.deleteAccount(db, other, bank.id, bank.version)).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteAccount(db, owner, bank.id, bank.version + 1)).rejects.toMatchObject({ status: 409 });
    await expect(service.deleteAccount(db, owner, bank.id, bank.version)).resolves.toEqual({ ok: true });
    expect((await snapshot()).accounts).toHaveLength(0);
  });
  it('elimina cuentas con movimientos incluso anulados y con recurrentes o cuotas', async () => {
    const bank = await account();
    const movement = await service.createExpense(db, owner, expense(bank.id));
    await service.voidMovement(db, owner, movement.id, movement.version);
    const current = (await snapshot()).accounts.find((item) => item.id === bank.id)!;
    const archived = await service.editAccount(db, owner, bank.id, { name: current.name, emoji: current.emoji, archived: true, version: current.version });
    await expect(service.deleteAccount(db, owner, bank.id, archived.version)).resolves.toEqual({ ok: true });
    const wallet = await account('wallet');
    await service.createRecurring(db, owner, recurring(wallet.id));
    await expect(service.deleteAccount(db, owner, wallet.id, wallet.version)).resolves.toEqual({ ok: true });
    const card = await account('credit');
    await service.createPlan(db, owner, { id: randomUUID(), name: 'Compra', emoji: '🛒', category: 'General', accountId: card.id, total: 10000, count: 2, firstDate: date, historicalCount: 0 });
    await expect(service.deleteAccount(db, owner, card.id, card.version)).resolves.toEqual({ ok: true });
  });
  it('guarda y edita gastos sin concepto y los conserva al restaurar un respaldo', async () => {
    const bank = await account();
    const input = expenseInputSchema.parse({ ...expense(bank.id), concept: '   ' });
    const created = await service.createExpense(db, owner, input);
    expect(created.concept).toBe('');
    const named = await service.editExpense(db, owner, input.id, { ...input, concept: 'Compra', version: 1 });
    await service.editExpense(db, owner, input.id, { ...input, version: named.version });
    await restoreBackup(db, owner, await exportBackup(db, owner));
    expect((await snapshot()).movements).toEqual([expect.objectContaining({ concept: '', amount: input.amount })]);
    const { concept, ...withoutConcept } = input;
    expect(expenseInputSchema.parse(withoutConcept).concept).toBe('');
  });

  it('crea cuentas sin saldo ni fecha inicial y no expone esos datos', async () => {
    const bank = await account();
    expect(bank).not.toHaveProperty('openingBalance'); expect(bank).not.toHaveProperty('openingDate');
    const data = await snapshot();
    expect(data.accounts[0]).not.toHaveProperty('balance'); expect(data.accounts[0]).toMatchObject({ name: 'bank', currency: 'ARS' });
  });
  it('conserva el gasto y el historial de pagos de tarjeta anteriores', async () => {
    const bank = await account(), card = await account('credit');
    await service.createExpense(db, owner, expense(card.id));
    await insertLegacyTransfer(db, owner, transfer(bank.id, card.id));
    const data = await snapshot(); expect(data.movements).toHaveLength(2);
    expect(data.movements.reduce((sum, m) => sum + m.expenseAmount, 0)).toBe(20000);
    expect((await service.accountHistory(db, owner, card.id)).map((h) => h.movement.kind).sort()).toEqual(['expense', 'transfer']);
  });
  it('conserva ambos importes de un cambio de moneda anterior y cuenta solo la comisión', async () => {
    const ars = await account(), usd = await account('bank', 'USD');
    await insertLegacyTransfer(db, owner, { ...transfer(ars.id, usd.id, 60000), receivedAmount: 50, fee: 500 });
    const data = await snapshot(); expect(data.movements[0]).toMatchObject({ expenseAmount: 500, currency: 'ARS', destinationCurrency: 'USD', receivedAmount: 50 });
    expect((await service.accountHistory(db, owner, usd.id))[0]).toMatchObject({ posting: { delta: 50 }, movement: { destinationId: usd.id } });
  });
  it('conserva un gasto USD y su pago anterior desde una cuenta ARS', async () => {
    const ars = await account(), usdCard = await account('credit', 'USD');
    await service.createExpense(db, owner, expense(usdCard.id, 2000));
    await insertLegacyTransfer(db, owner, { ...transfer(ars.id, usdCard.id, 30000), receivedAmount: 2000 });
    const data = await snapshot();
    expect(data.movements.filter((m) => m.expenseAmount).map((m) => [m.currency, m.expenseAmount])).toEqual([['USD', 2000]]);
  });
  it('reintenta sin duplicar y rechaza reutilizar un envío con datos distintos', async () => {
    const bank = await account(); const input = expense(bank.id);
    await service.createExpense(db, owner, input); await service.createExpense(db, owner, input);
    expect((await snapshot()).movements).toHaveLength(1);
    await expect(service.createExpense(db, owner, { ...input, amount: 99 })).rejects.toThrow('otros datos');
  });
  it('corrige y anula sin borrar el historial; detecta una edición desactualizada', async () => {
    const bank = await account(); const input = expense(bank.id);
    const movement = await service.createExpense(db, owner, input);
    const updated = await service.editExpense(db, owner, movement.id, { ...input, amount: 30000, version: 1 });
    await expect(service.editExpense(db, owner, movement.id, { ...input, version: 1 })).rejects.toThrow('cambió');
    await service.voidMovement(db, owner, movement.id, updated.version);
    expect((await snapshot()).movements[0]).toMatchObject({ amount: 30000, voided: true });
    expect((await service.accountHistory(db, owner, bank.id))[0].movement.voided).toBe(true);
  });
  it('registra ingresos sin alterar el gasto', async () => {
    const bank = await account(); await service.createIncome(db, owner, { ...expense(bank.id, 5000), concept: 'Ingreso' });
    const data = await snapshot(); expect(data.movements[0]).toMatchObject({ kind: 'income', amount: 5000, expenseAmount: 0 });
  });
  it('permite registrar y editar importes válidos sin limitar el acumulado de la cuenta', async () => {
    const card = await account('credit');
    await service.createExpense(db, owner, expense(card.id, MAX_MONEY));
    const input = expense(card.id, 100); await service.createExpense(db, owner, input);
    await service.editExpense(db, owner, input.id, { ...input, amount: 200, version: 1 });
    const data = await snapshot(); expect(data.movements.reduce((sum, m) => sum + m.expenseAmount, 0)).toBe(MAX_MONEY + 200);
  });
  it('archiva una tarjeta con compras registradas y conserva su historial', async () => {
    const card = await account('credit'); await service.createExpense(db, owner, expense(card.id));
    const current = (await snapshot()).accounts[0];
    await expect(service.editAccount(db, owner, card.id, { name: card.name, emoji: card.emoji, archived: true, version: current.version })).resolves.toMatchObject({ archived: true });
    expect(await service.accountHistory(db, owner, card.id)).toHaveLength(1);
    await expect(service.createExpense(db, owner, expense(card.id))).rejects.toThrow('archivada');
  });
});
describe('Planes y recurrentes', () => {
  it('releer el resumen no vuelve a insertar períodos existentes y genera solo los nuevos', async () => {
    const bank = await account();
    const rule = await service.createRecurring(db, owner, { ...recurring(bank.id), startDate: addMonth(`${month}-01`, -12) });
    const first = await snapshot();
    const queries: string[] = [];
    const measured = drizzle(client, { schema, logger: { logQuery(query) { queries.push(query); } } });
    const second = await service.getSnapshot(measured, owner, month);
    expect(second.occurrences).toEqual(first.occurrences);
    expect(queries.filter((query) => /insert into "occurrence"/i.test(query))).toHaveLength(0);
    queries.length = 0;
    const futureMonth = addMonth(`${month}-01`, 1).slice(0, 7);
    const future = await service.getSnapshot(measured, owner, futureMonth);
    expect(future.occurrences.filter((period) => period.ruleId === rule.id)).toHaveLength(first.occurrences.length + 1);
    expect(queries.filter((query) => /insert into "occurrence"/i.test(query))).toHaveLength(1);
  });
  it('admite cuotas ya pagadas sin una fecha de saldo inicial', async () => {
    const bank = await account();
    const plan = await service.createPlan(db, owner, { id: randomUUID(), name: 'Compra anterior', accountId: bank.id, total: 9000, count: 3, firstDate: addMonth(date, -1), category: 'General', emoji: '🛍️', historicalCount: 1 });
    const data = await snapshot();
    expect(data.installments.filter((i) => i.planId === plan.id).map((i) => i.status)).toEqual(['historical', 'pending', 'pending']);
    expect(data.movements).toHaveLength(0);
    await expect(service.createPlan(db, owner, { ...plan, id: randomUUID(), firstDate: addMonth(date, 1) })).rejects.toThrow('hoy o anterior');
  });
  it('anular un cargo de un plan cancelado conserva cancelada la cuota', async () => {
    const card = await account('credit', 'ARS');
    const plan = await service.createPlan(db, owner, { id: randomUUID(), name: 'Teclado', accountId: card.id, total: 10000, count: 3, firstDate: date, category: 'General', emoji: '⌨️', historicalCount: 0 });
    const installment = (await snapshot()).installments.find((i) => i.number === 1)!;
    const movementId = randomUUID(); await service.chargeInstallment(db, owner, installment.id, { id: movementId, date });
    await service.cancelPlan(db, owner, plan.id, plan.version);
    await service.voidMovement(db, owner, movementId, 1);
    const data = await snapshot(); expect(data.installments.every((i) => i.status === 'cancelled')).toBe(true); 
  });
  it('crear cuotas no genera gastos y una confirmación duplicada produce un solo cargo', async () => {
    const bank = await account(); await service.createPlan(db, owner, { id: randomUUID(), name: 'Teclado', accountId: bank.id, total: 10000, count: 3, firstDate: date, category: 'General', emoji: '⌨️', historicalCount: 0 });
    let data = await snapshot();  expect(data.movements).toHaveLength(0);
    expect(data.installments.reduce((sum, i) => sum + i.amount, 0)).toBe(10000);
    const installment = data.installments.find((i) => i.number === 1)!;
    await service.chargeInstallment(db, owner, installment.id, { id: randomUUID(), date }); await service.chargeInstallment(db, owner, installment.id, { id: randomUUID(), date });
    data = await snapshot(); expect(data.movements).toHaveLength(1); expect(data.movements[0].expenseAmount).toBe(3333);
  });
  it('conserva pagos anteriores al editar la regla, y permite importe real distinto', async () => {
    const bank = await account(); const input = { id: randomUUID(), name: 'Internet', kind: 'service' as const, accountId: bank.id, amount: 20000, dueDay: 31, startDate: `${month}-01`, emoji: '📶', category: 'Servicios' };
    await service.createRecurring(db, owner, input); let data = await snapshot();
    await service.chargeOccurrence(db, owner, data.occurrences[0].id, { id: randomUUID(), date, amount: 23000 });
    await service.updateRecurring(db, owner, input.id, { ...input, amount: 25000, version: 1, active: true });
    data = await snapshot(); expect(data.movements[0].amount).toBe(23000); expect(data.occurrences[0].amount).toBe(20000);
    await service.chargeOccurrence(db, owner, data.occurrences[0].id, { id: randomUUID(), date });
    expect((await snapshot()).movements).toHaveLength(1);
  });
});
describe('Eliminar recurrentes', () => {
  it('descarta pendientes vencidos y futuros, conserva pagos y no vuelve a generar períodos', async () => {
    const bank = await account(); const input = { ...recurring(bank.id), startDate: addMonth(`${month}-01`, -2) };
    const rule = await service.createRecurring(db, owner, input);
    const remaining = await service.createRecurring(db, owner, recurring(bank.id));
    const futureMonth = addMonth(`${month}-01`, 1).slice(0, 7);
    const periods = (await service.getSnapshot(db, owner, futureMonth)).occurrences.filter((p) => p.ruleId === rule.id).sort((a, b) => a.period.localeCompare(b.period));
    await service.chargeOccurrence(db, owner, periods[0].id, { id: randomUUID(), date, amount: 23000 });
    await service.skipOccurrence(db, owner, periods[1].id);
    const before = await snapshot(); const history = await service.accountHistory(db, owner, bank.id);
    await service.deleteRecurring(db, owner, rule.id, rule.version);
    const after = await service.getSnapshot(db, owner, addMonth(`${month}-01`, 2).slice(0, 7));
    expect(after.recurring.map((r) => r.id)).toEqual([remaining.id]);
    expect(after.occurrences.every((p) => p.ruleId === remaining.id)).toBe(true);
    expect(after.accounts).toEqual(before.accounts); expect(after.movements).toEqual(before.movements);
    expect(await service.accountHistory(db, owner, bank.id)).toEqual(history);
    await expect(service.chargeOccurrence(db, owner, periods[2].id, { id: randomUUID(), date })).rejects.toThrow('omitido');
    const backup = await exportBackup(db, owner);
    expect(backup.occurrences.filter((p) => p.ruleId === rule.id).map((p) => p.status).sort()).toEqual(['paid', 'skipped', 'skipped', 'skipped']);
  });
  it('elimina un pausado, verifica propietario y versión, y permite reintentar sin reactivarlo', async () => {
    const bank = await account(); const input = recurring(bank.id);
    await service.createRecurring(db, owner, input); const period = (await snapshot()).occurrences[0];
    const paused = await service.updateRecurring(db, owner, input.id, { ...input, active: false, version: 1 });
    await expect(service.deleteRecurring(db, other, input.id, paused.version)).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteRecurring(db, owner, randomUUID(), 1)).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteRecurring(db, owner, input.id, 1)).rejects.toMatchObject({ status: 409 });
    expect((await snapshot()).occurrences[0].status).toBe('pending');
    await service.deleteRecurring(db, owner, input.id, paused.version);
    await expect(service.deleteRecurring(db, owner, input.id, paused.version)).resolves.toEqual({ ok: true });
    await expect(service.updateRecurring(db, owner, input.id, { ...input, active: true, version: paused.version })).rejects.toMatchObject({ status: 404 });
    await expect(service.chargeOccurrence(db, owner, period.id, { id: randomUUID(), date })).rejects.toThrow('omitido');
    expect((await snapshot()).recurring).toHaveLength(0); expect((await snapshot()).occurrences).toHaveLength(0);
    await expect(service.editAccount(db, owner, bank.id, { name: bank.name, emoji: bank.emoji, archived: true, version: bank.version })).resolves.toMatchObject({ archived: true });
  });
  it('elimina una regla que todavía no tiene períodos', async () => {
    const bank = await account(); const rule = await service.createRecurring(db, owner, { ...recurring(bank.id), startDate: addMonth(`${month}-01`, 1) });
    expect((await snapshot()).occurrences).toHaveLength(0);
    await service.deleteRecurring(db, owner, rule.id, rule.version);
    const data = await service.getSnapshot(db, owner, addMonth(`${month}-01`, 3).slice(0, 7));
    expect(data.recurring).toHaveLength(0); expect(data.occurrences).toHaveLength(0);
  });
  it('restaura pagos de un recurrente eliminado y permite anularlos sin reabrir pendientes', async () => {
    const bank = await account(); const rule = await service.createRecurring(db, owner, recurring(bank.id));
    const period = (await snapshot()).occurrences[0];
    await service.chargeOccurrence(db, owner, period.id, { id: randomUUID(), date });
    await service.deleteRecurring(db, owner, rule.id, rule.version);
    await restoreBackup(db, owner, await exportBackup(db, owner));
    let data = await snapshot();
    expect(data.recurring).toHaveLength(0); expect(data.occurrences).toHaveLength(0);
     expect(data.movements[0]).toMatchObject({ sourceType: 'recurring', amount: 20000, voided: false });
    await service.voidMovement(db, owner, data.movements[0].id, data.movements[0].version);
    await restoreBackup(db, owner, await exportBackup(db, owner));
    data = await snapshot();
     expect(data.movements[0].voided).toBe(true);
    expect(data.recurring).toHaveLength(0); expect(data.occurrences).toHaveLength(0);
    const backup = await exportBackup(db, owner);
    expect(backup.recurring[0]).toMatchObject({ deleted: true, active: false });
    expect(backup.occurrences[0]).toMatchObject({ status: 'skipped', movementId: null });
  });
});
describe('Respaldo', () => {
  it('restaura cuentas y ajustes de respaldos anteriores descartando los campos de saldo', async () => {
    const bank = await account(); await service.createIncome(db, owner, { ...expense(bank.id, 5000), concept: 'Revisión anterior' });
    const backup = await exportBackup(db, owner);
    expect(backup.accounts[0]).not.toHaveProperty('openingBalance');
    const legacy = { ...backup, accounts: backup.accounts.map((a) => ({ ...a, openingBalance: 100000, openingDate: '2026-01-01' })), movements: backup.movements.map((m) => ({ ...m, kind: 'adjustment', classification: 'neutral', category: 'Ajuste', emoji: '⚖️' })) };
    await restoreBackup(db, owner, legacy);
    const data = await snapshot();
    expect(data.accounts[0]).not.toHaveProperty('openingBalance'); expect(data.accounts[0]).not.toHaveProperty('openingDate'); expect(data.accounts[0]).not.toHaveProperty('balance');
    expect(data.movements[0]).toMatchObject({ kind: 'adjustment', amount: 5000, expenseAmount: 0 });
    expect(await service.accountHistory(db, owner, data.accounts[0].id)).toHaveLength(1);
  });
  it('acepta respaldos anteriores sin estado de eliminación de recurrentes', async () => {
    const bank = await account(); await service.createRecurring(db, owner, recurring(bank.id)); await snapshot();
    const backup = await exportBackup(db, owner);
    const legacy = { ...backup, recurring: backup.recurring.map(({ deleted, ...rule }) => rule) };
    await restoreBackup(db, owner, legacy);
    const data = await snapshot();
    expect(data.recurring).toHaveLength(1); expect(data.recurring[0]).toMatchObject({ active: true, deleted: false });
    expect(data.occurrences[0].status).toBe('pending');
  });
  it('exporta y restaura relaciones, cuentas y cargos sin duplicarlos ni incluir credenciales', async () => {
    const bank = await account(), card = await account('credit', 'ARS');
    await service.createExpense(db, owner, expense(card.id)); await insertLegacyTransfer(db, owner, transfer(bank.id, card.id));
    const before = await snapshot(); const backup = await exportBackup(db, owner);
    expect(JSON.stringify(backup)).not.toContain('password'); expect(JSON.stringify(backup)).not.toContain('userId');
    await restoreBackup(db, owner, backup); const after = await snapshot();
    expect(after.accounts.map(({ id, ...a }) => a)).toEqual(before.accounts.map(({ id, ...a }) => a));
    expect(after.movements).toHaveLength(2); expect(after.movements.reduce((sum, m) => sum + m.expenseAmount, 0)).toBe(20000);
    expect((await service.getSnapshot(db, other, month)).accounts).toHaveLength(0);
  });
  it('rechaza un respaldo corrupto antes de reemplazar los datos', async () => {
    const bank = await account(); await service.createExpense(db, owner, expense(bank.id));
    const backup = await exportBackup(db, owner); backup.postings[0].delta = 10;
    await expect(restoreBackup(db, owner, backup)).rejects.toThrow('inconsistentes');
    const data = await snapshot(); expect(data.movements).toHaveLength(1); 
  });
});
