# Flujo rapido para generar APK

1. Configura variables en `.env`.
2. Ejecuta `npm install` si cambiaste dependencias.
3. Ejecuta `eas login`.
4. Genera APK con `eas build -p android --profile preview`.

El perfil `preview` de `eas.json` esta configurado para salida APK.

## Variables requeridas

Además de tus variables actuales, la app ahora usa Firebase:

- `EXPO_PUBLIC_USE_FIREBASE` (`false` para trabajar solo con Sheet)
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## Salida local con `build-apk.bat`
El APK (release) se copiará siempre a `C:\flota\flota_releases` con formato:
`Gestiflota Version <version_sin_puntos> <yyyyMMdd> <HHmmss>.apk`

Ejemplo:
`Gestiflota Version 1_0_0 20260331 110542.apk`

## Flujo recomendado: bundle local y luego Git

Si quieres trabajar siempre en `C:\flota` y commitear solo cuando se genera bundle local:

1. Ejecuta `npm run bundle:git`
2. El script corre `build-apk.bat`
3. Si el bundle termina bien, muestra cambios Git
4. Te pide mensaje de commit y opcionalmente push a `origin/master`

Tambien puedes usar solo bundle local:

- `npm run bundle:local`
