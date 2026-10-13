# Stage 0 Implementation: Baseline and Shared Contract

## Objective and prerequisites

Produce an honest baseline and freeze the wire contract before parallel implementation. Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), and [verification](stage-0-verification.md). No prior stage is required. Preserve `.env` and Google; do not deploy or change financial rules.

## Ownership and required reading

Read the entry-point table and operation matrix in context, `package.json`, route-data tests, API fixtures, and PWA configuration. Own `shared/finance-sync.ts`, additive bootstrap `userId`, timing helpers, `playwright.config.ts`, `tests/browser/performance.spec.ts`, and the `test:browser` package script. Use `test:browser = playwright test`; Playwright discovers only `tests/browser/**/*.spec.ts`, leaving Vitest discovery unchanged. Do not modify UI save behavior yet.

## Ordered implementation

1. Record revision, Node/pnpm versions, site/device accessibility, browser version, viewport, cache state, and test fixture version in `stage-0-results.md`. Keep previous 93-test results labeled historical.
2. Build shared types and exported Zod validators exactly matching the context contract. Derive record schemas from domain/schema fields; include all returned fields, not only input schemas. Validate duplicates, overlapping IDs, delta version, complete records, and unknown collections. Export `financeChangesSchema` and `parseFinanceSyncResponse<T>(value, resultSchema)`; the result schema is passed by each caller and does not reconstruct canonical changes from result.
3. Add `userId` to `/api/bootstrap` from authenticated context. Do not change AuthUser or `/api/snapshot`. Confirm callers tolerate the additive field. Establish two small shared integration modules now to avoid a hidden Stage 3 dependency on Stage 4: `src/lib/build-info.ts` exports `buildInfo: { id: 'development' }` initially; `src/lib/update-safety.ts` exports `setUpdateBlocked(blocked: boolean)`, `getUpdateBlocked(): boolean`, and `subscribeUpdateSafety(listener: () => void): () => void`. The latter is an in-memory boolean/subscription module, initially false, with no user data. Stage 4 owns these modules after this gate; Stage 3 only imports their stable interfaces.
4. Add server timing utilities using monotonic elapsed time. Header metric names: `total`, `auth`, `db`, `materialize`, `snapshot`. Omit unavailable metrics, never invent zero values, and do not include names, IDs, queries, or tokens in descriptions. Attach on success and handled errors without changing cache headers. Instrument current transactions/reads; do not restructure them in this stage.
5. Add frontend marks for dispatch, JSON response receipt, and post-render observation. Generic metric names and opaque per-operation counters only; clear marks after each measurement. Use a React commit effect plus requestAnimationFrame for the changed visible row/summary. Stage 3 will connect the same observer to its new state flow. Do not emit financial values to console or analytics.
6. Create a deterministic browser test harness. Start an isolated API with `DATABASE_URL=file:.data/performance-test.db`, empty database token/Google/dashboard/owner credentials, development mode, host 127.0.0.1, port 3002, and a fixed fictional secret of at least 32 characters. Pass environment directly to spawned Node processes so dotenv cannot repopulate empty credentials. These are test-process overrides only; never edit `.env` or normal startup scripts. Vite must accept a test-only proxy target through `TRACK_IT_TEST_API_ORIGIN`, defaulting to 127.0.0.1:3001 outside tests. Stage 0 owns this small Vite addition, then hands Vite to Stage 4.
7. Browser harness serves on 127.0.0.1:5174 with `BETTER_AUTH_URL` matching that origin. Development runs use Vite with that port; production-like runs use `vite preview` on the same port after build. Configure one worker and `reuseExistingServer: false`. Launch through existing Node/tsx entry points with explicit test environment; keep startup and teardown process IDs under harness control. Only delete the resolved dedicated performance-test database files after stopping their processes; never delete `.data/` recursively.
8. Build a fresh fictional user and use fixture names prefixed `PCACHE-`. Create a bank account ARS, a credit account ARS, and a bank account USD. Use 30 seeded single expenses, one service, one subscription, and a three-installment plan. Dates derive from shared `today()`; tests record actual month. A new current-month service uses dueDay 15, startDate first day of the month, estimate 12500 cents; confirm it at 14999 cents. Expense baseline: `PCACHE-Expense`, 12345 cents, current date, bank ARS. Edit to 23456 cents; use separate users/databases for restore and isolation scenarios.
9. Capture baseline at 1440x900, 360x800, and 390x844. Use two conditions: normal network; simulated 400 ms response delay for both financial writes and bootstrap plus 4x CPU throttling where supported. Keep service worker/cache behavior unmodified during the baseline. Run 10 measured saves per condition after two warmups; record median and p95, response sizes, write/bootstrap counts, receipt-to-render, and end-to-end duration. Record cold versus warm separately.
10. Inspect published site read-only where reachable: sanitized resource URLs, CSS status/content type, computed recurring layout, active/waiting service worker, cache entries, current asset hashes. Do not clear the user's site storage or modify their data merely to investigate CSS. If unavailable, record BLOCKED and retain the exact remaining procedure for Stage 4.

## Contracts and preserved behavior

The context contract and mutation matrix are authoritative. Month validation happens before writes in later Stage 1. For this stage, tests prove schema semantics and bootstrap identity; synchronization endpoints are not implemented yet. No database migration or cache persistence is permitted.

## Checks and deliverables

From repository root:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

If browser installation/access is unavailable, preserve automated test sources and record the blocker; do not claim measured results. Deliver shared contract, operation-matrix confirmation, isolated harness, timing observations, baseline table, sanitized evidence, and `stage-0-results.md` with commit SHA. Stage 0 finishes only when its [verification](stage-0-verification.md) passes the local contract/harness checks. Published observations may remain explicitly blocked.
