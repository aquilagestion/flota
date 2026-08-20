// ======================================================================
// 33_servicios_colaborador_proyectos.gs
// Gestion de proyectos y liquidacion de servicios de colaborador.
// Backend para Apps Script + Google Sheets (sin SQL/ORM).
// ======================================================================

var ESTADOS_SERVICIO_COLAB_ = {
  BORRADOR: "BORRADOR",
  ENVIADA: "ENVIADA",
  APROBADA_PROYECTO: "APROBADA_PROYECTO",
  RECHAZADA_PROYECTO: "RECHAZADA_PROYECTO",
  APROBADA_ADMIN: "APROBADA_ADMIN",
  RECHAZADA_ADMIN: "RECHAZADA_ADMIN",
  PAGADA: "PAGADA",
};

function nowIso_() {
  return formatDateTimeISO_(new Date());
}

function normalizeSiNo_(v, def) {
  var s = String(v == null ? "" : v)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return def ? "SI" : "NO";
  if (s === "SI" || s === "S" || s === "TRUE" || s === "1" || s === "YES" || s === "Y") return "SI";
  if (s === "NO" || s === "N" || s === "FALSE" || s === "0") return "NO";
  // Valores ambiguos: si el default pide SI (p. ej. listados), no descartar filas.
  return def ? "SI" : "NO";
}

function numOrNull_(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  var n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

function safeStr_(v) {
  return String(v == null ? "" : v).trim();
}

function ensureSheetHeaders_(sheetName, headers) {
  var sh = getSheet(sheetName);
  var current = getHeaders_(sh);
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    if (current.indexOf(headers[i]) < 0) missing.push(headers[i]);
  }
  if (!missing.length) return sh;
  if (!current.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  // getRange(row, col, lastRow, lastCol): añadir columnas al final.
  sh.getRange(1, current.length + 1, 1, current.length + missing.length).setValues([missing]);
  return sh;
}

function headersProyectos_() {
  return [
    "id_proyecto",
    "nombre_proyecto",
    "departamento",
    "responsable_email",
    "responsable_nombre",
    "activo",
    "created_at",
    "updated_at",
  ];
}

function headersTarifasKm_() {
  return ["id_tarifa", "eur_km", "fecha_inicio", "fecha_fin", "activo", "created_at", "updated_at"];
}

function headersServiciosColaborador_() {
  return [
    "id_servicio",
    "id_colaborador",
    "email_colaborador",
    "nombre_colaborador",
    "id_proyecto",
    "proyecto_nombre",
    "fecha_servicio",
    "origen",
    "destino",
    "motivo_servicio",
    "centro_coste",
    "matricula",
    "km_inicio",
    "km_fin",
    "km_declarados",
    "km_base",
    "km_aprobados",
    "tarifa_eur_km_aplicada",
    "importe_km",
    "importe_gastos_aprobados",
    "importe_total",
    "ruta_aprobacion",
    "responsable_proyecto_email_snapshot",
    "estado",
    "motivo_rechazo_proyecto",
    "motivo_rechazo_admin",
    "resuelto_proyecto_por_email",
    "resuelto_proyecto_por_nombre",
    "fecha_aprobacion_proyecto",
    "resuelto_admin_por_email",
    "resuelto_admin_por_nombre",
    "fecha_aprobacion_admin",
    "pagado_por_email",
    "fecha_pago",
    "referencia_pago",
    "created_at",
    "updated_at",
  ];
}

function headersGastosServicio_() {
  return [
    "id_gasto",
    "id_servicio",
    "tipo_gasto",
    "fecha_gasto",
    "importe_declarado",
    "importe_aprobado",
    "descripcion",
    "url_adjunto",
    "estado",
    "motivo_rechazo",
    "created_at",
    "updated_at",
  ];
}

function headersViajesVehiculoPropio_() {
  return [
    "id_viaje",
    "usuario_email",
    "usuario_nombre",
    "matricula",
    "tipo_vehiculo",
    "fecha_viaje",
    "fecha_cierre",
    "origen",
    "destino",
    "km_inicial",
    "km_final",
    "km_recorridos",
    "id_proyecto",
    "proyecto_nombre",
    "work_package",
    "accion",
    "dni",
    "motivo",
    "tarifa_eur_km_aplicada",
    "importe_km",
    "importe_gastos",
    "importe_total",
    "estado",
    "created_at",
    "updated_at",
  ];
}

/** PROPIO | ORGANIZACION (flota GREFA). */
function normalizeTipoVehiculoViaje_(raw) {
  var v = safeStr_(raw).toUpperCase();
  if (v === "ORGANIZACION" || v === "FLOTA" || v === "GREFA" || v === "ORG") return "ORGANIZACION";
  if (v === "PROPIO" || v === "PARTICULAR" || v === "PRIVADO") return "PROPIO";
  return "";
}

/** Set de matrículas activas en FLOTA (mayúsculas, sin espacios). */
function getMatriculasFlotaSet_() {
  var out = {};
  var flota = [];
  try {
    flota = rowsToObjects_(getSheet(CFG.SHEETS.FLOTA || "FLOTA"));
  } catch (e) {
    try {
      flota = typeof readSheetObjects_ === "function" ? readSheetObjects_("FLOTA") : [];
    } catch (e2) {
      flota = [];
    }
  }
  for (var i = 0; i < flota.length; i++) {
    var row = flota[i] || {};
    var mat = safeStr_(row.matricula || row.Matricula || row["matrícula"] || "").toUpperCase().replace(/\s+/g, "");
    if (typeof normalizeMatricula_ === "function" && mat) {
      try {
        var n = normalizeMatricula_(mat);
        if (n) mat = safeStr_(n).toUpperCase().replace(/\s+/g, "");
      } catch (e3) {
        // ignore
      }
    }
    if (!mat) continue;
    var activo = safeStr_(row.activo).toUpperCase();
    if (activo === "NO" || activo === "FALSE" || activo === "0") continue;
    out[mat] = true;
  }
  return out;
}

/**
 * Resuelve tipo_vehiculo.
 * Si la matrícula está en FLOTA, gana ORGANIZACION aunque el payload diga PROPIO
 * (evita viajes de flota mal etiquetados).
 */
function resolveTipoVehiculoViaje_(payloadTipo, viajeTipo, matricula, flotaSet) {
  var mat = safeStr_(matricula).toUpperCase().replace(/\s+/g, "");
  var set = flotaSet || getMatriculasFlotaSet_();
  if (mat && set[mat]) return "ORGANIZACION";
  var fromPayload = normalizeTipoVehiculoViaje_(payloadTipo);
  if (fromPayload) return fromPayload;
  var fromViaje = normalizeTipoVehiculoViaje_(viajeTipo);
  if (fromViaje) return fromViaje;
  return "PROPIO";
}

function ensureProyectoModuleSheets_() {
  ensureSheetHeaders_("PROYECTOS", headersProyectos_());
  ensureSheetHeaders_("TARIFAS_KM", headersTarifasKm_());
  ensureSheetHeaders_("SERVICIOS_COLABORADOR", headersServiciosColaborador_());
  ensureSheetHeaders_("GASTOS_SERVICIO", headersGastosServicio_());
  ensureSheetHeaders_("VIAJES_VEHICULO_PROPIO", headersViajesVehiculoPropio_());
}

function ensureGastosViajePropioCols_() {
  ensureSheetHeaders_("GASTOS", ["id_viaje_propio"]);
}

function indexRowById_(rows, idField, idValue) {
  var id = safeStr_(idValue);
  for (var i = 0; i < rows.length; i++) {
    if (safeStr_(rows[i][idField]) === id) return rows[i];
  }
  return null;
}

function userEsAdmin_(email) {
  var rol = normalizeRolSegunUsuarios_(normalizeEmail_(email));
  return rol === "ADMINISTRACION" || rol === "GESTOR";
}

/** Actor autenticado (user_email) y titular del viaje (usuario_email). GESTOR/ADMIN pueden otro titular. */
function resolveViajeActorTitular_(payload) {
  payload = payload || {};
  var actor = normalizeEmail_(payload.user_email || "");
  if (!looksLikeEmail_(actor)) throw new Error("user_email invalido");
  var titular = normalizeEmail_(payload.usuario_email || actor);
  if (!looksLikeEmail_(titular)) throw new Error("usuario_email invalido");
  if (titular !== actor && !userEsAdmin_(actor)) {
    throw new Error("No autorizado para operar viajes a nombre de otro usuario");
  }
  return { actor: actor, titular: titular };
}

function userEsAdministracionOnly_(email) {
  return normalizeRolSegunUsuarios_(normalizeEmail_(email)) === "ADMINISTRACION";
}

function getAdminsEmails_() {
  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return safeStr_(h).replace(/^\uFEFF/, "");
  });
  var idxEmail = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  var idxActivo = headerIndexCI_(headers, "activo");
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var em = normalizeEmail_(idxEmail >= 0 ? all[i][idxEmail] : all[i][0]);
    var rol = safeStr_(idxRol >= 0 ? all[i][idxRol] : all[i][2]).toUpperCase();
    var act = idxActivo >= 0 ? normalizeSiNo_(all[i][idxActivo], true) : "SI";
    if (act !== "SI") continue;
    if (rol !== "ADMINISTRACION") continue;
    if (!looksLikeEmail_(em)) continue;
    if (out.indexOf(em) < 0) out.push(em);
  }
  return out;
}

