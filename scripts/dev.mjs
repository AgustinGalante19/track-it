import { spawn } from 'node:child_process';
const preview = process.argv.includes('--preview');
const processes = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : [])], { stdio: 'inherit', env: process.env }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.pid) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill();
  }
  process.exitCode = code;
}
for (const child of processes) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
