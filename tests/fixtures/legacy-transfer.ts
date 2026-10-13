import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../../server/db/client';
import * as schema from '../../server/db/schema';
import type { Movement } from '../../shared/domain';

// Fixtures de registros anteriores: la aplicación ya no crea transferencias.
export async function insertLegacyTransfer(db: Database, userId: string, input: Pick<Movement,
  'id' | 'concept' | 'accountId' | 'destinationId' | 'direction' | 'classification' |
  'counterpart' | 'amount' | 'receivedAmount' | 'fee' | 'date' | 'notes'>) {
  const [origin] = await db.select().from(schema.financeAccounts).where(eq(schema.financeAccounts.id, input.accountId));
  const [destination] = input.destinationId
    ? await db.select().from(schema.financeAccounts).where(eq(schema.financeAccounts.id, input.destinationId)) : [];
  const receivedAmount = destination ? input.receivedAmount ?? input.amount : null;
  const movement: Movement = {
    ...input, userId, kind: 'transfer', currency: origin.currency,
    destinationCurrency: destination?.currency ?? null, receivedAmount,
    expenseAmount: input.fee + (input.classification === 'expense' ? input.amount : 0),
    category: 'Comisiones', emoji: '↔️', sourceType: 'single', sourceId: null,
    version: 1, voided: false, createdAt: new Date().toISOString(),
  };
  await db.insert(schema.movements).values(movement);
  await db.insert(schema.postings).values([
    { id: randomUUID(), movementId: input.id, accountId: origin.id, delta: (input.direction === 'incoming' ? input.amount : -input.amount) - input.fee },
    ...(destination ? [{ id: randomUUID(), movementId: input.id, accountId: destination.id, delta: destination.type === 'credit' ? -receivedAmount! : receivedAmount! }] : []),
  ]);
  return movement;
}
