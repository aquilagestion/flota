@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
set "EXPECTED_DIR=C:\flota\flota_releases"
set "LAST_APK_FILE=%EXPECTED_DIR%\last_apk_path.txt"
set "EXPECTED_APK="

echo === FLUJO BUNDLE + GIT (C:\flota) ===
echo.

if not exist "build-apk.bat" (
  echo No existe build-apk.bat en %cd%.
  exit /b 1
)

echo [1/4] Generando bundle local...
call build-apk.bat
if errorlevel 1 (
  echo.
  echo Fallo el bundle local. Se cancela flujo de Git.
  exit /b 1
)
if not exist "%LAST_APK_FILE%" (
  echo.
  echo Error: no se encontro el archivo de control:
  echo "%LAST_APK_FILE%"
  exit /b 1
)
set /p EXPECTED_APK=<"%LAST_APK_FILE%"
if "%EXPECTED_APK%"=="" (
  echo.
  echo Error: no se pudo leer la ruta del APK generado.
  exit /b 1
)
echo APK generado: "%EXPECTED_APK%"
if not exist "%EXPECTED_APK%" (
  echo.
  echo Error: el APK no quedo en la ruta obligatoria:
  echo "%EXPECTED_APK%"
  exit /b 1
)

echo.
echo [2/4] Revisando cambios Git...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Este directorio no es un repo Git valido.
  exit /b 1
)

git status --short

for /f %%i in ('git status --porcelain ^| find /c /v ""') do set CHANGES=%%i
if "%CHANGES%"=="0" (
  echo.
  echo No hay cambios para commitear despues del bundle.
  exit /b 0
)

echo.
set /p COMMIT_MSG=Escribe mensaje de commit (Enter = auto): 
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=chore: bundle local %date% %time%"

echo.
echo [3/4] Creando commit...
git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo No se pudo crear el commit.
  exit /b 1
)

echo.
set /p DO_PUSH=Quieres hacer push a origin/master ahora? (s/n): 
if /I "%DO_PUSH%"=="s" (
  if exist "%USERPROFILE%\.ssh\id_ed25519_flota" (
    set "GIT_SSH_COMMAND=ssh -i ""%USERPROFILE%\.ssh\id_ed25519_flota"" -o IdentitiesOnly=yes"
  )
  echo [4/4] Haciendo push...
  git push origin master
  if errorlevel 1 (
    echo Push fallido. El commit local quedo creado.
    exit /b 1
  )
  echo Push completado.
) else (
  echo [4/4] Push omitido.
)

echo.
echo Flujo terminado.
exit /b 0
