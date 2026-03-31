@echo off
setlocal

echo [1/2] Compilando APK release...
cd /d C:\flota\android
call gradlew.bat assembleRelease
if errorlevel 1 (
  echo Error compilando APK.
  exit /b 1
)

set OUTPUT_DIR=C:\flota\flota_releases
set OUTPUT_APK=GESTIFLOTA.apk

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo [2/2] Copiando APK a "%OUTPUT_DIR%"...
copy /Y "C:\flota\android\app\build\outputs\apk\release\app-release.apk" "%OUTPUT_DIR%\%OUTPUT_APK%" >nul
echo Listo: "%OUTPUT_DIR%\%OUTPUT_APK%"
endlocal
