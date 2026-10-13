import { expect, it, vi } from 'vitest';
import { timed, timingHeader, withTimings } from '../server/timing';
import { beginTiming, discardTiming, observeFinanceRender, receiveTiming } from '../src/lib/performance';

it('isolates request timings and records handled errors without sensitive descriptions', async () => {
  const results = await Promise.all([1, 2].map(() => withTimings(async () => {
    await expect(timed('db', async () => { throw new Error('not recorded'); })).rejects.toThrow();
    const value = timingHeader();
    expect(value).toMatch(/^db;dur=\d+\.\d{2}$/);
    return value;
  })));
  expect(results).toHaveLength(2);
  expect(timingHeader()).toBe('');
});
it('observes only receipts before a commit and clears operation marks', () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const measure = vi.spyOn(performance, 'measure');
  try {
    const first = beginTiming(); receiveTiming(first);
    observeFinanceRender();
    const second = beginTiming(); receiveTiming(second);
    frame!(0);
    expect(measure).toHaveBeenCalledTimes(3);
    expect(performance.getEntriesByName(`finance-${first}-dispatch`)).toHaveLength(0);
    expect(performance.getEntriesByName(`finance-${second}-dispatch`)).toHaveLength(1);
    discardTiming(second);
    expect(performance.getEntriesByName(`finance-${second}-dispatch`)).toHaveLength(0);
  } finally { measure.mockRestore(); vi.unstubAllGlobals(); }
});
