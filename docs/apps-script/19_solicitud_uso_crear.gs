// ======================================================================
// 19_solicitud_uso_crear.gs
// Alta de solicitudes de uso de vehículo (hoja SOLICITUDES) + correo al responsable.
//
// Aviso de nueva solicitud:
// - Correos: columna O (índice 14) + misma fila FLOTA: cabeceras tipo e-mail_de_notificaciones
//   (evita filas largas con O vacía pero notificaciones rellenas en otra columna mapeada).
// - Correos en FLOTA validados en USUARIOS (activo SI) con rol RESPONSABLE, GESTOR o ADMINISTRACION.
// - Si tras validar no queda nadie: opcionalmente (AVISO_SOLICITUD_USA_FALLBACK_…) se avisa a
//   RESPONSABLE con esa matrícula a cargo (getMatriculasACargo_), p. ej. cuando O está vacío.
// - Tras appendRowByHeaders_ se fuerza columna D = email del solicitante (resolución por mail).
//
// Resolución (correo al solicitante): ver apiSolicitudResolver + columna D SOLICITUDES en 16.
//
// Requiere: getSheet, appendRowByHeaders_, normalizeDateDMYCell_, readSheetObjects_,
// normalizeEmail_, headerIndexCI_ (14_filtro_backend_visibilidad.gs).
// Requiere: 12_usuarios_roles.gs → apiUsuarioGet (usuario existente y activo).
// Requiere: 04_solicitudes.gs → parseFechaHoraDesdeFila_, haySolapeReservaParaNuevaSolicitud_.
// Añadir en doPost: if (action === "solicitud_crear") { ... apiSolicitudCrear(body) ... }
// ======================================================================

/** Columna O en FLOTA (1-based 15) = índice 0-based 14 — e-mail de notificaciones / responsable. */
var FLOTA_COL_O_NOTIFICACIONES_0_ = 14;

/** Columna D en SOLICITUDES (1-based 4) = índice 3 — email del solicitante según libro estándar. */
var SOLICITUDES_COL_D_EMAIL_SOLICITANTE_0_ = 3;

/**
 * Si true y no hay destinatarios tras validar correos leídos de FLOTA (O + notificaciones en la fila),
 * se añaden los emails USUARIOS rol RESPONSABLE con esa matrícula a cargo (getMatriculasACargo_).
 * Pon false para exigir solo correos en FLOTA validados frente a USUARIOS.
 */
var AVISO_SOLICITUD_USA_FALLBACK_RESPONSABLES_MATRICULA_ = true;

/**
 * Si tras FLOTA + responsables a cargo no hay ningún destinatario, se avisa a usuarios
 * GESTOR (y ADMINISTRACION) en USUARIOS para que no quede el aviso en silencio total.
 */
var AVISO_SOLICITUD_SI_VACIO_ENVIAR_A_GESTORES_ = true;

function looksLikeEmail_(s) {
  var t = String(s || "").trim();
  if (!t) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return true;
  var at = t.indexOf("@");
  if (at < 1 || at >= t.length - 1) return false;
  if (/\s/.test(t)) return false;
  var dom = t.substring(at + 1);
  return dom.length >= 2 && dom.indexOf(".") >= 0;
}

