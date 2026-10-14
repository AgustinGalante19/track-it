# Run, test, and prepare a release

## Local development

From this repository, use Node >=22.12 and the pinned pnpm version (11.25.0):

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by the launcher (normally http://127.0.0.1:5173). The existing `.env`, Google configuration, and database are used unchanged. Normal development writes go to that configured database. No migration is introduced by this change.

For a production client with the normal local API:

```powershell
pnpm build
pnpm preview
```

## Isolated verification

```powershell
pnpm typecheck
pnpm test
pnpm exec playwright install chromium # First use only
pnpm build
$env:PCACHE_PREVIEW = '1'
try {
  pnpm test:browser
  if ($LASTEXITCODE -ne 0) { throw 'Browser verification failed' }
} finally { Remove-Item Env:PCACHE_PREVIEW -ErrorAction SilentlyContinue }
git diff --check
```

Browser tests launch their own API on 3002 and UI on 5174, override external database/auth settings in the child environment, create fictional PCACHE accounts in `.data/performance-test.db`, and remove that dedicated database after stopping their processes. They refuse to overwrite an existing test database. Do not point the harness at personal data. `pnpm test:browser` without PCACHE_PREVIEW tests the development client and skips the production-worker check.

Reports and screenshots appear in `test-results/`. Timing tests use two warmups plus ten measurements for desktop and two phone-sized Chromium viewports, both normal and with 400 ms API response delay plus 4x CPU throttling. Inspect `sanitized-baseline.json` for end-to-end, receipt-to-render, request counts, and decoded bytes. Viewport emulation is not physical-phone acceptance.

Manual acceptance: create an expense, confirm the row and month total before the success message, edit/duplicate/void it, and inspect its account history. Test ARS/USD and future-month filters; create/pay/pause/delete a recurring item; create/pay/cancel installments. Open a form and trigger reconnect/focus: it must retain values, with refresh deferred until closed. A failed history request must preserve confirmed totals and retry only history. Test backup restoration only with fictional data in the isolated account.

## Deployment-host preparation (does not publish)

Docker is unavailable on the implementation machine. The following commands must run from this checkout on the already configured Caddy/Compose deployment host. Host access, Caddy A/B verification, production CSS diagnosis, and physical-device acceptance remain release gates. Do not invent a host or replace `.env`. Use PowerShell 7. Save the following as a host-local release preparation script, then invoke it with one immutable public release ID.

```powershell
param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9_.-]{0,80}$')][string]$Release)
$ErrorActionPreference = 'Stop'
function DockerChecked {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($args[0])" }
}
DockerChecked version
DockerChecked compose version
if (-not (Test-Path -LiteralPath '.env')) { throw 'Existing deployment .env is required' }
if (git status --porcelain) { throw 'Use a clean, reviewed checkout for release preparation' }
$revision = (git rev-parse HEAD).Trim()
$webContainer = (DockerChecked compose -f compose.yaml ps -q web).Trim()
$apiContainer = (DockerChecked compose -f compose.yaml ps -q api).Trim()
if (-not $webContainer -or -not $apiContainer) { throw 'Running web and API containers are required for rollback' }
$webImage = (DockerChecked inspect --format '{{.Image}}' $webContainer).Trim()
$apiImage = (DockerChecked inspect --format '{{.Image}}' $apiContainer).Trim()
# Refuse to reuse candidate/rollback identifiers.
foreach ($tag in @("track-it-web:$Release", "track-it-api:$Release", "track-it-web:rollback-$Release", "track-it-api:rollback-$Release")) {
  $existing = & docker image ls --quiet $tag
  if ($LASTEXITCODE -ne 0 -or $existing) { throw "Image tag already exists or cannot be checked: $tag" }
}
DockerChecked tag $webImage "track-it-web:rollback-$Release"
DockerChecked tag $apiImage "track-it-api:rollback-$Release"
$releaseDir = Join-Path ([IO.Path]::GetTempPath()) "track-it-release-$Release"
if (Test-Path -LiteralPath $releaseDir) { throw 'Release record already exists' }
New-Item -ItemType Directory -Path $releaseDir | Out-Null
# Read only image metadata; never print container environment or Compose config.
$previousRevision = (DockerChecked image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' $webImage).Trim()
@{ release=$Release; candidateRevision=$revision; previousRevision=$previousRevision;
   webContainer=$webContainer; apiContainer=$apiContainer; webImage=$webImage; apiImage=$apiImage } |
  ConvertTo-Json | Set-Content (Join-Path $releaseDir 'images.json')
# If the previous image has no revision label, record its known deployed checkout
# SHA from existing deployment records before proceeding. Image IDs remain exact rollback references.
& ./scripts/prepare-release-assets.ps1 -PreviousWebContainer $webContainer
DockerChecked build --target web --build-arg "TRACK_IT_BUILD_ID=$Release" --label "org.opencontainers.image.revision=$revision" -t "track-it-web:$Release" .
DockerChecked build --target api --build-arg "TRACK_IT_BUILD_ID=$Release" --label "org.opencontainers.image.revision=$revision" -t "track-it-api:$Release" .
$candidateOverride = Join-Path $releaseDir 'candidate.yaml'
$rollbackOverride = Join-Path $releaseDir 'rollback.yaml'
@"
services:
  web:
    image: track-it-web:$Release
  api:
    image: track-it-api:$Release
"@ | Set-Content $candidateOverride
@"
services:
  web:
    image: track-it-web:rollback-$Release
  api:
    image: track-it-api:rollback-$Release
"@ | Set-Content $rollbackOverride
DockerChecked compose -f compose.yaml -f $candidateOverride config --quiet
DockerChecked compose -f compose.yaml -f $rollbackOverride config --quiet
DockerChecked run --rm --entrypoint caddy "track-it-web:$Release" validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Both image builds use the same release parameter; only the web build consumes it in Vite. The API candidate is built but is never started against the external database during preparation. Do not run migrations. Retained assets accumulate across releases; pruning is deliberately outside this change. A true first release can run the asset script without a previous container to create an empty directory, but an existing deployment must export its assets and retain rollback images.

Before publication, serve A and B in disposable Caddy containers on a loopback test port with isolated configuration (never bind public 80/443). Check A HTML and every linked/lazy asset before switching test serving to B. Verify B includes all exported A assets byte-for-byte, missing `/assets/*.js` and `/missing.css` return 404 and never HTML, JS/CSS/manifest MIME types, immutable assets, no-cache HTML/SPA/sw, and no-store `/api` and `/api/*`. Confirm the release ID in Settings. In an A browser tab, load B, request an update with a dirty form, verify no reload until the form closes, then verify exactly one activation. Repeat postpone/offline and confirm CacheStorage has no API records. Run the complete isolated suite above against the candidate source. These are mandatory checks, not results already obtained locally.

## Separately authorized publication and rollback

Only after explicit deployment authorization and all release gates pass, in the same host shell with `$candidateOverride`, `$rollbackOverride`, and `$Release` from preparation:

```powershell
# Publication: base ports, domain, database, environment and volumes remain in place.
DockerChecked compose -f compose.yaml -f $candidateOverride up -d --no-build --no-deps api web
function WaitApiHealthy {
  param([string]$Override)
  $container = (DockerChecked compose -f compose.yaml -f $Override ps -q api).Trim()
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $health = (DockerChecked inspect --format '{{.State.Health.Status}}' $container).Trim()
    if ($health -eq 'healthy') { return }
    if ($health -eq 'unhealthy') { throw 'API unhealthy; use rollback' }
    Start-Sleep -Seconds 5
  }
  throw 'API health timeout; use rollback'
}
WaitApiHealthy $candidateOverride
$healthResponse = Invoke-WebRequest 'https://track-it-26.duckdns.org/api/health'
if ($healthResponse.StatusCode -ne 200) { throw 'Public health failed; use rollback' }
```

Only `api` and `web` are selected; `--no-deps` prevents touching DNS or other services. Verify existing Google login, username login, expense visibility, recurring styles, paid/history behavior, Settings version, old-tab updates, no API caching, and physical-phone timing. Use a dedicated fictional account for authorized writes. Do not restore over personal data.

If acceptance fails:

```powershell
DockerChecked compose -f compose.yaml -f $rollbackOverride up -d --no-build --no-deps api web
WaitApiHealthy $rollbackOverride
Invoke-WebRequest 'https://track-it-26.duckdns.org/api/health' | Select-Object StatusCode
Invoke-WebRequest 'https://track-it-26.duckdns.org/' | Select-Object StatusCode
```

Check the previous static entry and rollback image IDs against `images.json`. Keep volumes, environment, database, retained assets, and rollback images. Never use `down -v` or database restore as release rollback. A PWA may retain the newer frontend after server rollback; legacy response compatibility is preserved, and users should accept the update prompt when a rollback frontend is published.
