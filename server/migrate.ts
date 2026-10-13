import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './db/client';
import { backfillUsernames } from './auth-identity';
export async function migrateDatabase() {
  await migrate(db, { migrationsFolder: './drizzle' });
  await backfillUsernames(db);
}
