import { createConnection } from 'node:net';
// @ts-expect-error Local ESM helper shared with the standalone harness.
import { performanceControlPath } from './performance-control.mjs';

export default async function teardown() {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection(performanceControlPath, () => socket.write('stop'));
    socket.setTimeout(15_000, () => socket.destroy(new Error('Performance harness shutdown timed out')));
    socket.once('end', resolve);
    socket.once('error', reject);
  });
}
