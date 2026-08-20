// ======================================================================
// 36_gobierno_mensual.gs
// Informe mensual de gobierno (API) + recordatorios por correo (triggers).
//
// GET informe_gobierno_mensual — solo GESTOR / ADMINISTRACION.
// Triggers (ejecutar una vez): instalarTriggersGobiernoMensual_()
//   · Día 25: recordatorio a campo (USUARIO/OPERARIO, RESPONSABLE, COLABORADOR).
//   · Día 2: resumen pendientes a GESTOR/ADMINISTRACION + aviso a cada RESPONSABLE.
//
// Criterios del informe (documentados también en la app):
//   · Hojas por estado: agrupadas por hoja_gasto_id con hoja_gasto_fecha_envio en el mes.
//   · Gastos sin hoja: filas GASTOS del mes (columna fecha) sin hoja_gasto_id.
//   · Tiempo medio aprobación: hojas APROBADAS con hoja_gasto_fecha_revision en el mes.
//   · Vehículos sin responsable: FLOTA activa sin correo responsable/notificaciones
//     válido frente a USUARIOS activos RESPONSABLE/GESTOR (misma lógica que SLA solicitudes).
// ======================================================================

var MESES_ES_ = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parseDateTimeFlexibleGobierno_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var s = String(value || "").trim();
  if (!s) return null;

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    var sec = m[6] || "00";
    var d = new Date(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + sec);
    return isNaN(d.getTime()) ? null : d;
  }

  return parseFechaFlexible_(value);
}

function resolvePeriodoGobierno_(anioRaw, mesRaw) {
  var now = new Date();
  var anio = parseInt(String(anioRaw || now.getFullYear()), 10);
  var mes = parseInt(String(mesRaw || now.getMonth() + 1), 10);
  if (!anio || anio < 2000 || anio > 2100) anio = now.getFullYear();
  if (!mes || mes < 1 || mes > 12) mes = now.getMonth() + 1;
  return {
    anio: anio,
    mes: mes,
    etiqueta: (MESES_ES_[mes] || String(mes)) + " " + anio,
  };
}

function dateInPeriodoGobierno_(value, anio, mes) {
  var d = parseDateTimeFlexibleGobierno_(value);
  if (!d) return false;
  return d.getFullYear() === anio && d.getMonth() + 1 === mes;
}

function looksLikeEmailGobierno_(s) {
  var t = String(s || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function splitEmailsGobierno_(raw) {
  var s = String(raw || "").trim();
  if (!s) return [];
  var parts = s.split(/[;,]/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var e = normalizeEmail_(parts[i]);
    if (looksLikeEmailGobierno_(e) && out.indexOf(e) < 0) out.push(e);
  }
  return out;
}

/** USUARIOS activos con rol RESPONSABLE o GESTOR (aprobadores de vehículos). */
function buildActiveVehicleApproversGobierno_() {
  var set = {};
  var rows = apiUsuariosList();
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    var email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    var activo = String(u.activo || "SI").trim().toUpperCase();
    if (activo !== "SI" && activo !== "TRUE" && activo !== "1") continue;
    var rol = String(u.rol || "").trim().toUpperCase();
    if (rol === "ADMIN") rol = "ADMINISTRACION";
    if (rol === "RESPONSABLE" || rol === "GESTOR") set[email] = true;
  }
  return set;
}

function vehicleApproverEmailsGobierno_(flotaRow) {
  var emails = [];
  var resp = String(flotaRow.responsable || "").trim().toLowerCase();
  if (looksLikeEmailGobierno_(resp)) emails.push(resp);
  var notifyRaw =
    flotaRow["e-mail_de_notificaciones"] || flotaRow.email_de_notificaciones || flotaRow["E-mail_de_notificaciones"] || "";
  var notify = splitEmailsGobierno_(notifyRaw);
  for (var i = 0; i < notify.length; i++) {
    if (emails.indexOf(notify[i]) < 0) emails.push(notify[i]);
  }
  return emails;
}

function vehicleHasActiveApproverGobierno_(flotaRow, activeApprovers) {
  var candidates = vehicleApproverEmailsGobierno_(flotaRow);
  if (!candidates.length) return false;
  for (var i = 0; i < candidates.length; i++) {
    if (activeApprovers[candidates[i]]) return true;
  }
  return false;
}

function readGastosIndexGobierno_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) {
    return { headers: [], rows: [], col: function() { return -1; }, val: function() { return ""; } };
  }

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c;

  function col(name) {
    return idx[name] !== undefined ? idx[name] : -1;
  }
  function val(row, i) {
    return i >= 0 ? row[i] : "";
  }

  return { headers: headers, rows: rows, col: col, val: val };
}

