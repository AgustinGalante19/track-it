# Performance and Cache: Context and Binding Decisions

Recorded: 2026-10-13, America/Buenos_Aires. Status: documentation only; all engineering stages are pending. Start with [the roadmap](01-ROADMAP.md). This document is the shared source of truth for every implementation and verification handoff.

## User goal and authorization

Make confirmed saves visible promptly across the home page, recurring items, categories, and account history; prevent stale views and unreliable styling on mobile; improve caching without changing financial rules.

The user uses the published site at `https://track-it-26.duckdns.org` in a mobile browser. They reported that saving an expense displays a message claiming the numbers are updated, but the home page does not change until refreshing and waiting. New recurring items have sometimes appeared as unstyled text. These are user reports, not independently reproduced production findings.

The existing `.env` points to the user's external development database. The user explicitly permits manipulating that database during development. Keep that configuration and Google authentication. Earlier changes introducing an isolated SQLite startup and disabling integrations were reverted. Do not recreate `dev:local`, alter startup defaults, replace `.env`, or disable Google. Use `pnpm dev` for ordinary development. Automated tests still use isolated fictional fixtures; destructive restore tests must not replace the user's financial data.

This documentation task does not authorize deployment or technical implementation. Later stage implementation is separate work. Publishing requires subsequent authorization. No credentials, tokens, personal movements, emails, or `.env` contents belong in these documents or evidence.

## Confirmed repository findings

- `src/forms.tsx` awaits the write, shows the success notice, then calls `refresh()` and closes. The notice therefore precedes completion of data refresh.
- `src/Layout.tsx` implements `refresh()` as a void call to Router revalidation. Confirmation dialogs also announce success before refreshing.
- `src/lib/route-data.ts` loads `/api/bootstrap?month=...`; routes reuse the snapshot for navigation within the same month. Account history has a separate route loader.
- `server/service.ts:getSnapshot` initializes categories and materializes recurring occurrences in a transaction, then batches seven collections. Most collections contain the user's complete history rather than only the selected month.
- The snapshot collections are `accounts`, `movements`, `recurring`, `occurrences`, `plans`, `installments`, and `categories`. Postings are returned through account history, not Snapshot.
- Inserting movements increments referenced account versions. Editing and voiding movements also affect accounts. Category reassignment changes movements, rules, plans, and occurrences; some entities receive new versions.
- Deleting recurring rules is a soft delete. Snapshot excludes those rules and all their occurrences, while movements remain in history. Cancelling a plan preserves recorded charges.
- `src/styles.css` contains recurring-item styling. Its presence does not establish that the published browser downloaded or applied that CSS.
- `server/app.ts` sends `Cache-Control: no-store` on API responses. Vite PWA precaches HTML and static resources, excludes API navigation, and uses prompted updates. A browser tab may have a service worker even when the app is not installed.
- `Caddyfile` currently applies `no-cache` to all static content and falls back to HTML for missing paths. Hashed assets need distinct handling. `vercel.json` already distinguishes immutable assets, HTML, service worker, and API.

## Unknowns and hypotheses

The actual deployed revision, phone OS/browser, active service-worker version, write latency, read latency, and missing-CSS cause are unknown. The earlier web tool could not reach the published domain; that is a tooling limitation, not proof of downtime.

Possible explanations include delayed refresh, an interrupted or superseded read, a stale deployment, missing hashed assets, or incorrect static fallback. Do not claim a particular cause without reproduction and evidence. Confirm browser and OS from the accessible device during Stage 0; if unavailable, record the missing observation rather than guess.

## Architecture and environment

React 19, React Router 7.18.4, Vite 8, TypeScript, Hono, Better Auth, Drizzle, and libSQL/Turso are declared in `package.json`. The repository includes Caddy/Docker Compose deployment and a Vercel entry point; use Caddy/Docker as the target for this work and preserve Vercel behavior.

Important entry points, relative to the repository root:

