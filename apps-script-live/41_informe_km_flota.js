// ======================================================================
// 41_informe_km_flota.gs
// Informe de kilómetros de viajes con vehículos de flota GREFA
// (origen: Grabar viajes → VIAJES_VEHICULO_PROPIO, matrícula ∈ FLOTA).
//
// GET  informe_km_flota
// POST/GET informe_km_flota_set_accion — GESTOR/ADMIN o RESPONSABLE a cargo.
// ======================================================================

function puedeVerInformeKmFlota_(email) {
  var rol = normalizeRolSegunUsuarios_(normalizeEmail_(email));
  return rol === "GESTOR" || rol === "ADMINISTRACION" || rol === "RESPONSABLE";
}

function esGestionInformeKmFlota_(email) {
  var rol = normalizeRolSegunUsuarios_(normalizeEmail_(email));
  return rol === "GESTOR" || rol === "ADMINISTRACION";
}

/** Parseo robusto: Date, serial Sheets, dd/MM/yyyy, ISO. */
function parseFechaInformeKm_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  // Importante: no String()-ificar antes; parseFechaFlexible_ entiende números serial.
  if (typeof parseFechaFlexible_ === "function") {
    var f = parseFechaFlexible_(value);
    if (f instanceof Date && !isNaN(f.getTime())) return f;
  }
  if (typeof normalizeDateDMYCell_ === "function") {
    var dmy = normalizeDateDMYCell_(value);
    if (dmy && /^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) {
      var p = dmy.split("/");
      var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]), 12, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  var s = String(value == null ? "" : value).trim();
  if (!s) return null;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    var di = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    return isNaN(di.getTime()) ? null : di;
  }
  return null;
}

function startOfDayInformeKm_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDayInformeKm_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function resolveRangoInformeKmFlota_(payload) {
  payload = payload || {};
  var desdeRaw = payload.fecha_desde || payload.desde || "";
  var hastaRaw = payload.fecha_hasta || payload.hasta || "";
  var dDesde = parseFechaInformeKm_(desdeRaw);
  var dHasta = parseFechaInformeKm_(hastaRaw);

  if (!dDesde || !dHasta) {
    var now = new Date();
    var anio = parseInt(String(payload.anio || payload.ano || payload["año"] || now.getFullYear()), 10);
    var mes = parseInt(String(payload.mes || now.getMonth() + 1), 10);
    if (!anio || anio < 2000 || anio > 2100) anio = now.getFullYear();
    if (!mes || mes < 1 || mes > 12) mes = now.getMonth() + 1;
    dDesde = new Date(anio, mes - 1, 1, 12, 0, 0);
    dHasta = new Date(anio, mes, 0, 12, 0, 0);
  }

  if (dHasta.getTime() < dDesde.getTime()) {
    var tmp = dDesde;
    dDesde = dHasta;
    dHasta = tmp;
  }

  return {
    desde: startOfDayInformeKm_(dDesde),
    hasta: endOfDayInformeKm_(dHasta),
    fecha_desde: typeof normalizeDateDMYCell_ === "function" ? normalizeDateDMYCell_(dDesde) : "",
    fecha_hasta: typeof normalizeDateDMYCell_ === "function" ? normalizeDateDMYCell_(dHasta) : "",
  };
}

function normalizeMatriculaInformeKm_(raw) {
  var m = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (typeof normalizeMatricula_ === "function") {
    try {
      var n = normalizeMatricula_(m);
      if (n) return String(n).trim().toUpperCase();
    } catch (e) {
      // ignore
    }
  }
  return m;
}

/**
 * Es viaje de flota GREFA si:
 * - la matrícula está en FLOTA, o
 * - tipo_vehiculo = ORGANIZACION
 * (aunque el alta lo dejara como PROPIO por error).
 */
function esViajeFlotaGrefa_(viaje, flotaSet) {
  var mat = normalizeMatriculaInformeKm_(viaje.matricula);
  if (mat && flotaSet && flotaSet[mat]) return true;
  var tipo = "";
  if (typeof normalizeTipoVehiculoViaje_ === "function") {
    tipo = normalizeTipoVehiculoViaje_(viaje.tipo_vehiculo);
  } else {
    tipo = String(viaje.tipo_vehiculo || "")
      .trim()
      .toUpperCase();
  }
  return tipo === "ORGANIZACION";
}

