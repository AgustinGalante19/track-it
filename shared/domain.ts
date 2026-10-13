import { z } from 'zod';
import { MAX_MONEY, validDate } from './format';
export { MAX_MONEY, validDate, parseMoney, moneyInput, formatMoney, splitInstallments, monthDate, addMonth, today } from './format';

export const currencySchema = z.enum(['ARS', 'USD']);
export type Currency = z.infer<typeof currencySchema>;
export const accountTypeSchema = z.enum(['bank', 'wallet', 'cash', 'credit']);
export type AccountType = z.infer<typeof accountTypeSchema>;
export const moneySchema = z.number().int().min(1).max(MAX_MONEY);
export const signedMoneySchema = z.number().int().min(-MAX_MONEY).max(MAX_MONEY);
export const dateSchema = z.string().refine(validDate, 'Elegí una fecha válida entre 2000 y 2100.');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const titleSchema = z.string().trim().min(1, 'Escribí un nombre.').max(80);
const emojiSchema = z.string().trim().min(1).max(16);
export const categoryInputSchema = z.object({
  name: titleSchema.refine((name) => name.toLocaleLowerCase('es') !== 'sin categoría', 'Elegí otro nombre; Sin categoría se usa para gastos sin asignar.'),
  emoji: emojiSchema,
  budgetArs: signedMoneySchema.nonnegative().default(0),
  budgetUsd: signedMoneySchema.nonnegative().default(0),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type Category = CategoryInput & { id: string; version: number };
export const accountColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Elegí un color válido.').nullable().optional();
export const idSchema = z.string().uuid();
export const accountInputSchema = z.object({
  id: idSchema, name: titleSchema, type: accountTypeSchema, currency: currencySchema,
  emoji: emojiSchema,
  color: accountColorSchema,
});
export const expenseInputSchema = z.object({
  id: idSchema, concept: z.string().trim().max(80).default(''), accountId: idSchema, amount: moneySchema, date: dateSchema,
  category: titleSchema, emoji: emojiSchema, notes: z.string().trim().max(500).default(''),
});
export const incomeInputSchema = z.object({ id: idSchema, concept: titleSchema, accountId: idSchema, amount: moneySchema, date: dateSchema, notes: z.string().trim().max(500).default('') });
export const recurringInputSchema = z.object({
  id: idSchema, name: titleSchema, kind: z.enum(['subscription', 'service']), emoji: emojiSchema,
  category: titleSchema, accountId: idSchema, amount: moneySchema,
  dueDay: z.number().int().min(1).max(31), startDate: dateSchema,
});
export const planInputSchema = z.object({
  id: idSchema, name: titleSchema, emoji: emojiSchema, category: titleSchema,
  accountId: idSchema, total: moneySchema, count: z.number().int().min(2).max(60),
  firstDate: dateSchema, historicalCount: z.number().int().min(0).default(0),
}).superRefine((data, ctx) => {
  if (data.total < data.count) ctx.addIssue({ code: 'custom', path: ['total'], message: 'Cada cuota debe tener al menos un centavo.' });
  if (data.historicalCount >= data.count) ctx.addIssue({ code: 'custom', path: ['historicalCount'], message: 'Debe quedar al menos una cuota pendiente.' });
});
export const chargeInputSchema = z.object({ id: idSchema, date: dateSchema, amount: moneySchema.optional() });
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;
export type RecurringInput = z.infer<typeof recurringInputSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;

export const defaultCategories = [
  { name: 'Alimentación', emoji: '🛒' }, { name: 'Comida', emoji: '🍜' },
  { name: 'Transporte', emoji: '🚌' }, { name: 'Salud', emoji: '💊' },
  { name: 'Tecnología', emoji: '⌨️' }, { name: 'Hogar', emoji: '🏠' },
  { name: 'Entretenimiento', emoji: '🎬' }, { name: 'Servicios', emoji: '💡' },
  { name: 'General', emoji: '🛍️' },
];

export type FinanceAccount = AccountInput & { userId: string; archived: boolean; version: number };
export type Movement = {
  // transfer se conserva únicamente para historial y respaldos de versiones anteriores.
  id: string; userId: string; kind: 'expense' | 'income' | 'transfer' | 'adjustment';
  concept: string; date: string; amount: number; currency: Currency; accountId: string;
  destinationId: string | null; receivedAmount: number | null; destinationCurrency: Currency | null;
  direction: 'outgoing' | 'incoming'; classification: 'expense' | 'income' | 'neutral';
  counterpart: string; fee: number; expenseAmount: number; category: string; emoji: string;
  notes: string; sourceType: 'single' | 'installment' | 'recurring'; sourceId: string | null;
  version: number; voided: boolean; createdAt: string;
};
export type Posting = { id: string; movementId: string; accountId: string; delta: number };
export type Recurring = RecurringInput & { userId: string; active: boolean; deleted: boolean; version: number; generationFrom: string | null };
export type Occurrence = {
  id: string; userId: string; ruleId: string; period: string; name: string; emoji: string; category: string;
  accountId: string; amount: number; dueDate: string; status: 'pending' | 'paid' | 'skipped'; movementId: string | null;
};
export type InstallmentPlan = PlanInput & { userId: string; active: boolean; version: number };
export type Installment = {
  id: string; userId: string; planId: string; number: number; amount: number; dueDate: string;
  status: 'pending' | 'charged' | 'historical' | 'cancelled'; movementId: string | null;
};
export type Snapshot = {
  accounts: FinanceAccount[]; movements: Movement[]; recurring: Recurring[];
  occurrences: Occurrence[]; plans: InstallmentPlan[]; installments: Installment[];
  categories: Category[];
};
