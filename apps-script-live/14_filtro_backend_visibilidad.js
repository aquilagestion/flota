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

/** Quita tildes para comparar cabeceras (p. ej. matrícula → matricula). */
function headerKeyNormalize_(s) {
  var t = String(s || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  try {
    return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    return t;
  }
}

/** Índice de cabecera ignorando mayúsculas, BOM y tildes (p. ej. "Matrícula", "fecha_inicio"). */
function headerIndexCI_(headers, canonical) {
  var want = headerKeyNormalize_(canonical);
  for (var i = 0; i < headers.length; i++) {
    var h = headerKeyNormalize_(headers[i]);
    if (h === want) return i;
  }
  return -1;
}

function normalizeRolSegunUsuarios_(email) {
  var e = normalizeEmail_(email);
  if (!e) return "OPERARIO";

  var sh = getSheet("USUARIOS");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return "OPERARIO";

  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEmail = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  if (idxEmail < 0 || idxRol < 0) return "OPERARIO";

  for (var i = 1; i < all.length; i++) {
    var mail = normalizeEmail_(all[i][idxEmail]);
    if (mail !== e) continue;
    var rol = String(all[i][idxRol] || "").trim().toUpperCase();
    if (rol === "GESTOR" || rol === "RESPONSABLE" || rol === "OPERARIO") return rol;
    if (rol === "ADMINISTRACION" || rol === "ADMIN") return "ADMINISTRACION";
    return "OPERARIO";
  }
  return "OPERARIO";
}
function canViewAllByRole_(email) {
  return normalizeRolSegunUsuarios_(email) === "GESTOR";
}

/**
 * La celda e-mail_de_notificaciones puede traer varios correos separados por ; o ,.
 * Antes solo se comparaba la cadena entera con normalizeEmail_, y nunca coincidía.
 */
function notificacionesEmailMatches_(me, notifRaw) {
  var me2 = normalizeEmail_(me);
  if (!me2) return false;
  var raw = String(notifRaw || "").trim();
  if (!raw) return false;
  if (normalizeEmail_(raw) === me2) return true;
  var parts = raw.split(/[;,]/);
  for (var i = 0; i < parts.length; i++) {
    var e = normalizeEmail_(parts[i]);
    if (e && e === me2) return true;
  }
  return false;
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
    if (resp === me) {
      out[mat] = true;
      continue;
    }
    var notifRaw = String(r["e-mail_de_notificaciones"] || r.email_de_notificaciones || "").trim();
    if (notificacionesEmailMatches_(me, notifRaw)) out[mat] = true;
  }
  return out;
}

/**
 * Visibilidad de una hoja de gasto (cabecera = email en columna responsable_email de GASTOS).
 * matriculasMap: { MAT123: true, ... } matrículas presentes en las filas de esa hoja.
 * Alineado con la app: OPERARIO solo propias; RESPONSABLE propias o vehículo a cargo; GESTOR/ADMIN todo.
 */
function puedeVerHojaGastoResumen_(requester, rol, ownerEmail, matriculasMap) {
  var req = normalizeEmail_(requester);
  var owner = normalizeEmail_(ownerEmail);
  var r = String(rol || "").trim().toUpperCase();
  if (!req) return false;
  if (r === "GESTOR" || r === "ADMINISTRACION") return true;
  if (r === "OPERARIO" || r === "COLABORADOR") return owner === req;
  if (r === "RESPONSABLE") {
    if (owner === req) return true;
    var assigned = getMatriculasACargo_(req);
    matriculasMap = matriculasMap || {};
    for (var mat in matriculasMap) {
      if (!Object.prototype.hasOwnProperty.call(matriculasMap, mat)) continue;
      if (matriculasMap[mat] && assigned[mat]) return true;
    }
    return false;
  }
  return false;
}

function readSheetObjects_(sheetName) {
  var sh = getSheet(sheetName);
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (!key) key = "COL_" + c;
      obj[key] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function getAllGastosRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = [];

  // 1) GASTOS general (fuente principal)
  var shGeneral = ss.getSheetByName("GASTOS");
  if (shGeneral) {
    out = out.concat(readSheetObjects_("GASTOS"));
  }

  // 2) Pestañas por tipo: incorporar filas que no estén ya en GASTOS (p. ej. histórico solo en tipo)
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
    "GASTOS_BILLETES",
    "GASTOS_MULTAS",
    "GASTOS_KILOMETRAJE_COLABORADOR"
  ];
  for (var i = 0; i < typeSheets.length; i++) {
    if (ss.getSheetByName(typeSheets[i])) {
      out = out.concat(readSheetObjects_(typeSheets[i]));
    }
  }

  // Dedupe por id_gasto (prioriza la primera aparición = GASTOS)
  var seen = {};
  var dedup = [];
  for (var j = 0; j < out.length; j++) {
    var row = out[j];
    if (!String(row.forma_pago || "").trim()) row.forma_pago = "Usuario";
    var id = String(row.id_gasto || "").trim();
    if (!id) {
      dedup.push(row);
      continue;
    }
    if (seen[id]) {
      var existing = seen[id];
      var keys = Object.keys(row);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (key === "_row") continue;
        if (existing[key] == null || String(existing[key]).trim() === "") {
          if (row[key] != null && String(row[key]).trim() !== "") existing[key] = row[key];
        }
      }
      continue;
    }
    seen[id] = row;
    dedup.push(row);
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

  return filtered.map(function (r) {
    if (!String(r.forma_pago || "").trim()) r.forma_pago = "Usuario";
    return serializeRowFechasForApi_(r);
  });
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

