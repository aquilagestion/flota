# Setup APK en C:\flota

## 1) Variables

1. En la raíz del repo, copia `.env.example` a `.env` (no se sube a git).
2. Edita `.env` y completa los valores reales de API y Firebase.

Ejemplo (ver `.env.example` en la raíz de `C:\flota`):

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## 2) Login de EAS

```powershell
npm install -g eas-cli
cd C:\flota
eas login
```

## 3) Build de APK (preview)

```powershell
cd C:\flota
npm run build:apk
```

## 4) Descargar APK

1. Abrir el enlace que devuelve EAS.
2. Descargar el archivo `.apk`.
3. Guardarlo en `C:\flota\flota_releases`.

## Alternativa: build local (sin EAS)

Requisitos típicos: **Node.js**, **JDK 17** (o el que pida tu `android/`), **Android SDK** con variables `ANDROID_HOME` / `PATH`, y dependencias instaladas (`npm install` en la raíz de `C:\flota`).

1. Sube la versión de release en `app.json` → campo `expo.version` (semver `x.y.z`).
2. Opcional: `npm run bundle:prepare` (iguala `HELP_APP_VERSION`, `package.json` y `android/app/build.gradle` a esa versión). **Omitible** si vas a ejecutar solo `bundle:local`, porque `build-apk.bat` ya llama al script de sincronización.
3. Genera el APK:

```powershell
cd C:\flota
npm run bundle:local
```

Equivale a ejecutar `build-apk.bat`: compila `assembleRelease` y copia el resultado.

El APK queda en `C:\flota\flota_releases\GESTIFLOTA_<version>.apk` (versión = `expo.version` en `app.json`). La ruta del último build se guarda en `flota_releases\last_apk_path.txt`.
