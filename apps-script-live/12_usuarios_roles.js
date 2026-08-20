// ======================================================================
// 12_usuarios_roles.gs
// Gestion de usuarios/roles desde pestana USUARIOS:
// headers: email | nombre | rol | activo | telefono | fecha_alta | pwd (opcional)
// roles: GESTOR | ADMINISTRACION | RESPONSABLE | USUARIO | COLABORADOR (OPERARIO legacy → USUARIO)
// ======================================================================

function normalizeRol_(rol) {
  var v = String(rol || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (v === "ADMIN") return "ADMINISTRACION";
  if (v === "OPERARIO") return "USUARIO";
  if (
    v === "GESTOR" ||
    v === "ADMINISTRACION" ||
    v === "RESPONSABLE" ||
    v === "USUARIO" ||
    v === "COLABORADOR"
  ) {
    return v;
  }
  return "USUARIO";
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
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEmail = headerIndexCI_(headers, "email");
  var idxRol = headerIndexCI_(headers, "rol");
  var idxActivo = headerIndexCI_(headers, "activo");
  var idxNombre = headerIndexCI_(headers, "nombre");
  var idxTel = headerIndexCI_(headers, "telefono");
  var idxPwd = headerIndexCI_(headers, "pwd");
  var idxFecha = headerIndexCI_(headers, "fecha_alta");
  var out = [];
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    var emailRaw = idxEmail >= 0 ? row[idxEmail] : obj.email || obj.Email || "";
    if (!String(emailRaw || "").trim()) continue;
    obj.email = String(emailRaw || "").trim().toLowerCase();
    // Importante: la cabecera puede ser "Rol"/"ROL"; no usar solo obj.rol (undefined → USUARIO).
    var rolRaw = idxRol >= 0 ? row[idxRol] : obj.rol || obj.Rol || obj.role || "";
    obj.rol = normalizeRol_(rolRaw);
    var activoRaw = idxActivo >= 0 ? row[idxActivo] : obj.activo || obj.Activo || "SI";
    obj.activo = normalizeActivo_(activoRaw);
    if (idxNombre >= 0) obj.nombre = String(row[idxNombre] || "").trim();
    if (idxTel >= 0) obj.telefono = String(row[idxTel] || "").trim();
    if (idxPwd >= 0) obj.pwd = String(row[idxPwd] || "");
    if (idxFecha >= 0) obj.fecha_alta = String(row[idxFecha] || "").trim();
    out.push(obj);
  }
  return out;
}

/**
 * Lista mínima de aprobadores de uso de vehículo (email, rol, activo).
 * Accesible a RESPONSABLE/GESTOR/ADMINISTRACION para SLA/escalado sin exponer
 * la lista completa de USUARIOS (pwd, etc.).
 */