function rolEsResponsableUsuarios_(rolRaw) {
  var r = String(rolRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ");
  return r === "RESPONSABLE";
}

/** Roles que pueden recibir el aviso de nueva solicitud si el correo figura en FLOTA (columna O / notificaciones). */
function rolPuedeRecibirAvisoNuevaSolicitudUso_(rolRaw) {
  var r = String(rolRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ");
  if (r === "ADMIN") r = "ADMINISTRACION";
  return r === "RESPONSABLE" || r === "GESTOR" || r === "ADMINISTRACION";
}

function splitEmailsFromCell_(raw) {
  var s = String(raw || "").trim();
  if (!s) return [];
  var parts = s.split(/[;,]/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var e = normalizeEmail_(parts[i]);
    if (looksLikeEmail_(e) && out.indexOf(e) < 0) out.push(e);
  }
  return out;
}

/** Lee correos de la columna de notificaciones aunque el header en la hoja varíe ligeramente. */
function extractNotificacionEmailsFromFlotaRow_(r) {
  if (!r) return [];
  var collected = [];
  var direct = String(
    r["e-mail_de_notificaciones"] ||
      r["E-mail_de_notificaciones"] ||
      r.email_de_notificaciones ||
      r["email_de_notificaciones"] ||
      ""
  ).trim();
  collected = collected.concat(splitEmailsFromCell_(direct));
  for (var k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
    var kn = String(k)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");
    if (kn.indexOf("notificacion") >= 0 || kn === "e_mail_de_notificaciones" || kn.indexOf("mail_de_notificacion") >= 0) {
      collected = collected.concat(splitEmailsFromCell_(r[k]));
    }
  }
  var uniq = [];
  for (var j = 0; j < collected.length; j++) {
    if (uniq.indexOf(collected[j]) < 0) uniq.push(collected[j]);
  }
  return uniq;
}

/**
 * Compatibilidad (código antiguo / copias locales): primer correo de notificación en una fila FLOTA
 * como objeto { cabecera: valor }. La lista completa: extractNotificacionEmailsFromFlotaRow_(r).
 */
function extractResponsableEmailFromFlotaRow_(r) {
  var list = extractNotificacionEmailsFromFlotaRow_(r);
  return list && list.length ? list[0] : "";
}

/**
 * True si el correo está en USUARIOS, está activo (si hay columna activo) y puede recibir
 * avisos de solicitud puestos en FLOTA (RESPONSABLE, GESTOR o ADMINISTRACION).
 * Así los correos de la columna O que sean gestores no se descartan silenciosamente.
 */
function emailEnUsuariosParaAvisoFLoTaSolicitud_(email) {
  var want = normalizeEmail_(email);
  if (!looksLikeEmail_(want)) return false;
  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return false;
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEm = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  var idxAct = headerIndexCI_(headers, "activo");
  if (idxEm >= 0 && idxRol >= 0) {
    for (var i = 1; i < all.length; i++) {
      if (normalizeEmail_(all[i][idxEm]) !== want) continue;
      if (idxAct >= 0) {
        var act = String(all[i][idxAct] || "")
          .trim()
          .toUpperCase();
        if (act && act !== "SI" && act !== "TRUE" && act !== "1") return false;
      }
      return rolPuedeRecibirAvisoNuevaSolicitudUso_(all[i][idxRol]);
    }
  }
  for (var j = 1; j < all.length; j++) {
    var row = all[j];
    if (!row || row.length < 3) continue;
    if (normalizeEmail_(row[0]) !== want) continue;
    return rolPuedeRecibirAvisoNuevaSolicitudUso_(row[2]);
  }
  return false;
}

/**
 * Emails USUARIOS con rol RESPONSABLE que tienen la matrícula a cargo en FLOTA
 * (responsable o e-mail_de_notificaciones, misma regla que getMatriculasACargo_).
 */
function emailsResponsablesMatriculaDesdeCargo_(matricula) {
  var mat = String(matricula || "").trim().toUpperCase();
  if (!mat) return [];
  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEm = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  var out = [];
  if (idxEm >= 0 && idxRol >= 0) {
    for (var i = 1; i < all.length; i++) {
      if (!rolEsResponsableUsuarios_(all[i][idxRol])) continue;
      var em = normalizeEmail_(all[i][idxEm]);
      if (!looksLikeEmail_(em)) continue;
      var assigned = getMatriculasACargo_(em);
      if (!assigned[mat]) continue;
      if (out.indexOf(em) < 0) out.push(em);
    }
    return out;
  }
  for (var j = 1; j < all.length; j++) {
    var row = all[j];
    if (!row || row.length < 3) continue;
    if (!rolEsResponsableUsuarios_(row[2])) continue;
    var em2 = normalizeEmail_(row[0]);
    if (!looksLikeEmail_(em2)) continue;
    var assigned2 = getMatriculasACargo_(em2);
    if (!assigned2[mat]) continue;
    if (out.indexOf(em2) < 0) out.push(em2);
  }
  return out;
}

/**
 * FLOTA por matrícula: columna O + celdas de notificación de la misma fila (cabeceras),
 * deduplicados. Evita devolver [] cuando la fila tiene muchas columnas pero O está vacía
 * y el correo está en e-mail_de_notificaciones u otra columna mapeada.
 */
function getEmailsColumnaOFlotaPorMatricula_(matricula) {
  var mat = String(matricula || "").trim().toUpperCase();
  if (!mat) return [];
  var sh = getSheet("FLOTA");
  var all = sh.getDataRange().getValues();
  var merged = [];
  if (all && all.length >= 2) {
    var headers = all[0].map(function (h) {
      return String(h || "")
        .trim()
        .replace(/^\uFEFF/, "");
    });
    var idxMat = headerIndexCI_(headers, "matricula");
    if (idxMat < 0) idxMat = 0;
    for (var i = 1; i < all.length; i++) {
      var row = all[i];
      if (String(row[idxMat] || "").trim().toUpperCase() !== mat) continue;
      if (row.length > FLOTA_COL_O_NOTIFICACIONES_0_) {
        merged = merged.concat(splitEmailsFromCell_(String(row[FLOTA_COL_O_NOTIFICACIONES_0_] || "")));
      }
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var key = String(headers[c] || "").trim();
        if (!key) key = "COL_" + c;
        obj[key] = c < row.length ? row[c] : "";
      }
      merged = merged.concat(extractNotificacionEmailsFromFlotaRow_(obj));
      break;
    }
  }
  if (!merged.length) {
    var flota = readSheetObjects_("FLOTA");
    for (var k = 0; k < flota.length; k++) {
      var r = flota[k] || {};
      if (String(r.matricula || "").trim().toUpperCase() !== mat) continue;
      merged = merged.concat(extractNotificacionEmailsFromFlotaRow_(r));
      break;
    }
  }
  var out = [];
  for (var j = 0; j < merged.length; j++) {
    var e = normalizeEmail_(merged[j]);
    if (!looksLikeEmail_(e)) continue;
    if (out.indexOf(e) < 0) out.push(e);
  }
  return out;
}

/** Emails de GESTOR y ADMINISTRACION en USUARIOS (cabeceras o respaldo A/C). */
function emailsGestoresDesdeUsuarios_() {
  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEm = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  var out = [];
  function addIfGestor(rolRaw, emRaw) {
    var rol = String(rolRaw || "")
      .trim()
      .toUpperCase()
      .replace(/\u00A0/g, " ");
    if (rol !== "GESTOR" && rol !== "ADMINISTRACION" && rol !== "ADMIN") return;
    var em = normalizeEmail_(emRaw);
    if (!looksLikeEmail_(em)) return;
    if (out.indexOf(em) < 0) out.push(em);
  }
  if (idxEm >= 0 && idxRol >= 0) {
    for (var i = 1; i < all.length; i++) {
      addIfGestor(all[i][idxRol], all[i][idxEm]);
    }
    return out;
  }
  for (var j = 1; j < all.length; j++) {
    var row = all[j];
    if (!row || row.length < 3) continue;
    addIfGestor(row[2], row[0]);
  }
  return out;
}

/** Correos FLOTA validados en USUARIOS RESPONSABLE; opcional fallback por matrícula a cargo. */
function getDestinatariosAvisoNuevaSolicitud_(matricula) {
  var raw = getEmailsColumnaOFlotaPorMatricula_(matricula);
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var e = normalizeEmail_(raw[i]);
    if (!looksLikeEmail_(e)) continue;
    if (!emailEnUsuariosParaAvisoFLoTaSolicitud_(e)) continue;
    if (out.indexOf(e) < 0) out.push(e);
  }
  var usedFallback = false;
  if (!out.length && AVISO_SOLICITUD_USA_FALLBACK_RESPONSABLES_MATRICULA_) {
    var fb = emailsResponsablesMatriculaDesdeCargo_(matricula);
    for (var k = 0; k < fb.length; k++) {
      if (out.indexOf(fb[k]) < 0) out.push(fb[k]);
    }
    usedFallback = fb.length > 0;
  }
  var usedGestorFallback = false;
  if (!out.length && AVISO_SOLICITUD_SI_VACIO_ENVIAR_A_GESTORES_) {
    var gg = emailsGestoresDesdeUsuarios_();
    for (var g = 0; g < gg.length; g++) {
      if (out.indexOf(gg[g]) < 0) out.push(gg[g]);
    }
    usedGestorFallback = gg.length > 0;
  }
  return {
    toEmails: out,
    emails_columna_o: raw,
    usado_fallback_responsables_matricula: usedFallback,
    usado_fallback_gestores: usedGestorFallback,
  };
}