function getProyectoById_(idProyecto) {
  var rows = rowsToObjects_(getSheet("PROYECTOS"));
  return indexRowById_(rows, "id_proyecto", idProyecto);
}

function getTarifaVigente_(fechaServicio) {
  var rows = rowsToObjects_(getSheet("TARIFAS_KM"));
  var ref = parseFechaHoraDesdeFila_(fechaServicio, "");
  if (!ref) throw new Error("fecha_servicio invalida");
  var refTs = ref.getTime();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizeSiNo_(r.activo, true) !== "SI") continue;
    var fi = parseFechaHoraDesdeFila_(r.fecha_inicio, "");
    var ff = parseFechaHoraDesdeFila_(r.fecha_fin, "");
    if (!fi || !ff) continue;
    if (refTs >= fi.getTime() && refTs <= ff.getTime()) {
      var eur = numOrNull_(r.eur_km);
      if (eur == null || eur < 0) throw new Error("Tarifa vigente con eur_km invalido");
      return { id_tarifa: r.id_tarifa, eur_km: eur, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin };
    }
  }
  throw new Error("No existe TARIFA_KM activa para la fecha del servicio");
}

function calcularKmBase_(serv) {
  var kmIni = numOrNull_(serv.km_inicio);
  var kmFin = numOrNull_(serv.km_fin);
  if (kmIni != null && kmFin != null) {
    if (kmFin < kmIni) throw new Error("km_fin no puede ser menor que km_inicio");
    return kmFin - kmIni;
  }
  var kmDec = numOrNull_(serv.km_declarados);
  if (kmDec == null || kmDec < 0) throw new Error("km_declarados invalido");
  return kmDec;
}

function getSumaGastosAprobadosServicio_(idServicio) {
  var rows = rowsToObjects_(getSheet("GASTOS_SERVICIO"));
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    if (safeStr_(rows[i].id_servicio) !== safeStr_(idServicio)) continue;
    var est = safeStr_(rows[i].estado).toUpperCase();
    var imp = numOrNull_(rows[i].importe_aprobado);
    if (est === "APROBADO" && imp != null && imp > 0) total += imp;
  }
  return total;
}

function recalcularImportesServicio_(servicio) {
  var kmAprob = numOrNull_(servicio.km_aprobados);
  var kmBase = numOrNull_(servicio.km_base);
  var tarifa = numOrNull_(servicio.tarifa_eur_km_aplicada);
  if (kmAprob == null) kmAprob = kmBase == null ? 0 : kmBase;
  if (kmBase != null && kmAprob > kmBase) throw new Error("km_aprobados no puede ser mayor que km_base");
  if (kmAprob < 0) throw new Error("km_aprobados invalido");
  if (tarifa == null || tarifa < 0) tarifa = 0;
  var importeKm = kmAprob * tarifa;
  var gastos = getSumaGastosAprobadosServicio_(servicio.id_servicio);
  return {
    km_aprobados: kmAprob,
    importe_km: Number(importeKm.toFixed(2)),
    importe_gastos_aprobados: Number(gastos.toFixed(2)),
    importe_total: Number((importeKm + gastos).toFixed(2)),
  };
}

function updateRowByHeaders_(sh, rowNum, changes) {
  var headers = getHeaders_(sh);
  for (var key in changes) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    var idx = headers.indexOf(key);
    if (idx < 0) continue;
    var raw = changes[key];
    var toWrite =
      typeof cellValueForHeaderWrite_ === "function" ? cellValueForHeaderWrite_(key, raw) : raw;
    sh.getRange(rowNum, idx + 1).setValue(toWrite);
  }
}

function enviarCorreoCambioEstadoServicioColab_(servicio, nuevoEstado, motivo) {
  var to = normalizeEmail_(servicio.email_colaborador || "");
  if (!looksLikeEmail_(to)) return { sent: false, reason: "sin_email_colaborador" };
  var subj = "[FLOTA] Servicio colaborador " + safeStr_(servicio.id_servicio) + " · " + nuevoEstado;
  var body =
    "<p><b>Estado actualizado:</b> " +
    nuevoEstado +
    "</p><p><b>Proyecto:</b> " +
    escapeHtmlText_(safeStr_(servicio.proyecto_nombre)) +
    "<br/><b>Fecha servicio:</b> " +
    escapeHtmlText_(safeStr_(servicio.fecha_servicio)) +
    "<br/><b>Matrícula:</b> " +
    escapeHtmlText_(safeStr_(servicio.matricula)) +
    "<br/><b>Importe total:</b> " +
    String(servicio.importe_total || 0) +
    " €</p>";
  if (motivo) body += "<p><b>Motivo:</b> " + escapeHtmlText_(motivo) + "</p>";
  return enviarCorreoHtml_([to], subj, body);
}

function enviarCorreoAdminServicioColab_(servicio, contexto) {
  var admins = getAdminsEmails_();
  if (!admins.length) return { sent: false, reason: "sin_admins" };
  var subj = "[FLOTA] Servicio colaborador pendiente administración · " + safeStr_(servicio.id_servicio);
  var body =
    "<p><b>Contexto:</b> " +
    escapeHtmlText_(contexto || "") +
    "</p><p><b>Proyecto:</b> " +
    escapeHtmlText_(safeStr_(servicio.proyecto_nombre)) +
    "<br/><b>Colaborador:</b> " +
    escapeHtmlText_(safeStr_(servicio.nombre_colaborador || servicio.email_colaborador)) +
    "<br/><b>Fecha servicio:</b> " +
    escapeHtmlText_(safeStr_(servicio.fecha_servicio)) +
    "</p>";
  return enviarCorreoHtml_(admins, subj, body);
}

