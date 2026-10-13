# Stage 4 Verification: Styling, Static Responses, and Updates

## Assignment and setup

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), [implementation](stage-4-implementation.md), and Stage 0 results. Verify the completed Stage 4 SHA. Use production builds A and B with isolated test Caddy/static containers and fictional API, not the public host for deployment experiments. Do not edit code or reset the user's browser storage.

Run focused update tests, typecheck, build, and browser harness. If Docker is unavailable, record the exact missing Caddy/image checks; dev Vite is not a substitute for Caddy headers or PWA production behavior.

## Required scenarios

| ID | Procedure | Expected result |
|---|---|---|
| S4-01 | Inspect recurrent row at 360/390 px and desktop, light/dark themes | Expected computed layout and styling; compare screenshot with current design, no unexplained plain-text rendering |
| S4-02 | Request real CSS/JS/manifest and nonexistent `/assets/missing.js` | Correct MIME types; missing file 404, never HTML |
| S4-03 | Request index/SPA route, sw.js, hashed asset, `/api`, `/api/health` | HTML/worker no-cache; hashed asset immutable; API no-store or noncacheable API 404; no API-to-HTML fallback |
| S4-04 | Build A, record hashed URLs; export retained assets; build B | Current B and old A assets both served; current bytes not overwritten |
| S4-05 | Keep A tab open, lazy-navigate after switching test server to B | A lazy resources load; no chunk-load error or stale HTML substituted for JS/CSS |
| S4-06 | Detect B update while A form is dirty; choose later | Fields preserved, no forced reload, A remains usable |
| S4-07 | Choose update while busy, then close/finish safely | Activation deferred; one eventual reload; B identifier visible |
| S4-08 | Trigger focus/visibility repeatedly before/after hour with fake clock | At most one explicit update attempt per hour; hidden/offline skip; listeners cleaned |
| S4-09 | Load authenticated views, inspect every Cache Storage entry | No auth/API responses or financial records; static resources only |
| S4-10 | Offline after prior load, then online | Static shell behaves as existing design; API shows connection requirement; no queued offline mutation |
| S4-11 | Audit define/build outputs and retention directory | Public build ID only; no .env secrets; no .release-assets tracked; normal build without staged directory succeeds |
| S4-12 | Inspect Vercel configuration without deploying | API and immutable/hash behavior retained, nonexistent static files do not rewrite to application HTML |

For the reported production CSS defect, require evidence of resource/version/computed-style failure and correction, or mark it NOT REPRODUCED/BLOCKED. Neither a local screenshot nor a generic cache change proves that reported issue is fixed. Read-only production inspection may supplement tests but cannot change the site.

## Evidence and gates

Write `stage-4-results.md`: SHA, A/B build IDs, container/image references, asset hash inventory, command results, HTTP statuses/MIME/cache headers, screenshots, explicit check counts, worker/cache inspection, defects, and published-investigation status. Sanitize HARs and never publish cookies.

Local gate PASS requires S4 local cases and actual Caddy/production-PWA tests. Published-CSS and physical-device checks may remain BLOCKED separately, preventing final published acceptance but not misrepresenting local work. Return FAIL items to Stage 4 owner; rerun A/B tests after changes affecting worker, headers, or retention.
