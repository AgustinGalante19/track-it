# Stage 5 Implementation: Integration and Release Preparation

## Objective and prerequisites

Read [context](00-CONTEXT.md), [roadmap](01-ROADMAP.md), all prior results, and [verification](stage-5-verification.md). Stage 3 and Stage 4 local gates must pass on integrated code. Preserve any explicitly blocked production/device checks. This stage prepares release artifacts and instructions; it does not authorize deployment.

## Ownership and ordered work

1. Record integrated SHA and prerequisite SHAs. Review diffs for contract drift, leftover old financial send/refresh paths, duplicate stores/listeners, shared-file conflicts, changed auth/startup defaults, or accidental persistent data. Resolve integration defects through their stage owners and rerun affected gates.
2. Run typecheck, complete tests, build, and browser tests. Use the Stage 0 isolated database/fixtures and identical normal/throttled timing conditions. Record raw samples, median/p95, total save time, response-to-render, request counts, and payload bytes. Do not compare different fixture sizes/cache states as equivalent.
3. Prepare `stage-5-results.md` and `RELEASE-RUNBOOK.md` under this folder. Those additional files are future stage artifacts. Clearly separate local PASS, production investigation, physical-phone BLOCKED, release readiness, and authorized publication.
4. Write release commands for the actual target Caddy/Docker Compose stack. Do not invent a remote host or credentials: runbook commands execute from this repository checkout on the already configured deployment host. Confirm Docker/Compose availability there as a preflight; host access remains a named blocker until supplied. Vercel deployment is outside this release.
5. The runbook must accept one release identifier as a parameter and derive candidate/rollback tags from it. Capture running web/api image IDs and container IDs before changes, tag them `track-it-web:rollback-<release>` and `track-it-api:rollback-<release>`, and record the deployed revision without printing environment values.
6. Export current web container assets with Stage 4's preparation script. Build both candidates with the same TRACK_IT_BUILD_ID. Generate a release-only Compose override selecting immutable `track-it-web:<release>` and `track-it-api:<release>` images. Keep base .env, domain, ports, database, volumes, and DNS service unchanged. Never rebuild or restart DNS for this release.
7. Validate candidate static image, cache headers, expected build ID, retained previous assets, and complete tests before publication. API tests run with fictional isolated database; preparing candidates must not start a candidate API against the external database or run migration commands. This iteration expects no new schema migration.
8. Describe the separately authorized publication command: base Compose plus candidate override, `up -d --no-build api web`. Wait for API healthy and check HTTPS health, then published browser/user flows. Define rollback: use override pointing to tagged previous images, `up -d --no-build api web`, verify health and previous static entry. No volume deletion, database restore, environment replacement, or removal of retained images/assets. A PWA may continue serving newer cached frontend after rollback, so keep legacy API responses compatible and instruct users to use the update prompt if a rollback build is published.
9. Provide a post-deployment acceptance checklist: real Google with existing configured credentials, username login, confirmed expense visibility, recurring CSS, paid/history behavior, version ID, old tab update, no API caching, and physical-device timing. Use a dedicated fictional development account for authorized writes; no destructive restore on personal data.
10. Release blockers include failed local checks, absent asset retention, schema drift, missing rollback images, unknown host access, unresolved production CSS diagnosis, or unavailable physical acceptance. Do not automatically deploy to obtain evidence. Record external blockers and request access only when deployment is actually authorized later.

## Commands and completion criteria

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
git diff --check
```

The runbook must contain exact PowerShell commands and checked prerequisites, including how it obtains Compose container IDs, creates override files, inspects health, and selects rollback tags. Parameters are external identifiers, not undecided implementation choices. Copying the runbook must not expose `.env`.

Deliver integrated revision, measured comparison, runbook, checks/evidence, unresolved blocker list, and final [verification](stage-5-verification.md). Local delivery can complete with clearly pending external acceptance; do not mark the full published/mobile objective complete until those checks pass after authorized deployment.
