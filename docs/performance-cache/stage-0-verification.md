# Stage 0 Verification: Baseline and Contract Gate

## Assignment

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), and [implementation](stage-0-implementation.md). Verify the implementation owner's completed commit SHA. Do not repair implementation code or mark baseline measurements as post-improvement results.

## Setup

Inspect git status and runtime versions. Use the dedicated fictional browser harness from Stage 0, never the user's `.env` for restore tests. Confirm its API uses port 3002, web uses 5174, SQLite filename is performance-test.db, and normal `pnpm dev` still uses existing configuration. Record browser/OS and actual month. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm test:browser`.

## Required cases

| ID | Procedure | Expected result |
|---|---|---|
| S0-01 | Load bootstrap for two users, including one with no financial records | Correct top-level userId for each; original data/user fields remain; unauthenticated request is 401 |
| S0-02 | Validate a complete expense delta, empty changes, recurring delete, and category reassignment fixtures | Valid envelopes pass; nulls and versions retained |
| S0-03 | Try duplicate IDs, overlapping IDs, incomplete records, unsupported version, unknown collection, and another user's test record | Structural invalid values rejected; ownership additionally enforced by server tests, not assumed from schema |
| S0-04 | Inspect timing headers for bootstrap/write and handled failure | Monotonic nonnegative actual metrics, no sensitive descriptions, no-store retained |
| S0-05 | Run isolated harness while normal .env remains unchanged | Fictional data confined to dedicated database; test integrations disabled only in child processes |
| S0-06 | Create 12345-cent expense, edit to 23456 cents, add recurring rule, confirm at 14999 cents | Baseline includes response, row, total, and refresh observations without altering business rules |
| S0-07 | Repeat warmups and 10 samples at stated desktop/mobile sizes and network conditions | Median/p95 and counts derived from saved samples; cold/warm not mixed |
| S0-08 | Audit all 18 delta-enabled routes and restoration exception against context matrix | Every direct and indirect change represented; hidden recurring periods and account versions covered |
| S0-09 | Inspect published CSS and service worker, if accessible | Evidence distinguishes report, reproduction, and hypothesis; inaccessible checks labeled BLOCKED |
| S0-10 | Import build-info and update-safety stubs; set/reset blocked state and unsubscribe | Stable Stage 3/4 interfaces exist, callbacks clean up, no financial persistence |

Observe user-visible timing through commit/render evidence, not network timing alone. Mutation success can precede bootstrap completion in the baseline; document this honestly rather than failing Stage 0 for a pre-existing symptom. Confirm the harness cleans only its dedicated database/processes, preserves `.env` and unrelated `.data` contents, and does not persist financial fixtures in browser storage.

## Evidence and exit criteria

Append to `stage-0-results.md`: verified SHA, commands/exit codes, fixture revision, raw timing samples or sanitized artifact links, median/p95, request counts, response sizes, screenshots, and S0 case statuses. Strip cookies, auth headers, emails, and financial user content from HARs.

PASS requires all local contract, isolation, instrumentation, matrix, and reproducible baseline checks. Published/device access may be BLOCKED separately, with precise missing evidence. FAIL requires defects and reproduction steps returned to the Stage 0 owner; rerun affected checks after repairs. No Stage 1/2/4 implementation starts before the shared-contract local gate passes.

Report format: `Revision`, `Environment`, `Commands`, `Case results`, `Measurements`, `Evidence`, `Defects`, `Blocked external checks`, `Gate decision`.
