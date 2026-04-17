// ======================================================================
// 04_solicitudes.gs
// Utilidades de solape y cancelación de solicitudes de uso.
// apiSolicitudCrear / apiSolicitudList / apiSolicitudResolver → 19 y 16 (solapes: haySolapeAprobado_ vs haySolapeReservaParaNuevaSolicitud_).
// Requiere: CFG, getSheet, rowsToObjects_, normalizeMatricula_, appendRowByHeaders_,
// normalizeDateDMYCell_, formatDateTimeISO_, genId_, getHeaders_.
// 12_usuarios_roles.gs → apiUsuarioGet (cancelar solicitud).
// ======================================================================

/** Serial de fecha/hora de Google Sheets (días desde 30-dic-1899 + fracción de día). */
function sheetsSerialToDateTime_(serial) {
  if (typeof serial !== "number" || !isFinite(serial)) return null;
  if (serial > 0 && serial < 1) return null;
  var whole = Math.floor(serial);
  var frac = serial - whole;
  var ms = Date.UTC(1899, 11, 30) + whole * 86400000;
  if (frac > 1e-12) ms += Math.round(frac * 86400000);
  var d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Interpreta fecha y hora tal como vienen de getValues() en SOLICITUDES:
 * Date, número-serie, texto dd/MM/yyyy o yyyy-MM-dd, hora en texto HH:mm,
 * hora como Date (celda hora), o fracción de día (0–1).
 */
function parseFechaHoraDesdeFila_(fecha, hora) {
  function partesHora_(hr) {
    if (hr === undefined || hr === null || hr === "") return null;
    if (typeof hr === "number" && isFinite(hr) && hr >= 0 && hr < 1) {
      var tmin = Math.round(hr * 24 * 60);
      return { h: Math.floor(tmin / 60), m: tmin % 60 };
    }
    if (hr instanceof Date && !isNaN(hr.getTime())) {
      return { h: hr.getHours(), m: hr.getMinutes() };
    }
    var hs = String(hr).trim();
    if (!hs) return null;
    var p = hs.split(":");
    return { h: Number(p[0] || 0), m: Number(p[1] || 0) };
  }

  function aplicarHoraEnDia_(diaInicio, ph) {
    if (!diaInicio || isNaN(diaInicio.getTime()) || !ph) return null;
    var d = new Date(diaInicio.getTime());
    d.setHours(ph.h, ph.m, 0, 0);
    return d;
  }

  var horaExplicita = !(hora === undefined || hora === null || String(hora).trim() === "");
  var ph = horaExplicita ? partesHora_(hora) : null;

  if (fecha instanceof Date && !isNaN(fecha.getTime())) {
    if (!horaExplicita) return new Date(fecha.getTime());
    if (!ph) return null;
    var base = new Date(fecha.getTime());
    base.setHours(0, 0, 0, 0);
    return aplicarHoraEnDia_(base, ph);
  }

  if (typeof fecha === "number" && isFinite(fecha)) {
    var dt = sheetsSerialToDateTime_(fecha);
    if (!dt) return null;
    if (!horaExplicita) return dt;
    if (!ph) return null;
    var baseN = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    return aplicarHoraEnDia_(baseN, ph);
  }

  var f = String(fecha || "").trim();
  if (!f) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(f)) {
    var isoY = f.substring(0, 10);
    var dy = new Date(isoY + "T00:00:00");
    if (isNaN(dy.getTime())) return null;
    if (!horaExplicita) return dy;
    if (!ph) return null;
    return aplicarHoraEnDia_(dy, ph);
  }

  var m = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    var iso = m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    var dd = new Date(iso + "T00:00:00");
    if (isNaN(dd.getTime())) return null;
    if (!horaExplicita) return dd;
    if (!ph) return null;
    return aplicarHoraEnDia_(dd, ph);
  }

  var hTxt = horaExplicita ? String(hora).trim() : "00:00";
  var dlast = new Date(f + " " + hTxt);
  return isNaN(dlast.getTime()) ? null : dlast;
}

function haySolapeSolicitudPorEstados_(matricula, ini, fin, excludeId, estadosUpperSet) {
  const sh = getSheet(CFG.SHEETS.SOLICITUDES);
  const rows = rowsToObjects_(sh);
  const mat = normalizeMatricula_(matricula);
  const exc = String(excludeId || "").trim();

  return rows.some((r) => {
    const id = String(r.id_solicitud || "").trim();
    if (exc && id === exc) return false;

    const estado = String(r.estado || "")
      .trim()
      .toUpperCase();
    if (!estadosUpperSet || !estadosUpperSet[estado]) return false;
    if (normalizeMatricula_(r.matricula) !== mat) return false;

    const rIni = parseFechaHoraDesdeFila_(r.fecha_inicio, r.hora_inicio);
    const rFin = parseFechaHoraDesdeFila_(r.fecha_fin, r.hora_fin);
    if (!rIni || !rFin) return false;

    return ini < rFin && fin > rIni;
  });
}

