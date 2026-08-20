# Build GESTIFLOTA completo (gastos + flota).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:EXPO_PUBLIC_APP_MODE = "full"
$env:WEB_DIST_DIR = "dist-web"
Remove-Item Env:WEB_SKIP_APK -ErrorAction SilentlyContinue
Remove-Item Env:WEB_PAGE_TITLE -ErrorAction SilentlyContinue
Remove-Item Env:WEB_APP_SHORT_NAME -ErrorAction SilentlyContinue
if (-not $env:EXPO_PUBLIC_FULL_WEB_URL) { $env:EXPO_PUBLIC_FULL_WEB_URL = "https://gestiflota.web.app" }
if (-not $env:EXPO_PUBLIC_USO_WEB_URL) { $env:EXPO_PUBLIC_USO_WEB_URL = "https://gestiflota-uso.web.app" }

Write-Host "Expo export FULL → dist-web (EXPO_PUBLIC_APP_MODE=full)"
npx expo export --platform web --output-dir dist-web --clear
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/web-postbuild.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK dist-web"
