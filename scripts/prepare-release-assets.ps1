param(
  [string]$PreviousWebContainer,
  [string]$OutputDirectory = '.release-assets'
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$prefix = $repositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $destination.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Release assets must stay inside the repository workspace.'
}
# Reject junctions/symlinks in the destination ancestry before writing.
$ancestor = $destination
while ($ancestor.Length -ge $repositoryRoot.Length) {
  if (Test-Path -LiteralPath $ancestor) {
    if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw 'Release asset path must not traverse a symlink or junction.'
    }
  }
  $ancestor = [IO.Path]::GetDirectoryName($ancestor)
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
if ($PreviousWebContainer) {
  if ($PreviousWebContainer -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$') { throw 'Invalid container name or ID.' }
  & docker cp "${PreviousWebContainer}:/srv/assets/." $destination
  if ($LASTEXITCODE -ne 0) { throw 'Asset export failed. Do not publish without retained assets.' }
}
Write-Output "Retained static assets: $destination"
