# Stage 3 Verification: Saves, Views, and Refresh

## Assignment and setup

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), [implementation](stage-3-implementation.md), and Stage 1/2 PASS reports. Verify the integrated completed SHA. Use Stage 0's fictional isolated browser harness, same dates, account types, viewports, and delay settings. Do not restore over the user's external data or modify code.

Run implementation's focused tests, typecheck, complete tests, build, and browser tests. Test desktop 1440x900 and mobile 360x800/390x844. Keep network logs and render timing evidence sanitized.

## Required cases

1. From home create 12345-cent ARS expense. Observe committed row and month total before success notice. Count one write and zero post-save bootstrap; delay a pre-save read and release it afterward to prove it cannot erase the new row. Edit to 23456 cents, duplicate, move account, and void; compare category and account history views.
2. Save USD expense while ARS is selected; save a next-month expense while current month is selected. Notice remains truthful; filtered lists/totals do not incorrectly include either. Switch filters/month/currency and verify server-confirmed records appear where expected.
3. Create service at 12500 cents and subscription, edit future rule, pause/resume, skip period, confirm payment at 14999 cents, and delete rule. Rows retain styles; creation affects commitments rather than paid expense totals; confirmation affects expense totals; deletion preserves payment history and removes visible periods.
4. Create installments, confirm one, cancel remaining, then void charge. Preserve historical/cancelled behavior. Check immediate commitments and expense totals; no unnecessary bootstrap.
5. Create/edit/archive/delete accounts according to restrictions. Rename/delete categories with replacement across all entity types. Inspect account and entity versions through test fixtures; no stale form silently overwrites changes.
6. Delay write response and navigate to another section. No optimistic data appears. Upon confirmation all subscribed views reconcile; switching sections does not trigger another complete download for already-covered horizon.
7. Fail write with validation, 409, and network loss. Form retains values, no success notice, stable supported operation ID remains for manual retry. A confirmed legacy response followed by failed refresh displays saved-but-not-updated notice and does not submit again.
8. Fail visible account-history refresh after successful write. Shared totals remain confirmed; history shows updating/error/retry. Retry changes history only and must not repeat the write.
9. Open a form, reconnect, trigger focus/visibility repeatedly, then close. Exactly one deferred refresh occurs. Focus before 60 seconds performs none; after 60 seconds performs one. Manual refresh works even when full-read data is younger. Hidden/offline tabs do not send periodic requests.
10. Restore a fictional backup in the dedicated test user. Full read required before updated notice. Fail that read and verify restore is still reported confirmed, retry only reloads, and old data is marked stale. No duplicate restore.
11. Log out during active requests, sign in as another empty user, then release old responses. No old data flashes or persists. Check 401 route redirect, Google remains configured in normal development, StrictMode request deduplication, and unchanged unsaved form data during deferred refresh.

## Timing acceptance and evidence

Measure receipt of parsed confirmed response to first rendered changed row/summary using Stage 0 observers. Collect 10 samples per baseline condition after two warmups. Target p95 <=200 ms with normal CPU; report throttled results separately. End-to-end write latency is measured separately and cannot be advertised as guaranteed below 200 ms. Store mocked assertions alone do not demonstrate browser timing.

Produce `stage-3-results.md`: SHA, prerequisite SHAs, commands, complete consumer/mutation coverage, case statuses, write/bootstrap/history counts, median/p95, screenshots, errors, and external blockers. PASS requires coherent immediate confirmed state, all consumers migrated, race safety, and passing local integration checks. Missing physical-device evidence remains BLOCKED for Stage 5; do not call it mobile production acceptance.
