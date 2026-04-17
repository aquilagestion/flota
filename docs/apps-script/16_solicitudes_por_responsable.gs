// ======================================================================
// 16_solicitudes_por_responsable.gs
// Refuerzo backend para solicitudes de uso (hoja SOLICITUDES).
//
// Norma de negocio: aviso de nueva solicitud a los correos de la columna O de FLOTA
// solo si cada correo figura en USUARIOS (col. A) con rol RESPONSABLE (col. C).
// Resolución: correo al solicitante (cabeceras tipo trabajador_email / email_solicitante; no se usa user_email del POST).
//
// Técnico en este script:
// - RESPONSABLE: ve solicitudes propias + las de matrículas a su cargo (getMatriculasACargo_).
// - GESTOR: ve todas (apoyo / supervisión; si no quieres que resuelva, restringe en router).
// - OPERARIO: solo sus propias solicitudes (consulta).
//
// NOTA: Reemplaza tus funciones apiSolicitudList / apiSolicitudResolver
// por estas versiones si quieres blindaje completo en backend.
// ======================================================================
// Requiere en 14_filtro_backend_visibilidad.gs: headerIndexCI_, normalizeEmail_,
// normalizeRolSegunUsuarios_, getMatriculasACargo_.
// Requiere en 04_solicitudes.gs: parseFechaHoraDesdeFila_, haySolapeAprobado_ (aprobación sin solapes).
// Tras resolver: correo al solicitante vía enviarCorreoResolucionSolicitudUso_ en 19_solicitud_uso_crear.gs.
// Email del solicitante: ver emailSolicitanteDesdeRowSolicitud_ (columna D solo si contiene un correo válido).

/** Columna K (11.ª) = índice 10: muchos libros guardan aquí el estado aunque la cabecera no sea "estado". */
var SOLICITUDES_COL_ESTADO_K0_ = 10;

/** Columna D (4.ª) = índice 3 — email del solicitante en el libro estándar. */
var SOLICITUDES_COL_D_EMAIL_SOLICITANTE_0_ = 3;
/** Columna L (12.ª) = índice 11 — motivo_rechazo en el libro estándar. */
var SOLICITUDES_COL_L_MOTIVO_RECHAZO_0_ = 11;
/** Columna N (14.ª) = índice 13 — nombre de quien resuelve en el libro estándar. */
var SOLICITUDES_COL_N_RESUELTO_POR_NOMBRE_0_ = 13;

function nombreUsuarioDesdeEmail_(email) {
  var em = normalizeEmail_(email);
  if (!looksLikeEmail_(em)) return "";
  try {
    var sh = getSheet("USUARIOS");
    var all = sh.getDataRange().getValues();
    if (!all || all.length < 2) return "";
    var headers = all[0].map(function (h) {
      return String(h || "")
        .trim()
        .replace(/^\uFEFF/, "");
    });
    var idxEm = headerIndexCI_(headers, "email");
    var idxNombre = headerIndexCI_(headers, "nombre");
    if (idxEm < 0 || idxNombre < 0) return "";
    for (var i = 1; i < all.length; i++) {
      if (normalizeEmail_(all[i][idxEm]) !== em) continue;
      return String(all[i][idxNombre] || "").trim();
    }
  } catch (e) {}
  return "";
}

function fechaSalidaSolicitud_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return normalizeDateDMYCell_(v);
  if (typeof v === "number" && isFinite(v)) {
    var d = sheetsSerialToDateTime_(v);
    if (d && !isNaN(d.getTime())) return normalizeDateDMYCell_(d);
  }
  var raw = String(v == null ? "" : v).trim();
  if (!raw) return "";
  var m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var p1 = Number(m[1]);
    var p2 = Number(m[2]);
    var yyyy = m[3];
    // Si viene estilo MM/dd/yyyy (p2 > 12), invertir a dd/MM/yyyy.
    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      return String(p2).padStart(2, "0") + "/" + String(p1).padStart(2, "0") + "/" + yyyy;
    }
    return String(p1).padStart(2, "0") + "/" + String(p2).padStart(2, "0") + "/" + yyyy;
  }
  var mIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) {
    return mIso[3] + "/" + mIso[2] + "/" + mIso[1];
  }
  return raw;
}

