import { describe, expect, it, vi } from 'vitest';
import { createFinanceStore, type FinanceTransport, type HistoryRow } from '../src/lib/finance-store';
import type { FinanceBootstrap, FinanceChanges } from '../shared/finance-sync';
import { today, type Snapshot, type FinanceAccount } from '../shared/domain';

const month = today().slice(0, 7);
const empty = (): Snapshot => ({ accounts: [], movements: [], recurring: [], occurrences: [], plans: [], installments: [], categories: [] });
const account: FinanceAccount = { id: 'account', userId: 'A', name: 'PCACHE-Bank', type: 'bank', currency: 'ARS', emoji: 'B', color: null, archived: false, version: 1 };
const bootstrap = (userId = 'A', data = { ...empty(), accounts: [{ ...account, userId }] }): FinanceBootstrap => ({ userId, data, user: { name: 'PCACHE-Person', email: 'fiction@example.invalid' } });
const changes = (version = 2): FinanceChanges => ({ version: 1, collections: { accounts: { upserts: [{ ...account, version }], removes: [] } }, historyAccountIds: ['account'] });
const envelope = (version = 2) => ({ result: { ok: true }, changes: changes(version) });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  const transport = { bootstrap: vi.fn<FinanceTransport['bootstrap']>().mockResolvedValue(bootstrap()),
    mutation: vi.fn<FinanceTransport['mutation']>().mockResolvedValue(envelope()), history: vi.fn<FinanceTransport['history']>().mockResolvedValue([]) };
  const store = createFinanceStore(transport);
  const mutate = () => store.mutate({ path: '/accounts/account', method: 'PATCH', body: { version: 1 }, month });
  return { store, transport, mutate };
}
describe('session financial store', () => {
  it('atomically applies canonical changes, preserves unrelated references and does not refresh the full-read timestamp', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { store, mutate } = setup();
    await store.load({ month });
    clock.mockReturnValue(2000);
    const before = store.getState(); Object.freeze(before.data!.accounts); Object.freeze(before.data!.movements);
    const updates: Snapshot[] = [];
    let last = before.data;
    store.subscribe(() => { if (store.getState().data !== last) { last = store.getState().data; updates.push(last!); } });
    await mutate(); await mutate();
    expect(updates).toHaveLength(2);
    expect(store.getState().data?.accounts).toEqual([{ ...account, version: 2 }]);
    expect(store.getState().data?.movements).toBe(before.data!.movements);
    expect(store.getState().lastFullReadAt).toBe(before.lastFullReadAt);
    clock.mockRestore();
  });
  it('applies removals without losing unrelated records', async () => {
    const { store, transport, mutate } = setup(); await store.load({ month });
    await store.loadHistory({ accountId: 'account' });
    transport.mutation.mockResolvedValue({ result: { ok: true }, changes: { version: 1,
      collections: { accounts: { upserts: [], removes: ['account'] } }, historyAccountIds: ['account'] } });
    await mutate(); expect(store.getState().data?.accounts).toEqual([]);
    expect(store.getState().histories.account).toBeUndefined();
  });
  it.each([
    { result: {}, changes: { ...changes(), version: 2 } },
    { result: {}, changes: { ...changes(), collections: { accounts: { upserts: [{ id: 'bad' }], removes: [] } } } },
    { result: {}, changes: { ...changes(), collections: { accounts: { upserts: [account], removes: ['account'] } } } },
    { result: {}, changes: { ...changes(), collections: { accounts: { upserts: [{ ...account, userId: 'B' }], removes: [] } } } },
  ])('does not partially apply malformed/foreign envelopes or retry the confirmed write', async (raw) => {
    const { store, transport, mutate } = setup(); await store.load({ month });
    transport.mutation.mockResolvedValue(raw); transport.bootstrap.mockRejectedValue(new Error('offline'));
    const before = store.getState().data;
    expect(await mutate()).toMatchObject({ reconciled: false });
    expect(store.getState().data).toBe(before); expect(store.getState().stale).toBe(true);
    expect(transport.mutation).toHaveBeenCalledTimes(1); expect(transport.bootstrap).toHaveBeenCalledTimes(2);
  });
  it('drops a read started before a write, even if its transport ignores cancellation', async () => {
    const { store, transport, mutate } = setup(); await store.load({ month });
    const old = deferred<FinanceBootstrap>(); transport.bootstrap.mockReturnValueOnce(old.promise);
    const read = store.refresh({ month }); void read.catch(() => {}); await flush();
    await mutate(); old.resolve(bootstrap()); await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    await flush(); expect(store.getState().data?.accounts[0].version).toBe(2);
  });
  it('waits for FIFO writes, survives a failure, and copies the queued body', async () => {
    const { store, transport } = setup(); await store.load({ month });
    const first = deferred<unknown>(); transport.mutation.mockReturnValueOnce(first.promise).mockResolvedValueOnce(envelope(3));
    const one = store.mutate({ path: '/first', body: {}, month }); void one.catch(() => {});
    const body = { value: 1 };
    const two = store.mutate({ path: '/second', body, month }); body.value = 9;
    const read = store.refresh({ month }); await flush();
    expect(transport.bootstrap).toHaveBeenCalledTimes(1); expect(transport.mutation).toHaveBeenCalledTimes(1);
    first.reject(new Error('failed')); await expect(one).rejects.toThrow('failed');
    await two; await read;
    expect(transport.mutation.mock.calls.map(([request]) => request.path)).toEqual(['/first', '/second']);
    expect(transport.mutation.mock.calls[1][0].body).toEqual({ value: 1 });
    expect(transport.bootstrap).toHaveBeenCalledTimes(2);
  });
  it('shares same-key reads and only aborts transport after the last caller leaves', async () => {
    const { store, transport } = setup(); const result = deferred<FinanceBootstrap>(); transport.bootstrap.mockReturnValue(result.promise);
    const a = new AbortController(), b = new AbortController();
    const one = store.load({ month, signal: a.signal }), two = store.load({ month, signal: b.signal });
    void one.catch(() => {}); void two.catch(() => {}); await flush();
    expect(transport.bootstrap).toHaveBeenCalledTimes(1);
    a.abort(); await expect(one).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.bootstrap.mock.calls[0][0].signal.aborted).toBe(false);
    b.abort(); await expect(two).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.bootstrap.mock.calls[0][0].signal.aborted).toBe(true);
    result.resolve(bootstrap()); await flush(); expect(store.getState().data).toBeNull();
  });
  it('keeps the uncancelled shared caller alive and separately handles uncovered horizons', async () => {
    const { store, transport } = setup(); const result = deferred<FinanceBootstrap>(); transport.bootstrap.mockReturnValueOnce(result.promise);
    const controller = new AbortController();
    const one = store.load({ month, signal: controller.signal }), two = store.load({ month }); void one.catch(() => {});
    await flush(); controller.abort(); result.resolve(bootstrap()); await two;
    expect(store.getState().data).not.toBeNull(); expect(transport.bootstrap).toHaveBeenCalledTimes(1);
    await store.load({ month: '2000-01' }); expect(transport.bootstrap).toHaveBeenCalledTimes(1);
    const old = deferred<FinanceBootstrap>(); transport.bootstrap.mockReturnValueOnce(old.promise);
    const oldRead = store.refresh({ month }); void oldRead.catch(() => {}); await flush();
    await store.load({ month: '2100-12' }); old.resolve(bootstrap('A', empty())); await flush();
    expect(store.getState().materializedThroughMonth).toBe('2100-12');
    expect(store.getState().data?.accounts).toHaveLength(1);
  });
  it('invalidates subscribed history, rejects stale responses and reloads after the queue drains', async () => {
    const { store, transport, mutate } = setup(); await store.load({ month }); await store.loadHistory({ accountId: 'account' });
    const release = store.subscribeHistory('account', () => {});
    const old = deferred<HistoryRow[]>(); transport.history.mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
    const oldRead = store.loadHistory({ accountId: 'account', force: true }); void oldRead.catch(() => {}); await flush();
    await mutate(); old.resolve([]); await flush();
    await expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.history).toHaveBeenCalledTimes(3); expect(store.getState().histories.account.stale).toBe(false);
    release();
  });
  it('keeps confirmed saves successful when history refresh fails', async () => {
    const { store, transport, mutate } = setup(); await store.load({ month }); await store.loadHistory({ accountId: 'account' });
    store.subscribeHistory('account', () => {}); transport.history.mockRejectedValue(new Error('history offline'));
    expect(await mutate()).toMatchObject({ reconciled: true }); await flush();
    expect(store.getState().histories.account.error).toBe('history offline');
    expect(store.getState().histories.account.stale).toBe(true);
  });
  it('coalesces confirmed legacy writes into one final full read without deadlock', async () => {
    const { store, transport } = setup(); await store.load({ month });
    const first = deferred<unknown>(); transport.mutation.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ok: true });
    const onConfirmed = vi.fn(() => { throw new Error('callback'); });
    const one = store.mutate({ path: '/first', body: {}, month, onConfirmed });
    const two = store.mutate({ path: '/restore', body: {}, month, responseMode: 'full-refresh' });
    first.resolve({ ok: true });
    expect(await one).toMatchObject({ reconciled: true }); expect(await two).toMatchObject({ reconciled: true });
    expect(transport.mutation).toHaveBeenCalledTimes(2); expect(transport.bootstrap).toHaveBeenCalledTimes(2);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
  it('resets queued/active work and ignores late A responses after B signs in', async () => {
    const { store, transport, mutate } = setup(); await store.load({ month });
    const write = deferred<unknown>(); transport.mutation.mockReturnValueOnce(write.promise);
    const one = mutate(), two = mutate(); void one.catch(() => {}); void two.catch(() => {});
    const oldEpoch = store.getState().sessionEpoch; store.resetSession();
    await expect(one).rejects.toMatchObject({ name: 'AbortError' }); await expect(two).rejects.toMatchObject({ name: 'AbortError' });
    transport.bootstrap.mockResolvedValue(bootstrap('B', empty())); await store.load({ month });
    write.resolve(envelope()); await flush();
    expect(store.getState().userId).toBe('B'); expect(store.getState().data?.accounts).toEqual([]);
    expect(store.getState().sessionEpoch).toBeGreaterThan(oldEpoch); expect(store.getState().writeCount).toBe(0);
    expect(transport.mutation).toHaveBeenCalledTimes(1);
  });
  it('replaces empty identities, propagates 401, and clears cached state', async () => {
    const { store, transport } = setup(); transport.bootstrap.mockResolvedValue(bootstrap('A', empty())); await store.load({ month });
    const epoch = store.getState().sessionEpoch;
    transport.bootstrap.mockResolvedValue(bootstrap('B', empty())); await store.refresh({ month });
    expect(store.getState().userId).toBe('B'); expect(store.getState().sessionEpoch).toBe(epoch + 1);
    transport.bootstrap.mockRejectedValue(Object.assign(new Error('session expired'), { status: 401 }));
    await expect(store.refresh({ month })).rejects.toMatchObject({ status: 401 });
    expect(store.getState().data).toBeNull(); expect(store.getState().histories).toEqual({});
  });
  it('does not let late old-session reads clear the new session loading flag', async () => {
    const { store, transport } = setup();
    const old = deferred<FinanceBootstrap>(), current = deferred<FinanceBootstrap>();
    transport.bootstrap.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = store.load({ month }); void first.catch(() => {}); await flush(); store.resetSession();
    const second = store.load({ month }); await flush(); old.resolve(bootstrap('A')); await flush();
    expect(store.getState().refreshing).toBe(true); expect(store.getState().data).toBeNull();
    current.resolve(bootstrap('B', empty())); await second;
    expect(store.getState().userId).toBe('B'); expect(store.getState().refreshing).toBe(false);
  });
});