/**
 * Compatibilidad (código antiguo / otros módulos): datos de aviso por matrícula.
 * Equivale a getDestinatariosAvisoNuevaSolicitud_ (FLOTA + USUARIOS + fallback opcional).
 *
 * @returns {{
 *   matricula: string,
 *   emails_columna_o: string[],
 *   emails_validados_responsable: string[],
 *   destinatarios_aviso: string[],
 *   responsables: Array<{ email: string }>
 * }}
 */
function getResponsablesVehiculoUso_(matricula) {
  var mat = String(matricula || "").trim().toUpperCase();
  var rc = getDestinatariosAvisoNuevaSolicitud_(mat);
  var to = rc.toEmails || [];
  var responsables = [];
  for (var i = 0; i < to.length; i++) responsables.push({ email: to[i] });
  return {
    matricula: mat,
    emails_columna_o: rc.emails_columna_o || [],
    emails_validados_responsable: to,
    destinatarios_aviso: to,
    responsables: responsables,
    usado_fallback_responsables_matricula: !!rc.usado_fallback_responsables_matricula,
    usado_fallback_gestores: !!rc.usado_fallback_gestores,
  };
}

function htmlToPlainBody_(htmlBody) {
  return String(htmlBody || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Envío por destinatario: varios correos en "To" a la vez falla a veces con GmailApp / políticas.
 * MailApp primero (cuerpo plano + htmlBody), luego GmailApp por cada dirección.
 */
function enviarCorreoHtml_(toList, subject, htmlBody) {
  var emails = [];
  var raw = toList || [];
  for (var i = 0; i < raw.length; i++) {
    var e = normalizeEmail_(raw[i]);
    if (looksLikeEmail_(e) && emails.indexOf(e) < 0) emails.push(e);
  }
  if (!emails.length) return { sent: false, reason: "sin_destinatario" };
  var quotaHint = "";
  try {
    quotaHint = " | cuota_mail_diaria_restante=" + MailApp.getRemainingDailyQuota();
  } catch (q0) {
    quotaHint = "";
  }
  var plain = htmlToPlainBody_(htmlBody);
  var okList = [];
  var errs = [];
  for (var j = 0; j < emails.length; j++) {
    var one = emails[j];
    var okThis = false;
    try {
      GmailApp.sendEmail(one, subject, plain || subject, { htmlBody: htmlBody });
      okThis = true;
      okList.push(one);
    } catch (eG) {
      try {
        MailApp.sendEmail({
          to: one,
          subject: subject,
          body: plain || subject,
          htmlBody: htmlBody,
        });
        okThis = true;
        okList.push(one);
      } catch (eM) {
        errs.push(
          one +
            ": GmailApp=" +
            String(eG && eG.message ? eG.message : eG) +
            " | MailApp=" +
            String(eM && eM.message ? eM.message : eM)
        );
      }
    }
  }
  if (okList.length) {
    return { sent: true, to: okList.join(","), via: "por_destinatario", enviados: okList.length, fallos: errs };
  }
  var msg = errs.join(" || ") + quotaHint;
  Logger.log("enviarCorreoHtml_ fallo total: " + msg);
  return { sent: false, reason: msg || "sin_envio" };
}

function enviarCorreoNuevaSolicitudUso_(opts) {
  return enviarCorreoHtml_(opts.toEmails || [], opts.subject, opts.htmlBody);
}

function toHexDigest_(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i];
    if (v < 0) v += 256;
    out.push(("0" + v.toString(16)).slice(-2));
  }
  return out.join("");
}