function horaSalidaSolicitud_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, CFG.TIMEZONE, "HH:mm");
  }
  if (typeof v === "number" && isFinite(v) && v >= 0 && v < 1) {
    var mins = Math.round(v * 24 * 60);
    var hh = Math.floor(mins / 60);
    var mm = mins % 60;
    return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }
  return String(v == null ? "" : v).trim();
}

function findSolapeAprobadoEnMismaHoja_(all, headers, matricula, ini, fin, excludeId) {
  var mat = String(matricula || "").trim().toUpperCase();
  var exc = String(excludeId || "").trim();
  if (!mat || !ini || !fin) return null;

  var idxId = headerIndexCI_(headers, "id_solicitud");
  var idxEstado = headerIndexCI_(headers, "estado");
  if (idxEstado < 0) idxEstado = SOLICITUDES_COL_ESTADO_K0_;
  var idxMat = headerIndexCI_(headers, "matricula");
  var idxFechaIni = headerIndexCI_(headers, "fecha_inicio");
  if (idxFechaIni < 0) idxFechaIni = headerIndexCI_(headers, "fecha_desde");
  var idxHoraIni = headerIndexCI_(headers, "hora_inicio");
  if (idxHoraIni < 0) idxHoraIni = headerIndexCI_(headers, "hora_desde");
  var idxFechaFin = headerIndexCI_(headers, "fecha_fin");
  if (idxFechaFin < 0) idxFechaFin = headerIndexCI_(headers, "fecha_hasta");
  var idxHoraFin = headerIndexCI_(headers, "hora_fin");
  if (idxHoraFin < 0) idxHoraFin = headerIndexCI_(headers, "hora_hasta");

  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    var id = idxId >= 0 ? String(row[idxId] || "").trim() : "";
    if (exc && id === exc) continue;
    var est = idxEstado >= 0 && idxEstado < row.length ? String(row[idxEstado] || "").trim().toUpperCase() : "";
    if (est !== "APROBADA") continue;
    var matRow = idxMat >= 0 ? String(row[idxMat] || "").trim().toUpperCase() : "";
    if (matRow !== mat) continue;
    var rIni = parseFechaHoraDesdeFila_(idxFechaIni >= 0 ? row[idxFechaIni] : "", idxHoraIni >= 0 ? row[idxHoraIni] : "");
    var rFin = parseFechaHoraDesdeFila_(idxFechaFin >= 0 ? row[idxFechaFin] : "", idxHoraFin >= 0 ? row[idxHoraFin] : "");
    if (!rIni || !rFin) continue;
    if (ini < rFin && fin > rIni) {
      return {
        id_solicitud: id,
        fecha_inicio: idxFechaIni >= 0 ? String(row[idxFechaIni] || "").trim() : "",
        hora_inicio: idxHoraIni >= 0 ? String(row[idxHoraIni] || "").trim() : "",
        fecha_fin: idxFechaFin >= 0 ? String(row[idxFechaFin] || "").trim() : "",
        hora_fin: idxHoraFin >= 0 ? String(row[idxHoraFin] || "").trim() : "",
      };
    }
  }
  return null;
}

function getAllSolicitudesRows_() {
  var sh = getSheet("SOLICITUDES");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEstadoHeader = headerIndexCI_(headers, "estado");
  var idxEstado = idxEstadoHeader >= 0 ? idxEstadoHeader : SOLICITUDES_COL_ESTADO_K0_;
  var idxFechaIni = headerIndexCI_(headers, "fecha_inicio");
  if (idxFechaIni < 0) idxFechaIni = headerIndexCI_(headers, "fecha_desde");
  var idxHoraIni = headerIndexCI_(headers, "hora_inicio");
  if (idxHoraIni < 0) idxHoraIni = headerIndexCI_(headers, "hora_desde");
  var idxFechaFin = headerIndexCI_(headers, "fecha_fin");
  if (idxFechaFin < 0) idxFechaFin = headerIndexCI_(headers, "fecha_hasta");
  var idxHoraFin = headerIndexCI_(headers, "hora_fin");
  if (idxHoraFin < 0) idxHoraFin = headerIndexCI_(headers, "hora_hasta");
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (!key) key = "COL_" + c;
      obj[key] = row[c];
    }
    var es = "";
    if (idxEstado >= 0 && idxEstado < row.length) {
      es = String(row[idxEstado] != null ? row[idxEstado] : "").trim();
    }
    if (!es && SOLICITUDES_COL_ESTADO_K0_ < row.length && SOLICITUDES_COL_ESTADO_K0_ !== idxEstado) {
      es = String(row[SOLICITUDES_COL_ESTADO_K0_] != null ? row[SOLICITUDES_COL_ESTADO_K0_] : "").trim();
    }
    if (es) obj.estado = es;
    if (idxFechaIni >= 0 && idxFechaIni < row.length) obj.fecha_inicio = fechaSalidaSolicitud_(row[idxFechaIni]);
    if (idxHoraIni >= 0 && idxHoraIni < row.length) obj.hora_inicio = horaSalidaSolicitud_(row[idxHoraIni]);
    if (idxFechaFin >= 0 && idxFechaFin < row.length) obj.fecha_fin = fechaSalidaSolicitud_(row[idxFechaFin]);
    if (idxHoraFin >= 0 && idxHoraFin < row.length) obj.hora_fin = horaSalidaSolicitud_(row[idxHoraFin]);
    var trMail = emailSolicitanteDesdeRowSolicitud_(headers, row, {});
    if (trMail) obj.trabajador_email = trMail;
    out.push(obj);
  }
  return out;
}

