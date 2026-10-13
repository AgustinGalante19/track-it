import { prepareDemo } from '../server/demo';
import { migrateDatabase } from '../server/migrate';
import { client } from '../server/db/client';
await migrateDatabase(); await prepareDemo(); client.close();
console.log('Ejemplo local listo. Usá el botón de datos de ejemplo en la pantalla de acceso.');
