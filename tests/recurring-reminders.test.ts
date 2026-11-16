import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from '../server/db/client';
import * as schema from '../server/db/schema';
import { remindersForDate } from '../server/recurring-reminders';

let client: ReturnType<typeof createClient>;
let db: Database;
const owner = 'owner';
const other = 'other';

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.insert(schema.user).values([owner, other].map((id) => ({
    id, name: id, email: `${id}@example.invalid`, createdAt: new Date(), updatedAt: new Date(),
  })));
  await db.insert(schema.financeAccounts).values([
    { id: 'wallet', userId: owner, name: 'Mercado Pago', type: 'wallet', currency: 'ARS', emoji: 'M' },
    { id: 'bank', userId: owner, name: 'Banco', type: 'bank', currency: 'USD', emoji: 'B' },
    { id: 'other-bank', userId: other, name: 'Otra cuenta', type: 'bank', currency: 'USD', emoji: 'B' },
  ]);
});

afterEach(() => client.close());

function rule(id: string, overrides: Partial<typeof schema.recurring.$inferInsert> = {}) {
  return {
    id, name: id, userId: owner, accountId: 'wallet', amount: 4_000_000, dueDay: 18, startDate: '2027-01-01',
    kind: 'subscription' as const, emoji: 'S', category: 'Servicios', ...overrides,
  };
}

it('agrupa por persona y fecha sin crear períodos para una pantalla que nunca se abrió', async () => {
  await db.insert(schema.recurring).values([
    rule('Netflix'), rule('ChatGPT Plus'), rule('Internet', { dueDay: 19 }),
    rule('Cargo ajeno', { userId: other, accountId: 'other-bank', amount: 1250 }),
  ]);

  const reminders = await remindersForDate(db, [owner, other], '2027-11-18');
  expect(reminders.get(owner)).toEqual({
    title: 'Recordatorio de recurrentes',
    body: 'Recordá que el 18/11 vence ChatGPT Plus por $40.000 ARS en Mercado Pago (y 1 más ese día).',
    dueDate: '2027-11-18',
  });
  expect(reminders.get(other)?.body).toBe('Recordá que el 18/11 vence Cargo ajeno por $12,50 USD en Otra cuenta.');
  expect([...await remindersForDate(db, [owner], '2027-11-18')]).toHaveLength(1);
  expect(await db.select().from(schema.occurrences)).toEqual([]);
});

it('usa los datos de los períodos guardados y omite pagos confirmados, omitidos, pausados y eliminados', async () => {
  await db.insert(schema.recurring).values([
    rule('Editado', { dueDay: 20, name: 'Nombre nuevo' }),
    rule('Pagado'), rule('Omitido'), rule('Pausado', { active: false }), rule('Eliminado', { active: false, deleted: true }),
  ]);
  await db.insert(schema.occurrences).values([
    { ruleId: 'Editado', name: 'Nombre anterior', accountId: 'bank', amount: 1799, status: 'pending' as const },
    { ruleId: 'Pagado', name: 'Pagado', accountId: 'wallet', amount: 1200, status: 'paid' as const },
    { ruleId: 'Omitido', name: 'Omitido', accountId: 'wallet', amount: 1200, status: 'skipped' as const },
    { ruleId: 'Pausado', name: 'Pausado', accountId: 'wallet', amount: 1200, status: 'pending' as const },
  ].map((period) => ({
    ...period, id: `${period.ruleId}:2027-11`, userId: owner, period: '2027-11',
    dueDate: '2027-11-18', emoji: 'S', category: 'Servicios',
  })));

  expect((await remindersForDate(db, [owner], '2027-11-18')).get(owner)?.body)
    .toBe('Recordá que el 18/11 vence Nombre anterior por $17,99 USD en Banco.');
  expect((await remindersForDate(db, [owner], '2027-11-20')).size).toBe(0);
});

it('ajusta los días al fin de mes y respeta el comienzo y la reanudación de la regla', async () => {
  await db.insert(schema.recurring).values([
    rule('Fin de mes', { dueDay: 31 }),
    rule('Empieza después', { dueDay: 1, startDate: '2027-02-10' }),
    rule('Reanuda después', { dueDay: 28, generationFrom: '2027-03-01' }),
  ]);

  expect((await remindersForDate(db, [owner], '2027-02-01')).size).toBe(0);
  expect((await remindersForDate(db, [owner], '2027-02-28')).get(owner)?.body)
    .toBe('Recordá que el 28/02 vence Fin de mes por $40.000 ARS en Mercado Pago.');
  expect((await remindersForDate(db, [owner], '2027-03-01')).get(owner)?.body)
    .toContain('vence Empieza después');
  expect((await remindersForDate(db, [owner], '2027-03-28')).get(owner)?.body)
    .toContain('vence Reanuda después');
});
