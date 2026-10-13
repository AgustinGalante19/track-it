import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from './db/client';

type Metric = 'total' | 'auth' | 'db' | 'materialize' | 'snapshot';
const scope = new AsyncLocalStorage<Map<Metric, number>>();
export function withTimings<T>(action: () => Promise<T>) {
  return scope.run(new Map(), action);
}
export async function timed<T>(name: Metric, action: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await action(); }
  finally {
    const metrics = scope.getStore();
    metrics?.set(name, (metrics.get(name) ?? 0) + performance.now() - start);
  }
}
export function timingHeader() {
  return [...(scope.getStore() ?? [])].map(([name, duration]) => `${name};dur=${duration.toFixed(2)}`).join(', ');
}
export function timedTransaction<T>(db: Database, action: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return timed('db', () => db.transaction(action));
}
