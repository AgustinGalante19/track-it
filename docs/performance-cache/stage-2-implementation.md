# Stage 2 Implementation: Session-Scoped In-Memory State

## Objective and prerequisites

Read [context/contracts](00-CONTEXT.md), [roadmap](01-ROADMAP.md), Stage 0 results, and [verification](stage-2-verification.md). Stage 0 must pass; Stage 1 need not be merged yet. Build against injected transport and frozen response types. Keep all financial data in memory, preserve `.env` and auth behavior.

## Ownership and interfaces

Own new `src/lib/finance-store.ts` and `tests/finance-store.test.ts` only. Do not edit Router, forms, Layout, API wrapper, or auth yet; Stage 3 owns integration. Use built-in React `useSyncExternalStore` when integration occurs; add no query/state dependency.

Expose `createFinanceStore(transport)` for tests and a singleton for the app. Transport exposes typed bootstrap, history, and mutation methods with AbortSignals; it is supplied by Stage 3. State includes snapshot/user/userId, sessionEpoch, readGeneration, lastFullReadAt, materializedThroughMonth, refresh/write states, nonfatal error, and in-memory histories keyed by accountId. Public methods: `getState`, `subscribe`, `load({month,signal,force})`, `refresh({month})`, `mutate({path,method,body,month,responseMode,onConfirmed})`, `loadHistory({accountId,signal,force})`, `resetSession()`. `responseMode` defaults to `delta`; `full-refresh` is reserved for backup restoration and omits sync query metadata. Optional `onConfirmed(result)` runs once after parsed successful write receipt; it supports the restoration progress message, must not throw into write failure handling, and does not imply reconciliation. `mutate` resolves `{result,reconciled:boolean}` after application or a confirmed-write fallback; rejects only unconfirmed/failed writes and session cancellation. Provide commit-observer metadata for Stage 3 timing without financial values.

## Ordered implementation

1. Implement immutable, atomic delta application. Validate before publishing state. Preserve unaffected collection references, replace existing IDs, append new IDs, remove specified IDs, and do not sort shared arrays in place. UI selectors retain current business ordering.
2. Bind first authenticated bootstrap to top-level userId. On changed identity replace all financial state and histories; never merge users. Initial/explicit authentication bootstrap always makes a network request. Existing data may be reused within the authenticated tab session, subject to refresh policy.
3. Implement a FIFO mutation queue. Capture session epoch and stable caller body at enqueue; execute one request at a time. Before dispatch increment generation and cancel incompatible reads; after a valid confirmation increment again and apply delta atomically. Full reads wait until the queue drains. Failed tasks do not poison subsequent tasks. Never automatically retry writes.
4. Track horizon as max(requestedMonth,currentMonth). The server Snapshot still contains full history; horizon records recurring generation coverage, not an independent monthly cache. Navigation to an already covered month can reuse data. A future uncovered horizon requires a read. Delta from a recurring mutation may extend coverage only when its successful response guarantees that affected-rule coverage; do not claim full-user horizon extension from one rule delta. Only full bootstrap sets global materializedThroughMonth.
5. Coalesce identical full-read keys (epoch, generation, horizon). Each caller can abort independently; abort shared fetch only after the last caller leaves. Different keys may cancel/supersede old reads; only matching epoch/generation responses are accepted. Bootstrap and account-history responses both obey stale-read rejection.
6. On confirmed response apply its canonical changes before resolving mutate. Invalidate listed histories; reload a currently subscribed history after the write queue drains. Keep previous history rows while loading; deleted accounts drop their histories. History refresh failure remains nonfatal and retryable, not a write failure.
7. A 2xx missing/invalid envelope is a confirmed write: mark stale, perform one full refresh after queued writes drain, resolve reconciled=false if that refresh fails. Release the write queue slot before awaiting this fallback; keep the caller's completion promise separate, so waiting for queue drain cannot deadlock. Coalesce multiple pending reconciliation callers into one final read. Do not apply partial changes or resend. Account history is then globally invalidated. A valid delta does not update lastFullReadAt. Non-2xx/network failures preserve data and propagate current ApiError semantics.
8. Reset on logout/401/user switch: increment epoch, clear all financial state/histories/errors/timestamps, abort reads/in-flight client requests, reject queued tasks, and ignore late results. A write may have committed despite client abort; never claim it was rolled back. Protect against stale finally handlers clearing new-session loading flags.
9. Provide subscriptions with stable getState snapshots and no React render side effects. No timer/polling belongs in the store; Stage 3 drives existing focus/reconnection behavior.

## Test plan and deliverables

Use deferred promises and fake clocks to test schema validation, reference preservation, ID replacement/removal, FIFO writes, old read before/during/after writes, cancellation subscribers, different horizons, histories, legacy fallback, failures, and reset. Include two users with empty snapshots to prove identity cannot come from records.

```powershell
pnpm exec vitest run tests/finance-store.test.ts
pnpm typecheck
```

Deliver store/interfaces, test fixtures using complete contract records, SHA, case outcomes, and `stage-2-results.md`. The stage completes only after [verification](stage-2-verification.md) PASS. No browser storage, optimistic rows, monthly pagination, or UI rewrites are permitted.
