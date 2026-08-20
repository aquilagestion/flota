@echo off
setlocal

set "ROOT_DIR=%~dp0"
rem Quitar barra final para rutas consistentes
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "EXPECTED_OUTPUT_DIR=%ROOT_DIR%\flota_releases"
set "SOURCE_APK=%ROOT_DIR%\android\app\build\outputs\apk\release\app-release.apk"
set "LAST_APK_FILE=%EXPECTED_OUTPUT_DIR%\last_apk_path.txt"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content '%ROOT_DIR%\app.json' -Raw | ConvertFrom-Json).expo.version"`) do set "APP_VERSION=%%i"
if "%APP_VERSION%"=="" set "APP_VERSION=0.0.0"

if not "%APK_FORCE_CLEAN%"=="1" set "EXPO_PUBLIC_APP_MODE=full"

if "%APK_OUTPUT_PREFIX%"=="" set "APK_OUTPUT_PREFIX=GESTIFLOTA"
set "OUTPUT_APK=%APK_OUTPUT_PREFIX%_%APP_VERSION%.apk"

echo [1/3] Sincronizando versiones desde app.json (^>^> %APP_VERSION%^): ayuda, Gradle, package.json...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\sync-app-versions-from-app-json.ps1" -Root "%ROOT_DIR%"
if errorlevel 1 (
  echo Error al sincronizar versiones.
  exit /b 1
)

echo [2/3] Compilando APK release (modo=%EXPO_PUBLIC_APP_MODE%)...
cd /d "%ROOT_DIR%\android"
if "%APK_FORCE_CLEAN%"=="1" (
  echo Limpiando bundle JS embebido para forzar modo %EXPO_PUBLIC_APP_MODE%...
  if exist "%ROOT_DIR%\android\app\build\generated\assets" rmdir /s /q "%ROOT_DIR%\android\app\build\generated\assets"
  if exist "%ROOT_DIR%\android\app\build\intermediates\assets\release" rmdir /s /q "%ROOT_DIR%\android\app\build\intermediates\assets\release"
  if exist "%ROOT_DIR%\android\app\build\intermediates\compressed_assets\release" rmdir /s /q "%ROOT_DIR%\android\app\build\intermediates\compressed_assets\release"
  call gradlew.bat :app:createBundleReleaseJsAndAssets --no-daemon --rerun-tasks
  if errorlevel 1 (
    echo Error regenerando bundle JS.
    exit /b 1
  )
)
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 (
  echo Error compilando APK.
  exit /b 1
)

if not exist "%EXPECTED_OUTPUT_DIR%" mkdir "%EXPECTED_OUTPUT_DIR%"

echo [3/3] Copiando APK a "%EXPECTED_OUTPUT_DIR%" (unico destino)...
copy /Y "%SOURCE_APK%" "%EXPECTED_OUTPUT_DIR%\%OUTPUT_APK%" >nul
if errorlevel 1 (
  echo No se pudo copiar el APK a "%EXPECTED_OUTPUT_DIR%".
  exit /b 1
)

if not exist "%EXPECTED_OUTPUT_DIR%\%OUTPUT_APK%" (
  echo APK no encontrado en la ruta obligatoria: "%EXPECTED_OUTPUT_DIR%\%OUTPUT_APK%"
  exit /b 1
)

> "%LAST_APK_FILE%" echo %EXPECTED_OUTPUT_DIR%\%OUTPUT_APK%

echo Listo: "%EXPECTED_OUTPUT_DIR%\%OUTPUT_APK%"
endlocal
