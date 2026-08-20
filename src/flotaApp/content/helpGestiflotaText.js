/**
 * Ayuda in-app (texto completo). Mantener al día con las pantallas reales.
 * No incluir checklists de QA aquí (viven solo en docs/ del repositorio).
 *
 * HELP_APP_VERSION: al ejecutar `npm run bundle:local` / `build-apk.bat`, se iguala
 * a `expo.version` en app.json (junto con Gradle y package.json): scripts/sync-app-versions-from-app-json.ps1
 */
export const HELP_APP_VERSION = "1.2.90";

export const HELP_BODY = `MANUAL COMPLETO — APLICACIÓN FLOTA / GESTIFLOTA
Versión de esta guía: ${HELP_APP_VERSION}

════════════════════════════════════════════════════════════
A. QUÉ HACE ESTA APLICACIÓN
════════════════════════════════════════════════════════════

Es la herramienta de campo para la flota de vehículos y los gastos asociados: consultar vehículos, registrar gastos detallados, registrar mantenimientos con fotos, ver historial unificado, agrupar gastos en hojas para reembolso, solicitar uso de vehículos con calendario, y (según tu rol) administrar usuarios, aprobar hojas o solicitudes, y configurar destinos de sincronización.

Los datos se envían a los sistemas que haya configurado vuestra organización (normalmente Google Sheets mediante un enlace de servidor ya embebido en la aplicación que os entregan compilada). No sustituye al gestor humano: si algo falla, hay que avisar.

════════════════════════════════════════════════════════════
B. ANTES DE EMPEZAR
════════════════════════════════════════════════════════════

• Necesitas conexión a Internet para entrar, cargar listas y enviar lo pendiente (salvo lo que ya quedó guardado en el móvil).
• Debes tener usuario y contraseña dados de alta en la lista de usuarios de la organización (hoja USUARIOS o equivalente), salvo que el registro público esté permitido.
• La contraseña en la app coincide con la guardada para tu correo cuando la organización usa solo acceso “por hoja” sin cuenta Google separada.
• Permisos del móvil: cámara y archivos suelen ser necesarios para fotos de tickets, mantenimiento u odómetro.

════════════════════════════════════════════════════════════
C. PANTALLA DE BIENVENIDA (SPLASH)
════════════════════════════════════════════════════════════

Al abrir la app puede mostrarse un logo y texto de bienvenida unos segundos mientras se prepara la sesión. No hace falta pulsar nada: pasará sola al acceso o al menú.

════════════════════════════════════════════════════════════
D. ACCESO Y REGISTRO
════════════════════════════════════════════════════════════

D.1 Modo “Entrar” (login)

• Introduce correo electrónico válido y contraseña (mínimo 6 caracteres).
• Puedes mostrar u ocultar la contraseña con el botón de ver/ocultar.
• Si vuestra organización usa también Google Firebase, la app puede entrar por esa vía; si falla Firebase pero tu usuario está en la hoja, puede intentarse acceso validando contra la hoja (según configuración).

D.2 Modo “Crear cuenta” (registro)

• Cambia a registro desde la misma pantalla si está disponible.
• Debes indicar nombre completo, correo, contraseña dos veces (iguales), y el rol solicitado:
  – OPERARIO: uso normal de campo.
  – RESPONSABLE: en muchos despliegues la app te registra como operario hasta que un GESTOR apruebe en “Rol responsable” y te asignen vehículos en la flota.
• Tras registrarte, lee el mensaje que salga (alta correcta o solicitud enviada).

D.3 Salir de la app desde el login

• Suele haber opción para cerrar la aplicación del todo (confirmación).

════════════════════════════════════════════════════════════
E. ROLES: QUÉ SIGNIFICA CADA UNO EN LA APP
════════════════════════════════════════════════════════════

OPERARIO
• Menú: Vehículos, Gastos, Mantenimiento, Historial, Hojas gasto, Uso vehículos, Ayuda, Sincronizar, Contraseña, Salir.
• Ve y crea sus propios registros; no administra a otros ni aprueba hojas de gasto globales.
• En “Hojas de gasto”: solo genera y consulta sus propias hojas y solo puede incluir en una hoja los gastos “pagados por usuario” que él mismo haya registrado.
• En “Uso vehículos”: puede **retirar** sus solicitudes PENDIENTE y **liberar** sus reservas APROBADAS (cuando ya no necesita el vehículo).

RESPONSABLE
• Mismo menú base que operario.
• Debe figurar con rol **RESPONSABLE** en la hoja **USUARIOS** (mismo correo con el que entras a la app). Sin eso, el servidor no te tratará como responsable aunque en FLOTA aparezca tu nombre.
• En “Uso vehículos” es quien **debe** aprobar o rechazar las solicitudes de uso de los vehículos que en **FLOTA** estén a su cargo: campo responsable y/o **e-mail_de_notificaciones** con su correo (puede haber varios correos separados por ; o ,).
• Puede **liberar reservas APROBADAS** de vehículos a su cargo (botón «Liberar reserva»), total o parcial.
• En Historial puede ver también actividad de vehículos a su cargo (según datos del servidor). Por defecto puede filtrar «Gastos de mis vehículos» y el mes en curso, y marcar incidencias (sin ticket, sin hoja, no sincronizado).
• En “Aprobaciones”: puede **aprobar o rechazar** sus propias hojas de gasto y las de **operarios** con gastos en matrículas a su cargo. El **pago** lo marca ADMINISTRACIÓN.
• En “Hojas de gasto”: puede generar sus propias hojas; en la lista y al elegir gastos pendientes ve los suyos y también los de otros usuarios cuando el gasto está imputado a una matrícula que figura en FLOTA como vehículo a su cargo (responsable o correo de notificaciones).

GESTOR
• Todo lo del operario más: Aprobaciones (revisión de hojas de gasto), Usuarios, Rol responsable, Destinos.
• En “Hojas de gasto”: puede generar su propia hoja y ver o listar todas las hojas y gastos pendientes que haya en el dispositivo según la sincronización (consulta amplia frente a operario/responsable).
• En “Uso vehículos” puede ver todas las solicitudes según el servidor; la **resolución habitual** (aprobar/rechazar) corresponde al **RESPONSABLE** del vehículo en USUARIOS + FLOTA. El gestor puede **liberar** cualquier reserva APROBADA y suele intervenir en altas de usuarios, “Rol responsable” y administración general.
• Puede dar de alta o editar vehículos si el backend lo permite.

ADMINISTRACIÓN
• Menú reducido: Vehículos, Aprobaciones, Usuarios, Rol responsable, Ayuda, Contraseña, Salir.
• No ve Gastos, Mantenimiento, Historial de campo, Hojas gasto, Uso vehículos ni Sincronizar desde el menú principal (diseño actual).
• En Aprobaciones centra acciones de pago de hojas cuando corresponda.

════════════════════════════════════════════════════════════
F. MENÚ PRINCIPAL (ICONOS)
════════════════════════════════════════════════════════════

Arriba: nombre FLOTA, tu ROL en una pastilla, y tu correo.

Cada icono abre una pantalla. Los que no tengas permiso no aparecen.

• Vehículos — Flota.
• Gastos — Formulario de gasto.
• Mantenimiento — Registro de mantenimiento.
• Historial — Cronología gastos/mantenimientos; filtros por vehículo, periodo e incidencias. GESTOR: también por usuario y proyecto.
• Hojas gasto — Agrupación y envío de hojas de reembolso.
• Uso vehículos — Solicitudes, pendientes (si aplicas), calendario y disponibilidades. El GESTOR ve badges de escalado en el menú si hay solicitudes críticas.
• Aprobaciones — Hojas de gasto (revisión / pago).
• Usuarios — Lista y edición de usuarios.
• Rol responsable — Altas de responsables y asignación de matrículas.
• Destinos — Dónde se sincronizan archivos (solo gestor).
• Mi bandeja — Resumen de pendientes: sincronización, solicitudes de uso (con etiquetas SLA y aviso de escalado para gestor) y hojas de gasto por revisar (según rol).
• Informe mensual — Solo GESTOR y ADMINISTRACION: resumen del mes (hojas por estado, gastos sin hoja, vehículos sin responsable activo, tiempo medio de aprobación). Selector de mes/año y botón Refrescar.
• Sincronizar — Envía cola pendiente; el número en el icono son tareas pendientes. Al terminar muestra detalle si quedan errores.
• Ayuda — Este texto.
• Contraseña — Ventana emergente para cambiar contraseña.
• Salir — Cierra sesión.

════════════════════════════════════════════════════════════
G. VEHÍCULOS
════════════════════════════════════════════════════════════

• Lista de vehículos de la organización (matrícula y datos principales).
• Pulsar un vehículo para ver o editar (si tu rol lo permite).
• Si eres gestor (o según permisos): botón o sección para alta de vehículo nuevo con campos de la hoja FLOTA: matrícula, fechas, marca, modelo, combustible, propiedad, departamento/proyecto, responsable, ITV, seguro, póliza, correo de notificaciones, activo SI/NO, observaciones, etc.
• Exportar: puedes elegir columnas y generar CSV para compartir o imprimir / PDF según las opciones del sistema.
• La app puede guardar en caché la lista al entrar para trabajar con nombres y matrículas en otros formularios.

════════════════════════════════════════════════════════════
H. GASTOS (FORMULARIO COMPLETO)
════════════════════════════════════════════════════════════

Es un formulario largo pensado para sustituir formularios web: primero eliges matrícula y departamento/proyecto (o “otro” escribiendo texto). Luego el TIPO DE GASTO. Según el tipo, aparecen solo los campos que aplican.

En web (pantalla ancha) el formulario se reparte en tres bloques: datos generales, datos del gasto y ticket/adjuntos.

Puedes usar «Rellenar todo con voz» (o el 🎤 de cada campo) para dictar valores. El nº de factura/tiquet es opcional al crear el gasto; al generar la hoja de gastos sí es obligatorio.

Tipos de gasto disponibles en la app:

1) SEGURO — compañía, póliza, coberturas, fechas de vigencia, prima, etc.
2) IMPUESTOS — tipo, periodo IVM, importes y fechas asociadas.
3) OTROS IMPUESTOS — tipo, fechas e importes.
4) REPUESTOS / RECAMBIO — fechas de compra, proveedor, descripción, factura, importe.
5) MANTENIMIENTO / REPARACIONES — fechas, proveedor, descripción, facturas, importes, próximo mantenimiento y kilómetros previstos si aplica.
6) COMBUSTIBLES — fecha, entidad, tipo, kilómetros, litros, total pagado e IVA (4/10/21/0 u otro). La app calcula sola: precio/litro con IVA, precio/litro sin IVA, total neto y cuota de IVA.
7) PARKING — fecha, entidad, tipo de zona (azul, verde, etc.), horas de inicio y fin, importe.
8) PEAJES — fecha, entidad, nº factura/tiquet, entrada y salida, importe.
9) ITV — estación, fechas de inspección y próxima, importe, número de factura.
10) MULTAS / SANCIONES — fecha, conductor, lugar, organismo, tipo de infracción, importe.
11) OTROS — fecha, proveedor, concepto, importe, factura.

Campos transversales habituales: forma de pago (Usuario, Transferencia, Tarjeta según lista), observaciones, kilómetros actuales del vehículo.

Desglose IVA:
• Tras indicar el importe total del gasto, eliges el IVA (4 %, 10 %, 21 %, 0 % u otro %).
• La app calcula sola la base imponible y la cuota de IVA a partir del total: base = total ÷ (1 + IVA/100).

Fotos y odómetro:
• Puedes adjuntar fotos de tickets o documentos.
• Si está configurado un servicio de lectura de odómetro por imagen, la app puede intentar leer el kilometraje desde una foto del cuadro de instrumentos (depende de red y del servicio externo).

Guardar:
• Al guardar, el registro puede enviarse al momento o quedar en cola si no hay red; luego usar “Sincronizar” en el menú o el botón de sincronizar dentro de Historial.

════════════════════════════════════════════════════════════
I. MANTENIMIENTO
════════════════════════════════════════════════════════════

• Matrícula, departamento/proyecto (lista desplegable amplia más opción “otro”), fecha, tipo de intervención (lista cargada desde datos de mantenimiento del servidor si existen, más opción OTRO a mano), taller, descripción, kilometraje, coste, responsable del trabajo.
• Una o varias fotos del trabajo o del vehículo.
• Foto de odómetro opcional con lectura automática si el servicio está activo.
• Guardar envía o encola igual que gastos.
• La sincronización con la hoja de cálculo sube fotos a Drive y llama al servidor con el registro; si tu despliegue usa otro nombre de acción en Apps Script, la app puede probar varias variantes compatibles.

════════════════════════════════════════════════════════════
J. HISTORIAL
════════════════════════════════════════════════════════════

• Selector de vehículo para ver la línea de tiempo de gastos y mantenimientos de ese vehículo (mezclados y ordenados por fecha).
• Botón Sincronizar en la cabecera para forzar envío de pendientes y refrescar.
• Si hay Firebase configurado, puede mezclarse información remota; si no, se apoya en datos locales y hoja.

════════════════════════════════════════════════════════════
K. HOJAS DE GASTO
════════════════════════════════════════════════════════════

• Permite agrupar gastos ya registrados en una “hoja de gasto” numerada para el proceso interno de reembolso.
• Solo aparecen como seleccionables los gastos con forma de pago «Usuario» o «Tarjeta Grefa» (tarjeta corporativa), sin hoja asignada aún, y según tu rol (OPERARIO: solo los tuyos; RESPONSABLE: los tuyos o los de otros si la matrícula del gasto es un vehículo a tu cargo en FLOTA; GESTOR: todos los que haya en el móvil). Si la hoja incluye gastos con tarjeta corporativa, el texto legal del PDF será el de justificación contable (no reembolso).
• La lista de hojas creadas en el teléfono respeta la misma lógica de visibilidad por rol (GESTOR ve todo; RESPONSABLE ve las suyas y las que incluyan líneas con matrícula a su cargo; OPERARIO solo las suyas).
• Al crear la hoja, la app avisa si algún gasto seleccionado no tiene ticket, no está sincronizado o le falta proyecto; puedes corregir o continuar igualmente.
• Generación de PDF / impresión o compartir según botones disponibles (usa el visor o menú compartir del móvil).
• Los textos y numeración pueden adaptarse al nombre del usuario para no pisar hojas de otros compañeros.

════════════════════════════════════════════════════════════
L. USO DE VEHÍCULOS (SOLICITUDES)
════════════════════════════════════════════════════════════

La pantalla tiene varias vistas (pestañas arriba):

• Solicitudes — Formulario para crear una solicitud y, debajo, listado filtrable por estado (PENDIENTE, APROBADA, RECHAZADA, CANCELADA, LIBERADA) y búsqueda. Las fechas no muestran el almanaque siempre visible: toca el campo de fecha y se abre un calendario mensual en ventana; al elegir el día se guarda la fecha y puedes cerrar sin cambiar con «Cerrar». Las horas de inicio y fin son opcionales: si las quieres, toca el botón de hora y usa «Guardar»; si no, deja sin hora o pulsa «Sin hora» en el selector. Motivo y matrícula siguen siendo necesarios para enviar.
  – **Retirar:** el titular puede cancelar su solicitud **PENDIENTE**.
  – **Liberar reserva:** en solicitudes **APROBADAS**, el titular (operario), el RESPONSABLE del vehículo o el GESTOR pueden liberar el uso (total o parcial, **solo por fechas**; las horas no cuentan) para que el vehículo vuelva a aparecer libre en disponibilidades.
• Pendientes — Solo la ven GESTOR y RESPONSABLE. Lista solicitudes **PENDIENTE** que el servidor te devuelve según tu rol: si eres **RESPONSABLE** (en USUARIOS), las de matrículas a tu cargo en FLOTA; si eres **GESTOR**, las de todo el libro cargado. Sirve para revisar pendientes sin pasar por el formulario de alta.
  – **SLA (tiempo en PENDIENTE):** la antigüedad se calcula desde **fecha_solicitud** (o, si falta, desde fecha de inicio del uso). Etiqueta **naranja** si lleva más de **24 horas**; **roja** si supera **48 horas** (texto «Escalar»).
  – **GESTOR — sub-filtros:** Todas | Retrasadas (+24h) | Sin responsable activo | Escalado. «Escalado» agrupa solicitudes sin ningún aprobador activo en USUARIOS para ese vehículo o con SLA crítico (+48h).
  – **Suplentes / varios correos:** en FLOTA, columna **e-mail_de_notificaciones** admite varios correos separados por **;** o **,**. Cualquiera de ellos cuenta como responsable de notificación si está en USUARIOS con rol RESPONSABLE, GESTOR o ADMINISTRACIÓN y **activo = SI**. Útil para suplentes cuando el responsable principal no está disponible.
• Calendario — Vista mensual de ocupación según solicitudes aprobadas o pendientes; al tocar un día se abre el detalle y puedes tocar un vehículo libre para ir al formulario con esa fecha. No se puede cursar una solicitud si el periodo solapa con otra pendiente o aprobada del mismo vehículo (la app y el servidor lo bloquean).
• Disponibilidades — Comprueba un rango de fechas (mismo criterio de calendario en ventana para elegir día) y, si quieres, horas opcionales, para ver qué vehículos quedan libres u ocupados por solicitudes aprobadas o pendientes en ese intervalo.

Correos automáticos (Apps Script desplegado): al **crear** una solicitud, el servidor intenta enviar un aviso usando los correos de FLOTA («e-mail_de_notificaciones», etc.): solo se envían a direcciones que existan en **USUARIOS** con **activo = SI** y rol **RESPONSABLE**, **GESTOR** o **ADMINISTRACION** (antes solo pasaban los RESPONSABLE; si en FLOTA ponías un gestor, el aviso no salía). Si no hay destinatarios válidos, puede acudir al fallback de responsables por matrícula a cargo o a gestores. Al **aprobar o rechazar**, el correo al solicitante usa primero el email que envía la app y, si hace falta, la columna **trabajador_email** de la hoja. Si no llegan, revisa spam, cuotas, que el despliegue sea como **tú** (propietario) y que el archivo **appsscript.json** incluya el ámbito **Gmail** de envío; tras cambiar ámbitos hay que **volver a autorizar** y publicar una **nueva versión** de la Web App.

• Aprobar / rechazar: por norma lo hace el **RESPONSABLE** del vehículo (rol **RESPONSABLE** en USUARIOS y vínculo en FLOTA). El servidor puede permitir también al **GESTOR**; la app avisa si al aprobar choca con otra reserva ya aprobada del mismo vehículo en el mismo intervalo.

════════════════════════════════════════════════════════════
M. SINCRONIZAR (COLA OFFLINE)
════════════════════════════════════════════════════════════

• Cuando no hay red, muchos guardados se almacenan en una cola del teléfono.
• Al volver la conexión, pulsa “Sincronizar” en el menú: la app intenta subir fotos y registros respetando los destinos configurados (carpeta Drive y libro de cálculo corporativos o personales si existen).
• El número rojo sobre el icono indica cuántos elementos siguen pendientes.
• Si algo falla, la app muestra un mensaje: anótalo o captura pantalla para el gestor.

════════════════════════════════════════════════════════════
N. DESTINOS DE GUARDADO (SOLO GESTOR)
════════════════════════════════════════════════════════════

• Define si los archivos van a destino corporativo, personal o ambos.
• Campos típicos: identificador de carpeta de Google Drive y de hoja de cálculo corporativos; opcionalmente carpeta y libro personales; modo “solo corporativo”, “solo personal” o “ambos”; opción de crear automáticamente destino personal.
• Solo el rol GESTOR puede guardar cambios aquí.

════════════════════════════════════════════════════════════
O. USUARIOS Y ROLES
════════════════════════════════════════════════════════════

• Lista de usuarios cargada desde el servidor con buscador.
• Al pulsar una fila: pantalla de edición con nombre, rol (OPERARIO, RESPONSABLE, GESTOR, ADMINISTRACIÓN), activo SI/NO, teléfono, fecha de alta.
• Quien deba **aprobar solicitudes de uso** de un vehículo debe tener rol **RESPONSABLE** aquí (mismo correo con el que entra a la app) y además estar enlazado a esa matrícula en **FLOTA** (responsable y/o correo de notificaciones).
• Guardar intenta varios comandos compatibles del backend para máxima compatibilidad.
• Cambiar contraseña de un tercero puede no estar en esta pantalla: cada usuario cambia la suya desde el menú “Contraseña”.

════════════════════════════════════════════════════════════
P. ROL RESPONSABLE (SOLICITUDES DE PROMOCIÓN)
════════════════════════════════════════════════════════════

• Pantalla para GESTOR o ADMINISTRACIÓN.
• Lista solicitudes pendientes de quien pidió ser responsable.
• Para aprobar: seleccionar una o más matrículas de la flota que se asignan a esa persona (obligatorio al menos una al aprobar); opcional comentario.
• Rechazar no exige matrículas.
• Al aprobar, el servidor actualiza usuarios y filas de FLOTA (responsable y correo de notificación en vehículos elegidos) y puede enviar correo al solicitante.
• Tras aprobar, esa persona queda como **RESPONSABLE** en USUARIOS y puede gestionar en la app las solicitudes de uso de las matrículas asignadas (además del flujo de “Rol responsable”, conviene revisar FLOTA).

════════════════════════════════════════════════════════════
Q. APROBACIONES (HOJAS DE GASTO)
════════════════════════════════════════════════════════════

• Listado de hojas de gasto con filtros por estado de revisión y de pago.
• GESTOR: pasa hojas a “en revisión”, aprueba o rechaza revisión; puede abrir PDF resumen.
• ADMINISTRACIÓN: además gestiona estados de pago (pago pendiente, pagada, rechazada pago, etc.) según botones mostrados.
• Compartir o imprimir PDF usa las funciones del sistema Android.

════════════════════════════════════════════════════════════
Q.1 INFORME MENSUAL Y RECORDATORIOS AUTOMÁTICOS
════════════════════════════════════════════════════════════

Informe mensual (app):
• Menú → Informe mensual (GESTOR / ADMINISTRACION).
• Elige mes y año y pulsa Refrescar.
• Muestra: hojas de gasto del mes agrupadas por estado (según fecha de envío); gastos del mes sin hoja asignada por usuario; vehículos activos sin responsable o correo de notificaciones válido frente a usuarios RESPONSABLE/GESTOR activos; tiempo medio entre envío y revisión de hojas aprobadas en el periodo.

Recordatorios por correo (servidor, sin acción en la app):
• Día 25 de cada mes: correo a usuarios de campo activos (USUARIO, RESPONSABLE, COLABORADOR) recordando generar la hoja de gasto del mes en curso.
• Día 2 de cada mes: correo a GESTOR y ADMINISTRACION con el resumen de hojas ENVIADA / EN REVISIÓN pendientes; y correo a cada RESPONSABLE activo con el número de hojas de su ámbito pendientes de revisar.
• Los triggers se instalan una vez en Apps Script ejecutando instalarTriggersGobiernoMensual_() (zona horaria Europe/Madrid).

════════════════════════════════════════════════════════════
R. CONTRASEÑA
════════════════════════════════════════════════════════════

• Desde el menú se abre una ventana emergente.
• Debes escribir contraseña actual, nueva dos veces; mínimo 6 caracteres en la nueva.
• Se valida la actual contra la hoja de usuarios y se actualiza la guardada allí; si usas Firebase con la misma cuenta, también se intenta mantener alineado.

════════════════════════════════════════════════════════════
S. SALIR
════════════════════════════════════════════════════════════

Cierra la sesión en el dispositivo y vuelve a la pantalla de acceso. No borra los datos ya enviados al servidor.

════════════════════════════════════════════════════════════
T. CONSEJOS Y PROBLEMAS FRECUENTES
════════════════════════════════════════════════════════════

• “Timeout” o error de red: revisa Wi‑Fi o datos y vuelve a intentar; los borradores suelen seguir en cola.
• “Acción no reconocida”: el servidor (Apps Script) no tiene aún esa función desplegada: lo arregla quien mantiene el script.
• “Usuario inactivo”: el gestor debe marcar activo SI en usuarios.
• Fechas: respeta el formato que pida cada campo (muchas veces día/mes/año con barras).
• Tras aprobarte como RESPONSABLE, vuelve al menú o entra de nuevo para que se refresque el rol leído desde la hoja.

════════════════════════════════════════════════════════════
U. PRIVACIDAD Y BUEN USO
════════════════════════════════════════════════════════════

Las fotos pueden contener datos personales o de terceros (matrículas, tickets): úsalas solo para la gestión de flota y según la política de vuestra organización.

════════════════════════════════════════════════════════════

Si falta alguna función nueva en una versión futura, pide que actualicen también esta ayuda en la misma actualización de la aplicación.

Versión de referencia: ${HELP_APP_VERSION}.
`;
