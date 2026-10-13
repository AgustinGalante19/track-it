import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.DATABASE_URL || 'file:.data/local.db';
if (process.env.NODE_ENV === 'production' && (!url.startsWith('libsql://') && !url.startsWith('https://'))) throw new Error('Producción requiere una base Turso remota.');
if (url.startsWith('file:')) mkdirSync('.data', { recursive: true });
export const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN, intMode: 'number' });
export const db = drizzle(client, { schema });
export type Database = typeof db;