/** Cabeceras en la hoja pueden variar en mayúsculas/espacios (p. ej. "Estado", "estado "). */
function fieldFromRowCI_(r, canonical) {
  if (!r) return "";
  var want = String(canonical || "").toLowerCase();
  for (var k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
    if (String(k).trim().toLowerCase() === want) return r[k];
  }
  return "";
}

/**
 * Email del solicitante para avisos de resolución.
 * - Nunca usa body.user_email (en POST es quien ejecuta: gestor/responsable).
 * - Cabeceras alternativas y escaneo por nombre de columna (tilde/espacios vía headerKeyNormalize_ en 14).
 */
function emailSolicitanteDesdeRowSolicitud_(headers, row, payloadOpt) {
  payloadOpt = payloadOpt || {};
  function cellAt_(idx) {
    if (idx < 0 || !row || idx >= row.length) return "";
    return normalizeEmail_(String(row[idx] != null ? row[idx] : ""));
  }
  var fromPayload = normalizeEmail_(
    String(payloadOpt.trabajador_email || payloadOpt.solicitante_email || "").trim()
  );
  if (looksLikeEmail_(fromPayload)) return fromPayload;

  var names = [
    "trabajador_email",
    "email_solicitante",
    "correo_solicitante",
    "email del solicitante",
    "correo del solicitante",
    "usuario_email",
    "email_trabajador",
    "mail_trabajador",
    "correo_trabajador",
  ];
  for (var n = 0; n < names.length; n++) {
    var ix = headerIndexCI_(headers, names[n]);
    var em = cellAt_(ix);
    if (looksLikeEmail_(em)) return em;
  }
  for (var c = 0; c < headers.length; c++) {
    var hk = headerKeyNormalize_(headers[c]);
    if (!hk) continue;
    var mailish =
      hk.indexOf("mail") >= 0 ||
      hk.indexOf("email") >= 0 ||
      hk.indexOf("correo") >= 0;
    if (!mailish) continue;
    var personish =
      hk.indexOf("trabajador") >= 0 ||
      hk.indexOf("solicitante") >= 0 ||
      hk.indexOf("usuario") >= 0 ||
      hk.indexOf("empleado") >= 0;
    if (!personish) continue;
    var em2 = cellAt_(c);
    if (looksLikeEmail_(em2)) return em2;
  }
  if (row.length > SOLICITUDES_COL_D_EMAIL_SOLICITANTE_0_) {
    var d = cellAt_(SOLICITUDES_COL_D_EMAIL_SOLICITANTE_0_);
    if (looksLikeEmail_(d)) return d;
  }
  return "";
}

