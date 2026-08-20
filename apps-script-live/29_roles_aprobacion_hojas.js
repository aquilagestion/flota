// ======================================================================
// 29_roles_aprobacion_hojas.gs
// Helpers de permisos para revisión/pago de hojas de gasto.
// ======================================================================

function getRolUsuarioHojas_(email) {
  var e = String(email || "").trim().toLowerCase();
  if (!e) return "";
  try {
    var u = apiUsuarioGet({ email: e });
    return String((u && (u.rol || u.role)) || "")
      .trim()
      .toUpperCase();
  } catch (_) {
    return "";
  }
}

function requireRolGestorOnly_(email) {
  var rol = getRolUsuarioHojas_(email);
  if (rol !== "GESTOR") {
    throw new Error("Permisos insuficientes: solo GESTOR");
  }
}

function requireRolAdministracionOnly_(email) {
  var rol = getRolUsuarioHojas_(email);
  if (rol !== "ADMINISTRACION") {
    throw new Error("Permisos insuficientes: solo ADMINISTRACION");
  }
}

function requireRolGestorOrAdministracion_(email) {
  var rol = getRolUsuarioHojas_(email);
  if (rol !== "GESTOR" && rol !== "ADMINISTRACION") {
    throw new Error("Permisos insuficientes: solo GESTOR o ADMINISTRACION");
  }
}

function requireRolImportExcelHojaGasto_(email) {
  var rol = getRolUsuarioHojas_(email);
  if (rol === "GESTOR" || rol === "ADMINISTRACION" || rol === "RESPONSABLE") return;
  throw new Error(
    "Permisos insuficientes: la importación Excel solo está disponible para GESTOR, ADMINISTRACION o RESPONSABLE"
  );
}

function puedeVerHojaGasto_(rol) {
  var r = String(rol || "").trim().toUpperCase();
  return (
    r === "GESTOR" ||
    r === "ADMINISTRACION" ||
    r === "RESPONSABLE" ||
    r === "OPERARIO" ||
    r === "USUARIO" ||
    r === "COLABORADOR"
  );
}

/** Metadatos de una hoja (titular + matrículas en líneas) desde GASTOS. */
function getHojaGastoMeta_(hojaId) {
  var id = String(hojaId || "").trim();
  if (!id) return null;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) return null;

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) return null;

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) {
    idx[String(headers[c] || "").trim()] = c;
  }

  function col(name) {
    return idx[name] !== undefined ? idx[name] : -1;
  }

  var cHoja = col("hoja_gasto_id");
  var cEmail = col("responsable_email");
  var cMat = col("matricula");
  if (cHoja < 0) return null;

  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var ownerEmail = "";
  var matriculasMap = {};

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var hid = String(row[cHoja] || "").trim();
    if (hid !== id) continue;
    if (!ownerEmail && cEmail >= 0) {
      ownerEmail = String(row[cEmail] || "").trim().toLowerCase();
    }
    if (cMat >= 0) {
      var mat = String(row[cMat] || "").trim().toUpperCase();
      if (mat) matriculasMap[mat] = true;
    }
  }

  if (!ownerEmail && !Object.keys(matriculasMap).length) return null;
  return { ownerEmail: ownerEmail, matriculasMap: matriculasMap };
}

/**
 * Puede aprobar/rechazar revisión de hoja:
 * - GESTOR / ADMINISTRACION: todas.
 * - RESPONSABLE: propias o con líneas en matrículas a su cargo.
 */
function puedeRevisarHojaGasto_(requesterEmail, ownerEmail, matriculasMap) {
  var req = normalizeEmail_(requesterEmail);
  if (!req) return false;

  var rol = getRolUsuarioHojas_(req);
  if (!rol) return false;
  if (rol === "GESTOR" || rol === "ADMINISTRACION") return true;
  if (rol !== "RESPONSABLE") return false;

  var owner = normalizeEmail_(ownerEmail);
  if (owner === req) return true;

  var assigned = getMatriculasACargo_(req);
  matriculasMap = matriculasMap || {};
  for (var mat in matriculasMap) {
    if (!Object.prototype.hasOwnProperty.call(matriculasMap, mat)) continue;
    if (matriculasMap[mat] && assigned[mat]) return true;
  }
  return false;
}

function requirePuedeRevisarHojaGasto_(actorEmail, hojaId) {
  var actor = String(actorEmail || "").trim().toLowerCase();
  if (!actor) throw new Error("Falta user_email");

  var meta = getHojaGastoMeta_(hojaId);
  if (!meta) throw new Error("Hoja de gasto no encontrada: " + hojaId);

  if (!puedeRevisarHojaGasto_(actor, meta.ownerEmail, meta.matriculasMap)) {
    throw new Error("Permisos insuficientes: no puedes revisar esta hoja de gasto");
  }
}

// Alias de compatibilidad por typo frecuente.
function requireRolGestorOrAdministration_(email) {
  return requireRolGestorOrAdministracion_(email);
}