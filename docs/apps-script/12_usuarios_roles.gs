// ======================================================================
// 12_usuarios_roles.gs
// Gestion de usuarios/roles desde pestana USUARIOS:
// headers: email | nombre | rol | activo | telefono | fecha_alta
// roles: GESTOR | RESPONSABLE | OPERARIO
// ======================================================================

function normalizeRol_(rol) {
  var v = String(rol || "").trim().toUpperCase();
  if (v !== "GESTOR" && v !== "RESPONSABLE" && v !== "OPERARIO") return "OPERARIO";
  return v;
}

function normalizeActivo_(activo) {
  var v = String(activo == null ? "SI" : activo).trim().toUpperCase();
  return (v === "SI" || v === "TRUE" || v === "1") ? "SI" : "NO";
}

function getUsuariosSheet_() {
  return getSheet("USUARIOS");
}

function apiUsuariosList() {
  var sh = getUsuariosSheet_();
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) return [];
  var headers = all[0].map(String);
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    if (!String(obj.email || "").trim()) continue;
    obj.email = String(obj.email || "").trim().toLowerCase();
    obj.rol = normalizeRol_(obj.rol);
    obj.activo = normalizeActivo_(obj.activo);
    out.push(obj);
  }
  return out;
}

function apiUsuarioGet(payload) {
  payload = payload || {};
  var email = String(payload.email || payload.user_email || "").trim().toLowerCase();
  if (!email) throw new Error("Falta campo: email");
  var list = apiUsuariosList();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].email || "").trim().toLowerCase() === email) return list[i];
  }
  return null;
}

function apiUsuarioGuardar(payload) {
  payload = payload || {};
  var email = String(payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("Falta campo: email");

  var rowObj = {
    email: email,
    nombre: String(payload.nombre || "").trim(),
    rol: normalizeRol_(payload.rol || payload.role || "OPERARIO"),
    activo: normalizeActivo_(payload.activo),
    telefono: String(payload.telefono || "").trim(),
    fecha_alta: String(payload.fecha_alta || normalizeDateDMYCell_(new Date())).trim(),
  };

  var sh = getUsuariosSheet_();
  var all = sh.getDataRange().getValues();
  var headers = all[0].map(String);
  var idxEmail = headers.indexOf("email");
  if (idxEmail < 0) throw new Error("No existe columna email en USUARIOS");

  // actualizar si existe
  for (var r = 1; r < all.length; r++) {
    var current = String(all[r][idxEmail] || "").trim().toLowerCase();
    if (current !== email) continue;
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (rowObj[h] !== undefined) sh.getRange(r + 1, c + 1).setValue(rowObj[h]);
    }
    return { email: email, updated: true };
  }

  // crear nuevo
  appendRowByHeaders_(sh, rowObj);
  return { email: email, created: true };
}
