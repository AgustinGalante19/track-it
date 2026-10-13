// Only opaque counters and durations enter the performance timeline.
let counter = 0;
const pending = new Map<number, { received: boolean; timer: ReturnType<typeof setTimeout> }>();
const mark = (id: number, phase: string) => `finance-${id}-${phase}`;
export function discardTiming(id: number) {
  const operation = pending.get(id);
  if (operation) clearTimeout(operation.timer);
  pending.delete(id);
  for (const phase of ['dispatch', 'receipt', 'render']) performance.clearMarks(mark(id, phase));
}
export function beginTiming() {
  const id = ++counter;
  performance.mark(mark(id, 'dispatch'));
  pending.set(id, { received: false, timer: setTimeout(() => discardTiming(id), 60_000) });
  return id;
}
export function receiveTiming(id: number) {
  const operation = pending.get(id);
  if (!operation) return;
  operation.received = true;
  performance.mark(mark(id, 'receipt'));
}
export function observeFinanceRender() {
  // Capture only receipts preceding this React commit, never later responses.
  const ready = [...pending].filter(([, operation]) => operation.received).map(([id]) => id);
  const frame = requestAnimationFrame(() => {
    for (const id of ready) {
      if (!pending.has(id)) continue;
      performance.mark(mark(id, 'render'));
      for (const [name, start, end] of [
        ['response', 'dispatch', 'receipt'], ['receipt-to-render', 'receipt', 'render'], ['end-to-end', 'dispatch', 'render'],
      ]) {
        performance.measure(`finance-${name}`, mark(id, start), mark(id, end));
        performance.clearMeasures(`finance-${name}`);
      }
      discardTiming(id);
    }
  });
  return () => cancelAnimationFrame(frame);
}
