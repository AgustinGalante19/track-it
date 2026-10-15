# Stage 1 Implementation: Transactional Synchronization Responses

## Objective and prerequisites

Read [context and full operation matrix](00-CONTEXT.md), [roadmap](01-ROADMAP.md), `stage-0-results.md` (produced after Stage 0 executes), and [verification](stage-1-verification.md). Stage 0's contract gate must be PASS. Stage 2 and Stage 4 can proceed independently against the frozen contract.

## Ownership

Own `server/app.ts`, `server/service.ts`, `server/categories.ts`, new `server/finance-sync.ts`, and `tests/finance-sync-api.test.ts`. Read shared schemas, DB schema, backup implementation, current API tests, and recurring/category tests. Do not change frontend state or forms, shared contract, auth semantics, schema migrations, Caddy, or `.env`.

## Ordered implementation

1. Parse synchronization query metadata at route entry. For sync=1 validate month before entering any mutation; preserve original routes otherwise. Use the exact context envelope and status codes.
2. Extract internal transaction-executor operation helpers where necessary. Keep public legacy service signatures/results compatible. A route must execute mutation plus change collection in one outer transaction; do not nest a transaction on the same libSQL transaction executor or call a completed public transaction and reread afterward.
3. Create a typed change collector keyed by collection and ID. Capture affected IDs and pre-change references before deletion/reassignment. Reread canonical complete records after mutation using the same executor. Derive removes only from actual deletion or Snapshot visibility loss. Deduplicate arrays and histories and validate the final envelope before commit. Snapshot row projections are authoritative.
4. Implement all 18 delta-enabled routes in the context matrix. Start with account/expense/income, then payments and recurring/plans, then category reassignment. Add histories for both previous and new account when moving expenses. Canonical changes include account versions even when totals do not use them.
5. Make occurrence materialization accept an optional affected-rule filter and the transaction executor. Sync recurring create/update generates missing periods for that rule through max(selectedMonth,currentMonth), maintaining start dates, generationFrom, paused/deleted behavior, monthly estimates, batching, and unique rule-period IDs. Do not materialize unrelated users/rules. Legacy non-sync behavior remains unchanged.
6. For recurring deletion collect every visible occurrence ID before hiding the rule. Remove paid/skipped/pending occurrences from client Snapshot while retaining stored history and movements. For category changes include only visible rules/occurrences in deltas; changes to hidden storage must not resurrect it.
7. Preserve legacy result values. In particular voidMovement's result can omit a fresh version; changes must reread it. Charge retries may return a period/installment in result; changes must include its linked movement and current account records. Existing repeat-skip/conflict behavior is unchanged. Existing non-idempotent category creation is not automatically retried.
8. Add a fault-injection test seam in the collector (test-only injected callback, no production HTTP switch). Throw after writes but before commit and prove all financial rows/postings/versions roll back. Include failures in timing instrumentation without leaking data.
9. Keep backup restore unenveloped. Auth/password/demo/config remain outside synchronization. Return existing errors unwrapped. No server-memory financial cache or full-snapshot diffing is allowed.

## Error and concurrency rules

The database transaction is authoritative; failed validation/collection rolls it back. No success envelope before commit. Two-client version conflicts remain 409. Collect ownership-scoped canonical rows, never accept userId from requests. Replays must not increment versions twice when existing idempotency already prevents this. Do not invent idempotency for routes that currently lack it.

## Tests and commands

Add operation-matrix API tests using in-memory SQLite and two fictional authenticated users, following `tests/api.test.ts`. Compare applying each returned delta to a pre-operation snapshot with a fresh post-operation snapshot at the same horizon; normalize ordering by ID. Cover source-linked voids, category-wide changes, old/new account versions, charged retries, and recurring visibility.

```powershell
pnpm exec vitest run tests/finance-sync-api.test.ts tests/api.test.ts tests/recurring.test.ts tests/categories.test.ts
pnpm typecheck
pnpm test
```

Deliver the completed matrix with response examples, compatibility results, transaction-fault evidence, SHA, timing/query observations, and `stage-1-results.md`. Stage 1 finishes after [verification](stage-1-verification.md) passes. Do not begin Stage 3 merely because happy-path expense creation works.
