# Lee expo.version de app.json y actualiza:
# - src/flotaApp/content/helpGestiflotaText.js (HELP_APP_VERSION)
# - android/app/build.gradle (versionName + versionCode derivado del semver)
# - package.json ("version")
#
# versionCode = major*10000 + minor*100 + patch (cada parte 0..99 aprox.)

param(
  [Parameter(Mandatory = $true)]
  [string]$Root
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path $Root).Path

function Get-ExpoVersion_ {
  param([string]$AppJsonPath)
  $j = Get-Content $AppJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  return [string]$j.expo.version.Trim()
}

function SemverToVersionCode_ {
  param([string]$Semver)
  $s = $Semver -replace '^v', ''
  $m = [regex]::Match($s, '^(\d+)\.(\d+)\.(\d+)')
  if (-not $m.Success) {
    Write-Error "expo.version debe ser semver tipo 1.2.3 (numeros). Valor: $Semver"
    exit 1
  }
  $maj = [int]$m.Groups[1].Value
  $min = [int]$m.Groups[2].Value
  $pat = [int]$m.Groups[3].Value
  if ($maj -gt 2100) { Write-Error "major demasiado grande para formula versionCode"; exit 1 }
  if ($min -gt 99 -or $pat -gt 99) { Write-Error "minor/patch deben ser <= 99 para la formula versionCode"; exit 1 }
  return $maj * 10000 + $min * 100 + $pat
}

$appJson = Join-Path $Root "app.json"
if (-not (Test-Path $appJson)) { Write-Error "No app.json"; exit 1 }
$v = Get-ExpoVersion_ $appJson
if (-not $v) { $v = "0.0.0" }
$code = SemverToVersionCode_ $v

# --- helpGestiflotaText.js ---
$helpJs = Join-Path $Root "src\flotaApp\content\helpGestiflotaText.js"
if (-not (Test-Path $helpJs)) { Write-Error "No helpGestiflotaText.js"; exit 1 }
$helpRaw = Get-Content $helpJs -Raw -Encoding UTF8
$helpPat = 'export const HELP_APP_VERSION = "[^"]*";'
if ($helpRaw -notmatch $helpPat) { Write-Error "Patron HELP_APP_VERSION no encontrado"; exit 1 }
$helpNew = [regex]::Replace($helpRaw, $helpPat, "export const HELP_APP_VERSION = `"$v`";", 1)
[System.IO.File]::WriteAllText($helpJs, $helpNew, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: helpGestiflotaText.js HELP_APP_VERSION = $v"

# --- android/app/build.gradle ---
$gradle = Join-Path $Root "android\app\build.gradle"
if (-not (Test-Path $gradle)) { Write-Error "No build.gradle"; exit 1 }
$g = Get-Content $gradle -Raw -Encoding UTF8
if ($g -notmatch 'versionCode\s+\d+') { Write-Error "versionCode no encontrado en build.gradle"; exit 1 }
if ($g -notmatch 'versionName\s+"[^"]*"') { Write-Error "versionName no encontrado en build.gradle"; exit 1 }
$g = [regex]::Replace($g, 'versionCode\s+\d+', "versionCode $code", 1)
$g = [regex]::Replace($g, 'versionName\s+"[^"]*"', "versionName `"$v`"", 1)
[System.IO.File]::WriteAllText($gradle, $g, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: android/app/build.gradle versionName = $v , versionCode = $code"

# --- package.json ---
$pkgPath = Join-Path $Root "package.json"
if (-not (Test-Path $pkgPath)) { Write-Error "No package.json"; exit 1 }
$pkgRaw = Get-Content $pkgPath -Raw -Encoding UTF8
if ($pkgRaw -notmatch '"version"\s*:\s*"[^"]*"') { Write-Error "package.json sin campo version"; exit 1 }
$pkgNew = [regex]::Replace($pkgRaw, '("version"\s*:\s*)"[0-9][^"]*"', "`${1}`"$v`"", 1)
[System.IO.File]::WriteAllText($pkgPath, $pkgNew, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: package.json version = $v"