function enviarCorreoResponsableProyecto_(servicio, responsableEmail) {
  var to = normalizeEmail_(responsableEmail);
  if (!looksLikeEmail_(to)) return { sent: false, reason: "sin_responsable" };
  var subj = "[FLOTA] Servicio colaborador ENVIADA · " + safeStr_(servicio.id_servicio);
  var body =
    "<p>Hay un servicio de colaborador <b>ENVIADA</b> pendiente de tu revisión.</p>" +
    "<p><b>Proyecto:</b> " +
    escapeHtmlText_(safeStr_(servicio.proyecto_nombre)) +
    "<br/><b>Colaborador:</b> " +
    escapeHtmlText_(safeStr_(servicio.nombre_colaborador || servicio.email_colaborador)) +
    "<br/><b>Fecha:</b> " +
    escapeHtmlText_(safeStr_(servicio.fecha_servicio)) +
    "</p>";
  return enviarCorreoHtml_([to], subj, body);
}

function validarCamposEnviarServicio_(servicio) {
  if (!safeStr_(servicio.id_proyecto)) throw new Error("No se puede ENVIAR sin id_proyecto");
  if (!safeStr_(servicio.fecha_servicio)) throw new Error("No se puede ENVIAR sin fecha_servicio");
  if (!safeStr_(servicio.motivo_servicio)) throw new Error("No se puede ENVIAR sin motivo_servicio");
  if (!safeStr_(servicio.matricula)) throw new Error("No se puede ENVIAR sin matricula");
}

function apiProyectoList(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var onlyActivos = normalizeSiNo_(payload.solo_activos == null ? "SI" : payload.solo_activos, true) === "SI";
  var rows = rowsToObjects_(getSheet("PROYECTOS"));
  return rows.filter(function (r) {
    return !onlyActivos || normalizeSiNo_(r.activo, true) === "SI";
  });
}

function apiProyectoListColumnaB(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var onlyActivos = normalizeSiNo_(payload.solo_activos == null ? "SI" : payload.solo_activos, true) === "SI";
  var sh = getSheet("PROYECTOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return safeStr_(h).replace(/^\uFEFF/, "");
  });
  var idxActivo = headerIndexCI_(headers, "activo");
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var id = safeStr_(all[i][0]);
    var nombre = safeStr_(all[i][1]);
    if (!nombre) continue;
    var activo = idxActivo >= 0 ? normalizeSiNo_(all[i][idxActivo], true) : "SI";
    if (onlyActivos && activo !== "SI") continue;
    out.push({
      id_proyecto: id || nombre,
      nombre_proyecto: nombre,
      activo: activo,
    });
  }
  return out;
}

function apiProyectoGet(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var p = getProyectoById_(payload.id_proyecto || "");
  if (!p) throw new Error("Proyecto no encontrado");
  return p;
}

function apiProyectoGuardar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var actor = normalizeEmail_(payload.user_email || payload.actualizado_por_email || "");
  if (!userEsAdmin_(actor)) throw new Error("Solo GESTOR/ADMINISTRACION puede guardar proyectos");
  var id = safeStr_(payload.id_proyecto) || genId_("PROY");
  var now = nowIso_();
  var sh = getSheet("PROYECTOS");
  var rows = rowsToObjects_(sh);
  var existing = indexRowById_(rows, "id_proyecto", id);
  var rowObj = {
    id_proyecto: id,
    nombre_proyecto: safeStr_(payload.nombre_proyecto),
    departamento: safeStr_(payload.departamento),
    responsable_email: normalizeEmail_(payload.responsable_email || ""),
    responsable_nombre: safeStr_(payload.responsable_nombre),
    activo: normalizeSiNo_(payload.activo, true),
    updated_at: now,
  };
  if (!rowObj.nombre_proyecto) throw new Error("nombre_proyecto es obligatorio");
  if (existing) {
    updateRowByHeaders_(sh, existing._row, rowObj);
  } else {
    rowObj.created_at = now;
    appendRowByHeaders_(sh, rowObj);
  }
  return { id_proyecto: id, created: !existing };
}

function apiProyectoEliminar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var actor = normalizeEmail_(payload.user_email || payload.actualizado_por_email || "");
  if (!userEsAdmin_(actor)) throw new Error("Solo GESTOR/ADMINISTRACION puede eliminar proyectos");
  var id = safeStr_(payload.id_proyecto);
  if (!id) throw new Error("Falta id_proyecto");
  var sh = getSheet("PROYECTOS");
  var rows = rowsToObjects_(sh);
  var p = indexRowById_(rows, "id_proyecto", id);
  if (!p) throw new Error("Proyecto no encontrado");
  updateRowByHeaders_(sh, p._row, { activo: "NO", updated_at: nowIso_() });
  return { id_proyecto: id, activo: "NO" };
}

function apiTarifaKmGetVigente(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var fecha = safeStr_(payload.fecha_servicio || payload.fecha || normalizeDateDMYCell_(new Date()));
  return getTarifaVigente_(fecha);
}