| Area | Sources |
|---|---|
| Routing and data | `src/main.tsx`, `src/Layout.tsx`, `src/context.tsx`, `src/lib/route-data.ts`, `src/lib/api.ts`, `src/lib/use-auto-refresh.ts` |
| Mutations and views | `src/forms.tsx`, `src/pages.tsx`, `src/CategoriesPage.tsx`, `src/SettingsPage.tsx`, `src/AccountsPage.tsx`, `src/components/SessionPreferences.tsx` |
| Server and rules | `server/app.ts`, `server/service.ts`, `server/categories.ts`, `server/backup.ts`, `server/db/schema.ts` |
| Shared types | `shared/domain.ts`, `shared/auth.ts`, `shared/categories.ts`, `shared/format.ts` |
| Static deployment | `vite.config.ts`, `src/components/UpdatePrompt.tsx`, `Caddyfile`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `vercel.json` |
| Existing checks | `tests/api.test.ts`, `tests/route-data.test.ts`, `tests/auto-refresh.test.ts`, recurring/category/account/auth tests |

The workspace is Windows/PowerShell. Node 24.14.0 and pnpm 11.25.0 were observed; dependencies were installed. Earlier checks passed the production build and 93 tests across 12 files. These are historical results, not acceptance of any future changes. The untracked `.idea/` directory is unrelated user content; leave it alone. No AGENTS.md was found in the repository during this documentation pass; future sessions must check again.

## Approved behavior and exclusions

1. Apply server-confirmed data before presenting updated totals. No optimistic financial mutations.
2. One session-scoped in-memory state; no financial data in localStorage, sessionStorage, IndexedDB, or Cache Storage. Existing theme, currency, navigation, and last-account preferences may remain.
3. Manual refresh always requests current data when online. Reconnection requests current data after blocking forms close. Focus/visibility refresh occurs when the last full read is at least 60 seconds old.
4. No continuous polling or WebSockets. Other-device changes become visible through those refresh triggers.
5. Keep full-history bootstrap for now. No monthly pagination, database migration, new query library, or schema redesign in this iteration.
6. Retain integer cents, ARS/USD separation, idempotency behavior, version conflicts, ownership checks, historical transfers, recurring estimates, and installment cancellation rules.
7. Keep prompted PWA updates and do not reload a dirty form automatically.

## Binding synchronization contract

Stage 0 creates `shared/finance-sync.ts` with these types and runtime validation. The type names and wire shape are fixed here to allow Stages 1 and 2 to proceed independently.

```ts
import type { Snapshot } from './domain';
export type CollectionDelta<T> = { upserts: T[]; removes: string[] };
export type FinanceChanges = {
  version: 1;
  collections: { [K in keyof Snapshot]?: CollectionDelta<Snapshot[K][number]> };
  historyAccountIds: string[];
};
export type FinanceSyncResponse<T> = { result: T; changes: FinanceChanges };
export type FinanceBootstrap = {
  data: Snapshot;
  user: import('./auth').AuthUser;
  userId: string;
};
```

Add `userId` at the bootstrap top level using the authenticated server user ID; keep AuthUser and existing bootstrap fields unchanged. This additive identity is required even for users with no records. Do not use email or the first financial record as the session identity. `/api/snapshot` retains its current shape.

Financial mutation URLs opt in with `sync=1&month=YYYY-MM`. `month` is optional, defaults to server `today().slice(0, 7)`, uses the current month schema and 2000-01 through 2100-12 limits, and is validated before writes. It controls recurring generation through `max(selectedMonth, currentMonth)`, not expense filtering. Without `sync=1`, preserve existing response body, status, and mutation behavior; ignore synchronization-only month metadata. Errors keep existing error bodies and status codes and never become success envelopes.

`result` preserves the legacy result exactly, including existing retry variations. `changes` contains fresh canonical records, reread inside the same transaction, even when legacy results omit a new version. Never generate deltas from stale request values. Omitted collections mean unchanged. Empty collections are valid. IDs are unique in each array; an ID cannot occur in both upserts and removes. Affected records use their current complete Snapshot shape, including nulls and versions. Validate the whole envelope before applying it. Use Zod schemas that reject unknown collection names, malformed records, unsupported versions, and overlapping/duplicate IDs; preserve known record fields.

Example: a successful expense POST retains status 201 and returns its legacy movement in `result`, canonical movement and incremented account in `changes.collections`, and the account ID in `historyAccountIds`. A recurring delete returns `{ ok: true }` in `result`, removes the rule and all visible periods of that rule, and leaves payment movements intact. The remove IDs must be selected before hiding/deleting rows.

## Complete mutation coverage matrix

All routes below have `/api` prefix. Upserts include every row actually changed, not unrelated history. `A` means affected accounts, including old and new accounts when moving an expense. History invalidation uses the union of affected posting/account references; over-invalidation of involved accounts is allowed, invalidation of other users is not.

