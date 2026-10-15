# Stage 2 Verification: State and Concurrency Gate

## Assignment and setup

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), [implementation](stage-2-implementation.md), and Stage 0 results. Verify a completed Stage 2 SHA independently of server availability, using complete fictional records and deferred transport promises. Run focused store tests and TypeScript. Do not edit the store.

## Required cases

| ID | Sequence | Expected outcome |
|---|---|---|
| S2-01 | Apply expense movement/account delta then the same delta again | Single record per ID, canonical versions, atomic subscriber notification |
| S2-02 | Remove rule/periods, then apply category-related changes | Deleted rows remain absent; no unrelated histories/records lost |
| S2-03 | Inject incomplete/overlapping/unsupported-version envelope | No partial application; confirmed-write reconciliation path, no write retry |
| S2-04 | Start read R1, dispatch write W, resolve W then R1 | W remains visible; R1 ignored |
| S2-05 | Request read while W is in progress | Read waits; no mid-write snapshot may overwrite W |
| S2-06 | Enqueue W1/W2; delay W1, reject W1, complete W2 | FIFO requests; queue continues after failure; no hidden automatic retry |
| S2-07 | Two callers share same read; one aborts then both abort | First abort preserves other caller; last abort cancels transport |
| S2-08 | Request current horizon then future uncovered month | Correct separate reads; older response cannot replace newer coverage |
| S2-09 | Confirm ordinary expense delta | Data updated; lastFullReadAt unchanged; full coverage timestamp not falsely refreshed |
| S2-10 | Load account history, move expense between accounts, return old history response | Both histories invalidated; stale response rejected; visible history refreshed once |
| S2-11 | Confirm legacy 2xx, then fail fallback read | Saved-but-not-reconciled result; old content retained; no duplicate write |
| S2-12 | Reset session during read/write; late A response follows B bootstrap | A never appears in B; queued A tasks rejected; B loading flags remain correct |
| S2-13 | Load empty snapshots for A then B | Identity supplied by bootstrap userId; complete replacement |
| S2-14 | Freeze previous arrays, render consumer sorts copy | No store mutation; unaffected collection references preserved |

Audit source for localStorage/sessionStorage/IndexedDB/Cache Storage writes: none may store financial state. State must be one session-wide snapshot, not seven independent page caches. Validate that history failures do not reject a confirmed mutation as a failed save. Count transport requests for coalescing and fallback cases.

## Evidence and exit criteria

Write `stage-2-results.md` with SHA, contract revision, commands, case-by-case PASS/FAIL, request-order traces using opaque IDs, and defects. Include a precise stale-response race trace and session-reset trace. No financial values or credentials from the external database.

PASS requires all cases, coherent ownership, no persistence, and specified public interfaces. Stage 3 waits for both this gate and Stage 1 gate. Missing server integration is expected here; it is Stage 3's work, not a reason to fake browser acceptance.
