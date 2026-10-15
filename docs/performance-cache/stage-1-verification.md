# Stage 1 Verification: API and Transaction Gate

## Assignment and setup

Read [context/matrix](00-CONTEXT.md), [roadmap](01-ROADMAP.md), [implementation](stage-1-implementation.md), and Stage 0 results. Verify the Stage 1 completed SHA against isolated in-memory fixtures with two authenticated users. Never run destructive restore against the external database. Do not change code to satisfy checks.

Run the focused Vitest command in implementation, `pnpm typecheck`, and `pnpm test`. Record all exit codes. Use existing test login helpers; tokens remain local and must not be committed.

## Required procedures

1. For each of the 18 delta-enabled routes, take a pre-operation snapshot, execute the sync mutation, apply its changes in a test reducer, and compare to a fresh same-horizon snapshot. Check full canonical fields, unique IDs, removals, and historyAccountIds. Do not use the production store reducer as the only oracle.
2. Repeat each applicable route without sync=1 and assert exact legacy result shape/status against current service behavior. Error responses remain unwrapped. Test malformed sync month, boundary months, unsupported IDs, unauthenticated calls, and cross-user references; malformed month must cause no write.
3. Expense: create 12345 cents, edit to 23456, move bank A to bank B, then void. Check movement version, both account versions, history invalidation, and no rounding errors. Void twice using existing semantics; no additional changes from a duplicate financial write.
4. Rule: create current-month service, edit a future estimate, pause, resume, then delete. Current-period estimates preserve existing rules; actual deleted future IDs are removed; resume honors generationFrom. Delete removes every visible occurrence even if paid/skipped, preserves stored relations and payment movements, and does not load unrelated users' rules.
5. Confirm a period at 14999 cents, repeat the charge, then void its linked movement. A replay returns linked canonical entities without another movement/version increment. Voiding deleted-rule payment must not make hidden periods visible.
6. Create a three-installment plan with one valid historical period, charge a pending installment, repeat charge, cancel remaining periods, and void the charge. Historical periods have no synthetic expenses; cancelled-plan void returns cancelled status instead of pending.
7. Rename/delete a category used by an expense, recurring rule/period, and plan; include a soft-deleted rule. Every visible changed entity is present with fresh versions, and hidden entities stay hidden. Verify null replacement, chosen replacement, default-category initialization, and rejection of self-replacement.
8. Account archive/delete restrictions remain enforced. Created, edited, and removed accounts invalidate only permitted histories. Income to credit remains rejected.
9. Trigger the collector fault after writes. Query movements, postings, accounts, periods, plans, and categories directly; all must match pre-operation state. Verify sync routes do not open nested transactions or call full bootstrap to construct deltas.
10. Audit every returned row's userId and history reference against the authenticated user; schemas alone do not guarantee authorization. Retain `Cache-Control: no-store` on sync responses and errors.

## Evidence and gate

Produce `stage-1-results.md` with SHA, prerequisite revision, command outputs, a row-by-row coverage matrix, canonical/legacy examples stripped of private data, retry and rollback assertions, defects, and PASS/FAIL/BLOCKED status. Local API tests do not establish Turso latency or production deployment correctness.

PASS requires every matrix entry, compatibility, ownership, retries, and atomicity to pass. A missing matrix route is FAIL, not deferred scope. Return failures to Stage 1 owner and verify the repaired revision. Stage 3 cannot start until this gate and Stage 2's gate both pass.
