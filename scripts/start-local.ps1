param([switch]$Preview)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$nodeCandidates = @()
$systemNode = Get-Command node -ErrorAction SilentlyContinue
if ($systemNode) { $nodeCandidates += $systemNode.Source }
# El runtime de Codex permite arrancar también en esta PC, que tiene Node 18 en PATH.
$nodeCandidates += Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$selectedNode = $null
foreach ($candidate in $nodeCandidates) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  $version = & $candidate -p 'process.versions.node'
  $parts = $version.Split('.')
  if ([int]$parts[0] -gt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 12)) { $selectedNode = $candidate; break }
}
if (-not $selectedNode) { throw 'Instalá Node.js 22.12 o superior antes de iniciar la app.' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw 'Faltan dependencias. Ejecutá pnpm install con Node.js compatible.' }
if ($Preview -and -not (Test-Path -LiteralPath 'dist/index.html')) { throw 'Primero ejecutá pnpm build.' }
Write-Host 'Track-It: http://127.0.0.1:5173/ (Ctrl+C para detener)'
if ($Preview) { & $selectedNode scripts/dev.mjs --preview }
else { & $selectedNode scripts/dev.mjs }
