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
    .toUpperCase();
  if (!s) return def ? "SI" : "NO";
  if (s === "SI" || s === "TRUE" || s === "1") return "SI";
  return "NO";
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
  sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
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

function ensureProyectoModuleSheets_() {
  ensureSheetHeaders_("PROYECTOS", headersProyectos_());
  ensureSheetHeaders_("TARIFAS_KM", headersTarifasKm_());
  ensureSheetHeaders_("SERVICIOS_COLABORADOR", headersServiciosColaborador_());
  ensureSheetHeaders_("GASTOS_SERVICIO", headersGastosServicio_());
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
    sh.getRange(rowNum, idx + 1).setValue(changes[key]);
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
