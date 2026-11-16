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
