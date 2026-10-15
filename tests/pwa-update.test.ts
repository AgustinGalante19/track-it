import { describe, expect, it, vi } from 'vitest';
import { createUpdateActivation, createUpdateChecker } from '../src/lib/pwa-update';

describe('prompted PWA updates', () => {
  it('throttles attempts, ignores hidden/offline events and coalesces in-flight checks', async () => {
    let now = 0, release!: () => void;
    const update = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const check = createUpdateChecker(update, () => now);
    await check(true, true); expect(update).not.toHaveBeenCalled();
    now = 3_600_000;
    await check(false, true); await check(true, false); expect(update).not.toHaveBeenCalled();
    const first = check(true, true);
    now += 3_600_000; await check(true, true); expect(update).toHaveBeenCalledTimes(1);
    release(); await first;
    const second = check(true, true); expect(update).toHaveBeenCalledTimes(2);
    release(); await second;
    await check(true, true); expect(update).toHaveBeenCalledTimes(2);
  });
  it('throttles a failed check without throwing or reloading', async () => {
    let now = 0;
    const update = vi.fn().mockRejectedValue(new Error('offline'));
    const check = createUpdateChecker(update, () => now);
    now = 3_600_000; await check(true, true); await check(true, true);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('requires consent, defers while dirty, supports postponing, and activates once', async () => {
    let release!: () => void;
    const activate = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const gate = createUpdateActivation(activate);
    await gate.flush(false); expect(activate).not.toHaveBeenCalled();
    await gate.request(true); await gate.flush(true); expect(activate).not.toHaveBeenCalled();
    gate.cancel(); await gate.flush(false); expect(activate).not.toHaveBeenCalled();
    await gate.request(true);
    const result = gate.flush(false); await gate.request(false);
    expect(activate).toHaveBeenCalledTimes(1);
    release(); await result; await gate.flush(false); await gate.request(false);
    expect(activate).toHaveBeenCalledTimes(1);
  });
  it('requires another user request after activation failure', async () => {
    const activate = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(undefined);
    const gate = createUpdateActivation(activate);
    await expect(gate.request(false)).rejects.toThrow('No pudimos actualizar');
    await gate.flush(false); expect(activate).toHaveBeenCalledTimes(1);
    await gate.request(false); expect(activate).toHaveBeenCalledTimes(2);
  });
});
