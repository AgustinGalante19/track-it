import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import webPush from 'web-push';
import type { Database } from './db/client';
import { pushReminderDeliveries as deliveries, pushSubscriptions as subscriptions } from './db/schema';
import { getPushConfig } from './push-subscriptions';
import { remindersForDate, type ReminderPayload } from './recurring-reminders';

const localClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const startHour = 9;
const leaseMs = 2 * 60_000;
const intervalMs = 5 * 60_000;

type Target = typeof subscriptions.$inferSelect;
type SendReminder = (target: Target, payload: ReminderPayload, ttl: number) => Promise<unknown>;
type PushConfig = NonNullable<ReturnType<typeof getPushConfig>>;
type TestPushPayload = { kind: 'test'; title: string; body: string };

function sameSubscription(target: Target) {
  return and(eq(subscriptions.id, target.id), eq(subscriptions.userId, target.userId),
    eq(subscriptions.sessionId, target.sessionId), eq(subscriptions.endpoint, target.endpoint),
    eq(subscriptions.p256dh, target.p256dh), eq(subscriptions.auth, target.auth),
    eq(subscriptions.daysBefore, target.daysBefore));
}

async function submitPush(db: Database, target: Target, send: () => Promise<unknown>) {
  try {
    await send();
    return 'sent';
  } catch (error) {
    const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null;
    if (status === 404 || status === 410) {
      await db.delete(subscriptions).where(sameSubscription(target));
      return 'expired';
    }
    return 'failed';
  }
}

async function deliver(db: Database, target: Target, payload: ReminderPayload, ttl: number, send: SendReminder) {
  const now = Date.now();
  const leaseUntil = now + leaseMs;
  const { dueDate } = payload;
  // Recheck enrollment and claim the delivery together after computing the reminder.
  const claimed = await db.insert(deliveries)
    .select(sql`select ${subscriptions.id}, ${dueDate}, ${leaseUntil}, null
      from ${subscriptions} where ${sameSubscription(target)}`)
    .onConflictDoUpdate({
      target: [deliveries.subscriptionId, deliveries.dueDate],
      set: { leaseUntil },
      setWhere: and(isNull(deliveries.sentAt), lte(deliveries.leaseUntil, now)),
    }).returning({ id: deliveries.subscriptionId });
  if (!claimed.length) return 'skipped';

  const claim = and(eq(deliveries.subscriptionId, target.id), eq(deliveries.dueDate, dueDate), eq(deliveries.leaseUntil, leaseUntil));
  const status = await submitPush(db, target, () => send(target, payload, ttl));
  if (status === 'sent') await db.update(deliveries).set({ sentAt: Date.now() }).where(claim);
  else await db.delete(deliveries).where(claim);
  return status;
}

export async function sendScheduledReminders(db: Database, now: Date, send: SendReminder) {
  const result = { sent: 0, expired: 0, failed: 0, skipped: 0 };
  const { year, month, day, hour, minute, second } = Object.fromEntries(localClock.formatToParts(now).map(({ type, value }) => [type, value]));
  if (Number(hour) < startHour) return result;

  const date = `${year}-${month}-${day}`;
  const ttl = 86_400 - Number(hour) * 3600 - Number(minute) * 60 - Number(second);
  const dueDate = sql<string>`date(${date}, '+' || ${subscriptions.daysBefore} || ' days')`;
  const targets = await db.select({ target: subscriptions, dueDate }).from(subscriptions)
    .leftJoin(deliveries, and(eq(deliveries.subscriptionId, subscriptions.id), eq(deliveries.dueDate, dueDate)))
    .where(or(isNull(deliveries.subscriptionId), and(isNull(deliveries.sentAt), lte(deliveries.leaseUntil, Date.now()))));

  const byDate = new Map<string, Target[]>();
  for (const entry of targets) {
    const batch = byDate.get(entry.dueDate);
    if (batch) batch.push(entry.target);
    else byDate.set(entry.dueDate, [entry.target]);
  }

  for (const [date, targetsForDate] of byDate) {
    for (let offset = 0; offset < targetsForDate.length; offset += 100) {
      const batch = targetsForDate.slice(offset, offset + 100);
      const reminders = await remindersForDate(db, [...new Set(batch.map((target) => target.userId))], date);
      const pending = batch.filter((target) => reminders.has(target.userId));
      for (let index = 0; index < pending.length; index += 10) {
        const attempts = await Promise.all(pending.slice(index, index + 10).map((target) =>
          deliver(db, target, reminders.get(target.userId)!, ttl, send)));
        for (const attempt of attempts) result[attempt]++;
      }
    }
  }
  return result;
}

function pushSender(vapidDetails: PushConfig) {
  return (target: Target, payload: ReminderPayload | TestPushPayload, ttl: number) => webPush.sendNotification({
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.auth },
  }, JSON.stringify(payload), {
    vapidDetails, TTL: ttl, timeout: 10_000,
    ...('dueDate' in payload ? { topic: `recurring-${payload.dueDate}` } : { topic: 'track-it-test', urgency: 'high' }),
  });
}

export async function sendTestPushNotifications(db: Database, config: PushConfig) {
  const targets = await db.select().from(subscriptions);
  const send = pushSender(config);
  const payload: TestPushPayload = { kind: 'test', title: 'Prueba de Track-It', body: 'Esta es una notificación de prueba.' };
  const result = { sent: 0, expired: 0, failed: 0 };

  for (let index = 0; index < targets.length; index += 10) {
    const attempts = await Promise.all(targets.slice(index, index + 10).map((target) =>
      submitPush(db, target, () => send(target, payload, 5 * 60))));
    for (const status of attempts) result[status]++;
  }
  return result;
}

export function startReminderScheduler(db: Database) {
  const config = getPushConfig();
  if (!config) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { failed } = await sendScheduledReminders(db, new Date(), pushSender(config));
      if (failed) console.warn(`No se pudieron enviar ${failed} avisos de recurrentes.`);
    } catch {
      console.error('No se pudo ejecutar el envío de avisos de recurrentes.');
    } finally {
      running = false;
    }
  };
  setInterval(() => void run(), intervalMs).unref();
  void run();
}

export async function handleReminderCron(request: Request, db: Database) {
  const config = getPushConfig();
  if (!config) return new Response(null, { status: 204 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('Authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  const result = await sendScheduledReminders(db, new Date(), pushSender(config));
  return Response.json(result, { status: result.failed ? 502 : 200 });
}