function firmaDecisionSolicitudCorreo_(idSolicitud, estado, resolverEmail) {
  var secret = String(getSecretKey_() || "").trim();
  if (!secret) return "";
  var base =
    String(idSolicitud || "").trim() +
    "|" +
    String(estado || "").trim().toUpperCase() +
    "|" +
    normalizeEmail_(resolverEmail || "") +
    "|" +
    secret;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base);
  return toHexDigest_(digest);
}

function getScriptWebAppUrl_() {
  try {
    return String(ScriptApp.getService().getUrl() || "").trim();
  } catch (e) {
    return "";
  }
}

function linkResolverSolicitudDesdeCorreo_(idSolicitud, estado, resolverEmail) {
  var baseUrl = getScriptWebAppUrl_();
  if (!baseUrl) return "";
  var id = String(idSolicitud || "").trim();
  var st = String(estado || "").trim().toUpperCase();
  var re = normalizeEmail_(resolverEmail || "");
  var tk = firmaDecisionSolicitudCorreo_(id, st, re);
  if (!id || !st || !re || !tk) return "";
  var q =
    "action=solicitud_resolver_desde_email" +
    "&id_solicitud=" +
    encodeURIComponent(id) +
    "&estado=" +
    encodeURIComponent(st) +
    "&resolver_email=" +
    encodeURIComponent(re) +
    "&token=" +
    encodeURIComponent(tk);
  return baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + q;
}