/** Serializa filas de viaje: fechas siempre dd/MM/yyyy (nunca Date/serial crudo). */
function serializeViajePropioRow_(r) {
  var out = {};
  var keys = Object.keys(r || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "_row") continue;
    var v = r[k];
    if (k === "fecha_viaje" || k.indexOf("fecha_") === 0) {
      out[k] = normalizeDateDMYCell_(v);
    } else if (v instanceof Date) {
      out[k] = formatDateTimeISO_(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function viajeFechaSortKey_(value) {
  var d = parseFechaFlexible_(value);
  return d ? d.getTime() : 0;
}

/** Más reciente primero: fecha inicio, luego fecha cierre. */
function compareViajesPorFechasDesc_(a, b) {
  var fa = viajeFechaSortKey_(a.fecha_viaje);
  var fb = viajeFechaSortKey_(b.fecha_viaje);
  if (fb !== fa) return fb - fa;
  var ca = viajeFechaSortKey_(a.fecha_cierre);
  var cb = viajeFechaSortKey_(b.fecha_cierre);
  if (cb !== ca) return cb - ca;
  return String(b.id_viaje || "").localeCompare(String(a.id_viaje || ""));
}

function apiViajeVehiculoPropioCrear(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  ensureGastosViajePropioCols_();
  var who = resolveViajeActorTitular_(payload);
  var actor = who.actor;
  var titular = who.titular;
  var id = genId_("VVP");
  var now = nowIso_();
  var kmInicial = numOrNull_(payload.km_inicial);
  if (kmInicial == null || kmInicial < 0) throw new Error("km_inicial invalido");
  var idProyecto = safeStr_(payload.id_proyecto);
  var proyecto = idProyecto ? getProyectoById_(idProyecto) : null;
  var nombreProyecto = safeStr_(payload.proyecto_nombre || (proyecto ? proyecto.nombre_proyecto : ""));
  // Siempre dd/MM/yyyy: evita que Sheets interprete "2026" o ISO mal como serial Excel (~1905).
  var fechaViaje = normalizeDateDMYCell_(payload.fecha_viaje || new Date());
  if (!fechaViaje || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViaje)) {
    throw new Error("fecha_viaje invalida (usa dd/MM/yyyy o yyyy-MM-dd)");
  }
  var matriculaNueva = safeStr_(payload.matricula).toUpperCase();
  var tipoVehiculo = resolveTipoVehiculoViaje_(
    payload.tipo_vehiculo,
    "",
    matriculaNueva,
    null
  );
  var fechaCierreRaw =
    payload.fecha_cierre != null && String(payload.fecha_cierre).trim() !== ""
      ? payload.fecha_cierre
      : payload.fecha_fin != null && String(payload.fecha_fin).trim() !== ""
        ? payload.fecha_fin
        : "";
  var fechaCierre = fechaCierreRaw ? normalizeDateDMYCell_(fechaCierreRaw) : "";
  var row = {
    id_viaje: id,
    usuario_email: titular,
    usuario_nombre: safeStr_(payload.usuario_nombre || nombreUsuarioDesdeEmail_(titular)),
    matricula: matriculaNueva,
    tipo_vehiculo: tipoVehiculo,
    fecha_viaje: fechaViaje,
    origen: safeStr_(payload.origen),
    destino: safeStr_(payload.destino),
    km_inicial: kmInicial,
    km_final: "",
    km_recorridos: "",
    id_proyecto: idProyecto,
    proyecto_nombre: nombreProyecto,
    work_package: safeStr_(payload.work_package),
    accion: safeStr_(payload.accion || payload.accion_proyecto),
    dni: safeStr_(payload.dni).toUpperCase(),
    motivo: safeStr_(payload.motivo),
    fecha_cierre: fechaCierre,
    tarifa_eur_km_aplicada: "",
    importe_km: 0,
    importe_gastos: 0,
    importe_total: 0,
    estado: "ABIERTO",
    created_at: now,
    updated_at: now,
    excel_import: safeStr_(payload.excel_import).toUpperCase() === "SI" ? "SI" : "",
    excel_source_file_id: safeStr_(payload.excel_source_file_id),
  };
  if (!row.fecha_viaje) throw new Error("fecha_viaje obligatoria");
  if (!row.origen) throw new Error("origen obligatorio");
  if (!row.destino) throw new Error("destino obligatorio");
  if (!row.id_proyecto) throw new Error("id_proyecto obligatorio");
  // work_package / accion / dni: opcionales en el viaje; obligatorios al confeccionar la hoja de gastos.
  appendRowByHeaders_(getSheet("VIAJES_VEHICULO_PROPIO"), row);
  return { id_viaje: id, estado: row.estado, fecha_viaje: row.fecha_viaje };
}

function apiViajeVehiculoPropioActualizar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_viaje);
  if (!id) throw new Error("Falta id_viaje");
  var actor = normalizeEmail_(payload.user_email || payload.usuario_email || "");
  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  var viaje = indexRowById_(rowsToObjects_(sh), "id_viaje", id);
  if (!viaje) throw new Error("Viaje no encontrado");
  var owner = normalizeEmail_(viaje.usuario_email);
  if (actor !== owner && !userEsAdmin_(actor)) throw new Error("No autorizado");
  var estado = safeStr_(viaje.estado).toUpperCase();

  // Viaje cerrado: se pueden editar todos los datos del viaje (sigue CERRADO).
  if (estado === "CERRADO") {
    var updatesClosed = { updated_at: nowIso_() };
    var idProyectoC = safeStr_(
      payload.id_proyecto != null ? payload.id_proyecto : viaje.id_proyecto
    );
    var proyectoC = idProyectoC ? getProyectoById_(idProyectoC) : null;
    var fechaViajeRawC =
      payload.fecha_viaje != null ? payload.fecha_viaje : viaje.fecha_viaje;
    var fechaViajeC = normalizeDateDMYCell_(fechaViajeRawC);
    if (!fechaViajeC || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViajeC)) {
      throw new Error("fecha_viaje invalida (usa dd/MM/yyyy o yyyy-MM-dd)");
    }
    updatesClosed.matricula = safeStr_(
      payload.matricula != null ? payload.matricula : viaje.matricula
    ).toUpperCase();
    updatesClosed.tipo_vehiculo = resolveTipoVehiculoViaje_(
      payload.tipo_vehiculo,
      viaje.tipo_vehiculo,
      updatesClosed.matricula,
      null
    );
    updatesClosed.fecha_viaje = fechaViajeC;
    updatesClosed.origen = safeStr_(payload.origen != null ? payload.origen : viaje.origen);
    updatesClosed.destino = safeStr_(payload.destino != null ? payload.destino : viaje.destino);
    updatesClosed.id_proyecto = idProyectoC;
    updatesClosed.proyecto_nombre = safeStr_(
      payload.proyecto_nombre ||
        (proyectoC ? proyectoC.nombre_proyecto : viaje.proyecto_nombre)
    );
    updatesClosed.work_package = safeStr_(
      payload.work_package != null ? payload.work_package : viaje.work_package
    );
    updatesClosed.accion = safeStr_(
      payload.accion != null
        ? payload.accion
        : payload.accion_proyecto != null
          ? payload.accion_proyecto
          : viaje.accion
    );
    updatesClosed.dni = safeStr_(payload.dni != null ? payload.dni : viaje.dni).toUpperCase();
    updatesClosed.motivo = safeStr_(payload.motivo != null ? payload.motivo : viaje.motivo);

    var kmIniC = numOrNull_(
      payload.km_inicial != null && String(payload.km_inicial) !== ""
        ? payload.km_inicial
        : viaje.km_inicial
    );
    if (kmIniC == null || kmIniC < 0) throw new Error("km_inicial invalido");
    updatesClosed.km_inicial = kmIniC;

    var kmFinC = numOrNull_(
      payload.km_final != null && String(payload.km_final) !== ""
        ? payload.km_final
        : viaje.km_final
    );
    if (kmFinC == null || kmFinC < 0) throw new Error("km_final invalido");
    if (kmFinC < kmIniC) throw new Error("km_final no puede ser menor que km_inicial");
    updatesClosed.km_final = kmFinC;
    updatesClosed.km_recorridos = kmFinC - kmIniC;

    var fechaCierreRawC =
      payload.fecha_cierre != null && String(payload.fecha_cierre).trim() !== ""
        ? payload.fecha_cierre
        : viaje.fecha_cierre;
    var fechaCierreUpd = normalizeDateDMYCell_(fechaCierreRawC);
    if (!fechaCierreUpd || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierreUpd)) {
      throw new Error("fecha_cierre invalida (usa dd/MM/yyyy)");
    }
    updatesClosed.fecha_cierre = fechaCierreUpd;

    var importeGastosC = getSumaGastosViajePropio_(id);
    updatesClosed.importe_gastos = importeGastosC;
    updatesClosed.importe_km = numOrNull_(viaje.importe_km) != null ? numOrNull_(viaje.importe_km) : 0;
    updatesClosed.importe_total = Number(
      ((updatesClosed.importe_km || 0) + importeGastosC).toFixed(2)
    );
    updateRowByHeaders_(sh, viaje._row, updatesClosed);
    return {
      id_viaje: id,
      estado: "CERRADO",
      fecha_viaje: updatesClosed.fecha_viaje,
      km_inicial: updatesClosed.km_inicial,
      km_final: updatesClosed.km_final,
      km_recorridos: updatesClosed.km_recorridos,
      fecha_cierre: updatesClosed.fecha_cierre,
      importe_gastos: updatesClosed.importe_gastos,
      importe_total: updatesClosed.importe_total,
    };
  }

  var idProyecto = safeStr_(payload.id_proyecto || viaje.id_proyecto);
  var proyecto = idProyecto ? getProyectoById_(idProyecto) : null;
  var fechaViajeRaw = payload.fecha_viaje != null ? payload.fecha_viaje : viaje.fecha_viaje;
  var fechaViaje = normalizeDateDMYCell_(fechaViajeRaw);
  if (!fechaViaje || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViaje)) {
    throw new Error("fecha_viaje invalida (usa dd/MM/yyyy o yyyy-MM-dd)");
  }
  var updates = {
    matricula: safeStr_(payload.matricula != null ? payload.matricula : viaje.matricula).toUpperCase(),
    tipo_vehiculo: resolveTipoVehiculoViaje_(
      payload.tipo_vehiculo,
      viaje.tipo_vehiculo,
      payload.matricula != null ? payload.matricula : viaje.matricula,
      null
    ),
    fecha_viaje: fechaViaje,
    origen: safeStr_(payload.origen != null ? payload.origen : viaje.origen),
    destino: safeStr_(payload.destino != null ? payload.destino : viaje.destino),
    id_proyecto: idProyecto,
    proyecto_nombre: safeStr_(payload.proyecto_nombre || (proyecto ? proyecto.nombre_proyecto : viaje.proyecto_nombre)),
    work_package: safeStr_(
      payload.work_package != null ? payload.work_package : viaje.work_package
    ),
    accion: safeStr_(
      payload.accion != null
        ? payload.accion
        : payload.accion_proyecto != null
          ? payload.accion_proyecto
          : viaje.accion
    ),
    dni: safeStr_(payload.dni != null ? payload.dni : viaje.dni).toUpperCase(),
    motivo: safeStr_(payload.motivo != null ? payload.motivo : viaje.motivo),
    updated_at: nowIso_(),
  };
  updateRowByHeaders_(sh, viaje._row, updates);
  return { id_viaje: id, estado: safeStr_(viaje.estado).toUpperCase(), fecha_viaje: fechaViaje };
}

