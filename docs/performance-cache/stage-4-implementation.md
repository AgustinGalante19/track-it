# Stage 4 Implementation: CSS Delivery and PWA Versions

## Objective and prerequisites

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), Stage 0 observations, and [verification](stage-4-verification.md). Stage 0 contract/harness gate must pass. This work can run alongside server/store/integration stages. Do not deploy or change `.env`, Google, financial storage, or financial rules.

## Ownership and interface

Own `vite.config.ts` after Stage 0's proxy addition, `src/components/UpdatePrompt.tsx`, new `src/lib/build-info.ts`, `Caddyfile`, `Dockerfile`, `.dockerignore`, release-asset preparation script, `.gitignore` entry, relevant static CSS only for a reproduced defect, and `tests/pwa-update.test.ts`/browser version tests. Stage 3 owns Settings; expose `buildInfo: { id: string }` there through the new module and coordinate its rendering without editing Settings concurrently.

## Ordered implementation

1. Reproduce published missing styles without resetting user storage. Inspect HTML linked CSS, lazy CSS, status, Content-Type, response bodies, computed layout, missing assets, old/waiting worker, and revision evidence. Compare with a clean test browser. Save sanitized observations. If inaccessible or not reproduced, retain the issue as unresolved; implement independently justified cache/version safeguards without claiming a CSS fix.
2. Generate a public build ID at build time: explicit nonsecret `TRACK_IT_BUILD_ID` if provided, otherwise short git SHA plus UTC build timestamp. Local dev label is `development`. Expose through a Vite define consumed only by build-info; do not load arbitrary `.env` into client code. The release runbook passes immutable release ID explicitly. Build identity is diagnostic, not a server-secret or user identifier.
3. Caddy ordering: `/api/*` remains reverse-proxied; `/assets/*` is file-only with immutable `public, max-age=31536000, immutable`; missing assets return 404, never index.html. Static requests with file extensions outside assets also return file/404. HTML/SPA routes and `/sw.js` use `no-cache`. Return correct JS/CSS/manifest MIME types. `/api` without trailing slash must not become HTML; return a non-cacheable 404 if no API route matches. Mirror equivalent missing-static behavior in Vercel rewrites without reducing existing cache protections.
4. Keep Workbox precache as a coherent HTML/JS/CSS version and API NetworkOnly/exclusions. Keep registerType prompt and cleanupOutdatedCaches; no runtime financial cache or autoUpdate conversion. Verify generated manifest covers lazy CSS and JS, including existing account/form modules.
5. Use onRegisteredSW to retain ServiceWorkerRegistration. On visible focus/visibility, check registration.update() when at least 3600000 ms since last attempt; coalesce duplicate events, skip offline/hidden state, remove listeners on unmount. A failed check does not trigger a reload or error spam. Registration's own normal update checks may still occur; the throttle applies to the added explicit checks. Mock clocks/registration for tests.
6. Preserve update notice and user consent. Clicking update while a form/confirmation or mutation is active must defer activation until it is safe; Stage 3 exposes a nonfinancial busy/dirty status for this purpose through a small event subscription in `src/lib/update-safety.ts` (owned by Stage 4, consumed by Stage 3). Do not silently close dirty forms. After safe activation reload once; postpone keeps the current version usable.
7. Prepare additive asset retention for Docker/Caddy. Add `scripts/prepare-release-assets.ps1` accepting `-PreviousWebContainer` and `-OutputDirectory` (default repository `.release-assets`). Resolve/check output stays inside workspace before any cleanup. Use `docker cp <container>:/srv/assets/. <output>` to copy all assets from the current web container, which already includes earlier retained assets; copy only static assets, never API/.env/data. A first release uses an empty directory. Fail on copy errors rather than deploy without promised retention. Do not remove existing retained assets in this iteration.
8. Add `.release-assets/` to .gitignore but permit it in Docker build context. In web image assembly use a read-only BuildKit context mount to copy retained files into `/srv/assets` only when the directory exists, without overwriting current build files. This conditional copy keeps ordinary `docker compose build` working without release staging. Document cumulative storage cost; pruning policy is outside this change.
9. Add deterministic Docker build ARG TRACK_IT_BUILD_ID propagated to Vite build only. Stage 5 exports previous assets and uses it to build the candidate. Retention and release verification use previous/candidate containers read-only; do not change the running public services here.

## Checks and deliverables

Use two production builds A/B, a test Caddy container, and fresh/old browser contexts. A loads before B replaces only test static serving; old A assets must still resolve in B. Check missing asset, CSS/JS types, cache headers, dirty-form deferred activation, offline behavior, and API cache exclusions.

```powershell
pnpm exec vitest run tests/pwa-update.test.ts
pnpm typecheck
pnpm build
pnpm test:browser
```

Docker/browser absence is BLOCKED for those checks, not PASS. Deliver configuration, asset script, build-info export, sanitized CSS investigation, A/B test evidence, SHA, and `stage-4-results.md`. Local correctness and reported production CSS resolution are separate gates. No deployment is authorized by this handoff.
