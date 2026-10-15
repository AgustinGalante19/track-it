import { z } from 'zod';
import { parseFinanceSyncResponse, type FinanceBootstrap, type FinanceChanges } from '../../shared/finance-sync';
import { today, type Snapshot, type Movement, type Posting } from '../../shared/domain';

export type HistoryRow = { movement: Movement; posting: Posting };
type HistoryState = { rows: HistoryRow[]; stale: boolean; loading: boolean; error: string | null };
export type MutationOptions = { path: string; method?: string; body: unknown; month: string;
  responseMode?: 'delta' | 'full-refresh'; onConfirmed?: (result: unknown) => void };
export type MutationResult = { result: unknown; reconciled: boolean };
export type FinanceTransport = {
  bootstrap: (options: { month: string; signal: AbortSignal }) => Promise<FinanceBootstrap>;
  history: (options: { accountId: string; signal: AbortSignal }) => Promise<HistoryRow[]>;
  mutation: (options: MutationOptions & { signal: AbortSignal }) => Promise<unknown>;
};
export type FinanceState = {
  data: Snapshot | null; user: FinanceBootstrap['user'] | null; userId: string | null;
  sessionEpoch: number; readGeneration: number; lastFullReadAt: number; materializedThroughMonth: string | null;
  refreshing: boolean; writeCount: number; stale: boolean; error: string | null;
  histories: Record<string, HistoryState>; commitVersion: number;
};
const aborted = () => new DOMException('Session or request superseded', 'AbortError');
const message = (error: unknown) => error instanceof Error ? error.message : 'No pudimos actualizar tus datos. Reintentá.';
const unauthorized = (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
function initial(epoch = 0, generation = 0): FinanceState {
  return { data: null, user: null, userId: null, sessionEpoch: epoch, readGeneration: generation,
    lastFullReadAt: 0, materializedThroughMonth: null, refreshing: false, writeCount: 0,
    stale: true, error: null, histories: {}, commitVersion: 0 };
}
export function applyFinanceChanges(data: Snapshot, changes: FinanceChanges): Snapshot {
  const next = { ...data };
  for (const key of Object.keys(changes.collections) as (keyof Snapshot)[]) {
    const delta = changes.collections[key]!;
    const rows = new Map<string, Snapshot[keyof Snapshot][number]>(data[key].map((row) => [row.id, row]));
    for (const id of delta.removes) rows.delete(id);
    for (const row of delta.upserts) rows.set(row.id, row);
    Object.assign(next, { [key]: [...rows.values()] });
  }
  return next;
}

// A shared transport is cancelled only after its last caller leaves or the store invalidates it.
function sharedRequest<T>(run: (signal: AbortSignal) => Promise<T>, onFinish: () => void) {
  const controller = new AbortController();
  const callers = new Set<{ reject: (reason: unknown) => void; cleanup: () => void }>();
  let settled = false;
  const promise = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw aborted();
    return run(controller.signal);
  }).finally(() => { settled = true; onFinish(); });
  void promise.catch(() => {});
  function cancel() {
    controller.abort();
    for (const caller of [...callers]) { caller.cleanup(); caller.reject(aborted()); }
    onFinish();
  }
  return {
    cancel,
    join(signal?: AbortSignal): Promise<T> {
      if (signal?.aborted || controller.signal.aborted) return Promise.reject(aborted());
      return new Promise((resolve, reject) => {
        const caller = { reject, cleanup: () => { callers.delete(caller); signal?.removeEventListener('abort', leave); } };
        function leave() { caller.cleanup(); reject(aborted()); if (!callers.size && !settled) cancel(); }
        callers.add(caller);
        signal?.addEventListener('abort', leave, { once: true });
        promise.then((value) => { caller.cleanup(); resolve(value); }, (error) => { caller.cleanup(); reject(error); });
      });
    },
  };
}
type Shared<T> = ReturnType<typeof sharedRequest<T>>;

