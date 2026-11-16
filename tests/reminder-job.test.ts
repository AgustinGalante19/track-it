import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '../server/db/client';
import * as schema from '../server/db/schema';
import { handleReminderCron, sendScheduledReminders } from '../server/reminder-job';
import webPush from 'web-push';

let client: ReturnType<typeof createClient>;
let db: Database;
const beforeNine = new Date('2026-11-30T11:59:59Z');
const atNine = new Date('2026-11-30T12:00:00Z');

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.insert(schema.user).values({ id: 'user', name: 'Persona', email: 'test@example.invalid', createdAt: atNine, updatedAt: atNine });
  await db.insert(schema.financeAccounts).values({ id: 'wallet', userId: 'user', name: 'Mercado Pago', type: 'wallet', currency: 'ARS', emoji: 'M' });
  await db.insert(schema.recurring).values({ id: 'rule', userId: 'user', accountId: 'wallet', name: 'ChatGPT Plus', amount: 4_000_000, kind: 'subscription', emoji: 'C', category: 'Suscripciones', dueDay: 1, startDate: '2026-11-01' });
});

afterEach(() => {
  client.close();
  vi.unstubAllEnvs();
});

async function subscribe(id: string, daysBefore = 1) {
  // The intentionally expired session is gone. A device's consent still applies.
  await db.insert(schema.pushSubscriptions).values({ id, userId: 'user', sessionId: 'expired', endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'key', auth: 'secret', daysBefore });
}

it('sends from 09:00 Argentina, uses each device’s lead time, and atomically deduplicates overlapping runs', async () => {
  await subscribe('first');
  await subscribe('second', 2);
  const send = vi.fn(async () => {});
  await sendScheduledReminders(db, beforeNine, send);
  expect(send).toHaveBeenCalledTimes(0);

  const concurrent = await Promise.all([
    sendScheduledReminders(db, atNine, send),
    sendScheduledReminders(db, atNine, send),
  ]);
  expect(concurrent.map(({ sent }) => sent).sort()).toEqual([0, 1]);
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'first' }),
    expect.objectContaining({ dueDate: '2026-12-01', body: expect.stringContaining('$40.000 ARS') }), 54_000);

  await db.update(schema.pushSubscriptions).set({ daysBefore: 2 }).where(eq(schema.pushSubscriptions.id, 'first'));
  await sendScheduledReminders(db, new Date('2026-11-29T12:00:00Z'), send);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'second' }), expect.anything(), 54_000);
});

it('retries a failed submission and removes push registrations that have expired', async () => {
  await subscribe('retry');
  await subscribe('expired');
  const send = vi.fn(async (target: typeof schema.pushSubscriptions.$inferSelect): Promise<void> => {
    if (target.id === 'expired') throw { statusCode: 410 };
    throw { statusCode: 503 };
  });

  expect(await sendScheduledReminders(db, atNine, send)).toMatchObject({ expired: 1, failed: 1, sent: 0 });
  expect(await db.select({ id: schema.pushSubscriptions.id }).from(schema.pushSubscriptions)).toEqual([{ id: 'retry' }]);
  send.mockResolvedValue(undefined);
  expect(await sendScheduledReminders(db, atNine, send)).toMatchObject({ expired: 0, failed: 0, sent: 1 });
  expect(await sendScheduledReminders(db, atNine, send)).toMatchObject({ sent: 0 });
});

it('sends both notice types for the same date and deduplicates each independently', async () => {
  await subscribe('first');
  await db.update(schema.recurring).set({ dueDay: 27 }).where(eq(schema.recurring.id, 'rule'));
  await db.insert(schema.financeAccounts).values({
    id: 'visa', userId: 'user', name: 'Visa', type: 'credit', currency: 'ARS', emoji: 'V', closingDay: 27,
  });
  const send = vi.fn(async () => {});
  const reminderDay = new Date('2026-11-26T12:00:00Z');

  expect(await sendScheduledReminders(db, reminderDay, send)).toMatchObject({ sent: 2 });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'first' }), {
    kind: 'card-closing', title: 'Cierre de tarjeta de crédito',
    body: 'Recordá que el 27/11 cierra la tarjeta Visa.', dueDate: '2026-11-27',
  }, 54_000);
  expect(await db.select({ kind: schema.pushReminderDeliveries.kind }).from(schema.pushReminderDeliveries))
    .toEqual(expect.arrayContaining([{ kind: 'recurring' }, { kind: 'card-closing' }]));
  expect(await sendScheduledReminders(db, reminderDay, send)).toMatchObject({ sent: 0 });
  expect(send).toHaveBeenCalledTimes(2);
});

it('groups active card closings at month-end and uses each device’s lead time', async () => {
  await subscribe('one-day');
  await subscribe('two-days', 2);
  const card = { userId: 'user', type: 'credit', currency: 'ARS', emoji: 'C' } as const;
  await db.insert(schema.financeAccounts).values([
    { ...card, id: 'visa', name: 'Visa', closingDay: 31 },
    { ...card, id: 'amex', name: 'Amex', closingDay: 29 },
    { ...card, id: 'archived', name: 'Archivada', closingDay: 31, archived: true },
    { ...card, id: 'no-date', name: 'Sin fecha' },
  ]);
  const send = vi.fn(async () => {});

  expect(await sendScheduledReminders(db, new Date('2027-02-26T12:00:00Z'), send)).toMatchObject({ sent: 1 });
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'two-days' }),
    expect.objectContaining({ dueDate: '2027-02-28', body: 'Recordá que el 28/02 cierra la tarjeta Amex (y 1 más ese día).' }), 54_000);
});

it('requires the cron bearer secret before accessing the database or dispatching', async () => {
  const keys = webPush.generateVAPIDKeys();
  vi.stubEnv('VAPID_SUBJECT', 'mailto:push@example.com');
  vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
  vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);
  vi.stubEnv('CRON_SECRET', 'a-long-test-secret');
  const url = 'https://example.com/api/cron/recurring-reminders';
  expect((await handleReminderCron(new Request(url), db)).status).toBe(401);
  expect((await handleReminderCron(new Request(url, { headers: { Authorization: 'Bearer a-wrong-test-secret' } }), db)).status).toBe(401);
});
