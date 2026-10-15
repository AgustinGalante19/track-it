# Integrated performance acceptance

Date: 2026-10-14, America/Buenos_Aires.

Integrated implementation: `9e1ae7c6eccbac9823c9bf47ca24000c9ee4238a`, including `74e83c0` (Stage 4), `cbe7a2c` (Stage 3), `c828bcf` (Stage 2), `ce09104` (Stage 1), and `4051b5d` (Stage 0).

## Decisions

- **Local implementation acceptance: BLOCKED for the complete release gate.** Core application tests and the production build pass; actual Docker/Caddy A/B checks cannot run because Docker is not installed. Individual passing checks are listed below; this is not a full Stage 4/5 PASS.
- **Release preparation: instructions prepared, NOT READY to publish.** `RELEASE-RUNBOOK.md` contains immutable candidate/rollback tags, static-asset export, health checks, and separately authorized publication/rollback commands. Candidate containers, retained asset hashes and Compose merge still need validation on the configured host.
- **Published physical-device acceptance: BLOCKED.** No deployment was performed. Real Google consent, the reported mobile CSS issue, old/new production workers, real-phone timing and second-device refresh require authorized host/device access.

## Verification matrix

| Check | Status / evidence |
|---|---|
| Schema/financial rules/auth startup | Preserved; no schema migration, `.env` replacement, Google disablement or `pnpm dev` default change |
| Canonical transactional deltas for 18 routes | PASS: real isolated SQLite snapshot equivalence, versions, retries, ownership, rollback |
| FIFO mutations, stale reads, session changes, subscriber cancellation | PASS: deferred transport store tests |
| Commit before success; category/account/recurring consumers | PASS: React integration and UI suites |
| Focus/reconnect/manual refresh policy | PASS: hook tests and browser recovery flow |
| Legacy response recovery/history failure/backup restore | PASS: isolated browser flow tests; no duplicated writes |
| Prompted PWA consent and dirty-form safety | PASS: helper and rendered-prompt tests, including postpone cancellation |
| Production worker static caching/offline behavior | PASS: CSS/JS/manifest MIME types, lazy CSS in precache, zero API cache entries, offline shell available and API unavailable |
| Actual Caddy headers, file-only 404s and retained A/B assets | BLOCKED: Docker command unavailable |
| Real A/B worker update and old lazy navigation | BLOCKED: actual Caddy A/B environment unavailable |
| Published recurring CSS diagnosis and physical mobile acceptance | BLOCKED: not reproduced on the reported device/host |

## Runbook and safety audit

The host-local preparation captures current container/image IDs and revision labels without exposing `.env`, tags rollback images before building, exports only `/srv/assets`, builds immutable candidate tags using one public release parameter, and creates candidate/rollback overrides. Publication selects only `api web` with `--no-build --no-deps`; DNS, volumes and database are preserved. No candidate API is started against the external database during preparation. No database restore is part of rollback. Existing user documentation edits and `.ai/` content were left intact.

The static export script's first-release directory creation and rejection of an outside-workspace destination passed. Docker copy, Caddy validation and image assembly remain unexecuted. Cumulative retained assets are not pruned.

## Local limitations

Early test attempts encountered slow local process startup/body delivery, fixture signup rate limits, and service-worker interference with browser route injection. Those attempts are excluded from timing comparisons. Failure-injection browser tests now block workers; measured performance scenarios retain normal cache/worker behavior. Rate-limit reset exists only in the isolated harness and never in the normal API.

Values below are local observations, not guarantees for external database/network or physical phones.

## Final command results

- `pnpm test`: **139 tests / 20 files PASS** (85.13 s).
- `pnpm build`: **PASS**, including TypeScript and production PWA generation (38 precache entries).
- `PCACHE_PREVIEW=1 pnpm test:browser`: **10/10 PASS** (1.6 min), including all six timing conditions, three recovery/history/restore flows, and actual production-worker cache/offline checks.
- Final audit found auth handlers could replace previously prepared cache headers. `9e1ae7c` reapplies no-store after the handler returns. The focused real API suite then passed **12/12** with an explicit authentication no-store assertion; `pnpm typecheck` passed again. This final repair changes server headers only; browser timings below were measured on the `74e83c0` production client before that header repair.
- `git diff --check`: **PASS**. The isolated browser database was removed by teardown; no harness processes are intentionally left running.

## Measured comparison

Chromium 156.0.8078.4, PCACHE-v1 fixture, fresh browser context for each condition, ordinary HTTP cache and service workers, two save warmups and ten measured saves per condition. Throttled conditions add 400 ms API response delay and 4x CPU slowdown. Same account types, counts, amounts and selected month as Stage 0; the fixture's current day moved from October 13 to October 14. Measurements are separate local runs, not a controlled physical-device experiment.

Every measured final save made **one write and zero bootstrap reads**, versus one write plus one bootstrap in Stage 0. Mean decoded JSON response bytes fell from **25,961.5 to 1,505.4 (94.2% reduction)**. These byte counts exclude headers and are not compressed transfer bytes. Cold navigation, each response duration, warmups and all individual samples are retained in the JSON reports.

Normal receipt-to-render p95 is **46.5 / 17.6 / 16.9 ms** at desktop / 360 px / 390 px, meeting the <=200 ms local target. Total save latency is reported separately; the app still waits for server confirmation.

Evidence: `evidence/stage-0/` baseline, `evidence/stage-3/` first passing integration run, and `evidence/stage-5/` repeated final production build. Each condition includes sanitized JSON and a fictional recurring screenshot. Desktop and phone-sized screenshots show styled recurring cards and paid badges; this does not establish resolution of the reported production CSS defect.

| Viewport / condition | Baseline save median / p95 (ms) | Final save median / p95 (ms) | Baseline receipt-to-render median / p95 (ms) | Final receipt-to-render median / p95 (ms) |
|---|---:|---:|---:|---:|
| 1440x900 / 400ms response delay + 4x CPU | 1305.0 / 1937.1 | 520.8 / 540.2 | 846.3 / 1494.2 | 71.6 / 96.5 |
| 1440x900 / normal | 201.7 / 222.7 | 87.3 / 110.7 | 135.7 / 163.9 | 40.9 / 46.5 |
| 360x800 / 400ms response delay + 4x CPU | 1456.1 / 1673.3 | 495.4 / 569.0 | 971.8 / 1220.0 | 55.1 / 114.5 |
| 360x800 / normal | 156.2 / 211.5 | 43.7 / 49.0 | 92.1 / 105.2 | 12.0 / 17.6 |
| 390x844 / 400ms response delay + 4x CPU | 1135.1 / 1513.4 | 547.1 / 609.5 | 668.1 / 1072.2 | 91.0 / 148.0 |
| 390x844 / normal | 155.1 / 179.4 | 44.2 / 51.1 | 99.3 / 109.6 | 12.8 / 16.9 |
