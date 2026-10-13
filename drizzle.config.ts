import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'turso', schema: './server/db/schema.ts', out: './drizzle', dbCredentials: {
  url: process.env.DATABASE_URL || 'file:.data/local.db', authToken: process.env.DATABASE_AUTH_TOKEN,
} });
