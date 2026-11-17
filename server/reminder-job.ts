import { randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import webPush from 'web-push';
import type { Database } from './db/client';
import { pushReminderDeliveries as deliveries, pushSubscriptions as subscriptions } from './db/schema';
import { getPushConfig } from './push-subscriptions';
import { remindersForDate, type ReminderPayload } from './recurring-reminders';
import { cardClosingRemindersForDate, type CardClosingReminder } from './card-closing-reminders';
import { today } from '../shared/format';
import {
  beginNotificationRun, finishNotificationRun, recordNotificationDeliveries,
  type NotificationCounts, type NotificationDeliveryInput, type NotificationRunSource, type NotificationRunStatus,
} from './notification-history';
import { createReceiptToken } from './notification-receipts';

const localClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const startHour = 9;
const leaseMs = 2 * 60_000;
const intervalMs = 5 * 60_000;

type Target = typeof subscriptions.$inferSelect;
type ReminderKind = typeof deliveries.$inferSelect.kind;
type ScheduledPushPayload = ReminderPayload | CardClosingReminder;
type SendReminder = (target: Target, payload: ScheduledPushPayload & { receiptToken?: string }, ttl: number) => Promise<unknown>;
type PushConfig = NonNullable<ReturnType<typeof getPushConfig>>;
type TestPushPayload = ReminderPayload & { kind: 'test' };
type Outcome = { status: keyof NotificationCounts; httpStatus: number | null };
type Audit = { id: string | null; counts: NotificationCounts; receiptSecret?: string };

function providerFor(endpoint: string): NotificationDeliveryInput['provider'] {
  if (endpoint.startsWith('https://fcm.googleapis.com/')) return 'fcm';
  if (endpoint.startsWith('https://updates.push.services.mozilla.com/')) return 'mozilla';
  return 'other';
}

async function runWithHistory(db: Database, source: NotificationRunSource, now: Date, receiptSecret: string | undefined,
  work: (audit: Audit) => Promise<string | undefined>) {
  const id = await beginNotificationRun(db, source, now).catch(() => {
    console.error('[push] No se pudo abrir el historial de la comprobación.');
    return null;
  });
  const audit: Audit = { id, counts: { sent: 0, expired: 0, failed: 0, skipped: 0 }, receiptSecret };
  let status: NotificationRunStatus = 'failed';
  let reason: string | undefined = 'run-error';
  try {
    reason = await work(audit);
    status = reason === 'before-window' || reason === 'vapid-unavailable' ? 'skipped' : 'completed';
    return audit.counts;
  } finally {
    if (id) await finishNotificationRun(db, id, status, audit.counts, reason).catch(() => {
      console.error('[push] No se pudo cerrar el historial de la comprobación.');
    });
  }
}

async function dispatchBatch(db: Database, audit: Audit, kind: NotificationDeliveryInput['kind'], targets: Target[],
  attempt: (target: Target, token?: string) => Promise<Outcome>) {
  const entries: NotificationDeliveryInput[] = targets.map((target) => ({
    id: randomUUID(), kind, status: 'pending', deviceId: target.id, provider: providerFor(target.endpoint),
  }));
  const { id, receiptSecret } = audit;
  const staged = id && receiptSecret && await recordNotificationDeliveries(db, id, entries).then(() => true, () => false);
  // The browser can acknowledge before the provider responds. Staging first keeps that receipt.
  const final = await Promise.all(targets.map(async (target, index) => {
    const entry = entries[index];
    const token = staged && receiptSecret ? createReceiptToken(entry.id, receiptSecret) : undefined;
    const result = await attempt(target, token).catch((): Outcome => ({ status: 'failed', httpStatus: null }));
    audit.counts[result.status]++;
    return { ...entry, ...result, at: new Date() };
  }));
  if (id) await recordNotificationDeliveries(db, id, final).catch(() => {
    console.error('[push] No se pudo guardar el detalle de los envíos.');
  });
}

function sameSubscription(target: Target) {
  return and(eq(subscriptions.id, target.id), eq(subscriptions.userId, target.userId),
    eq(subscriptions.sessionId, target.sessionId), eq(subscriptions.endpoint, target.endpoint),
    eq(subscriptions.p256dh, target.p256dh), eq(subscriptions.auth, target.auth),
    eq(subscriptions.daysBefore, target.daysBefore));
}

function providerStatus(result: unknown) {
  return result && typeof result === 'object' && 'statusCode' in result && typeof result.statusCode === 'number'
    ? result.statusCode : null;
}

async function submitPush(db: Database, target: Target, send: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { status: 'sent', httpStatus: providerStatus(await send()) };
  } catch (error) {
    const httpStatus = providerStatus(error);
    if (httpStatus === 404 || httpStatus === 410) {
      await db.delete(subscriptions).where(sameSubscription(target));
      return { status: 'expired', httpStatus };
    }
    return { status: 'failed', httpStatus };
  }
}

