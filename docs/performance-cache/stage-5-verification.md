# Stage 5 Verification: Integrated Acceptance and Release Gate

## Assignment and prerequisites

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), [implementation](stage-5-implementation.md), all stage results, and the prepared release runbook. Verify an integrated SHA, not individual feature branches. Require Stage 3 and Stage 4 local PASS reports; retain production/device blockers. Do not implement repairs or deploy as part of verification.

## Local checks

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`, and `git diff --check`. Verify the full matrix, authentication isolation, category/recurring/installment rules, restoration in isolated fixtures, and startup using existing `.env` without isolated defaults. Google remains available where credentials are configured; mocked OAuth tests do not prove real consent.

Repeat Stage 0 normal/throttled scenarios at 1440x900, 360x800, and 390x844 using the same fictional fixture revision and sample protocol. Required normal-network p95 receipt-to-visible-update is <=200 ms; report normal and throttled CPU separately. Confirm one write and zero extra bootstrap per complete-delta save; account history may independently refresh. Report server/write/end-to-end durations without promising a universal 200 ms save.

Run the following integrated cases:

1. Slow expense save -> shared row/total committed -> success notice -> navigate recurring/categories/history; no stale overwrite or unnecessary full reload.
2. External-device simulated write -> focus after 60 seconds or manual update -> current data; no continuous polling. Real second-device check remains pending if unavailable.
3. Offline/online with dirty form -> deferred single read after close; no lost fields or offline write queue.
4. Confirmed write plus history/read failure -> saved state retained, separate retry, no duplicate write.
5. Different month/currency and future horizon -> correct filters, necessary materialization, no false inclusion.
6. Logout/401/user switch with late reads and active write -> no old-user data; abort never described as server rollback.
7. A/B PWA update with lazy assets, dirty form, and postponed/accepted update -> correct styling and one safe activation; no API cache entries.
8. Recurring delete/category rename/plan cancel/source-linked void -> canonical versions and preserved paid history match backend.

## Release-runbook audit without publication

Check exact commands, release parameter validation, immutable candidate/rollback tags, existing-container asset export, Caddy test, base/override Compose merge, API health polling, and rollback procedure. Validate Compose configuration without printing resolved secrets. Confirm only api/web are selected, DNS and volumes untouched, no new migrations or destructive data actions, and previous assets are retained. Confirm candidate API validation uses an isolated database. Missing deployment host access is BLOCKED, not a reason to invent SSH commands or credentials.

The verifier must not run the publication command without subsequent explicit user authorization. If it is later authorized, repeat the runbook's published checks over HTTPS, with real Google and a fictional development account. Record actual phone/browser version, build ID, worker version, screenshots, receipt-to-render samples, CSS checks, and another-device refresh. Emulation alone cannot pass physical-phone acceptance.

## Reporting and acceptance

Finalize `stage-5-results.md` with revision/prerequisites, command results, stage case matrix, raw sample references, baseline-versus-final median/p95/count/byte table, HTTP/cache/worker evidence, runbook audit, defects, and external blockers.

Use three separate decisions:

- **Local implementation acceptance:** PASS only after complete automated/browser/Caddy checks and timing target pass.
- **Release preparation:** READY only when candidate/rollback instructions and assets are validated; publication remains unauthorized until separately approved.
- **Published physical-device acceptance:** PENDING/BLOCKED until actual authorized site/device checks pass; never inferred from local or mocked tests.

Any failed invariant returns to its owning stage and triggers focused reverification plus affected integration checks. Update roadmap checkboxes only for genuinely completed gates. Do not mark all stages or the reported CSS problem resolved just because the handoff documents exist.