function apiSolicitudList(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.requester_email || payload.user_email || payload.trabajador_email || ""
  );
  var rol = normalizeRolSegunUsuarios_(requester);
  var estado = String(payload.estado || "").trim().toUpperCase();

  var rows = getAllSolicitudesRows_();
  var assigned = getMatriculasACargo_(requester);
  var hasAssignedMatriculas = false;
  for (var mk in assigned) {
    if (!Object.prototype.hasOwnProperty.call(assigned, mk)) continue;
    if (assigned[mk]) {
      hasAssignedMatriculas = true;
      break;
    }
  }
  // Compatibilidad operativa: si USUARIOS no marca RESPONSABLE pero FLOTA sí lo tiene a cargo,
  // se comporta como responsable para visibilidad de solicitudes.
  var effectiveResponsable = rol === "RESPONSABLE" || (rol === "OPERARIO" && hasAssignedMatriculas);

  return rows.filter(function (r) {
    var rEstado = String(fieldFromRowCI_(r, "estado") || r.estado || "").trim().toUpperCase();
    if (estado && rEstado !== estado) return false;

    if (rol === "GESTOR" || rol === "ADMINISTRACION") return true;

    var trabajador = normalizeEmail_(
      fieldFromRowCI_(r, "trabajador_email") || r.trabajador_email || r.usuario_email || ""
    );
    if (rol === "OPERARIO" && !effectiveResponsable) return trabajador === requester;

    // RESPONSABLE (o equivalente por matrículas asignadas en FLOTA)
    if (!effectiveResponsable) return false;
    if (trabajador === requester) return true;
    var mat = String(fieldFromRowCI_(r, "matricula") || r.matricula || "").trim().toUpperCase();
    return !!assigned[mat];
  });
}

