# Stage 3 Implementation: Confirmed Saves Across Views

## Objective and prerequisites

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), Stage 1/2 results, and [verification](stage-3-verification.md). Both server and store gates must pass and their commits must be integrated. Stage 4 may run concurrently. Keep `.env`, Google, financial rules, and existing visual design.

## Ownership

Own `src/lib/api.ts`, `src/lib/route-data.ts`, `src/Layout.tsx`, `src/context.tsx`, `src/forms.tsx`, financial page consumers, `src/lib/use-auto-refresh.ts`, Settings, and integration/browser tests. Stage 4 owns static styling/configuration and exports `buildInfo` from `src/lib/build-info.ts`; render it in Settings only after that export exists. Do not modify frozen wire types or server transactions.

## Ordered implementation

1. Supply the store's transport through existing api/send helpers. Append sync=1 and selected month safely with URLSearchParams; keep occurrence IDs URL-encoded. Preserve credentials, AbortSignals, JSON/error behavior, and no-store fetch for financial reads. Do not change authentication requests into sync requests.
2. Route loaders call store load/history methods, propagate their signals, and retain 401 redirect behavior. Layout subscribes with useSyncExternalStore and provides the committed store Snapshot, not an independently retained loader snapshot. Keep Router for navigation, error routing, month/search changes, and lazy code loading. Post-initial refresh errors keep Layout/content visible with a retry action rather than replace the page.
3. Extend FinanceContext with the shared mutate method and async refresh; adapt Confirmation actions to call mutate. All 18 operations in the context matrix must use the same path, including category dialogs, recurring toggles, skip/delete, plan cancellation, account archive/delete, expense duplication, income, and charge confirmation. Search all send/refresh consumers; no financial mutation may remain on the old notify-then-refresh flow.
4. Success order is confirmed response -> committed canonical state -> close dialog -> notice. For changed displayed data, schedule notice after the relevant React commit so it cannot announce updated numbers ahead of the row/summary. Attach Stage 0 receipt-to-render markers to that commit. Disable submission while queued/running; preserve operationId/body across ambiguous retry for routes already supporting it. Forms remain open with errors on rejected writes.
5. Use honest existing Spanish product messages: ordinary success `Guardado.`, reconciliation fallback `Guardado. No pudimos actualizar las vistas. Volvé a actualizar.`, explicit refresh error `No pudimos actualizar tus datos. Reintentá.`. Plans continue explaining pending confirmation; recurring creation is not a paid expense. Do not promise totals changed when selected filters exclude the item.
6. Make all views derive from shared records with existing selectors. Avoid sorting shared history arrays in place. Hide deleted rules/periods as specified; retain paid movements/history. ARS/USD and selected month remain unchanged after save. A future-month save does not appear in the current-month expense list.
7. AccountPage consumes subscribed store history. Apply invalidation before displaying save success; background history refresh can continue with an updating indicator. Existing rows must not be labeled current after invalidation; show failure/retry if history refresh fails. Handle removed accounts without crashing or resurrecting cached histories.
8. Preserve the 150 ms event coalescing and 1-second repeated-trigger guard. Manual refresh queues one request after blocking UI closes; focus/visibility uses lastFullReadAt >=60 seconds; online reconnection is remembered while blocked. Blocking includes composer, confirmation, queued/running writes, and navigation. Do not count a successful delta as a full read or poll continuously.
9. Backup restoration uses the same write queue but no envelope. After confirmation clear histories and mark Snapshot stale, close restore dialog, show `Respaldo restaurado. Actualizando vistas…`, then await full read. On success show `Respaldo restaurado. Vistas actualizadas.`; on refresh failure show restored-but-not-updated state with retry, never resend restore automatically. Test only isolated fictional users.
10. Logout and 401 reset the store even if requests are active. Access-preference operations keep auth-specific behavior and await full refresh only when user/access display needs updating. Ensure StrictMode does not duplicate mutations, listeners, or bootstrap reads.

## Failure modes and preserved rules

Follow the context compatibility fallback. A successful server write followed by invalid JSON/connection loss may be ambiguous; do not fabricate confirmation. A parsed 2xx legacy result is confirmed and must not be retried automatically. Rejected 409 leaves form open and offers refresh without changing its unsaved values. Explicit refresh does not discard form fields.

## Tests and commands

Add `tests/finance-integration.test.ts` for mocked component/router behavior and expand Stage 0 browser scenarios against the isolated actual API. Verify UI timing and request counts, not just reducer correctness.

```powershell
pnpm exec vitest run tests/finance-integration.test.ts tests/route-data.test.ts tests/auto-refresh.test.ts tests/categories-ui.test.ts
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

Deliver complete consumer audit, before/after request traces, timing samples, SHA, and `stage-3-results.md`. Normal complete-delta saves must require one write and zero additional bootstrap requests; visible account history may request its own fresh history. Stage completes after [verification](stage-3-verification.md) passes.
