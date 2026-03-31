@echo off
setlocal

set "EXPECTED_OUTPUT_DIR=C:\flota\flota_releases"
set "SOURCE_APK=C:\flota\android\app\build\outputs\apk\release\app-release.apk"
set "LAST_APK_FILE=%EXPECTED_OUTPUT_DIR%\last_apk_path.txt"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content 'C:/flota/app.json' -Raw | ConvertFrom-Json).expo.version"`) do set "APP_VERSION=%%i"
if "%APP_VERSION%"=="" set "APP_VERSION=0.0.0"
set "APP_VERSION_SAFE=%APP_VERSION:.=_%"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd'"`) do set "BUILD_DATE=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'HHmmss'"`) do set "BUILD_TIME=%%i"

set "OUTPUT_APK=Gestiflota Version %APP_VERSION_SAFE% %BUILD_DATE% %BUILD_TIME%.apk"

echo [1/2] Compilando APK release...
cd /d C:\flota\android
call gradlew.bat assembleRelease
if errorlevel 1 (
  echo Error compilando APK.
  exit /b 1
)

if not exist "%EXPECTED_OUTPUT_DIR%" mkdir "%EXPECTED_OUTPUT_DIR%"

echo [2/2] Copiando APK a "%EXPECTED_OUTPUT_DIR%"...
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
