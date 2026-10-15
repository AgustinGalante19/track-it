import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { performanceControlPath } from './performance-control.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const database = resolve(root, '.data', 'performance-test.db');
const files = ['', '-wal', '-shm'].map((suffix) => database + suffix);
if (files.some(existsSync)) throw new Error('Dedicated performance-test database already exists; inspect it before rerunning.');
mkdirSync(dirname(database), { recursive: true });
const env = { ...process.env, DATABASE_URL: 'file:.data/performance-test.db', DATABASE_AUTH_TOKEN: '',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', BETTER_AUTH_API_KEY: '', OWNER_EMAIL: '', OWNER_USERNAME: '',
  OWNER_PASSWORD: '', DEMO_ENABLED: 'false', NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3002',
  BETTER_AUTH_URL: 'http://127.0.0.1:5174', BETTER_AUTH_SECRET: 'PCACHE-Fictional-Only-Secret-2026-Do-Not-Use',
  TRACK_IT_TEST_API_ORIGIN: 'http://127.0.0.1:3002',
};
const children = [];
const control = createServer((socket) => {
  socket.once('data', (message) => {
    if (message.toString() === 'stop') void stop(0).then(() => socket.end());
    else socket.destroy();
  });
});
control.listen(performanceControlPath);
let stopping = false;
function launch(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('error', () => void stop(1));
  child.once('exit', (code) => { if (!stopping) void stop(code || 1); });
  return child;
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map((child) => new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) return done();
    child.once('exit', done);
    child.kill();
  })));
  // Exact files under the dedicated database path, only after our child processes exit.
  for (const file of files) if (existsSync(file)) unlinkSync(file);
  control.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
launch(['--import', 'tsx', 'scripts/performance-api.ts']);
const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
launch([vite, ...(process.env.PCACHE_PREVIEW === '1' ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5174', '--strictPort']);