function apiUsuariosAprobadoresUsoList(payload) {
  payload = payload || {};
  var requester = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  if (!requester) throw new Error("Falta user_email");
  var rol = normalizeRolSegunUsuarios_(requester);
  if (rol !== "RESPONSABLE" && rol !== "GESTOR" && rol !== "ADMINISTRACION") {
    throw new Error("Permisos insuficientes para listar aprobadores de uso");
  }
  var list = apiUsuariosList();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    var r = String(u.rol || "").trim().toUpperCase();
    if (r !== "RESPONSABLE" && r !== "GESTOR" && r !== "ADMINISTRACION") continue;
    out.push({
      email: String(u.email || "").trim().toLowerCase(),
      rol: r,
      activo: String(u.activo || "SI").trim().toUpperCase() || "SI",
      nombre: String(u.nombre || "").trim(),
    });
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

  var sh = getUsuariosSheet_();
  var all = sh.getDataRange().getValues();
  var headers = all[0].map(function (h) {
    return String(h || "")
      .trim()
      .replace(/^\uFEFF/, "");
  });
  var idxEmail = headerIndexCI_(headers, "email");
  if (idxEmail < 0) throw new Error("No existe columna email en USUARIOS");
  var idxRol = headerIndexCI_(headers, "rol");
  var idxNombre = headerIndexCI_(headers, "nombre");
  var idxActivo = headerIndexCI_(headers, "activo");
  var idxTel = headerIndexCI_(headers, "telefono");
  var idxPwd = headerIndexCI_(headers, "pwd");
  var idxFecha = headerIndexCI_(headers, "fecha_alta");

  var updateRow = -1;
  for (var r = 1; r < all.length; r++) {
    var current = String(all[r][idxEmail] || "").trim().toLowerCase();
    if (current === email) {
      updateRow = r;
      break;
    }
  }
  var isUpdate = updateRow >= 0;

  // Si el cliente manda USUARIO por error de lectura previa, conservar el rol real de la fila.
  var rolIncoming = payload.rol !== undefined || payload.role !== undefined
    ? normalizeRol_(payload.rol || payload.role)
    : "";
  var rolActual = "";
  if (isUpdate && idxRol >= 0) {
    rolActual = normalizeRol_(all[updateRow][idxRol]);
  }
  var rolFinal = rolIncoming;
  if (!rolFinal) rolFinal = rolActual || "USUARIO";
  var actorEmail = String(payload.actor_email || payload.actualizado_por_email || "").trim().toLowerCase();
  var isSelfEdit = actorEmail && actorEmail === email;
  var preserve =
    String(payload.preserve_role_if_usuario || payload.preserve_higher_role || "").trim() ||
    isSelfEdit;
  function rankRol_(r) {
    var x = String(r || "").trim().toUpperCase();
    if (x === "ADMINISTRACION" || x === "ADMIN") return 5;
    if (x === "GESTOR") return 4;
    if (x === "RESPONSABLE") return 3;
    if (x === "COLABORADOR") return 2;
    if (x === "USUARIO" || x === "OPERARIO") return 1;
    return 0;
  }
  if (
    isUpdate &&
    rolActual &&
    rankRol_(rolActual) > rankRol_(rolIncoming || "USUARIO") &&
    preserve
  ) {
    // Autoedición / perfil: no degradar GESTOR/RESPONSABLE/ADMIN.
    rolFinal = rolActual;
  }
  if (
    isUpdate &&
    rolActual &&
    rolActual !== "USUARIO" &&
    rolIncoming === "USUARIO" &&
    preserve
  ) {
    rolFinal = rolActual;
  }

  var rowObj = {
    email: email,
    nombre: String(payload.nombre || "").trim(),
    rol: rolFinal,
    activo: normalizeActivo_(payload.activo),
    telefono: String(payload.telefono || "").trim(),
  };
  if (payload.pwd !== undefined) {
    rowObj.pwd = String(payload.pwd || "");
  }
  if (payload.nif !== undefined) rowObj.nif = String(payload.nif || "").trim();
  if (payload.iban !== undefined) rowObj.iban = String(payload.iban || "").trim();
  if (payload.fecha_alta !== undefined && String(payload.fecha_alta || "").trim() !== "") {
    rowObj.fecha_alta = String(payload.fecha_alta).trim();
  } else if (!isUpdate) {
    rowObj.fecha_alta = normalizeDateDMYCell_(new Date());
  }

  var idxNif = headerIndexCI_(headers, "nif");
  var idxIban = headerIndexCI_(headers, "iban");

  // actualizar si existe (cabeceras CI)
  if (isUpdate) {
    if (idxEmail >= 0) sh.getRange(updateRow + 1, idxEmail + 1).setValue(rowObj.email);
    if (idxNombre >= 0 && rowObj.nombre !== undefined) sh.getRange(updateRow + 1, idxNombre + 1).setValue(rowObj.nombre);
    if (idxRol >= 0) sh.getRange(updateRow + 1, idxRol + 1).setValue(rowObj.rol);
    if (idxActivo >= 0) sh.getRange(updateRow + 1, idxActivo + 1).setValue(rowObj.activo);
    if (idxTel >= 0) sh.getRange(updateRow + 1, idxTel + 1).setValue(rowObj.telefono);
    if (idxPwd >= 0 && payload.pwd !== undefined) sh.getRange(updateRow + 1, idxPwd + 1).setValue(rowObj.pwd);
    if (idxFecha >= 0 && rowObj.fecha_alta) sh.getRange(updateRow + 1, idxFecha + 1).setValue(rowObj.fecha_alta);
    if (idxNif >= 0 && payload.nif !== undefined) sh.getRange(updateRow + 1, idxNif + 1).setValue(rowObj.nif);
    if (idxIban >= 0 && payload.iban !== undefined) sh.getRange(updateRow + 1, idxIban + 1).setValue(rowObj.iban);
    return { email: email, updated: true, rol: rowObj.rol };
  }

  // crear nuevo
  if (!rowObj.fecha_alta) rowObj.fecha_alta = normalizeDateDMYCell_(new Date());
  appendRowByHeaders_(sh, rowObj);
  return { email: email, created: true, rol: rowObj.rol };
}