async function deliver(db: Database, target: Target, payload: ScheduledPushPayload, kind: ReminderKind, ttl: number, send: SendReminder, token?: string): Promise<Outcome> {
  const now = Date.now();
  const leaseUntil = now + leaseMs;
  const { dueDate } = payload;
  // Recheck enrollment and claim the delivery together after computing the reminder.
  const claimed = await db.insert(deliveries)
    .select(sql`select ${subscriptions.id}, ${dueDate}, ${leaseUntil}, null, ${kind}
      from ${subscriptions} where ${sameSubscription(target)}`)
    .onConflictDoUpdate({
      target: [deliveries.subscriptionId, deliveries.dueDate, deliveries.kind],
      set: { leaseUntil },
      setWhere: and(isNull(deliveries.sentAt), lte(deliveries.leaseUntil, now)),
    }).returning({ id: deliveries.subscriptionId });
  if (!claimed.length) return { status: 'skipped', httpStatus: null };

  const claim = and(eq(deliveries.subscriptionId, target.id), eq(deliveries.dueDate, dueDate),
    eq(deliveries.kind, kind), eq(deliveries.leaseUntil, leaseUntil));
  const outcome = await submitPush(db, target, () => send(target, token ? { ...payload, receiptToken: token } : payload, ttl));
  if (outcome.status === 'sent') await db.update(deliveries).set({ sentAt: Date.now() }).where(claim);
  else await db.delete(deliveries).where(claim);
  return outcome;
}

const readReminders = { recurring: remindersForDate, 'card-closing': cardClosingRemindersForDate };

async function sendRemindersOfKind(db: Database, audit: Audit, kind: ReminderKind, date: string, ttl: number, send: SendReminder) {
  const dueDate = sql<string>`date(${date}, '+' || ${subscriptions.daysBefore} || ' days')`;
  const targets = await db.select({ target: subscriptions, dueDate }).from(subscriptions)
    .leftJoin(deliveries, and(eq(deliveries.subscriptionId, subscriptions.id), eq(deliveries.dueDate, dueDate), eq(deliveries.kind, kind)))
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
      const reminders = await readReminders[kind](db, [...new Set(batch.map((target) => target.userId))], date);
      const pending = batch.filter((target) => reminders.has(target.userId));
      for (let index = 0; index < pending.length; index += 10) {
        await dispatchBatch(db, audit, kind, pending.slice(index, index + 10), (target, token) =>
          deliver(db, target, reminders.get(target.userId)!, kind, ttl, send, token));
      }
    }
  }
}

export async function sendScheduledReminders(db: Database, now: Date, send: SendReminder, receiptSecret?: string, source: 'scheduler' | 'cron' = 'scheduler') {
  return runWithHistory(db, source, now, receiptSecret, async (audit) => {
    const { year, month, day, hour, minute, second } = Object.fromEntries(localClock.formatToParts(now).map(({ type, value }) => [type, value]));
    if (Number(hour) < startHour) return 'before-window';

    const date = `${year}-${month}-${day}`;
    const ttl = 86_400 - Number(hour) * 3600 - Number(minute) * 60 - Number(second);
    await sendRemindersOfKind(db, audit, 'recurring', date, ttl, send);
    await sendRemindersOfKind(db, audit, 'card-closing', date, ttl, send);
    if (Object.values(audit.counts).every((count) => count === 0)) return 'no-due';
  });
}

function pushSender(vapidDetails: PushConfig) {
  return (target: Target, payload: (ScheduledPushPayload | TestPushPayload) & { receiptToken?: string }, ttl: number) => webPush.sendNotification({
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.auth },
  }, JSON.stringify(payload), {
    vapidDetails, TTL: ttl, timeout: 10_000,
    ...('kind' in payload && payload.kind === 'test' ? { topic: 'track-it-test', urgency: 'high' }
      : { topic: `${'kind' in payload ? payload.kind : 'recurring'}-${payload.dueDate}` }),
  });
}

export async function sendTestPushNotifications(db: Database, config: PushConfig) {
  const { sent, expired, failed } = await runWithHistory(db, 'test', new Date(), config.privateKey, async (audit) => {
    const targets = await db.select().from(subscriptions);
    if (!targets.length) return 'no-devices';
    const send = pushSender(config);
    // The initial worker requires a due date. Use a past date so its tag does not replace upcoming reminders.
    const previousDay = new Date(`${today()}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const payload: TestPushPayload = {
      kind: 'test', title: 'Prueba de Track-It', body: 'Esta es una notificación de prueba.',
      dueDate: previousDay.toISOString().slice(0, 10),
    };

    for (let index = 0; index < targets.length; index += 10) {
      await dispatchBatch(db, audit, 'test', targets.slice(index, index + 10), (target, token) =>
        submitPush(db, target, () => send(target, token ? { ...payload, receiptToken: token } : payload, 5 * 60)));
    }
  });
  return { sent, expired, failed };
}

export function startReminderScheduler(db: Database) {
  const config = getPushConfig();
  if (!config) {
    void runWithHistory(db, 'scheduler', new Date(), undefined, async () => 'vapid-unavailable');
    return;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { failed } = await sendScheduledReminders(db, new Date(), pushSender(config), config.privateKey);
      if (failed) console.warn(`No se pudieron enviar ${failed} avisos programados.`);
    } catch {
      console.error('No se pudo ejecutar el envío de avisos programados.');
    } finally {
      running = false;
    }
  };
  setInterval(() => void run(), intervalMs).unref();
  void run();
}

export async function handleReminderCron(request: Request, db: Database) {
  const config = getPushConfig();
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: config ? 503 : 204 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('Authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  if (!config) {
    await runWithHistory(db, 'cron', new Date(), undefined, async () => 'vapid-unavailable');
    return new Response(null, { status: 204 });
  }
  const result = await sendScheduledReminders(db, new Date(), pushSender(config), config.privateKey, 'cron');
  return Response.json(result, { status: result.failed ? 502 : 200 });
}
