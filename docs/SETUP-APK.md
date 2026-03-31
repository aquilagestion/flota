# Setup APK en C:\flota

## 1) Variables

1. Editar `C:\flota\app\.env`.
2. Completar los valores reales de API y Firebase.

Ejemplo (ver `.env.example`):

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## 2) Login de EAS

```powershell
npm install -g eas-cli
cd C:\flota\app
eas login
```

## 3) Build de APK (preview)

```powershell
cd C:\flota\app
eas build -p android --profile preview
```

## 4) Descargar APK

1. Abrir el enlace que devuelve EAS.
2. Descargar el archivo `.apk`.
3. Guardarlo en `C:\flota\flota_releases`.

## Alternativa: build local (sin EAS)

Si ya tienes carpeta `android/` generada:

```powershell
cd C:\flota
.\build-apk.bat
```

El APK se copiará en `C:\flota\flota_releases` con el nombre:
`"creada por Miguel Montero con soporte de Cursor IA - GESTIFLOTA GREFA.apk"`.
