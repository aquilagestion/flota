// ======================================================================
// PARCHE PARA doGet() en 09_api_router.gs
// Anadir estos bloques DENTRO de doGet(), despues de los endpoints existentes
// y ANTES del "logApi_(action...INVALID_ACTION)".
// ======================================================================

    // --- CATALOGOS ---
    if (action === "cat_tipos_gasto_list") {
      var out = jsonOk(apiCatTiposGastoList(), "Catalogo tipos gasto");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "cat_tipos_mantenimiento_list") {
      var out = jsonOk(apiCatTiposMantenimientoList(), "Catalogo tipos mantenimiento");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

// ======================================================================
// NOTA: Si ya tenias la funcion normalizeTipoGasto_() definida en
// otro archivo .gs, puedes borrar la anterior. La nueva version esta
// en 10_gastos_por_tipo.gs y soporta OTROS_IMPUESTOS y MULTAS_SANCIONES.
//
// NOTA 2: Si ya tenias apiGastoCrear y apiMantenimientoCrear en otro
// archivo .gs, BORRA las versiones anteriores. Las nuevas estan en
// 10_gastos_por_tipo.gs.
// ======================================================================