function apiSolicitudResolver(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.resuelto_por_email || payload.user_email || payload.requester_email || ""
  );
  var rol = normalizeRolSegunUsuarios_(requester);
  var assigned = getMatriculasACargo_(requester);
  var hasAssignedMatriculas = false;
  for (var mk in assigned) {
    if (!Object.prototype.hasOwnProperty.call(assigned, mk)) continue;
    if (assigned[mk]) {
      hasAssignedMatriculas = true;
      break;
    }
  }
  var canResolveByAssigned = rol === "RESPONSABLE" || (rol === "OPERARIO" && hasAssignedMatriculas);
  if (rol !== "GESTOR" && !canResolveByAssigned) {
    throw new Error("No autorizado para resolver solicitudes");
  }

  var id = String(payload.id_solicitud || "").trim();
  if (!id) throw new Error("Falta campo: id_solicitud");
  var estado = String(payload.estado || "").trim().toUpperCase();
  if (estado !== "APROBADA" && estado !== "RECHAZADA") {
    throw new Error("Estado inválido. Usa APROBADA o RECHAZADA.");
  }

  var sh = getSheet("SOLICITUDES");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) throw new Error("No hay solicitudes");
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });

  var idxId = headerIndexCI_(headers, "id_solicitud");
  var idxEstado = headerIndexCI_(headers, "estado");
  if (idxEstado < 0) idxEstado = SOLICITUDES_COL_ESTADO_K0_;
  var idxMat = headerIndexCI_(headers, "matricula");
  var idxResuelto = headerIndexCI_(headers, "resuelto_por_email");
  var idxFecha = headerIndexCI_(headers, "fecha_resolucion");
  var idxMotRech = headerIndexCI_(headers, "motivo_rechazo");
  if (idxMotRech < 0) idxMotRech = SOLICITUDES_COL_L_MOTIVO_RECHAZO_0_;
  var idxResueltoNombre = headerIndexCI_(headers, "resuelto_por_nombre");
  if (idxResueltoNombre < 0) idxResueltoNombre = SOLICITUDES_COL_N_RESUELTO_POR_NOMBRE_0_;
  var idxTrabEmail = headerIndexCI_(headers, "trabajador_email");
  var idxTrabNombre = headerIndexCI_(headers, "trabajador_nombre");
  var idxFechaIni = headerIndexCI_(headers, "fecha_inicio");
  if (idxFechaIni < 0) idxFechaIni = headerIndexCI_(headers, "fecha_desde");
  var idxHoraIni = headerIndexCI_(headers, "hora_inicio");
  if (idxHoraIni < 0) idxHoraIni = headerIndexCI_(headers, "hora_desde");
  var idxFechaFin = headerIndexCI_(headers, "fecha_fin");
  if (idxFechaFin < 0) idxFechaFin = headerIndexCI_(headers, "fecha_hasta");
  var idxHoraFin = headerIndexCI_(headers, "hora_fin");
  if (idxHoraFin < 0) idxHoraFin = headerIndexCI_(headers, "hora_hasta");
  if (idxId < 0) throw new Error("Falta cabecera id_solicitud en SOLICITUDES");

  for (var r = 1; r < all.length; r++) {
    var currId = String(all[r][idxId] || "").trim();
    if (currId !== id) continue;
    var estadoActual = String(all[r][idxEstado] || "")
      .trim()
      .toUpperCase();
    if (estadoActual !== "PENDIENTE") {
      throw new Error("La solicitud ya está resuelta");
    }

    var matRow = idxMat >= 0 ? String(all[r][idxMat] || "").trim().toUpperCase() : "";
    if (canResolveByAssigned && rol !== "GESTOR") {
      if (!assigned[matRow]) throw new Error("Solo puedes resolver solicitudes de vehículos a tu cargo");
    }

    if (estado === "APROBADA") {
      var iniR = parseFechaHoraDesdeFila_(idxFechaIni >= 0 ? all[r][idxFechaIni] : "", idxHoraIni >= 0 ? all[r][idxHoraIni] : "");
      var finR = parseFechaHoraDesdeFila_(idxFechaFin >= 0 ? all[r][idxFechaFin] : "", idxHoraFin >= 0 ? all[r][idxHoraFin] : "");
      if (!iniR || !finR || !matRow) throw new Error("Solicitud con fecha/hora/matrícula inválida");
      if (iniR >= finR) throw new Error("Rango de fecha/hora inválido en solicitud");
      var conflict = findSolapeAprobadoEnMismaHoja_(all, headers, matRow, iniR, finR, id);
      if (conflict) {
        throw new Error(
          "Vehículo no disponible en ese rango (solapa con " +
            String(conflict.id_solicitud || "sin_id") +
            " " +
            String(conflict.fecha_inicio || "") +
            (conflict.hora_inicio ? " " + conflict.hora_inicio : "") +
            " -> " +
            String(conflict.fecha_fin || "") +
            (conflict.hora_fin ? " " + conflict.hora_fin : "") +
            ")"
        );
      }
    }

    sh.getRange(r + 1, idxEstado + 1).setValue(estado);
    if (idxResuelto >= 0) sh.getRange(r + 1, idxResuelto + 1).setValue(requester);
    if (idxResueltoNombre >= 0 && idxResueltoNombre < headers.length) {
      var nombreRes = nombreUsuarioDesdeEmail_(requester) || requester;
      sh.getRange(r + 1, idxResueltoNombre + 1).setValue(nombreRes);
    }
    if (idxFecha >= 0) sh.getRange(r + 1, idxFecha + 1).setValue(normalizeDateDMYCell_(new Date()));
    var mr = String(payload.motivo_rechazo || "").trim();
    if (estado === "RECHAZADA" && idxMotRech >= 0 && idxMotRech < headers.length) {
      sh.getRange(r + 1, idxMotRech + 1).setValue(mr);
    }

    var trabTo = emailSolicitanteDesdeRowSolicitud_(headers, all[r], payload);
    var usoCreadoId = "";
    if (estado === "APROBADA") {
      usoCreadoId = crearUsoDesdeSolicitud_({
        id_solicitud: id,
        matricula: matRow,
        trabajador_email: idxTrabEmail >= 0 ? all[r][idxTrabEmail] : "",
        trabajador_nombre: idxTrabNombre >= 0 ? all[r][idxTrabNombre] : "",
        fecha_inicio: idxFechaIni >= 0 ? all[r][idxFechaIni] : "",
        hora_inicio: idxHoraIni >= 0 ? all[r][idxHoraIni] : "",
        fecha_fin: idxFechaFin >= 0 ? all[r][idxFechaFin] : "",
        hora_fin: idxHoraFin >= 0 ? all[r][idxHoraFin] : "",
      });
    }
    var mailRes = { sent: false, reason: "" };
    try {
      mailRes = enviarCorreoResolucionSolicitudUso_({
        solicitante_email: trabTo,
        matricula: matRow,
        estado: estado,
        resuelto_por_email: requester,
        id_solicitud: id,
        motivo_rechazo: mr,
      });
    } catch (eMail) {
      mailRes = { sent: false, reason: String(eMail && eMail.message ? eMail.message : eMail) };
    }

    return {
      id_solicitud: id,
      estado: estado,
      id_uso_creado: usoCreadoId,
      email_solicitante_enviado: mailRes.sent,
      email_solicitante_destino: trabTo,
      email_solicitante_aviso: mailRes.sent ? "ok" : String(mailRes.reason || ""),
    };
  }

  throw new Error("No existe la solicitud");
}
