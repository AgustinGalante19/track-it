import { and, eq, gte, inArray } from 'drizzle-orm';
import { monthDate, validDate } from '../shared/format';
import type { Database } from './db/client';
import { financeAccounts } from './db/schema';
import type { ReminderPayload } from './recurring-reminders';

export type CardClosingReminder = ReminderPayload & { kind: 'card-closing' };

export async function cardClosingRemindersForDate(db: Database, userIds: string[], dueDate: string): Promise<Map<string, CardClosingReminder>> {
  if (!userIds.length || !validDate(dueDate)) return new Map();

  const closingDay = Number(dueDate.slice(8));
  const lastDayOfMonth = monthDate(dueDate.slice(0, 7), 31);
  const dateMatches = dueDate === lastDayOfMonth
    ? gte(financeAccounts.closingDay, closingDay)
    : eq(financeAccounts.closingDay, closingDay);
  const cards = await db.select({ userId: financeAccounts.userId, name: financeAccounts.name }).from(financeAccounts)
    .where(and(inArray(financeAccounts.userId, userIds), eq(financeAccounts.type, 'credit'), eq(financeAccounts.archived, false), dateMatches))
    .orderBy(financeAccounts.name, financeAccounts.id);

  const groups = new Map<string, { name: string; count: number }>();
  for (const { userId, name } of cards) {
    const existing = groups.get(userId);
    if (existing) existing.count++;
    else groups.set(userId, { name, count: 1 });
  }

  const dateLabel = `${dueDate.slice(8)}/${dueDate.slice(5, 7)}`;
  const reminders = new Map<string, CardClosingReminder>();
  for (const [userId, { name, count }] of groups) {
    const extra = count > 1 ? ` (y ${count - 1} más ese día)` : '';
    reminders.set(userId, {
      kind: 'card-closing',
      title: 'Cierre de tarjeta de crédito',
      body: `Recordá que el ${dateLabel} cierra la tarjeta ${name}${extra}.`,
      dueDate,
    });
  }
  return reminders;
}
