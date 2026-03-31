// ======================================================================
// PARCHE para 09_api_router.gs
// Añadir bloques dentro de doGet / doPost
// ======================================================================

// ---------- doGet ----------
// insertar antes de INVALID_ACTION
if (action === "usuarios_list") {
  var out = jsonOk(apiUsuariosList(), "Usuarios obtenidos");
  logApi_(action, "GET", user, "success", "OK");
  return out;
}
if (action === "usuario_get") {
  var out = jsonOk(apiUsuarioGet({ email: e.parameter.email || e.parameter.user_email || "" }), "Usuario obtenido");
  logApi_(action, "GET", user, "success", "OK");
  return out;
}

// ---------- doPost ----------
// insertar antes de INVALID_ACTION
if (action === "usuario_guardar" || action === "usuarios_guardar" || action === "usuario_upsert") {
  var out = jsonOk(apiUsuarioGuardar(body), "Usuario guardado");
  logApi_(action, "POST", user, "success", "OK");
  return out;
}
