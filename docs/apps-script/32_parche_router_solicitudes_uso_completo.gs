// ======================================================================
// 32_parche_router_solicitudes_uso_completo.gs
// NO es un archivo ejecutable por sí solo: copia los bloques DENTRO de
// doGet(e) y doPost(e) de tu 09_api_router.gs (donde ya existen action, e,
// body, user, jsonOk, logApi_).
//
// Sin estas ramas, la app puede fallar o usar OTRO código antiguo que no
// llame a apiSolicitudCrear / apiSolicitudResolver (y entonces no habrá
// correos de 19 / 16).
//
// Requiere en el mismo proyecto:
// - 16_solicitudes_por_responsable.gs → apiSolicitudList, apiSolicitudResolver
// - 19_solicitud_uso_crear.gs       → apiSolicitudCrear, enviarCorreo*
// - 14_filtro_backend_visibilidad.gs (y helpers de hojas)
// ======================================================================

// ---------- doGet(e) — insertar antes de INVALID_ACTION / return error ----------
//
// if (action === "solicitud_list") {
//   var out = jsonOk(
//     apiSolicitudList({
//       requester_email: e.parameter.user_email || e.parameter.requester_email || "",
//       user_email: e.parameter.user_email || "",
//       trabajador_email: e.parameter.trabajador_email || "",
//       estado: e.parameter.estado || "",
//     }),
//     "Solicitudes obtenidas"
//   );
//   logApi_(action, "GET", user, "success", "OK");
//   return out;
// }
//
// if (action === "solicitud_resolver_desde_email") {
//   var out = resolverSolicitudDesdeCorreo_({
//     id_solicitud: e.parameter.id_solicitud || "",
//     estado: e.parameter.estado || "",
//     resolver_email: e.parameter.resolver_email || "",
//     token: e.parameter.token || "",
//   });
//   logApi_(action, "GET", user, "success", "OK");
//   return out;
// }

// ---------- doPost(e) — insertar antes de INVALID_ACTION ----------
//
// if (action === "solicitud_crear") {
//   var out = jsonOk(apiSolicitudCrear(body), "Solicitud de uso creada");
//   logApi_(action, "POST", user, "success", "OK");
//   return out;
// }
//
// if (action === "solicitud_resolver") {
//   var out = jsonOk(apiSolicitudResolver(body), "Solicitud resuelta");
//   logApi_(action, "POST", user, "success", "OK");
//   return out;
// }
