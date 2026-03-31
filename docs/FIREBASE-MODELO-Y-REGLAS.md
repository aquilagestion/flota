## Modelo de datos (Firestore)

Colecciones propuestas (mínimo viable):

- `users/{uid}`
  - `email`: string
  - `role`: `"operario" | "admin"`
  - `createdAt`, `updatedAt`: timestamp

- `vehicles/{vehicleId}`
  - `matricula`: string (en mayúsculas)
  - `bastidor`: string
  - `clase_etiqueta`: string
  - `fecha_compra`: string (`YYYY-MM-DD`)
  - `precio_compra_sin_iva`: string/number
  - `kilometros_iniciales`: string/number
  - `updatedAt`: timestamp

- `expenses/{expenseId}` (replica 1:1 del Google Form “INTRODUCCIÓN GASTOS”)
  - `matricula`, `vehiclePlate`
  - `tipo_gasto`: `"SEGURO" | "IMPUESTOS" | ...`
  - campos específicos por tipo (tal cual)
  - `ticketUrl` (si se subió a Storage)
  - `usuario_uid`, `usuario_email`, `usuario_rol`
  - `createdAt`: timestamp

- `maintenances/{maintenanceId}`
  - `matricula`, `vehiclePlate`
  - `fecha`, `tipo`, `descripcion`, `kilometraje`, `coste`, `responsable`
  - `photoUrls`: string[]
  - `usuario_uid`, `usuario_email`, `usuario_rol`
  - `createdAt`: timestamp

## Storage

- `tickets/{matricula}/{uuid}.jpg`
- `maintenance/{matricula}/{uuid}.jpg`

## Reglas (borrador)

Estas reglas son una base razonable:

- **Operario**: puede crear gastos/mantenimientos; leer vehículos.
- **Admin**: puede leer todo; puede escribir todo (incl. vehículos).

> Ajusta según tu gobernanza real.

### Firestore rules (ejemplo)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function userDoc() { return get(/databases/$(database)/documents/users/$(request.auth.uid)); }
    function role() { return isSignedIn() ? userDoc().data.role : null; }
    function isAdmin() { return role() == "admin"; }
    function isOperario() { return role() == "operario"; }

    match /users/{uid} {
      allow read: if isSignedIn() && (uid == request.auth.uid || isAdmin());
      allow create: if isSignedIn() && uid == request.auth.uid;
      allow update: if isAdmin() || uid == request.auth.uid;
      allow delete: if isAdmin();
    }

    match /vehicles/{id} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /expenses/{id} {
      allow read: if isSignedIn() && (isAdmin() || resource.data.usuario_uid == request.auth.uid);
      allow create: if isSignedIn() && (isOperario() || isAdmin());
      allow update, delete: if isSignedIn() && isAdmin();
    }

    match /maintenances/{id} {
      allow read: if isSignedIn() && (isAdmin() || resource.data.usuario_uid == request.auth.uid);
      allow create: if isSignedIn() && (isOperario() || isAdmin());
      allow update, delete: if isSignedIn() && isAdmin();
    }
  }
}
```

### Storage rules (ejemplo)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() { return request.auth != null; }

    // Ajusta si quieres limitar por rol/uid o por matrícula
    match /tickets/{matricula}/{fileName} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }
    match /maintenance/{matricula}/{fileName} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }
  }
}
```

