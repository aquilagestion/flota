function doGet(e) {
  const action = String((e.parameter && e.parameter.action) || "").trim();
  const user = String((e.parameter && e.parameter.user_email) || "").trim().toLowerCase();

  try {
    if (action === "health") {
      const out = jsonOk({ api: "FLOTA_MOBILE_V1", now: formatDateTimeISO_(new Date()) }, "API activa");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "flota_list") {
      const out = jsonOk(apiFlotaList(), "Flota obtenida");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "disponibilidad_mes") {
      const anio = e.parameter.anio || e.parameter.ano || e.parameter["año"];
      const mes = e.parameter.mes;
      const out = jsonOk(apiDisponibilidadMes(anio, mes, e.parameter.user_email || ""), "Disponibilidad obtenida");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "gasto_list") {
      const out = jsonOk(
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
      const out = jsonOk(
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

    if (action === "cat_tipos_gasto_list") {
      const out = jsonOk(apiCatTiposGastoList(), "Catalogo tipos gasto");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "cat_tipos_mantenimiento_list") {
      const out = jsonOk(apiCatTiposMantenimientoList(), "Catalogo tipos mantenimiento");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_list") {
      const out = jsonOk(
        apiSolicitudList({
          estado: e.parameter.estado || "",
          trabajador_email: e.parameter.trabajador_email || "",
          requester_email: e.parameter.user_email || "",
          user_email: e.parameter.user_email || "",
        }),
        "Solicitudes obtenidas"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_resolver_desde_email") {
      const out = resolverSolicitudDesdeCorreo_({
        id_solicitud: e.parameter.id_solicitud || "",
        estado: e.parameter.estado || "",
        resolver_email: e.parameter.resolver_email || "",
        token: e.parameter.token || "",
        motivo_rechazo: e.parameter.motivo_rechazo || "",
      });
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "solicitudes_responsable_list") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(
        apiSolicitudesResponsableList({
          estado: e.parameter.estado || "",
          user_email: e.parameter.user_email || "",
          requester_email: e.parameter.user_email || "",
        }),
        "Solicitudes de responsable obtenidas"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "hojas_gasto_list") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(
        apiHojasGastoList({
          user_email: e.parameter.user_email || "",
          requester_email: e.parameter.user_email || "",
        }),
        "Hojas de gasto obtenidas"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "hoja_gasto_detalle") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(
        apiHojaGastoDetalle({
          hoja_gasto_id: e.parameter.hoja_gasto_id || e.parameter.hoja_id_local || "",
          user_email: e.parameter.user_email || "",
          requester_email: e.parameter.user_email || "",
        }),
        "Detalle de hoja de gasto obtenido"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "usuarios_list") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiUsuariosList(), "Usuarios obtenidos");
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "usuario_get") {
      const out = jsonOk(
        apiUsuarioGet({
          email: e.parameter.email || e.parameter.user_email || "",
        }),
        "Usuario obtenido"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "proyecto_list") {
      const out = jsonOk(
        apiProyectoList({
          solo_activos: e.parameter.solo_activos || "SI",
          user_email: e.parameter.user_email || "",
        }),
        "Proyectos obtenidos"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "proyecto_list_columna_b") {
      const out = jsonOk(
        apiProyectoListColumnaB({
          solo_activos: e.parameter.solo_activos || "SI",
          user_email: e.parameter.user_email || "",
        }),
        "Proyectos (columna B) obtenidos"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "proyecto_get") {
      const out = jsonOk(
        apiProyectoGet({
          id_proyecto: e.parameter.id_proyecto || "",
          user_email: e.parameter.user_email || "",
        }),
        "Proyecto obtenido"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_list") {
      const out = jsonOk(
        apiServicioColaboradorList({
          estado: e.parameter.estado || "",
          user_email: e.parameter.user_email || "",
        }),
        "Servicios de colaborador obtenidos"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_detalle") {
      const out = jsonOk(
        apiServicioColaboradorDetalle({
          id_servicio: e.parameter.id_servicio || "",
          user_email: e.parameter.user_email || "",
        }),
        "Detalle de servicio colaborador obtenido"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "tarifa_km_get_vigente") {
      const out = jsonOk(
        apiTarifaKmGetVigente({
          fecha_servicio: e.parameter.fecha_servicio || e.parameter.fecha || "",
        }),
        "Tarifa vigente obtenida"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "viaje_vehiculo_propio_list") {
      const out = jsonOk(
        apiViajeVehiculoPropioList({
          estado: e.parameter.estado || "",
          user_email: e.parameter.user_email || "",
        }),
        "Viajes de vehículo propio obtenidos"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    if (action === "viaje_vehiculo_propio_detalle") {
      const out = jsonOk(
        apiViajeVehiculoPropioDetalle({
          id_viaje: e.parameter.id_viaje || "",
          user_email: e.parameter.user_email || "",
        }),
        "Detalle de viaje de vehículo propio obtenido"
      );
      logApi_(action, "GET", user, "success", "OK");
      return out;
    }

    logApi_(action, "GET", user, "error", "INVALID_ACTION");
    return jsonError("Acción GET no reconocida", "INVALID_ACTION");
  } catch (err) {
    logApi_(action || "unknown", "GET", user, "error", err.message);
    return jsonError(err.message, "GET_EXCEPTION");
  }
}

function doPost(e) {
  let action = "";
  let user = "";

  try {
    if (!e.postData || !e.postData.contents) {
      logApi_("unknown", "POST", "", "error", "EMPTY_BODY");
      return jsonError("Body vacío", "EMPTY_BODY");
    }

    const body = JSON.parse(e.postData.contents);
    action = String(body.action || "").trim();
    user = String(
      body.user_email ||
        body.actualizado_por_email ||
        body.trabajador_email ||
        body.responsable_email ||
        body.resuelto_por_email ||
        body.email ||
        ""
    )
      .trim()
      .toLowerCase();

    if (action === "gasto_crear" || action === "mantenimiento_crear") {
      try {
        logApi_(action, "POST", user, "debug", "body_keys=" + Object.keys(body || {}).join(","));
      } catch (e2) {}
    }

    if (!validarSecret_(body.secret)) {
      logApi_(action, "POST", user, "error", "UNAUTHORIZED");
      return jsonError("No autorizado", "UNAUTHORIZED");
    }

    if (action === "adjunto_subir") {
      const out = jsonOk(apiAdjuntoSubir(body), "Adjunto subido");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "flota_crear") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiFlotaCrear(body), "Vehículo creado/actualizado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "gasto_crear") {
      const out = jsonOk(apiGastoCrear(body), "Gasto creado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "mantenimiento_crear") {
      const out = jsonOk(apiMantenimientoCrear(body), "Mantenimiento creado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "hoja_gasto_actualizar_gastos" || action === "hoja_gasto_actualizar_estado") {
      const out = jsonOk(apiHojaGastoActualizarGastos(body), "Hoja de gasto aplicada sobre GASTOS");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "hoja_gasto_actualizar_revision") {
      requireRolGestorOnly_(user);
      const out = jsonOk(apiHojaGastoActualizarRevision(body), "Revisión de hoja de gasto actualizada");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "hoja_gasto_actualizar_pago") {
      requireRolAdministracionOnly_(user);
      const out = jsonOk(apiHojaGastoActualizarPago(body), "Pago de hoja de gasto actualizado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_responsable_crear") {
      const out = jsonOk(apiSolicitudResponsableCrear(body), "Solicitud responsable creada");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_responsable_resolver") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiSolicitudResponsableResolver(body), "Solicitud responsable resuelta");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_crear") {
      const out = jsonOk(apiSolicitudCrear(body), "Solicitud de uso creada");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "solicitud_resolver") {
      const out = jsonOk(apiSolicitudResolver(body), "Solicitud resuelta");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "cancelar_solicitud") {
      const out = jsonOk(apiCancelarSolicitud(body), "Solicitud cancelada");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "liberacion_crear") {
      const out = jsonOk(apiLiberacionCrear(body), "Liberación creada");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "usuario_registro_publico") {
      const payload = {
        email: String(body.email || "")
          .trim()
          .toLowerCase(),
        nombre: String(body.nombre || "").trim(),
        rol: "OPERARIO",
        activo: "SI",
        pwd: String(body.pwd || "").trim(),
        fecha_alta: body.fecha_alta || normalizeDateDMYCell_(new Date()),
        telefono: String(body.telefono || "").trim(),
      };

      if (!payload.email) {
        logApi_(action, "POST", user, "error", "Falta campo: email");
        return jsonError("Falta campo: email", "POST_EXCEPTION");
      }
      if (!payload.nombre) {
        logApi_(action, "POST", user, "error", "Falta campo: nombre");
        return jsonError("Falta campo: nombre", "POST_EXCEPTION");
      }

      const out = jsonOk(apiUsuarioGuardar(payload), "Usuario registrado");
      logApi_(action, "POST", payload.email, "success", "OK");
      return out;
    }

    if (action === "usuario_guardar" || action === "usuarios_guardar" || action === "usuario_upsert") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiUsuarioGuardar(body), "Usuario guardado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "odometro_extraer") {
      const out = jsonOk(apiOdometroExtraer(body), "Lectura odometro extraida");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "proyecto_guardar") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiProyectoGuardar(body), "Proyecto guardado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "proyecto_eliminar") {
      requireRolGestorOrAdministracion_(user);
      const out = jsonOk(apiProyectoEliminar(body), "Proyecto eliminado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_crear") {
      const out = jsonOk(apiServicioColaboradorCrear(body), "Servicio colaborador creado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_actualizar") {
      const out = jsonOk(apiServicioColaboradorActualizar(body), "Servicio colaborador actualizado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_enviar") {
      const out = jsonOk(apiServicioColaboradorEnviar(body), "Servicio colaborador enviado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_resolver") {
      const out = jsonOk(apiServicioColaboradorResolver(body), "Servicio colaborador resuelto");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "servicio_colaborador_marcar_pagado") {
      const out = jsonOk(apiServicioColaboradorMarcarPagado(body), "Servicio colaborador marcado pagado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "gasto_servicio_crear") {
      const out = jsonOk(apiGastoServicioCrear(body), "Gasto de servicio creado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "gasto_servicio_actualizar") {
      const out = jsonOk(apiGastoServicioActualizar(body), "Gasto de servicio actualizado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "gasto_servicio_eliminar") {
      const out = jsonOk(apiGastoServicioEliminar(body), "Gasto de servicio eliminado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "viaje_vehiculo_propio_crear") {
      const out = jsonOk(apiViajeVehiculoPropioCrear(body), "Viaje de vehículo propio creado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "viaje_vehiculo_propio_actualizar") {
      const out = jsonOk(apiViajeVehiculoPropioActualizar(body), "Viaje de vehículo propio actualizado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    if (action === "viaje_vehiculo_propio_cerrar") {
      const out = jsonOk(apiViajeVehiculoPropioCerrar(body), "Viaje de vehículo propio cerrado");
      logApi_(action, "POST", user, "success", "OK");
      return out;
    }

    logApi_(action, "POST", user, "error", "INVALID_ACTION");
    return jsonError("Acción POST no reconocida", "INVALID_ACTION");
  } catch (err) {
    logApi_(action || "unknown", "POST", user, "error", err.message);
    return jsonError(err.message, "POST_EXCEPTION");
  }
}
