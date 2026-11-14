import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '../server/db/schema';
import * as finance from '../server/service';
import { insertLegacyTransfer } from './fixtures/legacy-transfer';
import * as categories from '../server/categories';
import { exportBackup, restoreBackup } from '../server/backup';
import { summarizeCategories } from '../shared/categories';
import { addMonth, categoryInputSchema, today } from '../shared/domain';
import type { Database } from '../server/db/client';

let client: ReturnType<typeof createClient>, db: Database;
const month = today().slice(0, 7);
const input = (name = 'Viajes') => categoryInputSchema.parse({ name, emoji: '🏖️', budgetArs: 20000, budgetUsd: 5000 });
const snapshot = (userId = 'owner') => finance.getSnapshot(db, userId, month);

beforeEach(async () => {
  client = createClient({ url: ':memory:' }); db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' }); await client.execute('PRAGMA foreign_keys = ON');
  await db.insert(schema.user).values(['owner', 'other'].map((id) => ({ id, name: id, email: `${id}@example.com`, createdAt: new Date(), updatedAt: new Date() })));
});
afterEach(() => client.close());

it('persiste iconos de categorías y recurrentes y los conserva al restaurar un respaldo', async () => {
  const category = await categories.createCategory(db, 'owner', { ...input(), iconKey: 'travel' });
  const account = await finance.createAccount(db, 'owner', { id: randomUUID(), name: 'Banco', type: 'bank', currency: 'ARS', emoji: 'B' });
  await finance.createRecurring(db, 'owner', { id: randomUUID(), name: 'Spotify', kind: 'subscription', iconKey: 'spotify', emoji: 'R', category: category.name, accountId: account.id, amount: 10000, dueDay: 15, startDate: `${month}-01` });
  const backup = await exportBackup(db, 'owner');
  expect(backup.categories.find((c) => c.id === category.id)?.iconKey).toBe('travel');
  expect(backup.recurring[0].iconKey).toBe('spotify');
  await restoreBackup(db, 'other', backup);
  const restored = await snapshot('other');
  expect(restored.categories.find((c) => c.name === category.name)?.iconKey).toBe('travel');
  expect(restored.recurring[0].iconKey).toBe('spotify');
});

it('aísla categorías y presupuestos; rechaza editar, eliminar o reasignar a categorías ajenas', async () => {
  const own = await categories.createCategory(db, 'owner', input());
  const foreign = await categories.createCategory(db, 'other', { ...input(), budgetArs: 99 });
  expect((await snapshot()).categories.find((c) => c.name === 'Viajes')).toMatchObject({ id: own.id, budgetArs: 20000 });
  expect((await snapshot('other')).categories.find((c) => c.name === 'Viajes')).toMatchObject({ id: foreign.id, budgetArs: 99 });
  await expect(categories.editCategory(db, 'other', own.id, { ...input(), version: 1 })).rejects.toMatchObject({ status: 404 });
  await expect(categories.deleteCategory(db, 'other', own.id, { version: 1, replacementId: null })).rejects.toMatchObject({ status: 404 });
  await expect(categories.deleteCategory(db, 'owner', own.id, { version: 1, replacementId: foreign.id })).rejects.toMatchObject({ status: 404 });
  expect((await snapshot()).categories.some((c) => c.id === own.id)).toBe(true);
});

it('rechaza nombres duplicados y versiones desactualizadas sin sobrescribir presupuestos', async () => {
  const category = await categories.createCategory(db, 'owner', input());
  await expect(categories.createCategory(db, 'owner', input('viajes'))).rejects.toMatchObject({ status: 409 });
  const updated = await categories.editCategory(db, 'owner', category.id, { ...input('Vacaciones'), version: 1 });
  expect(updated).toMatchObject({ name: 'Vacaciones', version: 2, budgetUsd: 5000 });
  await expect(categories.editCategory(db, 'owner', category.id, { ...input(), version: 1 })).rejects.toMatchObject({ status: 409 });
  await expect(categories.deleteCategory(db, 'owner', category.id, { version: 1, replacementId: null })).rejects.toMatchObject({ status: 409 });
  const general = (await snapshot()).categories.find((c) => c.name === 'General')!;
  await expect(categories.editCategory(db, 'owner', category.id, { ...input(general.name), version: 2 })).rejects.toMatchObject({ status: 409 });
});

