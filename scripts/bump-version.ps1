# Bump version in sync across version.json / sw.js(BUILD_VERSION) / index.html(APP_VERSION)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 -Notes "what changed"
# After: git add -A; git commit -m "..."; git push
# NOTE: source kept ASCII-only on purpose. Windows PowerShell 5.1 misparses non-ASCII
#       in a BOM-less .ps1 (cp950), which breaks string literals. -Notes may still be
#       Chinese at runtime; it is written to version.json as UTF-8 data, which is fine.
param([string]$Notes = "content update")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$enc  = New-Object System.Text.UTF8Encoding($false)
$today = Get-Date -Format "yyyy.MM.dd"

$vp = Join-Path $root "version.json"; $seq = 1
if (Test-Path $vp) {
  $old = (Get-Content $vp -Raw | ConvertFrom-Json).version
  if ($old -match "^$([regex]::Escape($today))-(\d+)$") { $seq = [int]$Matches[1] + 1 }
}
$ver = "$today-$seq"

[System.IO.File]::WriteAllText($vp, ([ordered]@{ version = $ver; notes = $Notes } | ConvertTo-Json), $enc)
foreach ($f in @(
    @("sw.js",      "const BUILD_VERSION = '[^']*';", "const BUILD_VERSION = '$ver';"),
    @("index.html", "var APP_VERSION='[^']*';",       "var APP_VERSION='$ver';"))) {
  $p = Join-Path $root $f[0]
  $t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($p, [regex]::Replace($t, $f[1], $f[2]), $enc)
}
Write-Host "bumped -> $ver  (next: git add -A; git commit; git push)"
