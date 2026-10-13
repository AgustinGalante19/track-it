import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const key = createHash('sha256').update(resolve(import.meta.dirname, '..')).digest('hex').slice(0, 12);
export const performanceControlPath = process.platform === 'win32'
  ? `\\\\.\\pipe\\track-it-pcache-${key}` : resolve(tmpdir(), `track-it-pcache-${key}.sock`);
