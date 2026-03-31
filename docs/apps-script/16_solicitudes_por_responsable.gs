// ======================================================================
// 16_solicitudes_por_responsable.gs
// Refuerzo backend para solicitudes:
// - RESPONSABLE ve/gestiona solicitudes de vehículos a su cargo
// - GESTOR ve/gestiona todas
// - OPERARIO solo sus propias solicitudes (consulta), sin resolver
//
// NOTA: Reemplaza tus funciones apiSolicitudList / apiSolicitudResolver
// por estas versiones si quieres blindaje completo en backend.
// ======================================================================

function getAllSolicitudesRows_() {
  return readSheetObjects_("SOLICITUDES");
}

function apiSolicitudList(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.requester_email || payload.user_email || payload.trabajador_email || ""
  );
  var rol = normalizeRolSegunUsuarios_(requester);
  var estado = String(payload.estado || "").trim().toUpperCase();

  var rows = getAllSolicitudesRows_();
  var assigned = rol === "RESPONSABLE" ? getMatriculasACargo_(requester) : {};

  return rows.filter(function (r) {
    var rEstado = String(r.estado || "").trim().toUpperCase();
    if (estado && rEstado !== estado) return false;

    if (rol === "GESTOR") return true;

    var trabajador = normalizeEmail_(r.trabajador_email || r.usuario_email || "");
    if (rol === "OPERARIO") return trabajador === requester;

    // RESPONSABLE
    if (trabajador === requester) return true;
    var mat = String(r.matricula || "").trim().toUpperCase();
    return !!assigned[mat];
  });
}

function apiSolicitudResolver(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.resuelto_por_email || payload.user_email || payload.requester_email || ""
  );
  var rol = normalizeRolSegunUsuarios_(requester);
  if (rol !== "GESTOR" && rol !== "RESPONSABLE") {
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
  var headers = all[0].map(String);

  var idxId = headers.indexOf("id_solicitud");
  var idxEstado = headers.indexOf("estado");
  var idxMat = headers.indexOf("matricula");
  var idxResuelto = headers.indexOf("resuelto_por_email");
  var idxFecha = headers.indexOf("fecha_resolucion");
  if (idxId < 0 || idxEstado < 0) throw new Error("Faltan headers id_solicitud/estado en SOLICITUDES");

  var assigned = rol === "RESPONSABLE" ? getMatriculasACargo_(requester) : {};

  for (var r = 1; r < all.length; r++) {
    var currId = String(all[r][idxId] || "").trim();
    if (currId !== id) continue;

    if (rol === "RESPONSABLE") {
      var mat = idxMat >= 0 ? String(all[r][idxMat] || "").trim().toUpperCase() : "";
      if (!assigned[mat]) throw new Error("Solo puedes resolver solicitudes de vehículos a tu cargo");
    }

    sh.getRange(r + 1, idxEstado + 1).setValue(estado);
    if (idxResuelto >= 0) sh.getRange(r + 1, idxResuelto + 1).setValue(requester);
    if (idxFecha >= 0) sh.getRange(r + 1, idxFecha + 1).setValue(normalizeDateDMYCell_(new Date()));
    return { id_solicitud: id, estado: estado };
  }

  throw new Error("No existe la solicitud");
}