function aggregateHojasGobierno_(gastosIdx, anio, mes) {
  var cHojaId = gastosIdx.col("hoja_gasto_id");
  var cEstado = gastosIdx.col("hoja_gasto_estado");
  var cFechaEnvio = gastosIdx.col("hoja_gasto_fecha_envio");
  var cFechaRev = gastosIdx.col("hoja_gasto_fecha_revision");
  var cEmail = gastosIdx.col("responsable_email");
  var cMat = gastosIdx.col("matricula");

  var grouped = {};
  var rows = gastosIdx.rows || [];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var hojaId = String(gastosIdx.val(row, cHojaId) || "").trim();
    if (!hojaId) continue;

    if (!grouped[hojaId]) {
      grouped[hojaId] = {
        hoja_gasto_id: hojaId,
        hoja_gasto_estado: String(gastosIdx.val(row, cEstado) || "ENVIADA").trim().toUpperCase(),
        hoja_gasto_fecha_envio: String(gastosIdx.val(row, cFechaEnvio) || "").trim(),
        hoja_gasto_fecha_revision: String(gastosIdx.val(row, cFechaRev) || "").trim(),
        usuario_email: String(gastosIdx.val(row, cEmail) || "").trim().toLowerCase(),
        _matriculas: {},
      };
    }
    var mat = String(gastosIdx.val(row, cMat) || "").trim().toUpperCase();
    if (mat) grouped[hojaId]._matriculas[mat] = true;
  }

  var hojasPorEstado = {};
  var hojasEnMes = [];
  var approvalHours = [];
  var approvalSamples = 0;

  var keys = Object.keys(grouped);
  for (var k = 0; k < keys.length; k++) {
    var item = grouped[keys[k]];
    var envioEnMes = dateInPeriodoGobierno_(item.hoja_gasto_fecha_envio, anio, mes);
    var revEnMes = dateInPeriodoGobierno_(item.hoja_gasto_fecha_revision, anio, mes);

    if (envioEnMes) {
      hojasEnMes.push(item);
      var est = item.hoja_gasto_estado || "ENVIADA";
      hojasPorEstado[est] = (hojasPorEstado[est] || 0) + 1;
    }

    if (item.hoja_gasto_estado === "APROBADA" && revEnMes) {
      var dEnv = parseDateTimeFlexibleGobierno_(item.hoja_gasto_fecha_envio);
      var dRev = parseDateTimeFlexibleGobierno_(item.hoja_gasto_fecha_revision);
      if (dEnv && dRev && dRev.getTime() >= dEnv.getTime()) {
        var hours = (dRev.getTime() - dEnv.getTime()) / (60 * 60 * 1000);
        approvalHours.push(hours);
        approvalSamples++;
      }
    }
  }

  var horasMedia = 0;
  if (approvalHours.length) {
    var sum = 0;
    for (var h = 0; h < approvalHours.length; h++) sum += approvalHours[h];
    horasMedia = Math.round((sum / approvalHours.length) * 10) / 10;
  }

  return {
    hojas_por_estado: hojasPorEstado,
    hojas_totales: hojasEnMes.length,
    tiempo_aprobacion: {
      horas_media: horasMedia,
      muestras: approvalSamples,
    },
    groupedAll: grouped,
  };
}