function reservasResumenVehiculoParaCorreo_(matricula, excludeId) {
  var mat = String(matricula || "").trim().toUpperCase();
  var exc = String(excludeId || "").trim();
  if (!mat) return [];
  var rows = rowsToObjects_(getSheet("SOLICITUDES"));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var rid = String(r.id_solicitud || "").trim();
    if (exc && rid === exc) continue;
    var rMat = String(r.matricula || "").trim().toUpperCase();
    if (rMat !== mat) continue;
    var st = String(r.estado || "")
      .trim()
      .toUpperCase();
    if (st !== "PENDIENTE" && st !== "APROBADA") continue;
    out.push({
      id_solicitud: rid,
      estado: st,
      fecha_inicio: String(r.fecha_inicio || "").trim(),
      hora_inicio: String(r.hora_inicio || "").trim(),
      fecha_fin: String(r.fecha_fin || "").trim(),
      hora_fin: String(r.hora_fin || "").trim(),
      trabajador_nombre: String(r.trabajador_nombre || "").trim(),
      motivo: String(r.motivo || "").trim(),
    });
  }
  out.sort(function (a, b) {
    var ad = parseFechaHoraDesdeFila_(a.fecha_inicio, a.hora_inicio) || new Date(0);
    var bd = parseFechaHoraDesdeFila_(b.fecha_inicio, b.hora_inicio) || new Date(0);
    return ad.getTime() - bd.getTime();
  });
  if (out.length > 8) out = out.slice(0, 8);
  return out;
}

function horaCorreoConSegundos_(hhmm) {
  var t = String(hhmm || "").trim();
  if (!t) return "00:00:00";
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    var p = t.split(":");
    return String(p[0]).padStart(2, "0") + ":" + p[1] + ":00";
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
    var p2 = t.split(":");
    return String(p2[0]).padStart(2, "0") + ":" + p2[1] + ":" + p2[2];
  }
  return t;
}

/**
 * Aviso al solicitante cuando la solicitud pasa a APROBADA o RECHAZADA.
 * Llamar desde apiSolicitudResolver (16_solicitudes_por_responsable.gs).
 */
