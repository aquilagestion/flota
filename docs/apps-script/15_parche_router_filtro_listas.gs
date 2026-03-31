// ======================================================================
// PARCHE mínimo para 09_api_router.gs
// En doGet, sustituye SOLO los bloques gasto_list y mantenimiento_list
// para pasar user_email al backend filtrado.
// ======================================================================

if (action === "gasto_list") {
  var out = jsonOk(
    apiGastoList({
      matricula: e.parameter.matricula || "",
      requester_email: e.parameter.user_email || "",
      user_email: e.parameter.user_email || "",
    }),
    "Gastos obtenidos"
  );
  logApi_(action, "GET", user, "success", "OK");
  return out;
}

if (action === "mantenimiento_list") {
  var out = jsonOk(
    apiMantenimientoList({
      matricula: e.parameter.matricula || "",
      requester_email: e.parameter.user_email || "",
      user_email: e.parameter.user_email || "",
    }),
    "Mantenimientos obtenidos"
  );
  logApi_(action, "GET", user, "success", "OK");
  return out;
}

