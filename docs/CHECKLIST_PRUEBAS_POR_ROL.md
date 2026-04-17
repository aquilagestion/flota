# Checklist de pruebas por rol (GESTIFLOTA / FLOTA)

Versión objetivo de la app: **1.0.5**.  
Marca cada ítem cuando lo hayas comprobado en un dispositivo real o emulador, con **datos de prueba** en Sheets/Apps Script desplegados.

---

## Antes de empezar (todos los roles)

- [ ] La APK instalada es **GESTIFLOTA_1.0.5.apk** (o la que corresponda a esta versión).
- [ ] En el móvil hay **datos o Wi‑Fi** cuando toque sincronizar.
- [ ] Variables de entorno de la build: `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_API_SECRET` apuntan al **Web App** correcto.
- [ ] El usuario existe en **USUARIOS** (o se puede **registrar** según política), con **rol** y **activo** correctos.
- [ ] El menú muestra el **rol** en la cabecera y el **email** debajo.

---

## OPERARIO

**Menú esperado:** Vehículos, Gastos, Mantenimiento, Historial, Hojas gasto, Uso vehículos, Ayuda, Sincronizar, Contraseña, Salir.

> Para copiar y pegar en **Word**, usa el texto plano en `docs/CHECKLIST_PRUEBAS_WORD.txt`.

- [ ] **Entrar** con email y contraseña (modo solo Sheets / sin Firebase si aplica).
- [ ] **Vehículos:** lista o detalle sin error; vuelta al menú.
- [ ] **Gastos:** abrir formulario, rellenar campos mínimos, guardar (y comprobar cola offline si se usa sin red).
- [ ] **Mantenimiento:** crear registro con o sin foto; guardar.
- [ ] **Historial:** ver registros propios; filtro por vehículo si existe.
- [ ] **Hojas gasto:** crear o ver hoja según flujo; sin error de permisos.
- [ ] **Uso vehículos:** crear solicitud **PENDIENTE**; ver lista propia; **no** debe aparecer aprobar/rechazar (solo consulta y creación según diseño).
- [ ] **Sincronizar:** con pendientes en cola, enviar; badge de pendientes baja o mensaje OK.
- [ ] **Contraseña:** modal, cambiar contraseña válida; volver a entrar con la nueva.
- [ ] **Ayuda:** abre el texto de ayuda integrado; vuelta al menú.
- [ ] **Salir:** cierra sesión y vuelve a login.

**Registro (si lo usáis)**

- [ ] Registro como **OPERARIO** y entrada correcta.
- [ ] Si se pide rol **RESPONSABLE** en registro: queda como operativo provisional y solicitud (comprobar en backend/hoja si aplica).

---

## RESPONSABLE

**Menú:** igual que OPERARIO en iconos base (incluye Ayuda) + mismas comprobaciones de campo.

- [ ] **Uso vehículos:** además del operario, puede **aprobar/rechazar** solicitudes de matrículas **a su cargo** (FLOTA: responsable / email notificaciones).
- [ ] **Uso vehículos:** no puede resolver solicitudes de matrículas que **no** son suyas (debe fallar o no mostrarse según backend).
- [ ] **Historial:** ve lo esperado (propios + vehículos a cargo, según diseño actual).
- [ ] Resto de ítems del menú como OPERARIO donde aplique.

---

## GESTOR

**Menú:** incluye **Aprobaciones**, **Usuarios**, **Rol responsable**, **Destinos** (además del bloque de operario).

- [ ] **Aprobaciones:** listar hojas; acciones de **revisión** (GESTOR); PDF o detalle si lo usáis.
- [ ] **Usuarios:** listar USUARIOS; editar usuario de prueba; guardar sin romper contraseña existente.
- [ ] **Rol responsable:** listar **PENDIENTE**; aprobar con matrículas asignadas; comprobar **USUARIOS** (rol RESPONSABLE) y **FLOTA** (responsable / email).
- [ ] **Rol responsable:** rechazar solicitud; comprobar estado en hoja.
- [ ] **Destinos:** abrir pantalla y guardar destino de prueba (si está en uso).
- [ ] **Uso vehículos:** puede **aprobar/rechazar** cualquier solicitud (o según reglas del script `16_*`).
- [ ] **Vehículos:** alta/edición/export si tenéis permisos en backend.
- [ ] **Ayuda:** texto integrado y vuelta al menú.

---

## ADMINISTRACIÓN

**Menú:** **no** debe mostrar Gastos, Mantenimiento, Historial, Hojas gasto, Uso vehículos, Sincronizar, Destinos (según menú actual). Sí: **Vehículos**, **Aprobaciones**, **Usuarios**, **Rol responsable**, **Ayuda**, **Contraseña**, **Salir**.

- [ ] **Aprobaciones:** acciones de **pago** / estado de pago (solo administración).
- [ ] **Usuarios:** mismo flujo que gestor si aplica.
- [ ] **Rol responsable:** listar/resolver como gestoría compartida.
- [ ] **Vehículos:** consulta o edición según política.
- [ ] **Ayuda** / **Contraseña** / **Salir:** OK.

---

## Cruce entre roles (opcional pero recomendable)

- [ ] Operario crea **solicitud de uso** → Responsable o Gestor la **aprueba** → Operario ve estado actualizado.
- [ ] Operario solicita **rol RESPONSABLE** (flujo registro) → Gestor **aprueba** en **Rol responsable** → Tras sincronizar rol (volver al menú o re‑login), el usuario pasa a **RESPONSABLE** y ve nuevas capacidades.
- [ ] **Hoja de gasto:** flujo enviada → gestor revisión → administración pago (si usáis los tres estados).

---

## Incidencias

Anota aquí fallos con: **rol**, **pantalla**, **pasos**, **mensaje de error** y **fecha**.

| Fecha | Rol | Pantalla | Resumen |
|--------|-----|----------|---------|
|        |     |          |         |