function puedeEditarAccionInformeKmFlota_(actor, viaje, assignedMap) {
  if (esGestionInformeKmFlota_(actor)) return true;
  var rol = normalizeRolSegunUsuarios_(actor);
  if (rol !== "RESPONSABLE") return false;
  var mat = normalizeMatriculaInformeKm_(viaje.matricula);
  return !!(mat && assignedMap && assignedMap[mat]);
}

function esViajeCerradoInformeKm_(r) {
  var est = String(r.estado || "")
    .trim()
    .toUpperCase();
  if (est === "CERRADO") return true;
  if (est === "ABIERTO") return false;
  // Filas antiguas sin estado coherente: con km_final se consideran cerradas.
  var kmFin = typeof numOrNull_ === "function" ? numOrNull_(r.km_final) : Number(r.km_final);
  return kmFin != null && !isNaN(kmFin) && kmFin >= 0;
}

function serializeViajeInformeKm_(r) {
  var kmIni = typeof numOrNull_ === "function" ? numOrNull_(r.km_inicial) : Number(r.km_inicial);
  var kmFin = typeof numOrNull_ === "function" ? numOrNull_(r.km_final) : Number(r.km_final);
  var kmRec = typeof numOrNull_ === "function" ? numOrNull_(r.km_recorridos) : Number(r.km_recorridos);
  if ((kmRec == null || isNaN(kmRec)) && kmIni != null && kmFin != null && kmFin >= kmIni) {
    kmRec = kmFin - kmIni;
  }
  var fecha =
    typeof normalizeDateDMYCell_ === "function"
      ? normalizeDateDMYCell_(r.fecha_viaje)
      : String(r.fecha_viaje || "").trim();
  var origen = String(r.origen || "").trim();
  var destino = String(r.destino || "").trim();
  var desplazamiento = origen && destino ? origen + " → " + destino : origen || destino || "";
  var tipo =
    typeof normalizeTipoVehiculoViaje_ === "function"
      ? normalizeTipoVehiculoViaje_(r.tipo_vehiculo) || "ORGANIZACION"
      : String(r.tipo_vehiculo || "").trim().toUpperCase() || "ORGANIZACION";
  return {
    id_viaje: String(r.id_viaje || "").trim(),
    fecha_viaje: fecha,
    desplazamiento: desplazamiento,
    origen: origen,
    destino: destino,
    usuario_email: String(r.usuario_email || "")
      .trim()
      .toLowerCase(),
    usuario_nombre: String(r.usuario_nombre || "").trim(),
    matricula: normalizeMatriculaInformeKm_(r.matricula),
    tipo_vehiculo: tipo,
    km_inicial: kmIni != null && !isNaN(kmIni) ? kmIni : "",
    km_final: kmFin != null && !isNaN(kmFin) ? kmFin : "",
    km_recorridos: kmRec != null && !isNaN(kmRec) ? kmRec : 0,
    id_proyecto: String(r.id_proyecto || "").trim(),
    proyecto_nombre: String(r.proyecto_nombre || "").trim(),
    accion: String(r.accion || "").trim(),
    estado: String(r.estado || "")
      .trim()
      .toUpperCase(),
    fecha_cierre:
      typeof normalizeDateDMYCell_ === "function"
        ? normalizeDateDMYCell_(r.fecha_cierre)
        : String(r.fecha_cierre || "").trim(),
  };
}

/** Matrículas de FLOTA visibles para el actor (todas si gestión; a cargo si responsable). */
function listMatriculasFiltroInformeKm_(gestion, assigned, flotaSet) {
  var out = [];
  for (var mat in flotaSet) {
    if (!Object.prototype.hasOwnProperty.call(flotaSet, mat) || !flotaSet[mat]) continue;
    if (!gestion && !(assigned && assigned[mat])) continue;
    out.push(mat);
  }
  out.sort();
  return out;
}

/**
 * Informe filtrable de km de flota GREFA.
 * Filtros: fecha_desde/hasta (o anio/mes), matricula, usuario_email (conductor), id_proyecto.
 * Por defecto solo viajes cerrados.
 * filtros_disponibles.matriculas: siempre desde FLOTA (no solo viajes del periodo).
 */