function getSumaGastosViajePropio_(idViaje) {
  ensureGastosViajePropioCols_();
  var rows = rowsToObjects_(getSheet("GASTOS"));
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    if (safeStr_(rows[i].id_viaje_propio) !== safeStr_(idViaje)) continue;
    var n = numOrNull_(rows[i].coste_total);
    if (n == null) n = numOrNull_(rows[i].importe);
    if (n != null && n > 0) total += n;
  }
  return Number(total.toFixed(2));
}

function apiViajeVehiculoPropioCerrar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  ensureGastosViajePropioCols_();
  var id = safeStr_(payload.id_viaje);
  if (!id) throw new Error("Falta id_viaje");
  var actor = normalizeEmail_(payload.user_email || payload.usuario_email || "");
  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  var viaje = indexRowById_(rowsToObjects_(sh), "id_viaje", id);
  if (!viaje) throw new Error("Viaje no encontrado");
  var owner = normalizeEmail_(viaje.usuario_email);
  if (actor !== owner && !userEsAdmin_(actor)) throw new Error("No autorizado");
  var estado = safeStr_(viaje.estado).toUpperCase();
  if (estado === "CERRADO") throw new Error("Viaje ya cerrado");

  // Al cerrar se pueden revisar/corregir todos los datos del viaje.
  var idProyecto = safeStr_(
    payload.id_proyecto != null && String(payload.id_proyecto).trim() !== ""
      ? payload.id_proyecto
      : viaje.id_proyecto
  );
  var proyecto = idProyecto ? getProyectoById_(idProyecto) : null;
  var fechaViajeRaw =
    payload.fecha_viaje != null && String(payload.fecha_viaje).trim() !== ""
      ? payload.fecha_viaje
      : viaje.fecha_viaje;
  var fechaViaje = normalizeDateDMYCell_(fechaViajeRaw);
  if (!fechaViaje || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViaje)) {
    throw new Error("fecha_viaje invalida (usa dd/MM/yyyy o yyyy-MM-dd)");
  }

  var kmIni = numOrNull_(
    payload.km_inicial != null && String(payload.km_inicial) !== ""
      ? payload.km_inicial
      : viaje.km_inicial
  );
  var kmFin = numOrNull_(payload.km_final);
  if (kmIni == null || kmIni < 0) throw new Error("km_inicial invalido");
  if (kmFin == null || kmFin < 0) throw new Error("km_final invalido");
  if (kmFin < kmIni) throw new Error("km_final no puede ser menor que km_inicial");

  // fecha_cierre = Fecha Fin en la hoja de gasto.
  var fechaCierre = normalizeDateDMYCell_(payload.fecha_cierre || new Date());
  if (!fechaCierre || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierre)) {
    throw new Error("fecha_cierre invalida (usa dd/MM/yyyy)");
  }
  var kms = kmFin - kmIni;
  // TARIFA_KM solo aplica a gastos KILOMETRAJE_COLABORADOR, no al cierre de viaje propio.
  var importeKm = 0;
  var importeGastos = getSumaGastosViajePropio_(id);
  var total = Number((importeKm + importeGastos).toFixed(2));
  var matriculaCierre = safeStr_(
    payload.matricula != null && String(payload.matricula).trim() !== ""
      ? payload.matricula
      : viaje.matricula
  ).toUpperCase();
  updateRowByHeaders_(sh, viaje._row, {
    matricula: matriculaCierre,
    tipo_vehiculo: resolveTipoVehiculoViaje_(
      payload.tipo_vehiculo,
      viaje.tipo_vehiculo,
      matriculaCierre,
      null
    ),
    fecha_viaje: fechaViaje,
    origen: safeStr_(payload.origen != null ? payload.origen : viaje.origen),
    destino: safeStr_(payload.destino != null ? payload.destino : viaje.destino),
    km_inicial: kmIni,
    km_final: kmFin,
    km_recorridos: kms,
    fecha_cierre: fechaCierre,
    id_proyecto: idProyecto,
    proyecto_nombre: safeStr_(
      payload.proyecto_nombre ||
        (proyecto ? proyecto.nombre_proyecto : viaje.proyecto_nombre)
    ),
    work_package: safeStr_(
      payload.work_package != null ? payload.work_package : viaje.work_package
    ),
    accion: safeStr_(
      payload.accion != null
        ? payload.accion
        : payload.accion_proyecto != null
          ? payload.accion_proyecto
          : viaje.accion
    ),
    dni: safeStr_(payload.dni != null ? payload.dni : viaje.dni).toUpperCase(),
    motivo: safeStr_(payload.motivo != null ? payload.motivo : viaje.motivo),
    tarifa_eur_km_aplicada: "",
    importe_km: importeKm,
    importe_gastos: importeGastos,
    importe_total: total,
    estado: "CERRADO",
    updated_at: nowIso_(),
  });
  return {
    id_viaje: id,
    estado: "CERRADO",
    fecha_viaje: fechaViaje,
    km_inicial: kmIni,
    km_final: kmFin,
    km_recorridos: kms,
    fecha_cierre: fechaCierre,
    tarifa_eur_km_aplicada: "",
    importe_km: importeKm,
    importe_gastos: importeGastos,
    importe_total: total,
  };
}

