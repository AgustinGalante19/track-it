# Stage 3 — saves and views

Prerequisites: server deltas `ce09104`, session store `c828bcf`, baseline `4051b5d`. Implementation commit: `cbe7a2c` on `codex/performance-cache-stage-3`; the final acceptance report records the integrated revision.

## Delivered behavior

All financial consumers use the session store: expense create/edit/duplicate/void, incomes, accounts, recurring rules/periods, installments/plans, and category changes. Router loaders subscribe to/reuse covered session data; account history has independently invalidated reads. There are no remaining financial `send()` followed by router refresh paths. The remaining direct sends are nonfinancial demo/password operations.

Successful saves apply canonical deltas atomically. Layout waits for the changed React commit's animation frame before resolving the form action and showing success. There is no optimistic balance or movement. Forms preserve their operation ID and input on errors. Dialog tracking blocks automatic refresh and PWA activation while forms/confirmations are open.

Malformed JSON cannot be mistaken for a confirmed legacy response. Parsed successful legacy/malformed envelopes trigger one reconciliation read after the write queue drains, without resubmitting. If that read fails, the notice says the save succeeded but views could not be updated. Backup restore uses this explicit full-read path and announces restoration separately from view reconciliation.

## Coverage

| Area | Evidence |
|---|---|
| All 18 mutation routes, versions, category reassignment, paid/skipped/deleted recurring periods, installment cancellation, ownership and rollback | Real SQLite API tests compare independently reduced deltas with fresh snapshots (`finance-sync-api.test.ts`) |
| Stale pre-write reads, FIFO writes, simultaneous subscribers, abort/reset, two-user isolation, invalid envelopes, fallback coalescing | Deferred-transport store tests (`finance-store.test.ts`) |
| Render before success, no optimistic record, no post-save bootstrap | Real Layout/form integration test (`finance-integration.test.ts`) and browser measurements |
| Account/category/recurring consumers and existing behavior | Migrated UI regression suites |
| 60-second focus threshold, reconnect deferral, offline/hidden suppression, event cleanup | `auto-refresh.test.ts` |
| Legacy save + failed reconciliation + manual recovery | Production-preview browser: exactly two writes and three reads across two saves and one manual retry |
| Account-history failure after income | Production-preview browser: one write, zero bootstrap, one failed history read; retry adds one history read only |
| Fictional backup restore | Production-preview browser: one restore, one bootstrap, final updated notice |

Full suite initially passed 134 tests in 18 files after updating old route-loader fixtures. Additional response/error and PWA prompt checks are recorded in the final report. Production build/typecheck passed. Browser injection tests disable service workers so interception is deterministic; performance tests keep normal HTTP caching and workers.

The fixture setup resets only the dedicated test database's rate-limit table between fictional users. Normal authentication configuration and production rate limits are unchanged. Early attempts exposed a worker-interception issue in the fault-injection tests, fixture signup limits in the combined suite, and intermittent local response timeouts; failed runs are not performance evidence.

## Timing and gate

Stage 3 local gate: **PASS**. All six production-preview conditions passed (two warmups plus ten saves each), with one write and zero bootstrap for every measured save. Normal receipt-to-render p95 was 57.7 ms desktop, 21.5 ms at 360 px, and 17.5 ms at 390 px, all below the 200 ms target. Throttled receipt-to-render p95 was 107.4/105.5/118.8 ms respectively. Decoded save-response bytes averaged 1,505.4 versus the baseline write-plus-bootstrap average 25,961.5.

Raw samples and styled recurring screenshots are in `evidence/stage-3/`. Desktop and 360 px screenshots were visually inspected: cards, actions, payment badges and summaries are styled; no local unstyled-row defect was seen. The final integrated build's repeated measurements are recorded separately in `stage-5-results.md`. No physical-phone or external Turso latency claim follows from local Chromium measurements. The reported published CSS defect remains a separate unresolved investigation.
