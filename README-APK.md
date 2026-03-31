# Flujo rapido para generar APK

1. Configura variables en `.env`.
2. Ejecuta `npm install` si cambiaste dependencias.
3. Ejecuta `eas login`.
4. Genera APK con `eas build -p android --profile preview`.

El perfil `preview` de `eas.json` esta configurado para salida APK.

## Variables requeridas

Además de tus variables actuales, la app ahora usa Firebase:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## Salida local con `build-apk.bat`
El APK (release) se copiará a `C:\flota\flota_releases` con el nombre que empieza por:
`creada por Miguel Montero con soporte de Cursor IA - GESTIFLOTA GREFA.apk`