/** Reabre un viaje CERRADO para poder añadir más gastos y volver a cerrarlo. */
function apiViajeVehiculoPropioReabrir(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  ensureGastosViajePropioCols_();
  var id = safeStr_(payload.id_viaje);
  if (!id) throw new Error("Falta id_viaje");
  var actor = normalizeEmail_(payload.user_email || payload.usuario_email || "");
  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  var viaje = indexRowById_(rowsToObjects_(sh), "id_viaje", id);
  if (!viaje) throw new Error("Viaje no encontrado");
  var owner = normalizeEmail_(viaje.usuario_email);
  if (actor !== owner && !userEsAdmin_(actor)) throw new Error("No autorizado");
  var estado = safeStr_(viaje.estado).toUpperCase();
  if (estado !== "CERRADO") throw new Error("Solo se pueden reabrir viajes CERRADOS");
  var importeGastos = getSumaGastosViajePropio_(id);
  updateRowByHeaders_(sh, viaje._row, {
    estado: "ABIERTO",
    km_final: "",
    km_recorridos: "",
    fecha_cierre: "",
    importe_km: 0,
    importe_gastos: importeGastos,
    importe_total: importeGastos,
    updated_at: nowIso_(),
  });
  return {
    id_viaje: id,
    estado: "ABIERTO",
    importe_gastos: importeGastos,
    importe_total: importeGastos,
  };
}

/** Elimina un viaje solo si no tiene gastos asignados (id_viaje_propio). */
function apiViajeVehiculoPropioEliminar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  ensureGastosViajePropioCols_();
  var id = safeStr_(payload.id_viaje);
  if (!id) throw new Error("Falta id_viaje");
  var actor = normalizeEmail_(payload.user_email || payload.usuario_email || "");
  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  var viaje = indexRowById_(rowsToObjects_(sh), "id_viaje", id);
  if (!viaje) throw new Error("Viaje no encontrado");
  var owner = normalizeEmail_(viaje.usuario_email);
  var rol = normalizeRolSegunUsuarios_(actor);
  if (!(rol === "GESTOR" || rol === "ADMINISTRACION" || owner === actor)) {
    throw new Error("No autorizado");
  }
  var gastos = rowsToObjects_(getSheet("GASTOS")).filter(function (g) {
    return safeStr_(g.id_viaje_propio) === id;
  });
  if (gastos.length) {
    throw new Error(
      "No se puede eliminar: el viaje tiene " +
        gastos.length +
        " gasto(s) asignado(s). Primero desasigna o elimina esos gastos."
    );
  }
  sh.deleteRow(viaje._row);
  return { id_viaje: id, eliminado: true };
}

function apiViajeVehiculoPropioList(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var actor = normalizeEmail_(payload.user_email || "");
  var rol = normalizeRolSegunUsuarios_(actor);
  var titularFilter = normalizeEmail_(payload.usuario_email || payload.titular_email || "");
  var estadoFilter = safeStr_(payload.estado).toUpperCase();
  return rowsToObjects_(getSheet("VIAJES_VEHICULO_PROPIO"))
    .filter(function (r) {
      var est = safeStr_(r.estado).toUpperCase();
      if (estadoFilter && est !== estadoFilter) return false;
      if (titularFilter) {
        if (rol === "GESTOR" || rol === "ADMINISTRACION") {
          // Filtrar por otro titular; si coincide con el actor, mostrar todos.
          if (titularFilter !== actor) {
            return normalizeEmail_(r.usuario_email) === titularFilter;
          }
        } else {
          return normalizeEmail_(r.usuario_email) === actor;
        }
      }
      if (rol === "GESTOR" || rol === "ADMINISTRACION") return true;
      return normalizeEmail_(r.usuario_email) === actor;
    })
    .map(serializeViajePropioRow_)
    .sort(compareViajesPorFechasDesc_);
}

function apiViajeVehiculoPropioDetalle(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  ensureGastosViajePropioCols_();
  var actor = normalizeEmail_(payload.user_email || "");
  var viaje = indexRowById_(rowsToObjects_(getSheet("VIAJES_VEHICULO_PROPIO")), "id_viaje", payload.id_viaje || "");
  if (!viaje) throw new Error("Viaje no encontrado");
  var rol = normalizeRolSegunUsuarios_(actor);
  var owner = normalizeEmail_(viaje.usuario_email);
  if (!(rol === "GESTOR" || rol === "ADMINISTRACION" || owner === actor)) throw new Error("No autorizado");
  var gastos = rowsToObjects_(getSheet("GASTOS")).filter(function (g) {
    return safeStr_(g.id_viaje_propio) === safeStr_(viaje.id_viaje);
  });
  return { viaje: serializeViajePropioRow_(viaje), gastos: gastos };
}

function apiServicioColaboradorCrear(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var now = nowIso_();
  var id = genId_("SVC");
  var estado = ESTADOS_SERVICIO_COLAB_.BORRADOR;
  var kmBase = calcularKmBase_(payload);
  var row = {
    id_servicio: id,
    id_colaborador: safeStr_(payload.id_colaborador),
    email_colaborador: normalizeEmail_(payload.email_colaborador || payload.user_email || ""),
    nombre_colaborador: safeStr_(payload.nombre_colaborador),
    id_proyecto: safeStr_(payload.id_proyecto),
    proyecto_nombre: safeStr_(payload.proyecto_nombre),
    fecha_servicio: safeStr_(payload.fecha_servicio),
    origen: safeStr_(payload.origen),
    destino: safeStr_(payload.destino),
    motivo_servicio: safeStr_(payload.motivo_servicio),
    centro_coste: safeStr_(payload.centro_coste),
    matricula: safeStr_(payload.matricula).toUpperCase(),
    km_inicio: numOrNull_(payload.km_inicio),
    km_fin: numOrNull_(payload.km_fin),
    km_declarados: numOrNull_(payload.km_declarados),
    km_base: kmBase,
    km_aprobados: numOrNull_(payload.km_aprobados),
    tarifa_eur_km_aplicada: "",
    importe_km: 0,
    importe_gastos_aprobados: 0,
    importe_total: 0,
    ruta_aprobacion: "",
    responsable_proyecto_email_snapshot: "",
    estado: estado,
    motivo_rechazo_proyecto: "",
    motivo_rechazo_admin: "",
    created_at: now,
    updated_at: now,
  };
  if (!looksLikeEmail_(row.email_colaborador)) throw new Error("email_colaborador invalido");
  appendRowByHeaders_(getSheet("SERVICIOS_COLABORADOR"), row);
  return { id_servicio: id, estado: estado };
}

function apiServicioColaboradorActualizar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_servicio);
  if (!id) throw new Error("Falta id_servicio");
  var actor = normalizeEmail_(payload.user_email || payload.email_colaborador || "");
  var sh = getSheet("SERVICIOS_COLABORADOR");
  var rows = rowsToObjects_(sh);
  var svc = indexRowById_(rows, "id_servicio", id);
  if (!svc) throw new Error("Servicio no encontrado");
  var estado = safeStr_(svc.estado).toUpperCase();
  var isOwner = normalizeEmail_(svc.email_colaborador) === actor;
  var editableByOwner = estado === ESTADOS_SERVICIO_COLAB_.BORRADOR || estado.indexOf("RECHAZADA_") === 0;
  if (!(isOwner && editableByOwner) && !userEsAdmin_(actor)) {
    throw new Error("Solo colaborador en BORRADOR/RECHAZADA (o admin) puede editar");
  }
  if (estado === ESTADOS_SERVICIO_COLAB_.PAGADA) throw new Error("Servicio PAGADA bloqueado");
  var merged = Object.assign({}, svc, payload);
  var kmBase = calcularKmBase_(merged);
  var changes = {
    id_proyecto: safeStr_(payload.id_proyecto || svc.id_proyecto),
    proyecto_nombre: safeStr_(payload.proyecto_nombre || svc.proyecto_nombre),
    fecha_servicio: safeStr_(payload.fecha_servicio || svc.fecha_servicio),
    origen: safeStr_(payload.origen || svc.origen),
    destino: safeStr_(payload.destino || svc.destino),
    motivo_servicio: safeStr_(payload.motivo_servicio || svc.motivo_servicio),
    centro_coste: safeStr_(payload.centro_coste || svc.centro_coste),
    matricula: safeStr_(payload.matricula || svc.matricula).toUpperCase(),
    km_inicio: numOrNull_(merged.km_inicio),
    km_fin: numOrNull_(merged.km_fin),
    km_declarados: numOrNull_(merged.km_declarados),
    km_base: kmBase,
    updated_at: nowIso_(),
  };
  updateRowByHeaders_(sh, svc._row, changes);
  return { id_servicio: id, estado: estado };
}

