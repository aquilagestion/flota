// ======================================================================
// 14_filtro_backend_visibilidad.gs
// Blindaje de visibilidad en backend para:
// - apiGastoList(payload)
// - apiMantenimientoList(payload)
//
// Reglas:
// - GESTOR: ve todo
// - RESPONSABLE: ve sus registros + registros de vehículos a su cargo
// - OPERARIO: solo registros creados por su email
//
// Requiere:
// - hoja USUARIOS con headers: email, rol, activo
// - helpers existentes: getSheet(name), normalizeMatricula_ (opcional)
// ======================================================================

function normalizeEmail_(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeRolSegunUsuarios_(email) {
  var e = normalizeEmail_(email);
  if (!e) return "OPERARIO";

  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return "OPERARIO";

  var headers = all[0].map(String);
  var idxEmail = headers.indexOf("email");
  var idxRol = headers.indexOf("rol");
  if (idxEmail < 0 || idxRol < 0) return "OPERARIO";

  for (var i = 1; i < all.length; i++) {
    var mail = normalizeEmail_(all[i][idxEmail]);
    if (mail !== e) continue;
    var rol = String(all[i][idxRol] || "").trim().toUpperCase();
    if (rol === "GESTOR" || rol === "RESPONSABLE" || rol === "OPERARIO") return rol;
    return "OPERARIO";
  }
  return "OPERARIO";
}
function canViewAllByRole_(email) {
  return normalizeRolSegunUsuarios_(email) === "GESTOR";
}

function getMatriculasACargo_(email) {
  var me = normalizeEmail_(email);
  if (!me) return {};

  var out = {};
  var flota = readSheetObjects_("FLOTA");
  for (var i = 0; i < flota.length; i++) {
    var r = flota[i] || {};
    var mat = String(r.matricula || "").trim().toUpperCase();
    if (!mat) continue;
    var resp = normalizeEmail_(r.responsable || "");
    var notifRaw = String(r["e-mail_de_notificaciones"] || r.email_de_notificaciones || "").trim();
    var notif = normalizeEmail_(notifRaw);
    if (resp === me || notif === me) out[mat] = true;
  }
  return out;
}

function readSheetObjects_(sheetName) {
  var sh = getSheet(sheetName);
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(String);
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    out.push(obj);
  }
  return out;
}

function getAllGastosRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = [];

  // 1) Si existe GASTOS, lo usamos como fuente principal
  var shGeneral = ss.getSheetByName("GASTOS");
  if (shGeneral) {
    out = out.concat(readSheetObjects_("GASTOS"));
  }

  // 2) Si no hay GASTOS o está vacía, intentamos pestañas por tipo
  if (!out.length) {
    var typeSheets = [
      "GASTOS_COMBUSTIBLE",
      "GASTOS_SEGURO",
      "GASTOS_PEAJES",
      "GASTOS_PARKING",
      "GASTOS_IMPUESTOS",
      "GASTOS_OTROS_IMPUESTOS",
      "GASTOS_ITV",
      "GASTOS_REPUESTOS",
      "GASTOS_MANTENIMIENTO_REPARACIONES",
      "GASTOS_OTROS",
      "GASTOS_MULTAS"
    ];
    for (var i = 0; i < typeSheets.length; i++) {
      if (ss.getSheetByName(typeSheets[i])) {
        out = out.concat(readSheetObjects_(typeSheets[i]));
      }
    }
  }

  // Dedupe por id_gasto
  var seen = {};
  var dedup = [];
  for (var j = 0; j < out.length; j++) {
    var id = String(out[j].id_gasto || "").trim();
    if (!id) {
      dedup.push(out[j]);
      continue;
    }
    if (seen[id]) continue;
    seen[id] = true;
    dedup.push(out[j]);
  }
  return dedup;
}

// ----------------------------------------------------------------------
// REEMPLAZAR con esta versión tu apiGastoList actual
// ----------------------------------------------------------------------
function apiGastoList(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.requester_email || payload.user_email || payload.responsable_email || ""
  );
  var requesterRol = normalizeRolSegunUsuarios_(requester);
  var mat = String(payload.matricula || "").trim().toUpperCase();

  var rows = getAllGastosRows_();
  var allowAll = canViewAllByRole_(requester);
  var assigned = requesterRol === "RESPONSABLE" ? getMatriculasACargo_(requester) : {};

  var filtered = rows.filter(function (r) {
    if (mat) {
      var rMat = String(r.matricula || "").trim().toUpperCase();
      if (rMat !== mat) return false;
    }
    if (allowAll) return true;
    var owner = normalizeEmail_(r.responsable_email || r.usuario_email || r.user_email || "");
    if (owner && owner === requester) return true;
    if (requesterRol === "RESPONSABLE") {
      var m = String(r.matricula || "").trim().toUpperCase();
      return !!assigned[m];
    }
    return false;
  });

  return filtered;
}

// ----------------------------------------------------------------------
// REEMPLAZAR con esta versión tu apiMantenimientoList actual
// ----------------------------------------------------------------------
function apiMantenimientoList(payload) {
  payload = payload || {};
  var requester = normalizeEmail_(
    payload.requester_email || payload.user_email || payload.responsable_email || ""
  );
  var requesterRol = normalizeRolSegunUsuarios_(requester);
  var mat = String(payload.matricula || "").trim().toUpperCase();

  var rows = readSheetObjects_("MANTENIMIENTOS");
  var allowAll = canViewAllByRole_(requester);
  var assigned = requesterRol === "RESPONSABLE" ? getMatriculasACargo_(requester) : {};

  var filtered = rows.filter(function (r) {
    if (mat) {
      var rMat = String(r.matricula || "").trim().toUpperCase();
      if (rMat !== mat) return false;
    }
    if (allowAll) return true;
    var owner = normalizeEmail_(r.responsable_email || r.usuario_email || r.user_email || "");
    if (owner && owner === requester) return true;
    if (requesterRol === "RESPONSABLE") {
      var m = String(r.matricula || "").trim().toUpperCase();
      return !!assigned[m];
    }
    return false;
  });

  return filtered;
}

