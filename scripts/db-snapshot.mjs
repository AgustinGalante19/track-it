import { existsSync, linkSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [output] = process.argv.slice(2);
const { DATABASE_URL, DATABASE_AUTH_TOKEN } = process.env;
if (!output || !DATABASE_URL || !DATABASE_AUTH_TOKEN) {
  throw new Error('Usage: set DATABASE_URL and DATABASE_AUTH_TOKEN, then run node scripts/db-snapshot.mjs <new-file.db>');
}

const dumpUrl = new URL(DATABASE_URL.replace(/^libsql:\/\//, 'https://'));
if (dumpUrl.searchParams.get('tls') === '0') {
  dumpUrl.protocol = 'http:';
}
if (dumpUrl.protocol !== 'https:' && dumpUrl.protocol !== 'http:') throw new Error('Expected a libSQL server URL');
if (dumpUrl.protocol === 'http:' && dumpUrl.host !== 'track-it-db:8080') throw new Error('Plain HTTP is only allowed on the private Docker endpoint');
dumpUrl.search = '';
dumpUrl.pathname = `${dumpUrl.pathname.replace(/\/$/, '')}/dump`;

const destination = resolve(output);
if (existsSync(destination)) throw new Error('Snapshot destination already exists');
process.umask(0o077);
const temporaryDirectory = mkdtempSync(join(dirname(destination), '.track-it-snapshot-'));
const temporaryFile = join(temporaryDirectory, basename(destination));
let stage = 'downloading the SQL dump';
try {
  const response = await fetch(dumpUrl, {
    headers: { Authorization: `Bearer ${DATABASE_AUTH_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const dump = await response.text();
  if (!/\bCOMMIT;\s*$/i.test(dump)) throw new Error('Incomplete SQL dump');

  stage = 'restoring and checking the SQLite file';
  const db = new DatabaseSync(temporaryFile, { enableForeignKeyConstraints: false });
  try {
    // Turso can dump sqlite_sequence even after the last AUTOINCREMENT table was dropped.
    if (/^(?:DELETE FROM|INSERT INTO) "?sqlite_sequence"?\b/im.test(dump)) {
      db.exec('CREATE TABLE snapshot_placeholder (id INTEGER PRIMARY KEY AUTOINCREMENT); DROP TABLE main.snapshot_placeholder');
    }
    db.exec(dump);
    if (db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table' AND name IN ('__drizzle_migrations', 'user', 'movement')").get().n !== 3) {
      throw new Error('Track It tables are missing');
    }
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) {
      throw new Error('SQLite integrity check failed');
    }
    db.exec('PRAGMA journal_mode = DELETE');
  } finally {
    db.close();
  }

  stage = 'publishing the snapshot file';
  linkSync(temporaryFile, destination);
  console.log(`SQLite snapshot saved to ${destination}`);
} catch (error) {
  console.error(`Snapshot failed while ${stage}${error.code ? ` (${error.code})` : ''}.`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryFile, { force: true });
  rmSync(`${temporaryFile}-journal`, { force: true });
  rmSync(`${temporaryFile}-wal`, { force: true });
  rmSync(`${temporaryFile}-shm`, { force: true });
  rmdirSync(temporaryDirectory);
}
