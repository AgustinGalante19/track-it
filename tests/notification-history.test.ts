import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from '../server/db/client';
import * as schema from '../server/db/schema';
import {
  beginNotificationRun, finishNotificationRun, listNotificationHistory, notificationDeviceLabel,
  recordNotificationDeliveries, recordNotificationReceipt, type NotificationDeliveryInput,
} from '../server/notification-history';

let client: ReturnType<typeof createClient>;
let db: Database;
const minute = 60_000;
const day = 24 * 60 * minute;
const counts = { sent: 1, failed: 0, expired: 0, skipped: 0 };
const pending = (deviceId: string): NotificationDeliveryInput => ({
  id: randomUUID(), kind: 'test', status: 'pending', provider: 'fcm', deviceId,
});

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
});
afterEach(() => client.close());

it('preserves early browser confirmation during transport finalization and hides the subscription ID', async () => {
  const now = new Date(Date.now() - minute);
  const runId = await beginNotificationRun(db, 'test', now);
  const deviceId = 'subscription-one';
  const initial = { ...pending(deviceId), at: now };
  await recordNotificationDeliveries(db, runId, [initial]);
  await recordNotificationReceipt(db, initial.id, 'display-failed');
  await recordNotificationReceipt(db, initial.id, 'shown');
  const [{ receiptAt }] = await db.select({ receiptAt: schema.notificationDeliveries.receiptAt }).from(schema.notificationDeliveries);
  expect(receiptAt).toBeInstanceOf(Date);

  const finalizedAt = new Date(now.getTime() + 600);
  await recordNotificationDeliveries(db, runId, [{ ...initial, at: finalizedAt, status: 'sent', httpStatus: 201 }]);
  await recordNotificationDeliveries(db, runId, [initial]);
  await recordNotificationReceipt(db, initial.id, 'shown');
  await recordNotificationReceipt(db, initial.id, 'display-failed');
  await finishNotificationRun(db, runId, 'completed', counts);

  const history = await listNotificationHistory(db);
  expect(history).toMatchObject({ nextCursor: null, runs: [{
    source: 'test', status: 'completed', startedAt: now.toISOString(), counts, reason: null, deliveryCount: 1,
    deliveries: [{
      at: finalizedAt.toISOString(), kind: 'test', status: 'sent', provider: 'fcm', device: notificationDeviceLabel(deviceId),
      httpStatus: 201, receipt: 'shown', receiptAt: receiptAt?.toISOString(),
    }],
  }] });
  expect(JSON.stringify(history).includes(deviceId)).toBe(false);
});

it('paginates runs with the same timestamp and limits detail rows without hiding the count', async () => {
  const now = new Date(Date.now() - minute);
  const ids = Array.from({ length: 26 }, () => randomUUID()).sort();
  await db.insert(schema.notificationRuns).values(ids.map((id) => ({ id, source: 'scheduler' as const, startedAt: now })));
  const newest = ids.at(-1)!;
  const attempts = Array.from({ length: 105 }, (_, index) => ({ ...pending(`device-${index}`), at: new Date(now.getTime() + index) }));
  await recordNotificationDeliveries(db, newest, attempts);

  const first = await listNotificationHistory(db);
  expect(first.runs.map(({ id }) => id)).toEqual(ids.slice(1).reverse());
  expect(first.runs[0].deliveries).toHaveLength(50);
  expect(first.runs[0].deliveryCount).toBe(105);
  expect(first.runs[0].deliveries[0]).toMatchObject({ device: notificationDeviceLabel('device-104'), receipt: null, status: 'pending' });
  expect(first.nextCursor).toBeTruthy();
  const last = await listNotificationHistory(db, first.nextCursor!);
  expect(last.runs.map(({ id }) => id)).toEqual([ids[0]]);
  expect(last.nextCursor).toBeNull();
});

it('prunes expired runs and their details at the next run', async () => {
  const now = new Date();
  await client.execute('PRAGMA foreign_keys = OFF');
  const old = await beginNotificationRun(db, 'cron', new Date(now.getTime() - 15 * day));
  await recordNotificationDeliveries(db, old, [pending('old-device')]);
  expect((await listNotificationHistory(db)).runs).toHaveLength(0);

  const recent = await beginNotificationRun(db, 'scheduler', now);
  const empty = { ...counts, sent: 0 };
  await finishNotificationRun(db, recent, 'skipped', empty, 'outside-window');
  expect((await listNotificationHistory(db)).runs).toMatchObject([{
    id: recent, counts: empty, status: 'skipped', reason: 'outside-window', deliveries: [],
  }]);
  expect(await db.select().from(schema.notificationDeliveries)).toEqual([]);
  expect(await db.select({ id: schema.notificationRuns.id }).from(schema.notificationRuns)).toEqual([{ id: recent }]);
});