export function createFinanceStore(initialTransport?: FinanceTransport) {
  let transport = initialTransport;
  let state = initial();
  const listeners = new Set<() => void>();
  const historyListeners = new Map<string, number>();
  const reads = new Map<string, Shared<FinanceState>>();
  const historyReads = new Map<string, Shared<HistoryRow[]>>();
  type Task = { options: MutationOptions; epoch: number; resolve: (value: MutationResult) => void; reject: (error: unknown) => void };
  const queue: Task[] = [];
  let active: { task: Task; controller: AbortController } | null = null;
  const draining = new Set<{ epoch: number; resolve: () => void; reject: (error: unknown) => void }>();
  let reconciliation: { epoch: number; month: string; promise: Promise<boolean> } | null = null;
  const requireTransport = () => { if (!transport) throw new Error('Finance transport is not configured'); return transport; };
  function publish(patch: Partial<FinanceState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function invalidateReads(except?: { cancel: () => void }) {
    for (const read of [...reads.values()]) if (read !== except) read.cancel();
    for (const read of [...historyReads.values()]) if (read !== except) read.cancel();
  }
  function resetSession(except?: { cancel: () => void }) {
    invalidateReads(except);
    active?.controller.abort(); active?.task.reject(aborted()); active = null;
    for (const task of queue.splice(0)) task.reject(aborted());
    for (const waiter of draining) waiter.reject(aborted());
    draining.clear(); reconciliation = null;
    state = initial(state.sessionEpoch + 1, state.readGeneration + 1);
    for (const listener of listeners) listener();
  }
  async function waitForWrites(epoch: number, signal?: AbortSignal) {
    if (signal?.aborted || epoch !== state.sessionEpoch) throw aborted();
    if (!active && !queue.length) return;
    await new Promise<void>((resolve, reject) => {
      const waiter = { epoch, resolve: finish, reject: fail };
      function cleanup() { draining.delete(waiter); signal?.removeEventListener('abort', cancel); }
      function finish() { cleanup(); resolve(); }
      function fail(error: unknown) { cleanup(); reject(error); }
      function cancel() { fail(aborted()); }
      draining.add(waiter); signal?.addEventListener('abort', cancel, { once: true });
    });
    if (epoch !== state.sessionEpoch || signal?.aborted) throw aborted();
  }
  async function load({ month, signal, force = false }: { month: string; signal?: AbortSignal; force?: boolean }): Promise<FinanceState> {
    const epoch = state.sessionEpoch;
    await waitForWrites(epoch, signal);
    while (active || queue.length) await waitForWrites(epoch, signal);
    if (epoch !== state.sessionEpoch || signal?.aborted) throw aborted();
    const horizon = month > today().slice(0, 7) ? month : today().slice(0, 7);
    if (!force && state.data && !state.stale && state.materializedThroughMonth! >= horizon) return state;
    let key = `${epoch}:${state.readGeneration}:${horizon}`;
    const existing = reads.get(key);
    if (existing) return existing.join(signal);
    // A fresh full read also supersedes prior history reads. Same-key callers joined above.
    publish({ readGeneration: state.readGeneration + 1 }); invalidateReads();
    const generation = state.readGeneration;
    key = `${epoch}:${generation}:${horizon}`;
    const flight = sharedRequest(async (requestSignal) => {
      try {
        const result = await requireTransport().bootstrap({ month: horizon, signal: requestSignal });
        if (requestSignal.aborted || epoch !== state.sessionEpoch || generation !== state.readGeneration) throw aborted();
        if (!result.userId || !result.data || !result.user) throw new Error('Invalid bootstrap identity');
        if (state.userId && state.userId !== result.userId) resetSession(flight);
        const histories = Object.fromEntries(Object.entries(state.histories).filter(([id]) => result.data.accounts.some((row) => row.id === id))
          .map(([id, history]) => [id, { ...history, stale: true }]));
        publish({ data: result.data, user: result.user, userId: result.userId, lastFullReadAt: Date.now(),
          materializedThroughMonth: horizon, stale: false, error: null, histories, refreshing: false,
          commitVersion: state.commitVersion + 1 });
        refreshVisibleHistories();
        return state;
      } catch (error) {
        if (epoch === state.sessionEpoch && generation === state.readGeneration && !requestSignal.aborted) {
          if (unauthorized(error)) resetSession(flight);
          else publish({ stale: true, error: message(error) });
        }
        throw error;
      }
    }, () => {
      if (reads.get(key) === flight) {
        reads.delete(key);
        if (epoch === state.sessionEpoch) publish({ refreshing: reads.size > 0 });
      }
    });
    reads.set(key, flight); publish({ refreshing: true });
    return flight.join(signal);
  }
  async function loadHistory({ accountId, signal, force = false }: { accountId: string; signal?: AbortSignal; force?: boolean }): Promise<HistoryRow[]> {
    const epoch = state.sessionEpoch;
    await waitForWrites(epoch, signal);
    while (active || queue.length) await waitForWrites(epoch, signal);
    if (epoch !== state.sessionEpoch || signal?.aborted) throw aborted();
    if (!state.data?.accounts.some((account) => account.id === accountId)) throw new Error('No se encontró la cuenta.');
    const cached = state.histories[accountId];
    if (!force && cached && !cached.stale) return cached.rows;
    const generation = state.readGeneration, key = `${epoch}:${generation}:${accountId}`;
    const existing = historyReads.get(key);
    if (existing) return existing.join(signal);
    const flight = sharedRequest(async (requestSignal) => {
      try {
        const rows = await requireTransport().history({ accountId, signal: requestSignal });
        if (requestSignal.aborted || epoch !== state.sessionEpoch || generation !== state.readGeneration) throw aborted();
        publish({ histories: { ...state.histories, [accountId]: { rows, loading: false, stale: false, error: null } } });
        return rows;
      } catch (error) {
        if (epoch === state.sessionEpoch && generation === state.readGeneration && !requestSignal.aborted) {
          if (unauthorized(error)) resetSession(flight);
          else publish({ histories: { ...state.histories, [accountId]: { rows: state.histories[accountId]?.rows ?? [], loading: false, stale: true, error: message(error) } } });
        }
        throw error;
      }
    }, () => {
      if (historyReads.get(key) === flight) {
        historyReads.delete(key);
        if (epoch === state.sessionEpoch && state.histories[accountId]?.loading) {
          publish({ histories: { ...state.histories, [accountId]: { ...state.histories[accountId], loading: false } } });
        }
      }
    });
    historyReads.set(key, flight);
    publish({ histories: { ...state.histories, [accountId]: { rows: cached?.rows ?? [], stale: true, loading: true, error: null } } });
    return flight.join(signal);
  }
  function invalidatedHistories(accountIds: string[], data = state.data) {
    const histories = { ...state.histories };
    for (const id of accountIds) {
      if (!data?.accounts.some((row) => row.id === id)) delete histories[id];
      else if (histories[id]) histories[id] = { ...histories[id], stale: true, loading: false, error: null };
    }
    return histories;
  }
  function refreshVisibleHistories() {
    for (const [accountId, count] of historyListeners) {
      if (count && state.histories[accountId]?.stale) void loadHistory({ accountId }).catch(() => {});
    }
  }
  function reconcile(month: string, epoch: number): Promise<boolean> {
    if (reconciliation?.epoch === epoch) {
      if (month > reconciliation.month) reconciliation.month = month;
      return reconciliation.promise;
    }
    const item = { epoch, month, promise: Promise.resolve(false) };
    item.promise = waitForWrites(epoch).then(() => load({ month: item.month, force: true }))
      .then(() => true, (error) => { if (epoch !== state.sessionEpoch) throw aborted(); return false; })
      .finally(() => { if (reconciliation === item) reconciliation = null; });
    reconciliation = item;
    return item.promise;
  }
  async function pump() {
    if (active) return;
    const task = queue.shift();
    if (!task) {
      for (const waiter of [...draining]) waiter.resolve();
      refreshVisibleHistories();
      return;
    }
    const running = { task, controller: new AbortController() };
    active = running;
    publish({ readGeneration: state.readGeneration + 1 }); invalidateReads();
    let fallback: { result: unknown } | undefined;
    try {
      const raw = await requireTransport().mutation({ ...task.options, signal: running.controller.signal });
      if (task.epoch !== state.sessionEpoch || running.controller.signal.aborted) throw aborted();
      publish({ readGeneration: state.readGeneration + 1 }); invalidateReads();
      let result: unknown = raw;
      if (task.options.responseMode !== 'full-refresh') {
        try {
          const envelope = parseFinanceSyncResponse(raw, z.unknown());
          for (const delta of Object.values(envelope.changes.collections)) for (const row of delta!.upserts) {
            if ('userId' in row && row.userId && row.userId !== state.userId) throw new Error('Mismatched record owner');
          }
          result = envelope.result;
          const data = applyFinanceChanges(state.data!, envelope.changes);
          publish({ data, histories: invalidatedHistories(envelope.changes.historyAccountIds, data), commitVersion: state.commitVersion + 1 });
        } catch {
          fallback = { result };
        }
      } else fallback = { result };
      if (fallback) publish({ stale: true, histories: invalidatedHistories(Object.keys(state.histories)) });
      try { task.options.onConfirmed?.(result); } catch { /* A UI callback cannot turn a confirmed write into failure. */ }
      if (!fallback) task.resolve({ result, reconciled: true });
    } catch (error) {
      if (task.epoch === state.sessionEpoch && unauthorized(error)) resetSession();
      else if (task.epoch === state.sessionEpoch) publish({ stale: true });
      task.reject(error);
    } finally {
      if (active === running) {
        active = null;
        publish({ writeCount: queue.length });
        if (fallback) void reconcile(task.options.month, task.epoch).then(
          (reconciled) => task.resolve({ result: fallback!.result, reconciled }), task.reject);
        void pump();
      }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeHistory(accountId: string, listener: () => void) {
      listeners.add(listener); historyListeners.set(accountId, (historyListeners.get(accountId) ?? 0) + 1);
      return () => { listeners.delete(listener); const count = (historyListeners.get(accountId) ?? 1) - 1;
        if (count) historyListeners.set(accountId, count); else historyListeners.delete(accountId); };
    },
    setTransport(value: FinanceTransport) { transport = value; },
    load, loadHistory,
    refresh: ({ month }: { month: string }) => load({ month, force: true }),
    mutate(options: MutationOptions): Promise<MutationResult> {
      if (!state.data || !state.userId) return Promise.reject(new Error('Tu sesión venció. Volvé a ingresar.'));
      const saved = { ...options, body: structuredClone(options.body), method: options.method ?? 'POST', responseMode: options.responseMode ?? 'delta' as const };
      return new Promise((resolve, reject) => {
        queue.push({ options: saved, epoch: state.sessionEpoch, resolve, reject });
        publish({ writeCount: queue.length + (active ? 1 : 0) }); void pump();
      });
    },
    resetSession: () => resetSession(),
  };
}
export const financeStore = createFinanceStore();