function apiInformeKmFlota(payload) {
  payload = payload || {};
  var actor = normalizeEmail_(payload.user_email || payload.requester_email || "");
  if (!looksLikeEmail_(actor)) throw new Error("user_email invalido");
  if (!puedeVerInformeKmFlota_(actor)) {
    throw new Error("No autorizado para ver el informe de km de flota");
  }

  if (typeof ensureProyectoModuleSheets_ === "function") ensureProyectoModuleSheets_();

  var gestion = esGestionInformeKmFlota_(actor);
  var assigned = gestion ? null : getMatriculasACargo_(actor);
  var flotaSet =
    typeof getMatriculasFlotaSet_ === "function" ? getMatriculasFlotaSet_() : {};

  // Normalizar claves de assigned al mismo formato de matrícula.
  if (!gestion && assigned) {
    var assignedNorm = {};
    for (var ak in assigned) {
      if (!Object.prototype.hasOwnProperty.call(assigned, ak) || !assigned[ak]) continue;
      var ank = normalizeMatriculaInformeKm_(ak);
      if (ank) assignedNorm[ank] = true;
    }
    assigned = assignedNorm;
  }

  var matriculasFiltro = listMatriculasFiltroInformeKm_(gestion, assigned, flotaSet);
  var rango = resolveRangoInformeKmFlota_(payload);

  if (!gestion) {
    var hasAny = matriculasFiltro.length > 0;
    if (!hasAny) {
      return {
        rango: rango,
        viajes: [],
        totales: { viajes_count: 0, km_recorridos: 0 },
        filtros_disponibles: { matriculas: [], conductores: [], proyectos: [] },
        alcance: "RESPONSABLE_SIN_VEHICULOS",
        meta: { flota_count: Object.keys(flotaSet).length, viajes_hoja: 0 },
      };
    }
  }

  var estadoFilter = String(payload.estado || "CERRADO")
    .trim()
    .toUpperCase();
  if (estadoFilter === "TODOS" || estadoFilter === "ALL" || estadoFilter === "*") estadoFilter = "";

  var matFilter = normalizeMatriculaInformeKm_(payload.matricula || "");
  var conductorFilter = normalizeEmail_(payload.usuario_email || payload.conductor_email || "");
  var proyectoFilter = String(payload.id_proyecto || "").trim();

  var rows = rowsToObjects_(getSheet("VIAJES_VEHICULO_PROPIO"));
  var meta = {
    viajes_hoja: rows.length,
    flota_count: Object.keys(flotaSet).length,
    descartados_no_flota: 0,
    descartados_alcance: 0,
    descartados_estado: 0,
    descartados_fecha: 0,
    descartados_fecha_invalida: 0,
  };

  var scoped = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    if (!esViajeFlotaGrefa_(r, flotaSet)) {
      meta.descartados_no_flota++;
      continue;
    }
    var mat = normalizeMatriculaInformeKm_(r.matricula);
    if (!gestion && !(assigned && assigned[mat])) {
      meta.descartados_alcance++;
      continue;
    }
    if (estadoFilter === "CERRADO") {
      if (!esViajeCerradoInformeKm_(r)) {
        meta.descartados_estado++;
        continue;
      }
    } else if (estadoFilter) {
      var est = String(r.estado || "")
        .trim()
        .toUpperCase();
      if (est !== estadoFilter) {
        meta.descartados_estado++;
        continue;
      }
    }
    var fViaje = parseFechaInformeKm_(r.fecha_viaje);
    if (!fViaje) {
      meta.descartados_fecha_invalida++;
      continue;
    }
    var ts = fViaje.getTime();
    if (ts < rango.desde.getTime() || ts > rango.hasta.getTime()) {
      meta.descartados_fecha++;
      continue;
    }
    scoped.push(r);
  }

  // Conductores / proyectos a partir del alcance + fechas (antes de filtros finos).
  var condMap = {};
  var proyMap = {};
  for (var s = 0; s < scoped.length; s++) {
    var rowS = scoped[s];
    var em = normalizeEmail_(rowS.usuario_email);
    if (em) {
      condMap[em] = String(rowS.usuario_nombre || "").trim() || em;
    }
    var idP = String(rowS.id_proyecto || "").trim();
    if (idP) {
      proyMap[idP] = String(rowS.proyecto_nombre || "").trim() || idP;
    }
  }

  var filtered = scoped.filter(function (row) {
    if (matFilter && normalizeMatriculaInformeKm_(row.matricula) !== matFilter) return false;
    if (conductorFilter && normalizeEmail_(row.usuario_email) !== conductorFilter) return false;
    if (proyectoFilter && String(row.id_proyecto || "").trim() !== proyectoFilter) return false;
    return true;
  });

  filtered.sort(function (a, b) {
    var da = parseFechaInformeKm_(a.fecha_viaje);
    var db = parseFechaInformeKm_(b.fecha_viaje);
    var ta = da ? da.getTime() : 0;
    var tb = db ? db.getTime() : 0;
    if (ta !== tb) return ta - tb;
    return normalizeMatriculaInformeKm_(a.matricula).localeCompare(normalizeMatriculaInformeKm_(b.matricula));
  });

  var viajes = [];
  var totalKm = 0;
  for (var j = 0; j < filtered.length; j++) {
    var item = serializeViajeInformeKm_(filtered[j]);
    totalKm += Number(item.km_recorridos) || 0;
    viajes.push(item);
  }

  var conductores = Object.keys(condMap)
    .sort()
    .map(function (email) {
      return { email: email, nombre: condMap[email] };
    });
  var proyectos = Object.keys(proyMap)
    .sort(function (a, b) {
      return String(proyMap[a]).localeCompare(String(proyMap[b]));
    })
    .map(function (id) {
      return { id_proyecto: id, nombre_proyecto: proyMap[id] };
    });

  return {
    rango: rango,
    viajes: viajes,
    totales: {
      viajes_count: viajes.length,
      km_recorridos: Number(totalKm.toFixed(2)),
    },
    filtros_disponibles: {
      matriculas: matriculasFiltro,
      conductores: conductores,
      proyectos: proyectos,
    },
    alcance: gestion ? "GESTION" : "RESPONSABLE",
    meta: meta,
    generado_en: typeof nowIso_ === "function" ? nowIso_() : new Date().toISOString(),
  };
}