it('no recrea categorías predeterminadas renombradas o eliminadas, incluso al eliminar todas', async () => {
  const general = (await snapshot()).categories.find((c) => c.name === 'General')!;
  await categories.editCategory(db, 'owner', general.id, { ...input('Mis compras'), version: general.version });
  expect((await snapshot()).categories.some((c) => c.name === 'General')).toBe(false);
  for (const category of (await snapshot()).categories) await categories.deleteCategory(db, 'owner', category.id, { version: category.version, replacementId: null });
  expect((await snapshot()).categories).toEqual([]);
  expect((await snapshot()).categories).toEqual([]);
  expect((await snapshot('other')).categories.length).toBeGreaterThan(0);
});

it('renombra referencias de gastos, cuotas y recurrentes en una transacción conservando emojis e importes', async () => {
  const category = await categories.createCategory(db, 'owner', input());
  const bank = await finance.createAccount(db, 'owner', { id: randomUUID(), name: 'Banco', emoji: '🏦', currency: 'ARS', type: 'bank' });
  const expense = { id: randomUUID(), concept: 'Pasaje', amount: 10000, date: today(), accountId: bank.id, category: category.name, emoji: '✈️', notes: '' };
  await finance.createExpense(db, 'owner', expense);
  await finance.createRecurring(db, 'owner', { id: randomUUID(), name: 'Abono', accountId: bank.id, category: category.name, emoji: '🚌', amount: 1200, kind: 'service', dueDay: 1, startDate: `${month}-01` });
  await finance.createPlan(db, 'owner', { id: randomUUID(), name: 'Hotel', accountId: bank.id, category: category.name, emoji: '🏨', total: 9000, count: 3, firstDate: today(), historicalCount: 0 });
  await snapshot();
  await categories.editCategory(db, 'owner', category.id, { ...input('Vacaciones'), emoji: '🌴', version: 1 });
  const data = await snapshot();
  for (const rows of [data.movements, data.recurring, data.plans, data.occurrences]) expect(rows.every((r) => r.category === 'Vacaciones')).toBe(true);
  expect(data.movements[0]).toMatchObject({ emoji: '✈️', amount: 10000, version: 2 });
  expect(data.recurring[0]).toMatchObject({ emoji: '🚌', version: 2 });
  await expect(finance.editExpense(db, 'owner', expense.id, { ...expense, version: 1 })).rejects.toMatchObject({ status: 409 });
  const destination = data.categories.find((c) => c.name === 'General')!;
  await categories.deleteCategory(db, 'owner', category.id, { version: 2, replacementId: destination.id });
  const after = await snapshot();
  for (const rows of [after.movements, after.recurring, after.plans, after.occurrences]) expect(rows.every((r) => r.category === 'General')).toBe(true);
  expect(after.movements[0].amount).toBe(10000);
});

it('deja gastos sin categoría al eliminar sin destino y mantiene los totales del mes', async () => {
  const category = await categories.createCategory(db, 'owner', input());
  const bank = await finance.createAccount(db, 'owner', { id: randomUUID(), name: 'Banco', emoji: '🏦', currency: 'ARS', type: 'bank' });
  await finance.createExpense(db, 'owner', { id: randomUUID(), concept: 'Compra', amount: 10000, date: today(), accountId: bank.id, category: category.name, emoji: '🛍️', notes: '' });
  await categories.deleteCategory(db, 'owner', category.id, { version: 1, replacementId: null });
  expect(summarizeCategories(await snapshot(), month, 'ARS').find((r) => r.name === 'Sin categoría')).toMatchObject({ current: 10000 });
});