/** Solo solicitudes ya aprobadas (p. ej. al aprobar otra, evitar doble reserva). */
function haySolapeAprobado_(matricula, ini, fin, excludeId) {
  const ap = String(CFG.ESTADOS.SOLICITUD_APROBADA || "APROBADA")
    .trim()
    .toUpperCase();
  const set = {};
  set[ap] = true;
  return haySolapeSolicitudPorEstados_(matricula, ini, fin, excludeId, set);
}

/** Aprobadas + pendientes: no permitir nueva solicitud solapada. */
function haySolapeReservaParaNuevaSolicitud_(matricula, ini, fin, excludeId) {
  const ap = String(CFG.ESTADOS.SOLICITUD_APROBADA || "APROBADA")
    .trim()
    .toUpperCase();
  const pe = String(CFG.ESTADOS.SOLICITUD_PENDIENTE || "PENDIENTE")
    .trim()
    .toUpperCase();
  const set = {};
  set[ap] = true;
  set[pe] = true;
  return haySolapeSolicitudPorEstados_(matricula, ini, fin, excludeId, set);
}

function apiCancelarSolicitud(payload) {
  payload = payload || {};
  const required = ["id_solicitud", "trabajador_email"];
  required.forEach((k) => {
    if (!payload[k]) throw new Error("Falta campo: " + k);
  });

  const email = String(payload.trabajador_email || "")
    .trim()
    .toLowerCase();
  const u = apiUsuarioGet({ email: email });
  if (!u || String(u.activo || "").trim().toUpperCase() !== "SI") {
    throw new Error("Usuario no existe o está inactivo");
  }

  const sh = getSheet(CFG.SHEETS.SOLICITUDES);
  const rows = rowsToObjects_(sh);
  const item = rows.find((r) => String(r.id_solicitud || "").trim() === String(payload.id_solicitud || "").trim());
  if (!item) throw new Error("Solicitud no encontrada");

  if (
    String(item.trabajador_email || "")
      .trim()
      .toLowerCase() !== email
  ) {
    throw new Error("No puedes cancelar solicitudes de otro usuario");
  }

  const estadoActual = String(item.estado || "")
    .trim()
    .toUpperCase();
  if (estadoActual !== CFG.ESTADOS.SOLICITUD_PENDIENTE) {
    throw new Error("Solo se pueden cancelar solicitudes PENDIENTE");
  }

  const headers = getHeaders_(sh);
  const colEstado = headers.indexOf("estado") + 1;
  const colFechaResolucion = headers.indexOf("fecha_resolucion") + 1;
  const colResueltoPor = headers.indexOf("resuelto_por_email") + 1;

  if (colEstado <= 0) throw new Error("No existe columna estado en SOLICITUDES");
  sh.getRange(item._row, colEstado).setValue(CFG.ESTADOS.SOLICITUD_CANCELADA);

  if (colFechaResolucion > 0) sh.getRange(item._row, colFechaResolucion).setValue(normalizeDateDMYCell_(new Date()));
  if (colResueltoPor > 0) sh.getRange(item._row, colResueltoPor).setValue(email);

  return { id_solicitud: item.id_solicitud, estado: CFG.ESTADOS.SOLICITUD_CANCELADA };
}

function crearUsoDesdeSolicitud_(sol) {
  const sh = getSheet(CFG.SHEETS.USO);
  const id = genId_("USO");

  const ini = parseFechaHoraDesdeFila_(sol.fecha_inicio, sol.hora_inicio);
  const fin = parseFechaHoraDesdeFila_(sol.fecha_fin, sol.hora_fin);
  if (!ini || !fin || ini >= fin) throw new Error("Fechas de solicitud inválidas");

  const rowObj = {
    id_uso: id,
    id_solicitud: String(sol.id_solicitud || ""),
    matricula: normalizeMatricula_(sol.matricula),
    trabajador_email: String(sol.trabajador_email || "")
      .trim()
      .toLowerCase(),
    trabajador_nombre: String(sol.trabajador_nombre || "").trim(),
    inicio_previsto: formatDateTimeISO_(ini),
    fin_previsto: formatDateTimeISO_(fin),
    inicio_real: "",
    fin_real: "",
    km_inicio: "",
    km_fin: "",
    estado_uso: "ACTIVO",
  };

  appendRowByHeaders_(sh, rowObj);
  return id;
}