/**
 * Actualiza solo la acción de un viaje de flota.
 * GESTOR/ADMIN: cualquiera. RESPONSABLE: matrícula a su cargo.
 */
function apiInformeKmFlotaSetAccion(payload) {
  payload = payload || {};
  var actor = normalizeEmail_(payload.user_email || payload.requester_email || "");
  if (!looksLikeEmail_(actor)) throw new Error("user_email invalido");
  if (!puedeVerInformeKmFlota_(actor)) throw new Error("No autorizado");

  var id = String(payload.id_viaje || "").trim();
  if (!id) throw new Error("Falta id_viaje");

  if (typeof ensureProyectoModuleSheets_ === "function") ensureProyectoModuleSheets_();

  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  var viaje = indexRowById_(rowsToObjects_(sh), "id_viaje", id);
  if (!viaje) throw new Error("Viaje no encontrado");

  var flotaSet =
    typeof getMatriculasFlotaSet_ === "function" ? getMatriculasFlotaSet_() : {};
  if (!esViajeFlotaGrefa_(viaje, flotaSet)) {
    throw new Error("El viaje no es de flota GREFA");
  }

  var assigned = null;
  if (!esGestionInformeKmFlota_(actor)) {
    assigned = getMatriculasACargo_(actor) || {};
    var assignedNorm = {};
    for (var ak in assigned) {
      if (!Object.prototype.hasOwnProperty.call(assigned, ak) || !assigned[ak]) continue;
      var ank = normalizeMatriculaInformeKm_(ak);
      if (ank) assignedNorm[ank] = true;
    }
    assigned = assignedNorm;
  }
  if (!puedeEditarAccionInformeKmFlota_(actor, viaje, assigned)) {
    throw new Error("No autorizado para editar la acción de este viaje");
  }

  var accion = String(
    payload.accion != null ? payload.accion : payload.accion_proyecto != null ? payload.accion_proyecto : ""
  ).trim();

  updateRowByHeaders_(sh, viaje._row, {
    accion: accion,
    updated_at: typeof nowIso_ === "function" ? nowIso_() : new Date().toISOString(),
  });

  return {
    id_viaje: id,
    accion: accion,
    matricula: normalizeMatriculaInformeKm_(viaje.matricula),
  };
}
