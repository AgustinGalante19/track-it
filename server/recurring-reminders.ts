import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { formatMoneyAmount, monthDate, recurringStartMonth, validDate } from '../shared/format';
import type { Database } from './db/client';
import { financeAccounts, occurrences, recurring } from './db/schema';

export type ReminderPayload = { title: string; body: string; dueDate: string };

export async function remindersForDate(db: Database, userIds: string[], dueDate: string): Promise<Map<string, ReminderPayload>> {
  if (!userIds.length || !validDate(dueDate)) return new Map();

  const month = dueDate.slice(0, 7);
  const rows = await db.select({
    userId: recurring.userId,
    rule: {
      name: recurring.name, amount: recurring.amount, dueDay: recurring.dueDay,
      startDate: recurring.startDate, generationFrom: recurring.generationFrom,
    },
    occurrence: { name: occurrences.name, amount: occurrences.amount },
    accountName: financeAccounts.name,
    currency: financeAccounts.currency,
  }).from(recurring)
    .leftJoin(occurrences, and(
      eq(occurrences.ruleId, recurring.id),
      eq(occurrences.userId, recurring.userId),
      eq(occurrences.period, month),
    ))
    .innerJoin(financeAccounts, and(
      eq(financeAccounts.id, sql`coalesce(${occurrences.accountId}, ${recurring.accountId})`),
      eq(financeAccounts.userId, recurring.userId),
      eq(financeAccounts.archived, false),
    ))
    .where(and(
      inArray(recurring.userId, userIds),
      eq(recurring.active, true),
      eq(recurring.deleted, false),
      or(isNull(occurrences.id), and(eq(occurrences.dueDate, dueDate), eq(occurrences.status, 'pending'))),
    ))
    .orderBy(sql`coalesce(${occurrences.name}, ${recurring.name})`, recurring.id);

  const groups = new Map<string, { first: (typeof rows)[number]; count: number }>();
  for (const row of rows) {
    // The saved period keeps its own date, amount, and account even after a rule is edited.
    if (!row.occurrence && (month < recurringStartMonth(row.rule)
      || dueDate < row.rule.startDate || dueDate !== monthDate(month, row.rule.dueDay))) continue;

    const existing = groups.get(row.userId);
    if (existing) existing.count++;
    else groups.set(row.userId, { first: row, count: 1 });
  }

  const reminders = new Map<string, ReminderPayload>();
  const dateLabel = `${dueDate.slice(8)}/${dueDate.slice(5, 7)}`;
  for (const [userId, { first, count }] of groups) {
    const { name, amount } = first.occurrence ?? first.rule;
    const extra = count > 1 ? ` (y ${count - 1} más ese día)` : '';
    reminders.set(userId, {
      title: 'Recordatorio de recurrentes',
      body: `Recordá que el ${dateLabel} vence ${name} por $${formatMoneyAmount(amount)} ${first.currency} en ${first.accountName}${extra}.`,
      dueDate,
    });
  }
  return reminders;
}
