# Stage 4 — static delivery and PWA safeguards

Implementation complete; **full local gate BLOCKED by missing Docker**, and published CSS diagnosis/physical-phone acceptance remain blocked. No site was deployed and no production styling fix is claimed.

## Implemented

- Public build identity: `TRACK_IT_BUILD_ID` supplied explicitly, otherwise git short SHA plus UTC timestamp; development displays `development`. Vite defines only this public value. Settings displays it.
- Caddy routes exact `/api` and `/api/*` to the API with no-store. Hashed assets are file-only/immutable; extension-bearing static paths are file-only/no-cache; SPA and HTML remain no-cache. Missing files cannot use the SPA fallback. Vercel exact API/SPA rules preserve the same separation.
- Workbox remains prompt-based, precaches the coherent static build including lazy CSS/JS, cleans old precaches, excludes API/static fallback paths, and uses NetworkOnly for API.
- Added visible/online focus checks, throttled to one explicit worker update attempt per hour, with in-flight coalescing and event cleanup.
- Explicit update consent waits for forms, confirmations, mutations, and authentication forms to become safe. Postpone cancels deferred activation; one activation is permitted per request lifecycle.
- Additive asset export from the previous web container, workspace/symlink guards, fail-on-copy-error, build-only release ID argument, and read-only Docker context copy that never overwrites current hashed assets. `.release-assets` is ignored by Git but included in Docker context. No old assets are pruned.

## Verification boundaries

`docker version` failed because Docker is not installed. Thus Caddy config validation, HTTP headers/404 behavior on actual Caddy, image assembly, A/B retained-asset hashes, old-tab lazy loading, and real worker A/B activation are **BLOCKED**, not passed by inference from Vite preview.

The asset script's empty-first-release path and outside-workspace rejection were executed successfully. `pnpm build` succeeded without staged assets. Generated worker precache contains 38 entries, including the form, account, category and base CSS files. Unit tests cover hourly checks, hidden/offline suppression, coalescing, failures, explicit consent, deferred activation and cancellation. The final report records production-preview CacheStorage/offline checks and overall counts.

The published URL was inaccessible during Stage 0's read-only investigation. Local recurring screenshots do not establish the reported production defect's cause or resolution. No CSS was restyled speculatively. See `RELEASE-RUNBOOK.md` for the remaining host and device acceptance steps.