function enviarCorreoResolucionSolicitudUso_(opt) {
  opt = opt || {};
  var to = normalizeEmail_(opt.solicitante_email || "");
  if (!looksLikeEmail_(to)) return { sent: false, reason: "solicitante_sin_email" };
  var est = String(opt.estado || "").trim().toUpperCase();
  var mat = String(opt.matricula || "").trim().toUpperCase();
  var id = String(opt.id_solicitud || "").trim();
  var resPor = String(opt.resuelto_por_email || "").trim();
  var mr = String(opt.motivo_rechazo || "").trim();
  var safeMr = mr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  var subj =
    est === "APROBADA"
      ? "[FLOTA] Solicitud de uso APROBADA · " + mat
      : "[FLOTA] Solicitud de uso RECHAZADA · " + mat;
  var body =
    "<p>Tu solicitud de uso de vehículo ha sido <b>" +
    (est === "APROBADA" ? "aprobada" : "rechazada") +
    "</b>.</p>" +
    "<p><b>Matrícula:</b> " +
    mat +
    "<br/>" +
    "<b>ID:</b> " +
    id +
    "<br/>" +
    "<b>Resuelto por:</b> " +
    resPor +
    "</p>";
  if (est === "RECHAZADA" && mr) {
    body += "<p><b>Motivo del rechazo:</b> " + safeMr + "</p>";
  }
  body += "<p>Puedes consultar el detalle en la aplicación.</p>";
  return enviarCorreoHtml_([to], subj, body);
}

