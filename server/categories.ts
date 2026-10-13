import { timedTransaction } from './timing';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './db/client';
import * as s from './db/schema';
import { defaultCategories, type CategoryInput } from '../shared/domain';
import { DomainError } from './service';

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function initializeCategories(tx: Executor, userId: string) {
  const [state] = await tx.select().from(s.categoryState).where(eq(s.categoryState.userId, userId));
  if (state) return;
  await tx.insert(s.categories).values(defaultCategories.map((c) => ({ ...c, id: randomUUID(), userId }))).onConflictDoNothing();
  await tx.insert(s.categoryState).values({ userId }).onConflictDoNothing();
}

async function ownedCategory(tx: Executor, userId: string, id: string) {
  const [category] = await tx.select().from(s.categories).where(and(eq(s.categories.id, id), eq(s.categories.userId, userId)));
  if (!category) throw new DomainError('No se encontró la categoría.', 404);
  return category;
}

async function checkName(tx: Executor, userId: string, name: string, exceptId?: string) {
  const rows = await tx.select().from(s.categories).where(eq(s.categories.userId, userId));
  if (rows.some((c) => c.id !== exceptId && c.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    throw new DomainError('Ya tenés una categoría con ese nombre.', 409);
  }
}

// Las referencias anteriores usan el nombre. La reasignación se realiza en una
// transacción y cambia las versiones para rechazar formularios desactualizados.
async function reassign(tx: Executor, userId: string, previous: string, next: string) {
  if (previous === next) return;
  await tx.update(s.movements).set({ category: next, version: sql`${s.movements.version} + 1` }).where(and(eq(s.movements.userId, userId), eq(s.movements.category, previous)));
  await tx.update(s.recurring).set({ category: next, version: sql`${s.recurring.version} + 1` }).where(and(eq(s.recurring.userId, userId), eq(s.recurring.category, previous)));
  await tx.update(s.plans).set({ category: next, version: sql`${s.plans.version} + 1` }).where(and(eq(s.plans.userId, userId), eq(s.plans.category, previous)));
  await tx.update(s.occurrences).set({ category: next }).where(and(eq(s.occurrences.userId, userId), eq(s.occurrences.category, previous)));
}

export async function createCategory(db: Database, userId: string, input: CategoryInput) {
  return timedTransaction(db, async (tx) => {
    await initializeCategories(tx, userId);
    await checkName(tx, userId, input.name);
    return (await tx.insert(s.categories).values({ ...input, id: randomUUID(), userId }).returning())[0];
  });
}

export async function editCategory(db: Database, userId: string, id: string, input: CategoryInput & { version: number }) {
  return timedTransaction(db, async (tx) => {
    const category = await ownedCategory(tx, userId, id);
    if (category.version !== input.version) throw new DomainError('La categoría cambió en otro dispositivo. Actualizá antes de editar.', 409);
    await checkName(tx, userId, input.name, id);
    await reassign(tx, userId, category.name, input.name);
    return (await tx.update(s.categories).set({ ...input, version: category.version + 1 }).where(and(eq(s.categories.id, id), eq(s.categories.userId, userId))).returning())[0];
  });
}

export async function deleteCategory(db: Database, userId: string, id: string, input: { version: number; replacementId: string | null }) {
  return timedTransaction(db, async (tx) => {
    const category = await ownedCategory(tx, userId, id);
    if (category.version !== input.version) throw new DomainError('La categoría cambió en otro dispositivo. Actualizá antes de eliminar.', 409);
    if (input.replacementId === id) throw new DomainError('Elegí una categoría diferente.');
    const replacement = input.replacementId ? await ownedCategory(tx, userId, input.replacementId) : null;
    await reassign(tx, userId, category.name, replacement?.name || 'Sin categoría');
    await tx.insert(s.categoryState).values({ userId }).onConflictDoNothing();
    await tx.delete(s.categories).where(and(eq(s.categories.id, id), eq(s.categories.userId, userId)));
    return { ok: true };
  });
}
