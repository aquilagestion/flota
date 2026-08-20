# Build del módulo independiente USO VEHÍCULOS (web).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:EXPO_PUBLIC_APP_MODE = "uso"
$env:WEB_DIST_DIR = "dist-web-uso"
$env:WEB_SKIP_APK = "1"
$env:WEB_PAGE_TITLE = "RESERVAS-AUTOS GREFA"
$env:WEB_APP_SHORT_NAME = "RESERVAS-AUTOS"
if (-not $env:EXPO_PUBLIC_FULL_WEB_URL) { $env:EXPO_PUBLIC_FULL_WEB_URL = "https://gestiflota.web.app" }
if (-not $env:EXPO_PUBLIC_USO_WEB_URL) { $env:EXPO_PUBLIC_USO_WEB_URL = "https://gestiflota-uso.web.app" }

Write-Host "Expo export USO → dist-web-uso (EXPO_PUBLIC_APP_MODE=uso)"
npx expo export --platform web --output-dir dist-web-uso --clear
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/web-postbuild.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK dist-web-uso"