it('compara meses y monedas, excluye anulados y cuenta solamente el gasto de transferencias', async () => {
  const category = await categories.createCategory(db, 'owner', input());
  const bank = await finance.createAccount(db, 'owner', { id: randomUUID(), name: 'Banco', emoji: '🏦', currency: 'ARS', type: 'bank' });
  const expense = { id: randomUUID(), concept: 'Compra', amount: 10000, date: today(), accountId: bank.id, category: category.name, emoji: '🛍️', notes: '' };
  await finance.createExpense(db, 'owner', expense);
  await finance.createExpense(db, 'owner', { ...expense, id: randomUUID(), date: addMonth(`${month}-01`, -1), amount: 2000 });
  const voided = await finance.createExpense(db, 'owner', { ...expense, id: randomUUID(), amount: 999 });
  await finance.voidMovement(db, 'owner', voided.id, 1);
  await insertLegacyTransfer(db, 'owner', { id: randomUUID(), concept: 'Transferencia', accountId: bank.id, destinationId: null, direction: 'outgoing', classification: 'neutral', counterpart: 'Persona', amount: 10000, receivedAmount: null, fee: 500, date: today(), notes: '' });
  const data = await snapshot();
  const ars = summarizeCategories(data, month, 'ARS');
  expect(ars.find((r) => r.name === category.name)).toMatchObject({ current: 10000, previous: 2000, budget: 20000 });
  expect(ars.find((r) => r.name === 'Sin categoría')).toMatchObject({ current: 500 });
  expect(ars.reduce((sum, r) => sum + r.current, 0)).toBe(10500);
  expect(summarizeCategories(data, month, 'USD').find((r) => r.name === category.name)).toMatchObject({ current: 0, previous: 0, budget: 5000 });
});

it('restaura presupuestos y respaldos antiguos, y conserva una lista de categorías vacía', async () => {
  await categories.createCategory(db, 'owner', input());
  const backup = await exportBackup(db, 'owner');
  await restoreBackup(db, 'other', backup);
  expect((await snapshot('other')).categories.find((c) => c.name === 'Viajes')).toMatchObject({ budgetArs: 20000, budgetUsd: 5000 });
  await restoreBackup(db, 'other', { ...backup, categories: backup.categories.map(({ budgetArs, budgetUsd, version, ...c }) => c) });
  expect((await snapshot('other')).categories.find((c) => c.name === 'Viajes')).toMatchObject({ budgetArs: 0, budgetUsd: 0, version: 1 });
  await restoreBackup(db, 'other', { ...backup, categories: [] });
  expect((await snapshot('other')).categories).toEqual([]);
});

it('valida nombres reservados, presupuestos negativos y fracciones de centavo', () => {
  expect(categoryInputSchema.safeParse({ ...input(), name: 'Sin categoría' }).success).toBe(false);
  expect(categoryInputSchema.safeParse({ ...input(), budgetArs: -1 }).success).toBe(false);
  expect(categoryInputSchema.safeParse({ ...input(), budgetUsd: 0.5 }).success).toBe(false);
});

it('migra categorías existentes conservando sus identificadores y emojis sin agregar predeterminadas', async () => {
  const legacy = createClient({ url: ':memory:' });
  try {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === '0005_cool_paladin');
    for (const entry of journal.entries.slice(0, index)) await legacy.executeMultiple(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
    await legacy.execute("INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('legacy','Persona','legacy@example.com',0,0)");
    const id = randomUUID();
    await legacy.execute({ sql: 'INSERT INTO category (id,user_id,name,emoji) VALUES (?,?,?,?)', args: [id, 'legacy', 'Mi categoría', '🎯'] });
    for (const entry of journal.entries.slice(index)) await legacy.executeMultiple(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
    const migrated = drizzle(legacy, { schema });
    const data = await finance.getSnapshot(migrated, 'legacy', month);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0]).toMatchObject({ id, name: 'Mi categoría', emoji: '🎯', budgetArs: 0, budgetUsd: 0, version: 1 });
    expect((await legacy.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
  } finally { legacy.close(); }
});