function apiServicioColaboradorEnviar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_servicio);
  if (!id) throw new Error("Falta id_servicio");
  var actor = normalizeEmail_(payload.user_email || payload.email_colaborador || "");
  var sh = getSheet("SERVICIOS_COLABORADOR");
  var rows = rowsToObjects_(sh);
  var svc = indexRowById_(rows, "id_servicio", id);
  if (!svc) throw new Error("Servicio no encontrado");
  if (safeStr_(svc.estado).toUpperCase() !== ESTADOS_SERVICIO_COLAB_.BORRADOR) {
    throw new Error("Solo se puede enviar desde BORRADOR");
  }
  if (normalizeEmail_(svc.email_colaborador) !== actor && !userEsAdmin_(actor)) {
    throw new Error("Solo el colaborador propietario puede enviar");
  }
  validarCamposEnviarServicio_(svc);
  var p = getProyectoById_(svc.id_proyecto);
  if (!p || normalizeSiNo_(p.activo, true) !== "SI") throw new Error("Proyecto no encontrado o inactivo");
  var tarifa = getTarifaVigente_(svc.fecha_servicio);
  var responsable = normalizeEmail_(p.responsable_email || "");
  var ruta = looksLikeEmail_(responsable) ? "PROYECTO_ADMIN" : "DIRECTO_ADMIN";
  var recalc = recalcularImportesServicio_({
    id_servicio: id,
    km_base: svc.km_base,
    km_aprobados: svc.km_base,
    tarifa_eur_km_aplicada: tarifa.eur_km,
  });
  updateRowByHeaders_(sh, svc._row, {
    proyecto_nombre: safeStr_(p.nombre_proyecto),
    ruta_aprobacion: ruta,
    responsable_proyecto_email_snapshot: responsable,
    tarifa_eur_km_aplicada: tarifa.eur_km,
    km_aprobados: recalc.km_aprobados,
    importe_km: recalc.importe_km,
    importe_gastos_aprobados: recalc.importe_gastos_aprobados,
    importe_total: recalc.importe_total,
    estado: ESTADOS_SERVICIO_COLAB_.ENVIADA,
    updated_at: nowIso_(),
  });
  svc.proyecto_nombre = p.nombre_proyecto;
  svc.importe_total = recalc.importe_total;
  if (ruta === "PROYECTO_ADMIN") {
    enviarCorreoResponsableProyecto_(svc, responsable);
  } else {
    enviarCorreoAdminServicioColab_(svc, "Proyecto sin responsable asignado");
  }
  enviarCorreoCambioEstadoServicioColab_(svc, ESTADOS_SERVICIO_COLAB_.ENVIADA, "");
  return { id_servicio: id, estado: ESTADOS_SERVICIO_COLAB_.ENVIADA, ruta_aprobacion: ruta };
}

function apiServicioColaboradorResolver(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_servicio);
  var nuevoEstado = safeStr_(payload.estado).toUpperCase();
  var actor = normalizeEmail_(payload.user_email || payload.resuelto_por_email || "");
  if (!id || !nuevoEstado) throw new Error("Faltan id_servicio o estado");
  var sh = getSheet("SERVICIOS_COLABORADOR");
  var svc = indexRowById_(rowsToObjects_(sh), "id_servicio", id);
  if (!svc) throw new Error("Servicio no encontrado");
  var estadoActual = safeStr_(svc.estado).toUpperCase();
  var motivo = safeStr_(payload.motivo_rechazo);
  var route = safeStr_(svc.ruta_aprobacion).toUpperCase();

  if (estadoActual === ESTADOS_SERVICIO_COLAB_.ENVIADA) {
    if (route === "PROYECTO_ADMIN") {
      var responsable = normalizeEmail_(svc.responsable_proyecto_email_snapshot || "");
      if (actor !== responsable && !userEsAdmin_(actor)) throw new Error("Solo responsable de proyecto puede resolver esta etapa");
      if (nuevoEstado !== ESTADOS_SERVICIO_COLAB_.APROBADA_PROYECTO && nuevoEstado !== ESTADOS_SERVICIO_COLAB_.RECHAZADA_PROYECTO) {
        throw new Error("Estado invalido para etapa proyecto");
      }
      if (nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_PROYECTO && !motivo) throw new Error("Motivo rechazo obligatorio");
      updateRowByHeaders_(sh, svc._row, {
        estado: nuevoEstado,
        motivo_rechazo_proyecto: nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_PROYECTO ? motivo : "",
        resuelto_proyecto_por_email: actor,
        resuelto_proyecto_por_nombre: nombreUsuarioDesdeEmail_(actor),
        fecha_aprobacion_proyecto: nowIso_(),
        updated_at: nowIso_(),
      });
      if (nuevoEstado === ESTADOS_SERVICIO_COLAB_.APROBADA_PROYECTO) {
        svc.estado = nuevoEstado;
        enviarCorreoAdminServicioColab_(svc, "Aprobada por responsable de proyecto");
      }
      enviarCorreoCambioEstadoServicioColab_(svc, nuevoEstado, motivo);
      return { id_servicio: id, estado: nuevoEstado };
    }
    if (route === "DIRECTO_ADMIN") {
      if (!userEsAdministracionOnly_(actor) && !userEsAdmin_(actor)) throw new Error("Solo administración puede resolver ruta directa");
      if (nuevoEstado !== ESTADOS_SERVICIO_COLAB_.APROBADA_ADMIN && nuevoEstado !== ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN) {
        throw new Error("Estado invalido para etapa administración");
      }
      if (nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN && !motivo) throw new Error("Motivo rechazo obligatorio");
      updateRowByHeaders_(sh, svc._row, {
        estado: nuevoEstado,
        motivo_rechazo_admin: nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN ? motivo : "",
        resuelto_admin_por_email: actor,
        resuelto_admin_por_nombre: nombreUsuarioDesdeEmail_(actor),
        fecha_aprobacion_admin: nowIso_(),
        updated_at: nowIso_(),
      });
      enviarCorreoCambioEstadoServicioColab_(svc, nuevoEstado, motivo);
      return { id_servicio: id, estado: nuevoEstado };
    }
  }

  if (estadoActual === ESTADOS_SERVICIO_COLAB_.APROBADA_PROYECTO) {
    if (!userEsAdministracionOnly_(actor) && !userEsAdmin_(actor)) throw new Error("Solo administración puede resolver etapa final");
    if (nuevoEstado !== ESTADOS_SERVICIO_COLAB_.APROBADA_ADMIN && nuevoEstado !== ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN) {
      throw new Error("Estado final invalido");
    }
    if (nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN && !motivo) throw new Error("Motivo rechazo obligatorio");
    updateRowByHeaders_(sh, svc._row, {
      estado: nuevoEstado,
      motivo_rechazo_admin: nuevoEstado === ESTADOS_SERVICIO_COLAB_.RECHAZADA_ADMIN ? motivo : "",
      resuelto_admin_por_email: actor,
      resuelto_admin_por_nombre: nombreUsuarioDesdeEmail_(actor),
      fecha_aprobacion_admin: nowIso_(),
      updated_at: nowIso_(),
    });
    enviarCorreoCambioEstadoServicioColab_(svc, nuevoEstado, motivo);
    return { id_servicio: id, estado: nuevoEstado };
  }

  throw new Error("Transicion de estado no permitida");
}

