# Stage 2 results

Prerequisites: Stage 0 `4051b5d`; Stage 1 `ce09104` (not required for the injected-transport store tests). Implementation source is committed with this report.

## Implementation

`createFinanceStore(transport)` and the configurable singleton expose a single session-wide Snapshot, authenticated top-level identity, epochs, read generations, materialization coverage, full-read timestamp, histories, busy/refresh/error states and opaque commit version. State is memory-only. No timer, polling, browser storage or optimistic financial write is used.

Writes are FIFO with cloned bodies, one active request and no automatic retry. Dispatch and confirmation invalidate older reads. Same-key full reads share transport while each caller retains independent cancellation; a different horizon supersedes the older read. Full reads wait for writes. Confirmed legacy/invalid envelopes release the write slot before a coalesced reconciliation read, preventing deadlock. History invalidation preserves old rows and reloads subscribed accounts after writes. A history error cannot reject a confirmed save.

## Checks

`pnpm exec vitest run tests/finance-store.test.ts`: PASS, 16 cases including parameterized malformed/foreign envelope cases. `pnpm typecheck`: PASS. Tests use deferred promises and a controlled full-read clock; no server or external data is required.

| Required cases | Result |
|---|---|
| S2-01/02/14 atomic ID replacement/removal, unaffected array references, frozen prior arrays | PASS |
| S2-03 malformed, overlapping, unsupported and foreign-owner envelopes | PASS; no partial application or repeated write |
| S2-04/05 old read versus write, reads requested while writes are pending | PASS |
| S2-06 FIFO body capture and continuation after failed write | PASS |
| S2-07 shared read with one caller cancelled and last-caller cancellation | PASS |
| S2-08 covered versus future horizon, late lower-horizon response | PASS |
| S2-09 delta preserves last-full-read time | PASS |
| S2-10 history invalidation, stale read rejection and subscribed reload | PASS |
| S2-11 legacy confirmed write and failed fallback; coalesced successful fallback | PASS |
| S2-12 old read/write after reset and new-user bootstrap; loading flags isolated | PASS |
| S2-13 empty A then empty B identity replacement; 401 clears session | PASS |

Race trace: R1 starts -> W dispatch increments generation and cancels R1 -> W confirms canonical version -> R1 ignores transport abort and resolves -> epoch/generation/signal checks discard R1. Reset trace: A write active and another queued -> reset aborts/rejects both -> B bootstrap commits -> late A transport result cannot change B's data or busy flags.

## Gate

**PASS — local store gate.** Stage 3 must connect this store to Router, forms and history consumers; this commit alone does not change the UI save flow. No server acceptance or browser performance claim is inferred from store tests.
