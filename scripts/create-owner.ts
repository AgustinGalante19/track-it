import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createAuth } from '../server/auth';
import { ownerIdentity, localEmail } from '../server/auth-identity';
import { usernameSchema } from '../shared/auth';
import { migrateDatabase } from '../server/migrate';
import { client, db } from '../server/db/client';
import { user } from '../server/db/schema';

const owner = ownerIdentity();
const username = usernameSchema.parse(owner.username);
const email = owner.email || localEmail(username);
const password = process.env.OWNER_PASSWORD;
try {
  await migrateDatabase();
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1);
    if (taken && taken.id !== existing.id) throw new Error('Ese usuario ya pertenece a otra cuenta.');
    await db.update(user).set({ username }).where(eq(user.id, existing.id));
    console.log('Usuario actualizado. Se conservan el acceso y los datos existentes.');
  } else {
    if (!password || password.length < 10 || password.length > 128) throw new Error('Configurá OWNER_PASSWORD (entre 10 y 128 caracteres) para crear la cuenta.');
    await createAuth(true).api.signUpEmail({ body: { email, username, password, name: process.env.OWNER_NAME || username } });
    console.log('Cuenta personal creada.');
  }
  console.log('Quitá OWNER_PASSWORD del entorno de despliegue.');
} finally { client.close(); }
