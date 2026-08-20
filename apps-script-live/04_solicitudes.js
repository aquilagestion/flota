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
    // Header real de USO en producción:
    desde_ts: normalizeDateDMYCell_(String(sol.fecha_inicio || "").trim()),
    hasta_ts: normalizeDateDMYCell_(String(sol.fecha_fin || "").trim()),
    km_salida: "",
    km_llegada: "",
    incidencias: "",
    estado: "ACTIVO",
    // Compatibilidad con otras plantillas de USO:
    fecha_inicio_ocupacion: formatDateDMY_(ini),
    fecha_fin_ocupacion: formatDateDMY_(fin),
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

function formatDateDMY_(d) {
  return Utilities.formatDate(d, CFG.TIMEZONE, "dd/MM/yyyy");
}

function formatTimeHM_(d) {
  return Utilities.formatDate(d, CFG.TIMEZONE, "HH:mm");
}

/** Solo fecha (ignora horas): inicio del día local. */
function parseFechaSoloInicioDia_(fecha) {
  var d = parseFechaHoraDesdeFila_(fecha, "00:00");
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Solo fecha (ignora horas): fin del día local. */
function parseFechaSoloFinDia_(fecha) {
  var d = parseFechaHoraDesdeFila_(fecha, "23:59");
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Libera total/parcialmente una solicitud APROBADA.
 *
 * Casos:
 * - liberación total: marca solicitud como LIBERADA y cierra su uso.
 * - liberación parcial: recorta/parte la solicitud en tramos APROBADA restantes.
 *
 * La liberación se calcula **solo por fechas** (día completo). Se ignoran
 * hora_inicio / hora_fin de la solicitud y del payload.
 *
 * Requiere payload:
 * - id_solicitud
 * - fecha_inicio_liberacion (dd/MM/yyyy o yyyy-MM-dd)
 * - fecha_fin_liberacion (dd/MM/yyyy o yyyy-MM-dd)
 * Opcional:
 * - motivo
 * - user_email / responsable_email / resuelto_por_email
 */
function apiLiberacionCrear(payload) {
  payload = payload || {};
  var idSolicitud = String(payload.id_solicitud || "").trim();
  if (!idSolicitud) throw new Error("Falta campo: id_solicitud");

  var requester = normalizeEmail_(
    payload.user_email || payload.responsable_email || payload.resuelto_por_email || ""
  );
  if (!requester) throw new Error("Falta user_email");
  var rol = normalizeRolSegunUsuarios_(requester);
  // USUARIO (OPERARIO legacy), COLABORADOR, RESPONSABLE, GESTOR, ADMINISTRACION
  if (
    rol !== "GESTOR" &&
    rol !== "RESPONSABLE" &&
    rol !== "ADMINISTRACION" &&
    rol !== "USUARIO" &&
    rol !== "OPERARIO" &&
    rol !== "COLABORADOR"
  ) {
    throw new Error("No autorizado para liberar solicitudes");
  }

  var shSol = getSheet(CFG.SHEETS.SOLICITUDES);
  var solRows = rowsToObjects_(shSol);
  var sol = solRows.find((r) => String(r.id_solicitud || "").trim() === idSolicitud);
  if (!sol) throw new Error("Solicitud no encontrada");
  var estadoActual = String(sol.estado || "")
    .trim()
    .toUpperCase();
  if (estadoActual !== "APROBADA") throw new Error("Solo se pueden liberar solicitudes APROBADA");

  var mat = normalizeMatricula_(sol.matricula);
  if (!mat) throw new Error("Solicitud sin matrícula");
  var titular = normalizeEmail_(sol.trabajador_email || sol.usuario_email || "");

  if (rol === "RESPONSABLE") {
    var assigned = getMatriculasACargo_(requester);
    if (!assigned[mat] && titular !== requester) {
      throw new Error("Solo puedes liberar solicitudes de vehículos a tu cargo o tus propias reservas APROBADAS");
    }
  } else if (rol === "USUARIO" || rol === "OPERARIO" || rol === "COLABORADOR") {
    if (!titular || titular !== requester) {
      throw new Error("Solo puedes liberar tus propias solicitudes APROBADAS");
    }
  }
  // GESTOR / ADMINISTRACION: cualquier APROBADA

  var fIniLib = String(payload.fecha_inicio_liberacion || payload.fecha_inicio || "").trim();
  var fFinLib = String(payload.fecha_fin_liberacion || payload.fecha_fin || "").trim();
  if (!fIniLib || !fFinLib) throw new Error("Faltan fecha_inicio_liberacion y fecha_fin_liberacion");

  // Solo fechas (día completo); se desprecian horas del payload y de la solicitud.
  var libIni = parseFechaSoloInicioDia_(fIniLib);
  var libFin = parseFechaSoloFinDia_(fFinLib);
  if (!libIni || !libFin || libIni > libFin) throw new Error("Rango de liberación inválido");

  var solDayIni = parseFechaSoloInicioDia_(sol.fecha_inicio);
  var solDayFin = parseFechaSoloFinDia_(sol.fecha_fin);
  if (!solDayIni || !solDayFin || solDayIni > solDayFin) {
    throw new Error("Solicitud original con fechas inválidas");
  }

  if (libIni < solDayIni || libFin > solDayFin) {
    throw new Error("El rango a liberar debe estar dentro del rango aprobado original (solo fechas)");
  }

  var motivo = String(payload.motivo || payload.motivo_liberacion || "").trim();
  if (!motivo) motivo = "Liberación de reserva";

  var keepBefore = solDayIni < libIni;
  var keepAfter = libFin < solDayFin;
  var segmentos = [];
  if (keepBefore) segmentos.push({ ini: solDayIni, fin: libIni });
  if (keepAfter) {
    var afterIni = new Date(libFin.getFullYear(), libFin.getMonth(), libFin.getDate() + 1, 0, 0, 0, 0);
    if (afterIni <= solDayFin) segmentos.push({ ini: afterIni, fin: solDayFin });
  }

  var headers = getHeaders_(shSol);
  var rowNum = Number(sol._row || 0);
  if (!rowNum) throw new Error("No se pudo localizar fila de la solicitud");
  var idxEstado = headers.indexOf("estado");
  var idxFechaIni = headers.indexOf("fecha_inicio");
  var idxHoraIni = headers.indexOf("hora_inicio");
  var idxFechaFin = headers.indexOf("fecha_fin");
  var idxHoraFin = headers.indexOf("hora_fin");
  var idxMotivo = headers.indexOf("motivo");
  var idxResuelto = headers.indexOf("resuelto_por_email");
  var idxFechaRes = headers.indexOf("fecha_resolucion");
  var idxMotivoRech = headers.indexOf("motivo_rechazo");

  function setCellIfIdx_(idx, value) {
    if (idx >= 0) shSol.getRange(rowNum, idx + 1).setValue(value);
  }

  var createdSolicitudIds = [];
  var updatedSolicitudIds = [];
  var estadoFinalSolicitud = "";

  if (!segmentos.length) {
    estadoFinalSolicitud = "LIBERADA";
    setCellIfIdx_(idxEstado, estadoFinalSolicitud);
    setCellIfIdx_(idxMotivoRech, motivo);
    setCellIfIdx_(idxResuelto, requester || "");
    setCellIfIdx_(idxFechaRes, normalizeDateDMYCell_(new Date()));
  } else {
    var seg0 = segmentos[0];
    estadoFinalSolicitud = "APROBADA";
    if (idxFechaIni >= 0) setCellIfIdx_(idxFechaIni, formatDateDMY_(seg0.ini));
    if (idxHoraIni >= 0) setCellIfIdx_(idxHoraIni, formatTimeHM_(seg0.ini));
    if (idxFechaFin >= 0) setCellIfIdx_(idxFechaFin, formatDateDMY_(seg0.fin));
    if (idxHoraFin >= 0) setCellIfIdx_(idxHoraFin, formatTimeHM_(seg0.fin));
    if (idxMotivo >= 0) {
      var mot0 = String(sol.motivo || "").trim();
      setCellIfIdx_(idxMotivo, mot0 ? mot0 + " | Ajuste por liberación parcial" : "Ajuste por liberación parcial");
    }
    updatedSolicitudIds.push(idSolicitud);

    if (segmentos.length > 1) {
      var seg1 = segmentos[1];
      var newId = genId_("SOL");
      var nueva = Object.assign({}, sol);
      delete nueva._row;
      nueva.id_solicitud = newId;
      nueva.fecha_inicio = formatDateDMY_(seg1.ini);
      nueva.hora_inicio = formatTimeHM_(seg1.ini);
      nueva.fecha_fin = formatDateDMY_(seg1.fin);
      nueva.hora_fin = formatTimeHM_(seg1.fin);
      nueva.estado = "APROBADA";
      if (nueva.motivo_rechazo !== undefined) nueva.motivo_rechazo = "";
      if (nueva.resuelto_por_email !== undefined) nueva.resuelto_por_email = "";
      if (nueva.fecha_resolucion !== undefined) nueva.fecha_resolucion = "";
      if (nueva.motivo !== undefined) {
        var mot1 = String(sol.motivo || "").trim();
        nueva.motivo = mot1 ? mot1 + " | Tramo generado por liberación parcial" : "Tramo generado por liberación parcial";
      }
      appendRowByHeaders_(shSol, nueva);
      createdSolicitudIds.push(newId);
    }
  }

  // Marcar usos vigentes de esta solicitud como liberados/cerrados para no duplicar intervalos activos.
  var shUso = getSheet(CFG.SHEETS.USO);
  var usoRows = rowsToObjects_(shUso);
  var usoHeaders = getHeaders_(shUso);
  var idxUsoEstado = usoHeaders.indexOf("estado_uso");
  var idxUsoFinReal = usoHeaders.indexOf("fin_real");
  var usosAfectados = 0;
  usoRows.forEach((u) => {
    if (String(u.id_solicitud || "").trim() !== idSolicitud) return;
    var uRow = Number(u._row || 0);
    if (!uRow) return;
    if (idxUsoEstado >= 0) shUso.getRange(uRow, idxUsoEstado + 1).setValue("LIBERADO");
    if (idxUsoFinReal >= 0) shUso.getRange(uRow, idxUsoFinReal + 1).setValue(formatDateTimeISO_(new Date()));
    usosAfectados++;
  });

  var usosCreados = [];
  if (segmentos.length) {
    // Re-crear usos activos para los tramos que quedan reservados.
    var sBase = rowsToObjects_(shSol).find((r) => String(r.id_solicitud || "").trim() === idSolicitud);
    if (sBase) {
      usosCreados.push(crearUsoDesdeSolicitud_(sBase));
    }
    if (createdSolicitudIds.length) {
      createdSolicitudIds.forEach((sid) => {
        var sx = rowsToObjects_(shSol).find((r) => String(r.id_solicitud || "").trim() === sid);
        if (sx) usosCreados.push(crearUsoDesdeSolicitud_(sx));
      });
    }
  }

  return {
    id_solicitud: idSolicitud,
    matricula: mat,
    liberacion_inicio: formatDateTimeISO_(libIni),
    liberacion_fin: formatDateTimeISO_(libFin),
    estado_final_solicitud_original: estadoFinalSolicitud || "APROBADA",
    solicitudes_actualizadas: updatedSolicitudIds,
    solicitudes_creadas: createdSolicitudIds,
    usos_marcados_liberados: usosAfectados,
    usos_creados: usosCreados,
    motivo: motivo,
  };
}

/**
 * Migra/sincroniza a USO todas las solicitudes APROBADA de SOLICITUDES.
 * - Si no existe id_solicitud en USO: crea nuevo uso.
 * - Si ya existe: actualiza datos base con los valores actuales de SOLICITUDES.
 *
 * Útil para regularizar histórico cuando antes no se creaba USO al aprobar.
 */
function migrarSolicitudesAprobadasAUso_(opts) {
  opts = opts || {};
  var dryRun = String(opts.dry_run || "").trim().toUpperCase() === "SI";

  var shSol = getSheet(CFG.SHEETS.SOLICITUDES);
  var shUso = getSheet(CFG.SHEETS.USO);
  var solRows = rowsToObjects_(shSol);
  var usoRows = rowsToObjects_(shUso);
  var usoHeaders = getHeaders_(shUso);

  var usoBySolicitudId = {};
  usoRows.forEach(function (u) {
    var sid = String(u.id_solicitud || "").trim();
    if (!sid) return;
    if (!usoBySolicitudId[sid]) usoBySolicitudId[sid] = u;
  });

  var res = {
    dry_run: dryRun,
    total_solicitudes_aprobadas: 0,
    creados_en_uso: 0,
    actualizados_en_uso: 0,
    omitidos_sin_id: 0,
    errores: [],
  };

  solRows.forEach(function (s) {
    var estado = String(s.estado || "")
      .trim()
      .toUpperCase();
    if (estado !== "APROBADA") return;
    res.total_solicitudes_aprobadas++;

    var sid = String(s.id_solicitud || "").trim();
    if (!sid) {
      res.omitidos_sin_id++;
      return;
    }

    var ini = parseFechaHoraDesdeFila_(s.fecha_inicio, s.hora_inicio);
    var fin = parseFechaHoraDesdeFila_(s.fecha_fin, s.hora_fin);
    if (!ini || !fin || ini >= fin) {
      res.errores.push("Solicitud " + sid + " con fechas inválidas");
      return;
    }

    var payloadUso = {
      id_solicitud: sid,
      matricula: String(s.matricula || "").trim(),
      trabajador_email: String(s.trabajador_email || "").trim(),
      trabajador_nombre: String(s.trabajador_nombre || "").trim(),
      inicio_previsto: formatDateTimeISO_(ini),
      fin_previsto: formatDateTimeISO_(fin),
    };

    var existing = usoBySolicitudId[sid];
    if (!existing) {
      if (!dryRun) {
        crearUsoDesdeSolicitud_(s);
      }
      res.creados_en_uso++;
      return;
    }

    if (dryRun) {
      res.actualizados_en_uso++;
      return;
    }

    try {
      var rowNum = Number(existing._row || 0);
      if (!rowNum) throw new Error("fila USO no localizada");

      function setIfCol_(colName, value) {
        var idx = usoHeaders.indexOf(colName);
        if (idx < 0) return;
        shUso.getRange(rowNum, idx + 1).setValue(value == null ? "" : value);
      }

      setIfCol_("matricula", normalizeMatricula_(payloadUso.matricula));
      setIfCol_("trabajador_email", String(payloadUso.trabajador_email || "").trim().toLowerCase());
      setIfCol_("trabajador_nombre", payloadUso.trabajador_nombre);
      setIfCol_("inicio_previsto", payloadUso.inicio_previsto);
      setIfCol_("fin_previsto", payloadUso.fin_previsto);
      setIfCol_("id_solicitud", payloadUso.id_solicitud);

      res.actualizados_en_uso++;
    } catch (eUp) {
      res.errores.push("Solicitud " + sid + ": " + String(eUp && eUp.message ? eUp.message : eUp));
    }
  });

  return res;
}