| Route | Collections and indirect effects | History invalidation |
|---|---|---|
| POST `/accounts` | Upsert created account | New account |
| PATCH `/accounts/:id` | Upsert edited account/version; preserve archive restrictions | Account |
| DELETE `/accounts/:id` | Remove account after existing reference restrictions pass | Account; remove cached history |
| POST `/expenses` | Upsert movement and A with fresh versions | A |
| PUT `/expenses/:id` | Upsert movement/version and old/new A; changed postings remain server-owned | Old/new A |
| POST `/incomes` | Upsert movement and A; preserve credit-account exclusion | A |
| POST `/movements/:id/void` | Upsert canonical voided movement and A; upsert reset occurrence if visible, or installment; hidden deleted-rule periods stay absent | All posting accounts |
| POST `/recurring` | Upsert rule and newly generated periods through requested horizon | Rule account |
| PUT `/recurring/:id` | Upsert rule/version and modified/new periods; remove pending future periods actually deleted by pause; preserve current estimates and resume generation rules | Old/new rule and affected-period accounts |
| DELETE `/recurring/:id` | Remove rule and every previously visible occurrence, including paid/skipped periods; preserve payment movements in history | Rule/period accounts |
| POST `/occurrences/:id/charge` | Upsert paid period, its canonical linked movement, and A, including retry of already-paid period | A |
| POST `/occurrences/:id/skip` | Upsert skipped period; preserve existing conflict on repeat | Period account |
| POST `/plans` | Upsert plan and all installments, including historical ones; do not synthesize historical expenses | Plan account |
| POST `/installments/:id/charge` | Upsert installment, linked movement, and A, including retry of already-charged installment | A |
| POST `/plans/:id/cancel` | Upsert inactive plan/version and cancelled pending installments; keep charged/historical installments | Plan account |
| POST `/categories` | Upsert created category and defaults newly initialized during that operation | None |
| PATCH `/categories/:id` | Upsert category/version and every renamed movement, visible rule/period, and plan, preserving their actual versions | Accounts of changed movements |
| DELETE `/categories/:id` | Remove category; upsert all reassigned movements, visible rules/periods, plans; preserve replacement/null behavior | Accounts of changed movements |
| POST `/backup/restore` | No delta; serialize restoration and then perform full bootstrap/history invalidation | All session histories |

Hidden deleted rules and their occurrences are never resurrected by category reassignment. Existing soft-deleted storage remains untouched. Auth, password, demo, config, and backup export routes do not receive financial envelopes; access-preference changes may request a full read.

## Error, compatibility, and concurrency rules

- Preserve stable operation IDs already used by forms. Do not add automatic write retries, especially for category creation, which currently uses a server-generated ID and has no equivalent retry contract.
- Serialize writes within one tab. Increment a read generation at write dispatch and again after confirmation; block new full reads until the queued writes finish. This closes the race where a read begun during a write overwrites it.
- Reads capture session epoch, generation, and requested materialization horizon. Ignore any mismatched response. One same-key full read is shared; different horizons are not interchangeable. Router cancellation removes that caller; abort shared transport only when no callers remain.
- Session reset increments epoch, aborts reads and active requests, rejects queued tasks, and drops late responses. Aborting a write is not proof that the server rolled it back.
- If a confirmed 2xx response lacks a valid envelope during a mixed deployment, mark data stale and attempt one full read. Never resend the write automatically. Say it was saved but the views could not be updated if reconciliation fails. A network loss with no confirmation retains the existing ambiguous-operation message.
- A successful delta updates data immediately but does not reset the last-full-read timestamp: a delta does not prove unrelated records are current.

## Evidence and reporting

Stage 0 establishes deterministic fictional fixtures and measurement conditions. Reports go under this folder using `stage-N-results.md`; they are future deliverables, not fabricated during handoff creation. Store sanitized screenshots/HARs under `evidence/stage-N/` and never commit cookies or authorization headers. Distinguish PASS, FAIL, and BLOCKED. Missing production/device access cannot be reported as PASS.

Reference behavior: [React Router useRevalidator](https://reactrouter.com/api/hooks/useRevalidator); [Vite PWA prompted versus automatic updates](https://vite-pwa-org.netlify.app/guide/auto-update). The latter recommends prompted updates for applications with forms to avoid losing input.
