# Guía sencilla: aplicación GESTIFLOTA (FLOTA de campo)

**Manual completo en la app:** pantalla **Ayuda** del menú (`src/flotaApp/content/helpGestiflotaText.js`). Este archivo es un resumen breve para reparto en PDF o intranet.

Esta guía es para **cualquier persona** que vaya a usar la aplicación en el móvil, **sin necesidad de saber de informática avanzada**. Si algo no cuadra con lo que ves en pantalla, pide ayuda a **tu gestor** o a quien os haya instalado la app.

---

## 1. Qué es esta aplicación

Sirve para **trabajar con la flota de vehículos y los gastos** desde el teléfono: consultar vehículos, apuntar gastos y mantenimientos, pedir uso de un vehículo, enviar hojas de gasto, etc.  
Los datos acaban en las **hojas de cálculo** de la organización (Google Sheets), conectadas por un enlace que ya viene **configurado dentro de la aplicación** cuando os la entregan.

**No hace falta abrir Google Forms** ni rellenar formularios en el navegador para lo que la app ya cubre.

---

## 2. Primera vez: instalar y abrir

1. Te pasarán un archivo **`.apk`** (por ejemplo **GESTIFLOTA_1.0.5.apk**).
2. En el móvil Android, ábrelo o instálalo desde **Archivos** / **Descargas**. Si el sistema pregunta por **“orígenes desconocidos”**, tu gestor te dirá si debes permitirlo solo para instalar esta app.
3. Busca el icono en el escritorio del móvil y **ábrelo**.
4. Si pide **permisos** (cámara para fotos, archivos, etc.), en general conviene **aceptar** para poder adjuntar fotos de mantenimiento o tickets.

---

## 3. Entrar (iniciar sesión)

1. Pantalla de **Entrar**.
2. Escribe tu **correo electrónico** (el mismo que tenéis en la lista de usuarios).
3. Escribe tu **contraseña**.
4. Pulsa el botón para **entrar**.

Si el mensaje dice que el usuario no existe o la contraseña no es correcta, revisa mayúsculas/minúsculas o pide al gestor que compruebe tu usuario en **USUARIOS**.

---

## 4. Pantalla principal (menú con iconos)

Arriba verás:

- El nombre **FLOTA** (o la marca que use vuestra organización).
- Tu **rol** (OPERARIO, RESPONSABLE, GESTOR o ADMINISTRACIÓN): indica **qué puedes hacer**.
- Tu **correo**.

Debajo hay **cuadrados con un dibujo y una palabra**. Cada cuadrado es una **función**. Toca el que necesites.

### Funciones que suelen tener casi todos (si tu rol lo permite)

| Icono / nombre en pantalla | Para qué sirve (en pocas palabras) |
|----------------------------|-------------------------------------|
| **Vehículos** | Ver la lista de vehículos y sus datos. Algunos roles también pueden dar de alta o editar. |
| **Gastos** | Apuntar un gasto de vehículo (combustible, peaje, etc.) con el formulario de la app. |
| **Mantenimiento** | Registrar revisiones, averías o trabajo hecho, a veces con **foto** y kilometraje. |
| **Historial** | Ver lo que ya se ha guardado (tuyo o de tus vehículos, según tu rol). |
| **Hojas gasto** | Agrupar gastos en una **hoja** para el proceso de reembolso o revisión interna. |
| **Uso vehículos** | Pedir **cuándo** necesitas un vehículo y ver el estado de la solicitud; quien corresponda puede **aprobar** o **rechazar**. |
| **Sincronizar** | Envía al servidor lo que quedó guardado en el móvil **sin internet**. Si hay un número en rojo, son **pendientes** por enviar. |
| **Contraseña** | Abre una ventana para **cambiar tu contraseña** (actual, nueva y repetir nueva). Mínimo **6 caracteres** en la nueva. |
| **Salir** | Cierra la sesión y vuelve a la pantalla de entrada. |

### Solo algunos usuarios (gestión)

- **Aprobaciones:** revisar **hojas de gasto** enviadas (y, según rol, gestionar el **pago**).
- **Usuarios:** ver y editar **usuarios y roles** de la organización.
- **Rol responsable:** quien gestiona altas: **aceptar o rechazar** a quien pidió ser **responsable de vehículos** y asignar **matrículas**.
- **Destinos:** ajustar **carpetas o hojas** por defecto (suele usarlo solo el **gestor**).

> **Administración** a veces ve **menos iconos** en el menú (no suele usar gastos ni mantenimiento desde la misma app), pero sí **aprobaciones** y **usuarios** según cómo lo tengáis montado.

---

## 5. Si no tienes internet

- Muchas cosas se pueden **guardar en el móvil** y quedan en cola.
- Cuando vuelvas a tener **Wi‑Fi o datos**, entra y pulsa **Sincronizar** hasta que no queden pendientes (o hasta que salga mensaje de OK).
- Si falla, anota el **mensaje** que sale y pásalo al gestor.

---

## 6. Pedir ser “responsable” de vehículos (si lo permitís)

En el **registro** o según os indiquen, si eliges ser **responsable**, muchas veces la app te deja entrar como **operario** hasta que un **gestor** apruebe la petición en **Rol responsable** y os asigne vehículos en la hoja **FLOTA**.  
Cuando esté aprobado, al volver al menú (o al entrar de nuevo) deberías ver el **rol actualizado**.

---

## 7. Consejos prácticos

- **Misma contraseña** que en la hoja USUARIOS si entráis solo con Sheets (sin cuenta Google en la app).
- **Fechas y horas:** seguid el formato que ponga la pantalla (por ejemplo día/mes/año).
- **Fotos:** buena luz y encuadre del ticket o del vehículo ayuda a quien revisa después.
- Si la app **se cierra sola** o “no hace nada”, prueba a **cerrarla del todo** en el móvil y volver a abrirla; si sigue mal, informa al gestor con **captura de pantalla** si puedes.

---

## 8. A quién preguntar

| Dudas sobre… | Pregunta a… |
|----------------|-------------|
| Contraseña, usuario desactivado, permisos | **Gestor** / administración |
| Instalar APK, actualizar versión | Quien os **distribuye** la aplicación |
| Datos erróneos en la hoja de cálculo | **Gestor** o responsable de datos |

---

*Documento generado para acompañar la versión **1.0.5** de la app. El texto integrado en la app vive en `src/flotaApp/content/helpGestiflotaText.js` (pantalla **Ayuda** del menú); mantén ambos alineados si cambias funciones.*

