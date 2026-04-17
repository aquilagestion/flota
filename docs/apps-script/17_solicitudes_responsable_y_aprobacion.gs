// ======================================================================
// 17_solicitudes_responsable_y_aprobacion.gs
// Flujo de alta RESPONSABLE:
// - El usuario se registra como OPERARIO provisional.
// - Se crea solicitud al gestor.
// - El gestor aprueba/rechaza, asigna vehiculos y se notifica por email.
// ======================================================================

var SHEET_SOLICITUDES_RESP = "SOLICITUDES_RESPONSABLE";

function getSolicitudesResponsableSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SOLICITUDES_RESP);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SOLICITUDES_RESP);
    sh.getRange(1, 1, 1, 10).setValues([[
      "id_solicitud",
      "email",
      "nombre",
      "rol_solicitado",
      "estado",
      "vehiculos_asignados",
      "fecha_solicitud",
      "fecha_resolucion",
      "resuelto_por_email",
      "comentario"
    ]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getGestoresActivosEmails_() {
  var rows = rowsToObjects_(getSheet("USUARIOS"));
  return rows
    .filter(function (r) {
      var rol = String(r.rol || "").trim().toUpperCase();
      var activo = String(r.activo || "").trim().toUpperCase();
      var email = String(r.email || "").trim().toLowerCase();
      return email && rol === "GESTOR" && (activo === "SI" || activo === "TRUE" || activo === "1");
    })
    .map(function (r) {
      return String(r.email || "").trim().toLowerCase();
    });
}

function apiSolicitudResponsableCrear(payload) {
  payload = payload || {};
  var email = String(payload.email || payload.user_email || "").trim().toLowerCase();
  var nombre = String(payload.nombre || "").trim();
  if (!email) throw new Error("Falta campo: email");
  if (!nombre) throw new Error("Falta campo: nombre");

  var sh = getSolicitudesResponsableSheet_();
  var id = genId_("SR");
  var rowObj = {
    id_solicitud: id,
    email: email,
    nombre: nombre,
    rol_solicitado: "RESPONSABLE",
    estado: "PENDIENTE",
    vehiculos_asignados: "",
    fecha_solicitud: normalizeDateDMYCell_(payload.fecha_solicitud || new Date()),
    fecha_resolucion: "",
    resuelto_por_email: "",
    comentario: String(payload.comentario || "").trim(),
  };
  appendRowByHeaders_(sh, rowObj);

  // Aviso por email a gestores (si MailApp disponible y hay destinatarios).
  var gestores = getGestoresActivosEmails_();
  if (gestores.length) {
    try {
      MailApp.sendEmail({
        to: gestores.join(","),
        subject: "[FLOTA] Nueva solicitud de rol RESPONSABLE",
        htmlBody:
          "<p>Se ha recibido una solicitud de rol RESPONSABLE.</p>" +
          "<p><b>Nombre:</b> " + nombre + "<br/>" +
          "<b>Email:</b> " + email + "<br/>" +
          "<b>ID solicitud:</b> " + id + "</p>",
      });
    } catch (e) {
      // No bloqueamos la solicitud por fallo de envio de correo.
    }
  }

  return { id_solicitud: id, notified_gestores: gestores.length };
}

function apiSolicitudesResponsableList(payload) {
  payload = payload || {};
  var requester = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  requireRolGestorOrAdministracion_(requester);

  var estado = String(payload.estado || "").trim().toUpperCase();
  var rows = rowsToObjects_(getSolicitudesResponsableSheet_());
  if (estado) {
    rows = rows.filter(function (r) {
      return String(r.estado || "").trim().toUpperCase() === estado;
    });
  }
  return rows;
}

function assignVehiclesToResponsable_(email, nombre, matriculasArr) {
  var sh = getSheet("FLOTA");
  var rows = rowsToObjects_(sh);
  var headers = getHeaders_(sh);
  var idxMat = headers.indexOf("matricula");
  var idxResponsable = headers.indexOf("responsable");
  var idxNotif = headers.indexOf("e-mail_de_notificaciones");
  if (idxMat < 0) throw new Error("No existe columna matricula en FLOTA");

  var set = {};
  for (var i = 0; i < matriculasArr.length; i++) {
    set[normalizeMatricula_(matriculasArr[i])] = true;
  }

  for (var r = 0; r < rows.length; r++) {
    var rowNum = r + 2;
    var mat = normalizeMatricula_(rows[r].matricula);
    if (!set[mat]) continue;
    if (idxResponsable >= 0) sh.getRange(rowNum, idxResponsable + 1).setValue(nombre || email);
    if (idxNotif >= 0) sh.getRange(rowNum, idxNotif + 1).setValue(email);
  }
}

function apiSolicitudResponsableResolver(payload) {
  payload = payload || {};
  var requester = String(payload.user_email || payload.resuelto_por_email || "").trim().toLowerCase();
  requireRolGestorOrAdministracion_(requester);

  var id = String(payload.id_solicitud || "").trim();
  var estado = String(payload.estado || "").trim().toUpperCase(); // APROBADA | RECHAZADA
  if (!id) throw new Error("Falta campo: id_solicitud");
  if (estado !== "APROBADA" && estado !== "RECHAZADA") throw new Error("Estado inválido");

  var sh = getSolicitudesResponsableSheet_();
  var rows = rowsToObjects_(sh);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_solicitud || "").trim() === id) {
      target = rows[i];
      break;
    }
  }
  if (!target) throw new Error("Solicitud no encontrada");
  if (String(target.estado || "").trim().toUpperCase() !== "PENDIENTE") {
    throw new Error("La solicitud ya está resuelta");
  }

  var vehiculosArr = normalizeMultiArray_(payload.vehiculos_asignados || payload.matriculas || "");
  var vehiculosText = vehiculosArr.join(";");
  var comentario = String(payload.comentario || "").trim();

  var headers = getHeaders_(sh);
  var rowNum = Number(target._row || 0);
  if (!rowNum) throw new Error("No se pudo localizar la fila de la solicitud");
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "estado") sh.getRange(rowNum, c + 1).setValue(estado);
    if (h === "vehiculos_asignados") sh.getRange(rowNum, c + 1).setValue(vehiculosText);
    if (h === "fecha_resolucion") sh.getRange(rowNum, c + 1).setValue(normalizeDateDMYCell_(new Date()));
    if (h === "resuelto_por_email") sh.getRange(rowNum, c + 1).setValue(requester);
    if (h === "comentario") sh.getRange(rowNum, c + 1).setValue(comentario);
  }

  // Actualizar USUARIOS: si se aprueba, pasa a RESPONSABLE (preservar pwd/fecha_alta/telefono).
  if (estado === "APROBADA") {
    var targetEmail = String(target.email || "").trim().toLowerCase();
    var existing = null;
    try {
      existing = apiUsuarioGet({ email: targetEmail });
    } catch (e) {
      existing = null;
    }
    var guard = {
      email: targetEmail,
      nombre: String(target.nombre || "").trim(),
      rol: "RESPONSABLE",
      activo: "SI",
    };
    if (existing) {
      guard.telefono = String(existing.telefono || "").trim();
      if (String(existing.fecha_alta || "").trim()) guard.fecha_alta = String(existing.fecha_alta).trim();
      if (String(existing.pwd || "").trim()) guard.pwd = String(existing.pwd);
    }
    apiUsuarioGuardar(guard);
    assignVehiclesToResponsable_(
      String(target.email || "").trim().toLowerCase(),
      String(target.nombre || "").trim(),
      vehiculosArr
    );
  }

  // Aviso por email al solicitante.
  var userEmail = String(target.email || "").trim().toLowerCase();
  if (userEmail) {
    try {
      var subject = "[FLOTA] Solicitud rol RESPONSABLE " + estado;
      var body =
        "<p>Tu solicitud de rol RESPONSABLE ha sido <b>" + estado + "</b>.</p>" +
        (estado === "APROBADA"
          ? "<p><b>Vehículos asignados:</b> " + (vehiculosText || "(sin asignación)") + "</p>"
          : "") +
        (comentario ? "<p><b>Comentario:</b> " + comentario + "</p>" : "");
      MailApp.sendEmail({ to: userEmail, subject: subject, htmlBody: body });
    } catch (e) {
      // no bloquear
    }
  }

  return {
    id_solicitud: id,
    estado: estado,
    vehiculos_asignados: vehiculosArr,
  };
}

