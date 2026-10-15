# Stage 1 results

Prerequisite: Stage 0 local PASS, `4051b5d`. Verified source is committed with this report; the next stage report records its SHA. No deployment.

## Implementation

All 18 financial routes opt into `sync=1`, validate the month before mutation and retain their existing HTTP statuses. Non-sync callers keep legacy results and ignore synchronization-only month metadata. Backup restore and authentication remain unenveloped.

Legacy public service functions now delegate to explicit transaction-executor helpers. Sync calls run those helpers and the canonical collector inside one outer transaction, with no nested transactions. The collector reads only operation-related IDs, rule periods, plan installments or category references. Category creation reads the small category collection to include newly initialized defaults. It never calls bootstrap or diffs full financial history. All canonical reads and history IDs are scoped to the authenticated user.

Recurring materialization accepts an affected-rule filter and generates through max(selected,current month). Soft-deleted rules and periods stay absent. Deleted IDs are captured before visibility changes. Replayed payments include their linked movement and current account even when the legacy result is a period/installment. Canonical void versions are reread, preserving the legacy result independently.

## Verification

- TypeScript: PASS.
- Focused API/recurring/category/matrix suite: PASS, 29 tests across 4 files.
- Full suite: PASS, 112 tests across 15 files.
- Existing non-sync API and domain suites remained unchanged except Stage 0 timing assertions and passed after helper extraction.

`tests/finance-sync-api.test.ts` applies each route's delta using an independent test reducer and compares it to a fresh same-horizon Snapshot, normalized only by ID order. Coverage:

| Operations | Result |
|---|---|
| Account create/edit/delete; archive/reference ownership rules | PASS |
| Expense create/retry/edit between accounts/void/repeat; canonical versions and both history IDs | PASS |
| Income create; existing credit exclusion regression | PASS |
| Recurring create/update/pause/resume/delete, every period visibility | PASS |
| Occurrence charge/retry/skip/repeat conflict; deleted-rule payment void | PASS |
| Plan create with historical installment; installment charge/retry; cancel and cancelled-plan void | PASS |
| Category create/default initialization/rename/delete with visible and hidden references | PASS |
| Invalid/boundary months, missing authentication, cross-user edit, no-store/unwrapped errors | PASS |
| Injected collector failure after mutation but before commit | PASS |

Fault injection confirms the entire Snapshot, postings and account versions match the pre-operation state after rollback. The seam is a function argument to the collector; no HTTP fault switch exists. Retry tests check one movement and canonical account versions via snapshot equality. Tests use isolated in-memory SQLite and fictional identities only.

## Gate

**PASS — local transactional API gate.** No Turso/network-latency or production claim. The client still uses legacy responses until Stage 3. Server timing covers the encompassing synchronization transaction; no sensitive descriptions or query text are emitted.
