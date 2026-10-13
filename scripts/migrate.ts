import { migrateDatabase } from '../server/migrate';
import { client } from '../server/db/client';
await migrateDatabase();
client.close();
console.log('Migraciones aplicadas.');
