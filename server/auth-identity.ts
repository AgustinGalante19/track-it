import { eq, isNull } from 'drizzle-orm';
import type { Database } from './db/client';
import { user } from './db/schema';
import { localEmail, usernameSchema } from '../shared/auth';

export function ownerIdentity() {
  return { email: process.env.OWNER_EMAIL?.trim().toLowerCase() || '', username: process.env.OWNER_USERNAME?.trim().toLowerCase() || '' };
}

// Conserva IDs, contraseñas, sesiones y datos financieros de las cuentas anteriores.
export async function backfillUsernames(database: Database) {
  const missing = await database.select().from(user).where(isNull(user.username));
  const owner = ownerIdentity();
  for (const identity of missing) {
    const configured = owner.email === identity.email.toLowerCase() && owner.username ? usernameSchema.parse(owner.username) : '';
    let base = configured || identity.email.split('@')[0].normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '_').slice(0, 24);
    if (base.length < 3) base = `usuario_${base}`;
    let candidate = base, suffix = 1;
    while ((await database.select({ id: user.id }).from(user).where(eq(user.username, candidate)).limit(1)).length) {
      if (configured) throw new Error('OWNER_USERNAME ya pertenece a otra cuenta. Elegí un usuario distinto.');
      const ending = `_${suffix++}`;
      candidate = `${base.slice(0, 30 - ending.length)}${ending}`;
    }
    await database.update(user).set({ username: candidate }).where(eq(user.id, identity.id));
  }
}

export { localEmail };
