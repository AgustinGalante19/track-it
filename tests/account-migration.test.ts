import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import * as schema from '../server/db/schema';
import { accountHistory, getSnapshot } from '../server/service';
import { today } from '../shared/domain';

it('quita los saldos de una base existente conservando cuentas, movimientos y relaciones', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    const balanceMigration = journal.entries.findIndex((entry: { tag: string }) => entry.tag === '0004_remove-account-balances');
    for (const entry of journal.entries.slice(0, balanceMigration)) await client.executeMultiple(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
    await client.execute('PRAGMA foreign_keys = ON');
    const db = drizzle(client, { schema });
    await db.insert(schema.user).values({ id: 'owner', name: 'Persona', email: 'owner@example.com', createdAt: new Date(), updatedAt: new Date() });
    const id = randomUUID();
    await client.execute({ sql: 'INSERT INTO finance_account (id, user_id, name, type, currency, emoji, opening_balance, opening_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [id, 'owner', 'Mi banco', 'bank', 'ARS', '🏦', 100000, '2026-01-01'] });
    // Insertar el registro anterior sin consultar columnas añadidas por migraciones posteriores.
    const movementId = randomUUID();
    await db.insert(schema.movements).values({ id: movementId, userId: 'owner', accountId: id, concept: 'Compra anterior', amount: 25000, date: today(), category: 'General', emoji: '🛒', notes: '', kind: 'expense', currency: 'ARS', classification: 'expense', expenseAmount: 25000, sourceType: 'single', createdAt: new Date().toISOString() });
    await db.insert(schema.postings).values({ id: randomUUID(), movementId, accountId: id, delta: -25000 });
    const before = await db.select({ posting: schema.postings, movement: schema.movements }).from(schema.postings).innerJoin(schema.movements, eq(schema.movements.id, schema.postings.movementId));
    await client.executeMultiple(readFileSync('drizzle/0004_remove-account-balances.sql', 'utf8'));
    for (const entry of journal.entries.slice(balanceMigration + 1)) await client.executeMultiple(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
    const data = await getSnapshot(db, 'owner', today().slice(0, 7));
    expect(data.accounts[0]).toMatchObject({ id, name: 'Mi banco', currency: 'ARS', color: null });
    expect(await accountHistory(db, 'owner', id)).toEqual(before);
    expect((await client.execute('PRAGMA table_info(finance_account)')).rows.map((row) => row.name)).not.toContain('opening_balance');
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
  } finally { client.close(); }
});
