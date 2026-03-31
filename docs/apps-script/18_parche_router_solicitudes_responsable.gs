// ======================================================================
// 18_parche_router_solicitudes_responsable.gs
// Parche para 09_api_router.gs (añadir dentro de doGet/doPost)
// ======================================================================

// ---- doGet ----
// if (action === "solicitudes_responsable_list") {
//   const out = jsonOk(
//     apiSolicitudesResponsableList({
//       estado: e.parameter.estado || "",
//       user_email: e.parameter.user_email || "",
//       requester_email: e.parameter.user_email || "",
//     }),
//     "Solicitudes de responsable obtenidas"
//   );
//   logApi_(action, "GET", user, "success", "OK");
//   return out;
// }

// ---- doPost ----
// if (action === "solicitud_responsable_crear") {
//   const out = jsonOk(apiSolicitudResponsableCrear(body), "Solicitud responsable creada");
//   logApi_(action, "POST", user, "success", "OK");
//   return out;
// }
//
// if (action === "solicitud_responsable_resolver") {
//   const out = jsonOk(apiSolicitudResponsableResolver(body), "Solicitud responsable resuelta");
//   logApi_(action, "POST", user, "success", "OK");
//   return out;
// }

