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

// Alias de compatibilidad por typo frecuente.
function requireRolGestorOrAdministration_(email) {
  return requireRolGestorOrAdministracion_(email);
}