import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Currency, AccountType, Movement, Occurrence, Installment } from '../../shared/domain';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  username: text('username').unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const session = sqliteTable('session', {
  id: text('id').primaryKey(), expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(), ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (t) => [index('session_user_idx').on(t.userId)]);
export const account = sqliteTable('account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }), scope: text('scope'), password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => [index('auth_account_user_idx').on(t.userId)]);
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('last_request').notNull(),
});
export const financeAccounts = sqliteTable('finance_account', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(), type: text('type').$type<AccountType>().notNull(), currency: text('currency').$type<Currency>().notNull(),
  emoji: text('emoji').notNull(),
  color: text('color'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false), version: integer('version').notNull().default(1),
}, (t) => [index('finance_user_idx').on(t.userId)]);
export const movements = sqliteTable('movement', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id),
  kind: text('kind').$type<Movement['kind']>().notNull(), concept: text('concept').notNull(), date: text('date').notNull(),
  amount: integer('amount').notNull(), currency: text('currency').$type<Currency>().notNull(),
  accountId: text('account_id').notNull().references(() => financeAccounts.id),
  destinationId: text('destination_id').references(() => financeAccounts.id), receivedAmount: integer('received_amount'),
  destinationCurrency: text('destination_currency').$type<Currency>(),
  direction: text('direction').$type<Movement['direction']>().notNull().default('outgoing'),
  classification: text('classification').$type<Movement['classification']>().notNull(), counterpart: text('counterpart').notNull().default(''),
  fee: integer('fee').notNull().default(0), expenseAmount: integer('expense_amount').notNull().default(0),
  category: text('category').notNull(), emoji: text('emoji').notNull(), notes: text('notes').notNull().default(''),
  sourceType: text('source_type').$type<Movement['sourceType']>().notNull().default('single'), sourceId: text('source_id'),
  version: integer('version').notNull().default(1), voided: integer('voided', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (t) => [index('movement_user_date_idx').on(t.userId, t.date)]);
export const postings = sqliteTable('posting', {
  id: text('id').primaryKey(), movementId: text('movement_id').notNull().references(() => movements.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => financeAccounts.id), delta: integer('delta').notNull(),
}, (t) => [index('posting_account_idx').on(t.accountId), uniqueIndex('posting_movement_account_idx').on(t.movementId, t.accountId)]);
export const recurring = sqliteTable('recurring', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id), name: text('name').notNull(),
  kind: text('kind').$type<'subscription' | 'service'>().notNull(), emoji: text('emoji').notNull(), category: text('category').notNull(),
  accountId: text('account_id').notNull().references(() => financeAccounts.id), amount: integer('amount').notNull(),
  dueDay: integer('due_day').notNull(), startDate: text('start_date').notNull(), generationFrom: text('generation_from'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true), version: integer('version').notNull().default(1),
}, (t) => [index('recurring_user_idx').on(t.userId)]);
export const occurrences = sqliteTable('occurrence', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id),
  ruleId: text('rule_id').notNull().references(() => recurring.id), period: text('period').notNull(),
  name: text('name').notNull(), emoji: text('emoji').notNull(), category: text('category').notNull(),
  accountId: text('account_id').notNull().references(() => financeAccounts.id), amount: integer('amount').notNull(), dueDate: text('due_date').notNull(),
  status: text('status').$type<Occurrence['status']>().notNull().default('pending'), movementId: text('movement_id').references(() => movements.id),
}, (t) => [uniqueIndex('occurrence_rule_period_idx').on(t.ruleId, t.period), index('occurrence_user_idx').on(t.userId)]);
export const plans = sqliteTable('installment_plan', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id), name: text('name').notNull(),
  emoji: text('emoji').notNull(), category: text('category').notNull(), accountId: text('account_id').notNull().references(() => financeAccounts.id),
  total: integer('total').notNull(), count: integer('count').notNull(), firstDate: text('first_date').notNull(), historicalCount: integer('historical_count').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true), version: integer('version').notNull().default(1),
}, (t) => [index('plan_user_idx').on(t.userId)]);
export const installments = sqliteTable('installment', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id), planId: text('plan_id').notNull().references(() => plans.id),
  number: integer('number').notNull(), amount: integer('amount').notNull(), dueDate: text('due_date').notNull(),
  status: text('status').$type<Installment['status']>().notNull().default('pending'), movementId: text('movement_id').references(() => movements.id),
}, (t) => [uniqueIndex('installment_plan_number_idx').on(t.planId, t.number), index('installment_user_idx').on(t.userId)]);
export const categories = sqliteTable('category', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id), name: text('name').notNull(), emoji: text('emoji').notNull(),
  budgetArs: integer('budget_ars').notNull().default(0), budgetUsd: integer('budget_usd').notNull().default(0),
  version: integer('version').notNull().default(1),
}, (t) => [uniqueIndex('category_user_name_idx').on(t.userId, t.name)]);
export const categoryState = sqliteTable('category_state', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
});