function aggregateGastosSinHojaGobierno_(gastosIdx, anio, mes) {
  var cHojaId = gastosIdx.col("hoja_gasto_id");
  var cFecha = gastosIdx.col("fecha");
  var cEmail = gastosIdx.col("responsable_email");
  var byUser = {};
  var rows = gastosIdx.rows || [];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var hojaId = String(gastosIdx.val(row, cHojaId) || "").trim();
    if (hojaId) continue;
    var fecha = gastosIdx.val(row, cFecha);
    if (!dateInPeriodoGobierno_(fecha, anio, mes)) continue;
    var email = String(gastosIdx.val(row, cEmail) || "").trim().toLowerCase();
    if (!email) email = "(sin email)";
    if (!byUser[email]) byUser[email] = { email: email, nombre: "", gastos_count: 0 };
    byUser[email].gastos_count += 1;
  }

  var out = Object.keys(byUser).map(function(k) {
    return byUser[k];
  });
  for (var i = 0; i < out.length; i++) {
    if (out[i].email && out[i].email !== "(sin email)") {
      try {
        var u = apiUsuarioGet({ email: out[i].email });
        out[i].nombre = String((u && u.nombre) || "").trim();
      } catch (_) {}
    }
  }
  out.sort(function(a, b) {
    return b.gastos_count - a.gastos_count;
  });
  return out;
}

function listVehiculosSinResponsableGobierno_() {
  var activeApprovers = buildActiveVehicleApproversGobierno_();
  var flota = apiFlotaList();
  var out = [];
  for (var i = 0; i < flota.length; i++) {
    var v = flota[i];
    var activo = String(v.activo || "SI").trim().toUpperCase();
    if (activo === "NO") continue;
    if (vehicleHasActiveApproverGobierno_(v, activeApprovers)) continue;
    out.push({
      matricula: String(v.matricula || "").trim().toUpperCase(),
      responsable: String(v.responsable || "").trim(),
      email_notificaciones: String(v["e-mail_de_notificaciones"] || "").trim(),
      departamento_o_proyecto: String(v.departamento_o_proyecto || "").trim(),
    });
  }
  out.sort(function(a, b) {
    return String(a.matricula || "").localeCompare(String(b.matricula || ""));
  });
  return out;
}

function apiInformeGobiernoMensual(payload) {
  payload = payload || {};
  var user = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  if (!user) throw new Error("Falta user_email");
  requireRolGestorOrAdministracion_(user);

  var periodo = resolvePeriodoGobierno_(payload.anio || payload.ano || payload["año"], payload.mes);
  var gastosIdx = readGastosIndexGobierno_();
  var hojasAgg = aggregateHojasGobierno_(gastosIdx, periodo.anio, periodo.mes);
  var gastosSinHoja = aggregateGastosSinHojaGobierno_(gastosIdx, periodo.anio, periodo.mes);
  var vehiculosSinResp = listVehiculosSinResponsableGobierno_();

  return {
    periodo: periodo,
    criterios: {
      hojas_por_estado:
        "Hojas únicas (hoja_gasto_id) con hoja_gasto_fecha_envio en el mes seleccionado.",
      gastos_sin_hoja:
        "Líneas de GASTOS del mes (columna fecha) sin hoja_gasto_id asignado, agrupadas por responsable_email.",
      tiempo_aprobacion:
        "Media en horas entre hoja_gasto_fecha_envio y hoja_gasto_fecha_revision para hojas APROBADAS con revisión en el mes.",
      vehiculos_sin_responsable:
        "Vehículos FLOTA activos sin responsable ni e-mail_de_notificaciones válidos frente a USUARIOS activos RESPONSABLE/GESTOR.",
    },
    hojas_por_estado: hojasAgg.hojas_por_estado,
    hojas_totales: hojasAgg.hojas_totales,
    gastos_sin_hoja: gastosSinHoja,
    gastos_sin_hoja_totales: gastosSinHoja.reduce(function(acc, x) {
      return acc + (Number(x.gastos_count) || 0);
    }, 0),
    vehiculos_sin_responsable: vehiculosSinResp,
    vehiculos_sin_responsable_count: vehiculosSinResp.length,
    tiempo_aprobacion: hojasAgg.tiempo_aprobacion,
    generado_en: formatDateTimeISO_(new Date()),
  };
}