function apiServicioColaboradorMarcarPagado(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_servicio);
  var actor = normalizeEmail_(payload.user_email || payload.pagado_por_email || "");
  if (!id) throw new Error("Falta id_servicio");
  if (!userEsAdministracionOnly_(actor) && !userEsAdmin_(actor)) throw new Error("Solo administración puede marcar pagado");
  var sh = getSheet("SERVICIOS_COLABORADOR");
  var svc = indexRowById_(rowsToObjects_(sh), "id_servicio", id);
  if (!svc) throw new Error("Servicio no encontrado");
  if (safeStr_(svc.estado).toUpperCase() !== ESTADOS_SERVICIO_COLAB_.APROBADA_ADMIN) {
    throw new Error("No se puede marcar PAGADA si no esta APROBADA_ADMIN");
  }
  var referencia = safeStr_(payload.referencia_pago);
  updateRowByHeaders_(sh, svc._row, {
    estado: ESTADOS_SERVICIO_COLAB_.PAGADA,
    pagado_por_email: actor,
    fecha_pago: safeStr_(payload.fecha_pago || normalizeDateDMYCell_(new Date())),
    referencia_pago: referencia,
    updated_at: nowIso_(),
  });
  enviarCorreoCambioEstadoServicioColab_(svc, ESTADOS_SERVICIO_COLAB_.PAGADA, referencia);
  return { id_servicio: id, estado: ESTADOS_SERVICIO_COLAB_.PAGADA, referencia_pago: referencia };
}

function apiServicioColaboradorList(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var actor = normalizeEmail_(payload.user_email || "");
  var rol = normalizeRolSegunUsuarios_(actor);
  var estadoFilter = safeStr_(payload.estado).toUpperCase();
  return rowsToObjects_(getSheet("SERVICIOS_COLABORADOR")).filter(function (r) {
    var est = safeStr_(r.estado).toUpperCase();
    if (estadoFilter && est !== estadoFilter) return false;
    if (rol === "GESTOR" || rol === "ADMINISTRACION") return true;
    if (normalizeEmail_(r.email_colaborador) === actor) return true;
    if (normalizeEmail_(r.responsable_proyecto_email_snapshot) === actor && est === ESTADOS_SERVICIO_COLAB_.ENVIADA) return true;
    return false;
  });
}

function apiServicioColaboradorDetalle(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var actor = normalizeEmail_(payload.user_email || "");
  var svc = indexRowById_(rowsToObjects_(getSheet("SERVICIOS_COLABORADOR")), "id_servicio", payload.id_servicio || "");
  if (!svc) throw new Error("Servicio no encontrado");
  var rol = normalizeRolSegunUsuarios_(actor);
  var canSee =
    rol === "GESTOR" ||
    rol === "ADMINISTRACION" ||
    normalizeEmail_(svc.email_colaborador) === actor ||
    normalizeEmail_(svc.responsable_proyecto_email_snapshot) === actor;
  if (!canSee) throw new Error("No autorizado");
  var gastos = rowsToObjects_(getSheet("GASTOS_SERVICIO")).filter(function (g) {
    return safeStr_(g.id_servicio) === safeStr_(svc.id_servicio);
  });
  return { servicio: svc, gastos: gastos };
}

function assertServicioNoPagada_(idServicio) {
  var svc = indexRowById_(rowsToObjects_(getSheet("SERVICIOS_COLABORADOR")), "id_servicio", idServicio);
  if (!svc) throw new Error("Servicio no encontrado");
  if (safeStr_(svc.estado).toUpperCase() === ESTADOS_SERVICIO_COLAB_.PAGADA) {
    throw new Error("Servicio PAGADA: datos economicos bloqueados");
  }
  return svc;
}

function apiGastoServicioCrear(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var idServicio = safeStr_(payload.id_servicio);
  if (!idServicio) throw new Error("Falta id_servicio");
  assertServicioNoPagada_(idServicio);
  var id = genId_("GSC");
  var now = nowIso_();
  var row = {
    id_gasto: id,
    id_servicio: idServicio,
    tipo_gasto: safeStr_(payload.tipo_gasto || "OTRO").toUpperCase(),
    fecha_gasto: safeStr_(payload.fecha_gasto || normalizeDateDMYCell_(new Date())),
    importe_declarado: numOrNull_(payload.importe_declarado) || 0,
    importe_aprobado: numOrNull_(payload.importe_aprobado) || 0,
    descripcion: safeStr_(payload.descripcion),
    url_adjunto: safeStr_(payload.url_adjunto),
    estado: safeStr_(payload.estado || "PENDIENTE").toUpperCase(),
    motivo_rechazo: safeStr_(payload.motivo_rechazo),
    created_at: now,
    updated_at: now,
  };
  appendRowByHeaders_(getSheet("GASTOS_SERVICIO"), row);
  return { id_gasto: id, id_servicio: idServicio };
}

function apiGastoServicioActualizar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_gasto);
  if (!id) throw new Error("Falta id_gasto");
  var sh = getSheet("GASTOS_SERVICIO");
  var gasto = indexRowById_(rowsToObjects_(sh), "id_gasto", id);
  if (!gasto) throw new Error("Gasto no encontrado");
  assertServicioNoPagada_(gasto.id_servicio);
  var changes = {
    tipo_gasto: safeStr_(payload.tipo_gasto || gasto.tipo_gasto).toUpperCase(),
    fecha_gasto: safeStr_(payload.fecha_gasto || gasto.fecha_gasto),
    importe_declarado: numOrNull_(payload.importe_declarado != null ? payload.importe_declarado : gasto.importe_declarado),
    importe_aprobado: numOrNull_(payload.importe_aprobado != null ? payload.importe_aprobado : gasto.importe_aprobado),
    descripcion: safeStr_(payload.descripcion != null ? payload.descripcion : gasto.descripcion),
    url_adjunto: safeStr_(payload.url_adjunto != null ? payload.url_adjunto : gasto.url_adjunto),
    estado: safeStr_(payload.estado != null ? payload.estado : gasto.estado).toUpperCase(),
    motivo_rechazo: safeStr_(payload.motivo_rechazo != null ? payload.motivo_rechazo : gasto.motivo_rechazo),
    updated_at: nowIso_(),
  };
  updateRowByHeaders_(sh, gasto._row, changes);
  return { id_gasto: id };
}

function apiGastoServicioEliminar(payload) {
  payload = payload || {};
  ensureProyectoModuleSheets_();
  var id = safeStr_(payload.id_gasto);
  if (!id) throw new Error("Falta id_gasto");
  var sh = getSheet("GASTOS_SERVICIO");
  var gasto = indexRowById_(rowsToObjects_(sh), "id_gasto", id);
  if (!gasto) throw new Error("Gasto no encontrado");
  assertServicioNoPagada_(gasto.id_servicio);
  sh.deleteRow(gasto._row);
  return { id_gasto: id, deleted: true };
}
