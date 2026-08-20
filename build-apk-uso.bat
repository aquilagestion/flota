@echo off
setlocal

set "EXPO_PUBLIC_APP_MODE=uso"
set "FL_ANDROID_APPLICATION_ID=com.monteromiguel.app.uso"
set "FL_ANDROID_APP_LABEL=RESERVAS-AUTOS"
set "APK_OUTPUT_PREFIX=RESERVAS_AUTOS"
set "APK_FORCE_CLEAN=1"

call "%~dp0build-apk.bat"
if errorlevel 1 exit /b 1

endlocal