// ----- Correos -----

function getUsuariosCampoActivosEmails_() {
  var rows = apiUsuariosList();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    var email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    var activo = String(u.activo || "SI").trim().toUpperCase();
    if (activo !== "SI" && activo !== "TRUE" && activo !== "1") continue;
    var rol = String(u.rol || "").trim().toUpperCase();
    if (rol === "OPERARIO") rol = "USUARIO";
    if (rol === "USUARIO" || rol === "RESPONSABLE" || rol === "COLABORADOR") {
      if (out.indexOf(email) < 0) out.push(email);
    }
  }
  return out;
}

function getGestoresYAdminActivosEmails_() {
  var rows = apiUsuariosList();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    var email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    var activo = String(u.activo || "SI").trim().toUpperCase();
    if (activo !== "SI" && activo !== "TRUE" && activo !== "1") continue;
    var rol = String(u.rol || "").trim().toUpperCase();
    if (rol === "ADMIN") rol = "ADMINISTRACION";
    if (rol === "GESTOR" || rol === "ADMINISTRACION") {
      if (out.indexOf(email) < 0) out.push(email);
    }
  }
  return out;
}

function getResponsablesActivosEmails_() {
  var rows = apiUsuariosList();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    var email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    var activo = String(u.activo || "SI").trim().toUpperCase();
    if (activo !== "SI" && activo !== "TRUE" && activo !== "1") continue;
    if (String(u.rol || "").trim().toUpperCase() === "RESPONSABLE") {
      if (out.indexOf(email) < 0) out.push(email);
    }
  }
  return out;
}

function sendMailSafeGobierno_(opts) {
  try {
    MailApp.sendEmail(opts);
    return true;
  } catch (e) {
    try {
      Logger.log("sendMailSafeGobierno_ error: " + e.message);
    } catch (_) {}
    return false;
  }
}

function listHojasPendientesAprobacionGobierno_() {
  var gastosIdx = readGastosIndexGobierno_();
  var agg = aggregateHojasGobierno_(gastosIdx, 1900, 1);
  var grouped = agg.groupedAll || {};
  var pendientes = [];
  var keys = Object.keys(grouped);
  for (var k = 0; k < keys.length; k++) {
    var item = grouped[keys[k]];
    var st = item.hoja_gasto_estado;
    if (st === "ENVIADA" || st === "EN_REVISION") pendientes.push(item);
  }
  return pendientes;
}

function countHojasPorRevisarResponsable_(responsableEmail, pendientes) {
  var req = String(responsableEmail || "").trim().toLowerCase();
  if (!req) return 0;
  var count = 0;
  for (var i = 0; i < pendientes.length; i++) {
    var item = pendientes[i];
    if (puedeRevisarHojaGasto_(req, item.usuario_email, item._matriculas)) count++;
  }
  return count;
}

/** Día 25: recordatorio a usuarios de campo para generar hojas del mes en curso. */
function jobRecordatorioHojasGastoDia25_() {
  var now = new Date();
  var mes = now.getMonth() + 1;
  var anio = now.getFullYear();
  var etiqueta = (MESES_ES_[mes] || String(mes)) + " " + anio;
  var destinatarios = getUsuariosCampoActivosEmails_();
  if (!destinatarios.length) return;

  var subject = "[GESTIFLOTA] Recordatorio: hojas de gasto de " + etiqueta;
  var htmlBody =
    "<p>Hola,</p>" +
    "<p>Recordatorio automático: quedan pocos días para cerrar el mes. " +
    "Revisa tus gastos registrados y genera/envía tu <b>hoja de gasto de " +
    etiqueta +
    "</b> desde la aplicación GESTIFLOTA.</p>" +
    "<p>Menú → <b>Hojas gasto</b> → crear o enviar la hoja del periodo.</p>" +
    "<p style='color:#666;font-size:12px'>Correo automático del sistema. No respondas a este mensaje.</p>";

  for (var i = 0; i < destinatarios.length; i++) {
    sendMailSafeGobierno_({
      to: destinatarios[i],
      subject: subject,
      htmlBody: htmlBody,
    });
  }
}

