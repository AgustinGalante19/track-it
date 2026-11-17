import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client';
import { notificationDeliveries as deliveries, notificationRuns as runs } from './db/schema';

const retentionMs = 14 * 24 * 60 * 60 * 1000;
const pageSize = 25;
const deliveriesPerRun = 50;
const insertionBatchSize = 100;

type NotificationRun = typeof runs.$inferSelect;
type NotificationDelivery = typeof deliveries.$inferSelect;
export type NotificationRunSource = NotificationRun['source'];
export type NotificationRunStatus = Exclude<NotificationRun['status'], 'running'>;
export type NotificationCounts = Pick<NotificationRun, 'sent' | 'expired' | 'failed' | 'skipped'>;
export type NotificationReceipt = NonNullable<NotificationDelivery['receipt']>;
export type NotificationDeliveryInput = Pick<NotificationDelivery, 'id' | 'kind' | 'status' | 'provider'> & {
  at?: Date;
  deviceId: string;
  httpStatus?: number | null;
};

export const notificationHistoryCursorSchema = z.string()
  .regex(/^\d{1,15}:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/, 'Cursor de notificaciones inválido.');

export async function beginNotificationRun(db: Database, source: NotificationRunSource, now: Date) {
  const id = randomUUID();
  const expired = lt(runs.startedAt, new Date(now.getTime() - retentionMs));
  await db.batch([
    db.delete(deliveries).where(inArray(deliveries.runId, db.select({ id: runs.id }).from(runs).where(expired))),
    db.delete(runs).where(expired),
    db.insert(runs).values({ id, source, startedAt: now }),
  ]);
  return id;
}

export async function finishNotificationRun(db: Database, id: string, status: NotificationRunStatus, counts: NotificationCounts, reason?: string) {
  await db.update(runs).set({ ...counts, status, reason: reason ?? null, finishedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.status, 'running')));
}

export function notificationDeviceLabel(deviceId: string) {
  return createHash('sha256').update('track-it:push-device:').update(deviceId).digest('hex').slice(0, 16);
}

export async function recordNotificationDeliveries(db: Database, runId: string, entries: readonly NotificationDeliveryInput[]) {
  const now = new Date();
  for (let offset = 0; offset < entries.length; offset += insertionBatchSize) {
    const batch = entries.slice(offset, offset + insertionBatchSize).map(({ id, at, kind, status, deviceId, provider, httpStatus }) => ({
      id, at: at ?? now, kind, status, runId, provider,
      device: notificationDeviceLabel(deviceId),
      httpStatus: typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null,
    }));
    await db.insert(deliveries).values(batch).onConflictDoUpdate({
      target: deliveries.id,
      set: { status: sql`excluded.status`, at: sql`excluded.at`, httpStatus: sql`excluded.http_status` },
      setWhere: and(eq(deliveries.runId, runId), eq(deliveries.status, 'pending')),
    });
  }
}

export async function recordNotificationReceipt(db: Database, id: string, receipt: NotificationReceipt) {
  const newReceipt = isNull(deliveries.receipt);
  const canRecord = receipt === 'shown' ? or(newReceipt, eq(deliveries.receipt, 'display-failed')) : newReceipt;
  await db.update(deliveries).set({ receipt, receiptAt: new Date() }).where(and(eq(deliveries.id, id), canRecord));
}

type HistoryDelivery = Pick<NotificationDelivery, 'kind' | 'status' | 'device' | 'provider' | 'httpStatus' | 'receipt'> & {
  at: string;
  receiptAt: string | null;
};

export async function listNotificationHistory(db: Database, before?: string) {
  const [time, id] = before ? notificationHistoryCursorSchema.parse(before).split(':') : [];
  const cursorDate = new Date(Number(time));
  const previous = before ? or(lt(runs.startedAt, cursorDate), and(eq(runs.startedAt, cursorDate), lt(runs.id, id))) : undefined;
  const recent = gte(runs.startedAt, new Date(Date.now() - retentionMs));
  const result = await db.select().from(runs).where(and(recent, previous))
    .orderBy(desc(runs.startedAt), desc(runs.id)).limit(pageSize + 1);
  const page = result.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = result.length > pageSize && last ? `${last.startedAt.getTime()}:${last.id}` : null;
  const detail = new Map<string, { count: number; rows: HistoryDelivery[] }>();

  if (page.length) {
    const ranked = db.$with('ranked_notification_delivery').as(db.select({
      runId: deliveries.runId, at: deliveries.at, kind: deliveries.kind, status: deliveries.status,
      device: deliveries.device, provider: deliveries.provider, httpStatus: deliveries.httpStatus,
      receipt: deliveries.receipt, receiptAt: deliveries.receiptAt,
      count: sql<number>`count(*) over (partition by ${deliveries.runId})`.as('delivery_count'),
      rank: sql<number>`row_number() over (partition by ${deliveries.runId} order by ${deliveries.at} desc, ${deliveries.id} desc)`.as('delivery_rank'),
    }).from(deliveries).where(inArray(deliveries.runId, page.map((row) => row.id))));
    const rows = await db.with(ranked).select().from(ranked)
      .where(sql`${ranked.rank} <= ${deliveriesPerRun}`).orderBy(sql`${ranked.rank}`);

    for (const { runId, count, rank, at, receiptAt, ...row } of rows) {
      const group = detail.get(runId) ?? { count, rows: [] };
      group.rows.push({ ...row, at: at.toISOString(), receiptAt: receiptAt?.toISOString() ?? null });
      detail.set(runId, group);
    }
  }

  return {
    runs: page.map(({ id, source, status, startedAt, finishedAt, reason, sent, expired, failed, skipped }) => ({
      id, source, status, startedAt: startedAt.toISOString(), finishedAt: finishedAt?.toISOString() ?? null, reason,
      counts: { sent, expired, failed, skipped }, deliveryCount: detail.get(id)?.count ?? 0, deliveries: detail.get(id)?.rows ?? [],
    })),
    nextCursor,
  };
}
