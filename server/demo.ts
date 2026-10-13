import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createAuth } from './auth';
import { db } from './db/client';
import { user, financeAccounts } from './db/schema';
import * as service from './service';
import { today, monthDate } from '../shared/domain';

export const demoCredentials = { email: 'demo@example.com', username: 'demo', password: 'SoloDemo2026!' };
export const demoEnabled = process.env.NODE_ENV !== 'production' && !process.env.OWNER_EMAIL && !process.env.OWNER_USERNAME && (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:'));
function id(label: string) { const hash = createHash('sha256').update(`demo:${label}`).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`; }
export async function prepareDemo() {
  if (!demoEnabled) throw new service.DomainError('Los datos de ejemplo solo están disponibles en desarrollo local.', 403);
  let [owner] = await db.select().from(user).where(eq(user.email, demoCredentials.email));
  if (!owner) {
    await createAuth(true).api.signUpEmail({ body: { ...demoCredentials, name: 'Agus Demo' } });
    [owner] = await db.select().from(user).where(eq(user.email, demoCredentials.email));
  }
  const existing = await db.select().from(financeAccounts).where(eq(financeAccounts.userId, owner.id)).limit(1);
  if (existing.length) return;
  const date = today(); const month = date.slice(0, 7); const first = `${month}-01`;
  const bank = id('bank'), wallet = id('wallet'), other = id('other'), card = id('card'), usd = id('usd');
  for (const input of [
    { id: bank, name: 'Galicia', type: 'bank' as const, currency: 'ARS' as const, emoji: '🏦' },
    { id: wallet, name: 'Mercado Pago', type: 'wallet' as const, currency: 'ARS' as const, emoji: '💳' },
    { id: other, name: 'Brubank', type: 'bank' as const, currency: 'ARS' as const, emoji: '🏦' },
    { id: card, name: 'Visa Galicia', type: 'credit' as const, currency: 'ARS' as const, emoji: '💳' },
    { id: usd, name: 'Dólares', type: 'bank' as const, currency: 'USD' as const, emoji: '💵' },
  ]) await service.createAccount(db, owner.id, input);
  const earlier = (offset: number) => `${month}-${String(Math.max(1, Number(date.slice(8)) - offset)).padStart(2, '0')}`;
  await service.createExpense(db, owner.id, { id: id('groceries'), concept: 'Supermercado', amount: 3_245_000, accountId: bank, date, category: 'Alimentación', emoji: '🛒', notes: '' });
  await service.createExpense(db, owner.id, { id: id('pharmacy'), concept: 'Farmacia', amount: 885_000, accountId: wallet, date: earlier(1), category: 'Salud', emoji: '💊', notes: '' });
  await service.createExpense(db, owner.id, { id: id('lunch'), concept: 'Almuerzo', amount: 1_150_000, accountId: wallet, date: earlier(2), category: 'Comida', emoji: '🍜', notes: '' });
  await service.createPlan(db, owner.id, { id: id('keyboard'), name: 'Teclado mecánico', total: 12_000_000, count: 6, firstDate: first, accountId: card, historicalCount: 0, category: 'Tecnología', emoji: '⌨️' });
  for (const input of [
    { id: id('internet'), name: 'Internet', kind: 'service' as const, amount: 2_830_000, dueDay: 15, accountId: bank, emoji: '📶' },
    { id: id('electricity'), name: 'Electricidad', kind: 'service' as const, amount: 1_900_000, dueDay: 20, accountId: bank, emoji: '⚡' },
    { id: id('youtube'), name: 'YouTube Premium', kind: 'subscription' as const, amount: 719_000, dueDay: 8, accountId: card, emoji: '▶️' },
    { id: id('gpt'), name: 'GPT Plus', kind: 'subscription' as const, amount: 2_000, dueDay: 12, accountId: usd, emoji: '🧠' },
  ]) await service.createRecurring(db, owner.id, { ...input, category: 'Servicios', startDate: first });
  const snapshot = await service.getSnapshot(db, owner.id, month);
  const keyboard = snapshot.installments.find((i) => i.planId === id('keyboard') && i.number === 1)!;
  await service.chargeInstallment(db, owner.id, keyboard.id, { id: id('keyboard-charge'), date });
  const youtube = snapshot.occurrences.find((i) => i.ruleId === id('youtube'))!;
  if (youtube.dueDate <= date) await service.chargeOccurrence(db, owner.id, youtube.id, { id: id('youtube-charge'), date });
}