/** Día 2: resumen a gestión + aviso a responsables con hojas pendientes de su ámbito. */
function jobRecordatorioGobiernoDia2_() {
  var pendientes = listHojasPendientesAprobacionGobierno_();
  var porEstado = { ENVIADA: 0, EN_REVISION: 0 };
  for (var i = 0; i < pendientes.length; i++) {
    var st = pendientes[i].hoja_gasto_estado;
    if (porEstado[st] !== undefined) porEstado[st]++;
  }
  var totalPend = pendientes.length;

  var gestores = getGestoresYAdminActivosEmails_();
  if (gestores.length && totalPend > 0) {
    var subjectG = "[GESTIFLOTA] Hojas de gasto pendientes de aprobación";
    var htmlG =
      "<p>Resumen automático (día 2 del mes):</p>" +
      "<ul>" +
      "<li><b>ENVIADA:</b> " +
      porEstado.ENVIADA +
      "</li>" +
      "<li><b>EN REVISIÓN:</b> " +
      porEstado.EN_REVISION +
      "</li>" +
      "<li><b>Total pendientes:</b> " +
      totalPend +
      "</li>" +
      "</ul>" +
      "<p>Revisa en la app: Menú → <b>Aprobaciones</b> o <b>Informe mensual</b>.</p>";
    sendMailSafeGobierno_({
      to: gestores.join(","),
      subject: subjectG,
      htmlBody: htmlG,
    });
  } else if (gestores.length) {
    sendMailSafeGobierno_({
      to: gestores.join(","),
      subject: "[GESTIFLOTA] Sin hojas de gasto pendientes",
      htmlBody: "<p>No hay hojas en estado ENVIADA ni EN REVISIÓN pendientes de aprobación.</p>",
    });
  }

  var responsables = getResponsablesActivosEmails_();
  for (var r = 0; r < responsables.length; r++) {
    var email = responsables[r];
    var count = countHojasPorRevisarResponsable_(email, pendientes);
    if (count < 1) continue;
    sendMailSafeGobierno_({
      to: email,
      subject: "[GESTIFLOTA] Tienes hojas de gasto por revisar",
      htmlBody:
        "<p>Hola,</p>" +
        "<p>Tienes <b>" +
        count +
        "</b> hoja(s) de gasto pendiente(s) de tu ámbito por revisar/aprobar.</p>" +
        "<p>Entra en GESTIFLOTA → Menú → <b>Aprobaciones</b>.</p>",
    });
  }
}

/**
 * Ejecutar una vez desde el editor Apps Script (cuenta con permisos de administrador).
 * Instala triggers mensuales en zona Europe/Madrid.
 */
function instalarTriggersGobiernoMensual_() {
  var targets = {
    jobRecordatorioHojasGastoDia25_: true,
    jobRecordatorioGobiernoDia2_: true,
  };
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (targets[fn]) ScriptApp.deleteTrigger(triggers[i]);
  }

  ScriptApp.newTrigger("jobRecordatorioHojasGastoDia25_")
    .timeBased()
    .onMonthDay(25)
    .atHour(9)
    .inTimezone(CFG.TIMEZONE)
    .create();

  ScriptApp.newTrigger("jobRecordatorioGobiernoDia2_")
    .timeBased()
    .onMonthDay(2)
    .atHour(8)
    .inTimezone(CFG.TIMEZONE)
    .create();

  return {
    ok: true,
    timezone: CFG.TIMEZONE,
    triggers: [
      { funcion: "jobRecordatorioHojasGastoDia25_", dia_mes: 25, hora: 9 },
      { funcion: "jobRecordatorioGobiernoDia2_", dia_mes: 2, hora: 8 },
    ],
  };
}
