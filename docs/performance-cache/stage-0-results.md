# Stage 0 results

## Revision

Base: `6c94d5fa2c6a2d3249817a19693fb1c4b837845c`. Verified implementation: `4051b5d` on `codex/performance-cache-stage-0` (checks ran against identical source before committing). No deployment or external financial data was modified.

## Environment

2026-10-13, America/Buenos_Aires. Windows, Node 24.14.0, pnpm 11.25.0, Chromium 156.0.8078.4. Fixture `PCACHE-v1`, month 2026-10. Production Vite build served with preview on 127.0.0.1:5174; isolated API on 127.0.0.1:3002. Fresh browser context per condition, normal HTTP cache and service-worker behavior. No browser request interception; the isolated API delays responses in the slow condition. Two warmup saves precede ten measured saves in each condition.

The harness passes explicit environment overrides to child processes, including blank Google/dashboard/database-token/owner credentials. Normal startup and `.env` are unchanged. Its dedicated database is `.data/performance-test.db`; Windows named-pipe teardown stops its own child processes before deleting only that database and its WAL/SHM siblings. Cleanup was confirmed after the final run. Existing files under `.data` are not traversed or removed.

## Commands

- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 108 tests in 14 files.
- Final focused API/schema/timing rerun: PASS, 27 tests in 3 files.
- `pnpm build`: PASS, including TypeScript and PWA generation (39 precache entries).
- `pnpm exec playwright install chromium`: PASS.
- `$env:PCACHE_PREVIEW='1'; pnpm test:browser`: PASS, six scenarios, 2.6 minutes.
- `git diff --check`: PASS (Git emits an informational CRLF warning).

The original 93-test result in context is historical. Initial harness trials exposed selector mistakes and a need for explicit Windows teardown. Those were repaired. A development trial overlapped source edits and is excluded from the measurements. The final production-preview run above is the baseline evidence.

## Case results

| Case | Result | Evidence |
|---|---|---|
| S0-01 | PASS | API tests: distinct top-level user IDs for two empty financial accounts; original user/data retained; unauthenticated 401 |
| S0-02 | PASS | Complete expense/account, empty, recurring deletion and category reassignment schema cases |
| S0-03 | PASS | Duplicate/overlapping IDs, unsupported version, incomplete records, unknown collections rejected; ownership remains enforced by authenticated API tests |
| S0-04 | PASS | Async-local monotonic timings; actual auth/transaction/materialization/batch/snapshot/total durations; handled errors retain timings and no-store |
| S0-05 | PASS | Explicit isolated child environment and exact-file teardown; no normal startup changes |
| S0-06 | PASS | All six browser cases save 12345 cents, edit to 23456, create a 12500-cent current-month service and confirm 14999 cents; visible row and monthly total assertions |
| S0-07 | PASS | Six conditions, each with two warmups plus ten recorded saves; cold navigation separately recorded |
| S0-08 | PASS | Matrix source audit below; no sync endpoints implemented in Stage 0 |
| S0-09 | BLOCKED | Published URL inaccessible through web tool; no physical-phone session available |
| S0-10 | PASS | Build-info and update-safety exports; state transitions, duplicate suppression and unsubscribe tested |

## Measurements

Durations in milliseconds. Median uses nearest rank (5th of 10); p95 is the maximum of ten. These are local SQLite/Windows measurements, not remote Turso or physical-phone measurements. Viewport changes do not emulate a phone's hardware. The 4x condition uses Chromium CPU throttling and 400 ms added response delay on both writes and bootstrap.

| Viewport | Condition | Cold navigation | Save median | Save p95 | Receipt-to-render median |
|---|---|---:|---:|---:|---:|
| 1440x900 | Normal | 347.0 | 201.7 | 222.7 | 135.7 |
| 1440x900 | 400 ms / 4x | 1631.0 | 1305.0 | 1937.1 | 846.3 |
| 360x800 | Normal | 440.0 | 156.2 | 211.5 | 92.1 |
| 360x800 | 400 ms / 4x | 2466.6 | 1456.1 | 1673.3 | 971.8 |
| 390x844 | Normal | 419.9 | 155.1 | 179.4 | 99.3 |
| 390x844 | 400 ms / 4x | 1666.2 | 1135.1 | 1513.4 | 668.1 |

Every measured save produced one expense write and one bootstrap. Combined decoded JSON response sizes grew from 23441 to 28484 bytes over the ten measured saves. Full samples, separate warmups, response timing, receipt-to-render p95, request counts and bytes are in [evidence/stage-0](evidence/stage-0/). The measurement begins at API dispatch and ends on requestAnimationFrame following the data's React commit; row/summary assertions independently check the visible data. It is a rendering opportunity, not a physical display scanout measurement. The existing notice still precedes refresh completion; this stage intentionally preserves that baseline behavior.

## Operation matrix audit

All 18 financial mutation routes exist. The server source confirms the contract must cover:

- Account create/edit/delete: canonical account versions, ownership and archive/reference restrictions.
- Expense create/edit, income, movement void: affected account versions/postings, old/new account history, linked periods/installments and legacy void result shape.
- Recurring create/update/delete: generated periods, pause deletions, resume `generationFrom` stored as a full date, soft-delete visibility for every period while payment movements remain.
- Occurrence charge/skip: linked movement on charge retry, actual amount versus estimate, repeat-skip conflict.
- Plan create, installment charge, plan cancel: historical installments, charge retry, preserved charged rows, cancelled pending rows.
- Category create/edit/delete: initialized defaults, name-based reassignment and actual versions across movements/rules/periods/plans, hidden-rule exclusion in Snapshot.

Backup restoration is the separate full-refresh exception. Auth, password, demo, config and export are excluded. Stage 1 must verify transactional envelopes for each route; this audit is not acceptance of unimplemented deltas.

## Evidence and defects

Sanitized JSON and fictional recurring-page screenshots are saved for all six conditions. No HAR, credentials, cookies, emails or external database rows are included. Local recurring styles are present; this does not reproduce or resolve the reported production CSS problem. Schema parsing preserves canonical nulls and versions and does not pretend to enforce ownership.

## Blocked external checks

The read-only web request to `https://track-it-26.duckdns.org` returned “not accessible via this tool.” This is not evidence of downtime. Remaining Stage 4 procedure: inspect linked/lazy CSS status, MIME and body; current asset hashes; computed recurring layout; active/waiting service worker and static cache entries in the affected mobile browser, without clearing its storage. Phone OS/browser and deployed revision remain unknown.

## Gate decision

Stage 0 local contract/harness gate: **PASS**. Published/device inspection: **BLOCKED**, separately. Baseline only; no claim of improved save latency, fixed production CSS, or deployment. Stages 1, 2 and 4 are now eligible under the roadmap.