function escapeHtmlText_(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlResponseSolicitudDesdeCorreo_(title, message, ok) {
  var color = ok ? "#1b5e20" : "#8b1d1d";
  var html =
    "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>GestiFlota</title></head><body style='font-family:Arial,sans-serif;background:#101827;color:#f2f6ff;padding:18px;'>" +
    "<div style='max-width:640px;margin:0 auto;background:#1a2233;border:1px solid #2f3f58;border-radius:12px;padding:18px;'>" +
    "<h2 style='margin-top:0;color:" +
    color +
    "'>" +
    escapeHtmlText_(title) +
    "</h2><p style='line-height:1.45'>" +
    escapeHtmlText_(message) +
    "</p><p style='color:#a9b7cf'>Puedes volver a la APK para revisar el detalle.</p></div></body></html>";
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resolverSolicitudDesdeCorreo_(params) {
  params = params || {};
  var id = String(params.id_solicitud || "").trim();
  var estado = String(params.estado || "").trim().toUpperCase();
  var resolver = normalizeEmail_(params.resolver_email || "");
  var token = String(params.token || "").trim();
  if (!id || !resolver || !token) {
    return htmlResponseSolicitudDesdeCorreo_("Acción inválida", "Faltan parámetros obligatorios para resolver la solicitud.", false);
  }
  if (estado !== "APROBADA" && estado !== "RECHAZADA") {
    return htmlResponseSolicitudDesdeCorreo_("Estado inválido", "El estado recibido no es válido.", false);
  }
  var expected = firmaDecisionSolicitudCorreo_(id, estado, resolver);
  if (!expected || token !== expected) {
    return htmlResponseSolicitudDesdeCorreo_("Token inválido", "El enlace no es válido o ha sido manipulado.", false);
  }
  try {
    apiSolicitudResolver({
      id_solicitud: id,
      estado: estado,
      resuelto_por_email: resolver,
      user_email: resolver,
    });
    return htmlResponseSolicitudDesdeCorreo_(
      "Solicitud " + estado,
      "La solicitud " + id + " se ha " + (estado === "APROBADA" ? "aprobado" : "rechazado") + " correctamente.",
      true
    );
  } catch (e) {
    return htmlResponseSolicitudDesdeCorreo_(
      "No se pudo resolver",
      "Error al resolver " + id + ": " + String(e && e.message ? e.message : e),
      false
    );
  }
}

/**
 * Crea fila en SOLICITUDES y avisa por email (columna O FLOTA + validación USUARIOS RESPONSABLE).
 * hora_inicio / hora_fin pueden ir vacíos.
 */
function apiSolicitudCrear(payload) {
  payload = payload || {};
  var mat = String(payload.matricula || "").trim().toUpperCase();
  if (!mat) throw new Error("Falta campo: matricula");

  var trab = normalizeEmail_(payload.trabajador_email || payload.user_email || "");
  if (!trab) throw new Error("Falta campo: trabajador_email");

  var fi = String(payload.fecha_inicio || payload.fecha_desde || "").trim();
  var ff = String(payload.fecha_fin || payload.fecha_hasta || "").trim();
  if (!fi || !ff) throw new Error("Faltan fecha_inicio y fecha_fin");

  var hi = String(payload.hora_inicio || "").trim();
  var hf = String(payload.hora_fin || "").trim();
  var mot = String(payload.motivo || "").trim();
  if (!mot) throw new Error("Falta campo: motivo");

  var uSol = apiUsuarioGet({ email: trab });
  if (!uSol || String(uSol.activo || "").trim().toUpperCase() !== "SI") {
    throw new Error("Usuario no existe o está inactivo");
  }

  var iniChk = parseFechaHoraDesdeFila_(fi, hi);
  var finChk = parseFechaHoraDesdeFila_(ff, hf);
  if (!iniChk || !finChk || iniChk >= finChk) throw new Error("Rango de fecha/hora inválido");
  if (haySolapeReservaParaNuevaSolicitud_(mat, iniChk, finChk, "")) {
    throw new Error(
      "El vehículo ya tiene una reserva aprobada o una solicitud pendiente en ese periodo. Elige otras fechas u otro vehículo."
    );
  }

  var id =
    "SOL-" +
    new Date().getTime() +
    "-" +
    String(Math.floor(Math.random() * 9000) + 1000);

  var sh = getSheet("SOLICITUDES");
  var rowObj = {
    id_solicitud: id,
    matricula: mat,
    trabajador_email: trab,
    trabajador_nombre: String(payload.trabajador_nombre || "").trim(),
    fecha_solicitud: normalizeDateDMYCell_(payload.fecha_solicitud || new Date()),
    fecha_inicio: fi,
    hora_inicio: hi,
    fecha_fin: ff,
    hora_fin: hf,
    motivo: mot,
    estado: "PENDIENTE",
    motivo_rechazo: "",
    resuelto_por_email: "",
    fecha_resolucion: "",
  };
  appendRowByHeaders_(sh, rowObj);
  try {
    var lr = sh.getLastRow();
    if (lr >= 2) {
      var h1 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      var hNorm = h1.map(function (h) {
        return String(h || "")
          .trim()
          .replace(/^\uFEFF/, "");
      });
      var icT = headerIndexCI_(hNorm, "trabajador_email");
      if (icT >= 0) {
        var cur = normalizeEmail_(String(sh.getRange(lr, icT + 1).getValue() || ""));
        if (!looksLikeEmail_(cur)) sh.getRange(lr, icT + 1).setValue(trab);
      }
    }
  } catch (eColD) {
    Logger.log("apiSolicitudCrear: refuerzo trabajador_email: " + String(eColD && eColD.message ? eColD.message : eColD));
  }

  var rc = getDestinatariosAvisoNuevaSolicitud_(mat);
  var nombreSol = String(payload.trabajador_nombre || "").trim() || trab;
  var hiTxt = horaCorreoConSegundos_(hi);
  var hfTxt = horaCorreoConSegundos_(hf);
  var safeMot = String(mot).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  var reservas = reservasResumenVehiculoParaCorreo_(mat, id);
  var reservasHtml = "";
  if (reservas.length) {
    reservasHtml =
      "<p><b>Reservas existentes del vehículo (aprobadas/pendientes):</b></p><ul>" +
      reservas
        .map(function (x) {
          var nombre = String(x.trabajador_nombre || "").trim() || "Sin nombre";
          var motivoX = String(x.motivo || "").trim() || "Sin motivo";
          var hi = horaCorreoConSegundos_(x.hora_inicio);
          var hf = horaCorreoConSegundos_(x.hora_fin);
          return (
            "<li>" +
            x.estado +
            " · " +
            x.fecha_inicio +
            " - " +
            hi +
            " (hora local) → " +
            x.fecha_fin +
            " " +
            hf +
            " + " +
            escapeHtmlText_(nombre) +
            " + " +
            escapeHtmlText_(motivoX) +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  } else {
    reservasHtml = "<p><b>Reservas existentes del vehículo:</b> no hay aprobadas/pendientes distintas a esta solicitud.</p>";
  }

  var sentTo = [];
  var sendErrors = [];
  for (var m = 0; m < rc.toEmails.length; m++) {
    var destinatario = normalizeEmail_(rc.toEmails[m]);
    if (!looksLikeEmail_(destinatario)) continue;
    var linkAprobar = linkResolverSolicitudDesdeCorreo_(id, "APROBADA", destinatario);
    var linkRechazar = linkResolverSolicitudDesdeCorreo_(id, "RECHAZADA", destinatario);
    var accionesHtml = "";
    if (linkAprobar && linkRechazar) {
      accionesHtml =
        "<p><b>Acción rápida:</b><br/>" +
        "<a href='" +
        linkAprobar +
        "' style='display:inline-block;padding:8px 12px;margin-right:10px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:6px;'>Aprobar</a>" +
        "<a href='" +
        linkRechazar +
        "' style='display:inline-block;padding:8px 12px;background:#b71c1c;color:#fff;text-decoration:none;border-radius:6px;'>Rechazar</a>" +
        "</p>" +
        "<p style='font-size:12px;color:#666'>También puedes resolverla desde la APK en la pestaña de pendientes.</p>";
    }
    var oneMail = enviarCorreoNuevaSolicitudUso_({
      toEmails: [destinatario],
      subject: "[FLOTA] Nueva solicitud de uso · " + mat,
      htmlBody:
        "<p>Hay una <b>nueva solicitud de uso</b> pendiente de revisión.</p>" +
        "<p><b>Matrícula:</b> " + mat + "</p>" +
        "<p><b>Solicitud nueva:</b><br/>" +
        "PENDIENTE · " +
        fi +
        " - " +
        hiTxt +
        " (hora local) → " +
        ff +
        " " +
        hfTxt +
        " + " +
        escapeHtmlText_(nombreSol) +
        " + " +
        safeMot +
        "</p>" +
        "<p><b>ID solicitud:</b> " + id + "</p>" +
        reservasHtml +
        accionesHtml,
    });
    if (oneMail.sent) sentTo.push(destinatario);
    else sendErrors.push(String(oneMail.reason || "sin_detalle"));
  }
  var mail = {
    sent: sentTo.length > 0,
    to: sentTo.join(","),
    reason: sendErrors.join(" || "),
  };

  var aviso = mail.sent ? "ok" : String(mail.reason || "");
  if (
    !mail.sent &&
    (!rc.toEmails || !rc.toEmails.length) &&
    rc.emails_columna_o &&
    rc.emails_columna_o.length
  ) {
    aviso =
      "hay_correos_en_FLOTA_pero_ninguno_cumple_USUARIOS_activo_y_rol_notificacion: " + aviso;
  }
  if (rc.usado_fallback_responsables_matricula) {
    aviso = (mail.sent ? "ok" : aviso) + " | destinatarios_por_matricula_a_cargo_USUARIOS_RESPONSABLE";
  }
  if (rc.usado_fallback_gestores) {
    aviso = (mail.sent ? "ok" : aviso) + " | destinatarios_GESTOR_por_lista_vacia_responsables";
  }

  return {
    id_solicitud: id,
    email_notificado: mail.sent,
    email_destino: mail.to || "",
    email_aviso: aviso,
    emails_columna_o_flota: (rc.emails_columna_o || []).join(","),
    emails_tras_validar_responsable_usuarios: (rc.toEmails || []).join(","),
    email_usado_fallback_responsables_matricula: !!rc.usado_fallback_responsables_matricula,
    email_usado_fallback_gestores: !!rc.usado_fallback_gestores,
  };
}
