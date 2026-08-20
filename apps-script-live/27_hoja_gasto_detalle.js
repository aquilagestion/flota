// ======================================================================
// 27_hoja_gasto_detalle.gs
// Devuelve detalle de una hoja de gasto (lineas) desde GASTOS.
//
// Misma regla de visibilidad que apiHojasGastoList (GET; no afecta POST sync).
// Requiere: getRolUsuarioHojas_, puedeVerHojaGastoResumen_.
// ======================================================================

function apiHojaGastoDetalle(payload) {
  payload = payload || {};
  var user = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  if (!user) throw new Error("Falta user_email");
  var rol = getRolUsuarioHojas_(user);
  if (!rol) throw new Error("Usuario no encontrado o sin rol en USUARIOS");
  if (!puedeVerHojaGasto_(rol)) {
    throw new Error("Permisos insuficientes");
  }

  var hojaId = String(payload.hoja_gasto_id || payload.hoja_id_local || "").trim();
  if (!hojaId) throw new Error("Falta campo: hoja_gasto_id / hoja_id_local");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) return { hoja_gasto_id: hojaId, lineas: [] };

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c;

  function val(r, name) {
    var i = idx[name];
    if (i === undefined || i < 0) return "";
    return r[i];
  }

  function nz() {
    for (var i = 0; i < arguments.length; i++) {
      var x = String(arguments[i] || "").trim();
      if (x) return x;
    }
    return "";
  }

  function parseNum(v) {
    var s = String(v || "").replace(",", ".").trim();
    var n = Number(s);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function conceptFromType(t) {
    var map = {
      COMBUSTIBLES: "combustible",
      DIETAS: "dieta",
      CONSUMIBLES: "consumible",
      MANTENIMIENTO_REPARACIONES: "mantenimiento",
      REPUESTOS_RECAMBIO: "repuestos",
      PARKING: "aparcamiento",
      PEAJES: "peaje",
      ITV: "itv",
      MULTAS_SANCIONES: "multa/sanción",
      OTROS: "otros gastos",
      HOSPEDAJE: "hospedaje",
      MANUTENCION: "manutención",
      SEGURO: "seguro",
      IMPUESTOS: "impuestos",
      OTROS_IMPUESTOS: "otros impuestos",
    };
    return map[t] || "gasto";
  }

  function detailFromRow(r) {
    var t = String(val(r, "tipo_gasto") || "").trim().toUpperCase();
    var entidad = "";
    if (t === "REPUESTOS_RECAMBIO") entidad = nz(val(r, "proveedor_repuestos"));
    else if (t === "MANTENIMIENTO_REPARACIONES") entidad = nz(val(r, "proveedor_mantenimiento"));
    else if (t === "COMBUSTIBLES") entidad = nz(val(r, "entidad_combustible"), val(r, "marca"), val(r, "lugar_repostaje"), val(r, "proveedor"));
    else if (t === "PARKING") entidad = nz(val(r, "entidad_parking"), val(r, "tipo_zona"), val(r, "proveedor"));
    else if (t === "PEAJES") entidad = nz(val(r, "entidad_peaje"), val(r, "salida_peaje"), val(r, "entrada_peaje"), val(r, "proveedor"));
    else if (t === "ITV") entidad = nz(val(r, "estacion_itv"));
    else if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
      entidad = nz(val(r, "proveedor_otros_gastos"), val(r, "proveedor"));
    }
    else if (t === "GASTOS_BILLETES") entidad = nz(val(r, "compania_billete"), val(r, "proveedor"));
    else entidad = nz(val(r, "proveedor"), val(r, "concepto"));

    var numFactura = "";
    if (t === "COMBUSTIBLES") numFactura = nz(val(r, "numero_ticket"));
    else if (t === "MANTENIMIENTO_REPARACIONES") numFactura = nz(val(r, "numero_factura_mantenimiento"));
    else if (t === "REPUESTOS_RECAMBIO") numFactura = nz(val(r, "numero_factura_repuestos"));
    else if (t === "ITV") numFactura = nz(val(r, "numero_factura_itv"));
    else if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") numFactura = nz(val(r, "numero_factura_otros"));
    else if (t === "GASTOS_BILLETES") numFactura = nz(val(r, "numero_reserva_billete"), val(r, "numero_factura_otros"));
    else if (t === "PEAJES" || t === "PARKING") numFactura = "TIQUET";
    else numFactura = nz(val(r, "numero_ticket"));

    var fecha = "";
    var byTipoFecha = {
      COMBUSTIBLES: "fecha_repostaje",
      PEAJES: "fecha_peaje",
      PARKING: "fecha_aparcamiento",
      HOSPEDAJE: "fecha_otros_gastos",
      MANUTENCION: "fecha_otros_gastos",
      ITV: "fecha_inspeccion",
      REPUESTOS_RECAMBIO: "fecha_compra_repuestos",
      MANTENIMIENTO_REPARACIONES: "fecha_compra_mantenimiento",
      OTROS: "fecha_otros_gastos",
      MULTAS_SANCIONES: "fecha_multa",
      MULTAS: "fecha_multa",
      KILOMETRAJE_COLABORADOR: "fecha_viaje_colaborador",
      SEGURO: "fecha_inicio_seguro",
      SEGUROS: "fecha_inicio_seguro",
      IMPUESTOS: "periodo_ivm",
      OTROS_IMPUESTOS: "fecha_pago",
      GASTOS_BILLETES: "fecha_ida_billete",
    };
    var typedFechaKey = byTipoFecha[t] || "";
    if (typedFechaKey) {
      var typedFecha = val(r, typedFechaKey);
      if (typedFecha !== "" && typedFecha !== null && typedFecha !== undefined) {
        fecha = normalizeDateDMYCell_(typedFecha);
      }
    }
    if (!fecha) {
      var fechaCandidates = [
        val(r, "fecha"),
        val(r, "fecha_repostaje"),
        val(r, "fecha_compra_mantenimiento"),
        val(r, "fecha_compra_repuestos"),
        val(r, "fecha_aparcamiento"),
        val(r, "fecha_peaje"),
        val(r, "fecha_inspeccion"),
        val(r, "fecha_otros_gastos"),
        val(r, "fecha_multa"),
        val(r, "fecha_viaje_colaborador"),
        val(r, "fecha_ida_billete"),
      ];
      for (var fi = 0; fi < fechaCandidates.length; fi++) {
        var fv = fechaCandidates[fi];
        if (fv === "" || fv === null || fv === undefined) continue;
        fecha = normalizeDateDMYCell_(fv);
        if (fecha) break;
      }
    }

    var importe = 0;
    if (t === "COMBUSTIBLES") importe = parseNum(val(r, "total_a_pagar"));
    else if (t === "SEGURO") importe = parseNum(val(r, "prima"));
    else if (t === "IMPUESTOS") importe = parseNum(val(r, "importe_ivm"));
    else if (t === "OTROS_IMPUESTOS") importe = parseNum(val(r, "importe_otros_impuestos"));
    else if (t === "REPUESTOS_RECAMBIO") importe = parseNum(val(r, "importe_repuestos"));
    else if (t === "MANTENIMIENTO_REPARACIONES") importe = parseNum(val(r, "importe_mantenimiento"));
    else if (t === "PARKING") importe = parseNum(val(r, "importe_aparcamiento"));
    else if (t === "PEAJES") importe = parseNum(val(r, "importe_peaje"));
    else if (t === "ITV") importe = parseNum(val(r, "importe_itv"));
    else if (t === "MULTAS_SANCIONES") importe = parseNum(val(r, "importe_multa"));
    else if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
      importe = parseNum(val(r, "importe_otros_gastos") || val(r, "coste_total"));
    }
    else if (t === "GASTOS_BILLETES") {
      importe = parseNum(val(r, "coste_total")) ||
        (parseNum(val(r, "precio_total_billete")) + parseNum(val(r, "tasas_billete")));
    }
    else importe = parseNum(val(r, "coste_total"));

    var numPersonas = "";
    var numPersonasHospedaje = nz(val(r, "numero_personas_hospedaje"));
    var numPersonasBillete = nz(val(r, "numero_personas_billete"));
    var numComensales = nz(val(r, "numero_comensales_manutencion"));
    if (t === "GASTOS_BILLETES") numPersonas = numPersonasBillete || numPersonasHospedaje;
    else if (t === "HOSPEDAJE" || t === "OTROS") numPersonas = numPersonasHospedaje;
    else if (t === "MANUTENCION") numPersonas = numComensales;

    var proyecto = nz(val(r, "departamento_o_proyecto"));
    var concepto = "";
    if (t === "REPUESTOS_RECAMBIO") concepto = nz(val(r, "descripcion_repuestos"), "repuestos");
    else if (t === "MANTENIMIENTO_REPARACIONES") concepto = nz(val(r, "descripcion_mantenimiento"), "mantenimiento");
    else if (t === "OTROS") concepto = nz(val(r, "concepto_otros_gastos"), val(r, "concepto"), "otros gastos");
    else if (t === "HOSPEDAJE") concepto = nz(val(r, "concepto_otros_gastos"), val(r, "concepto"), "hospedaje");
    else if (t === "MANUTENCION") concepto = nz(val(r, "concepto_otros_gastos"), val(r, "concepto"), "manutención");
    else if (t === "GASTOS_BILLETES") {
      concepto = nz(val(r, "concepto_billete"), val(r, "concepto"), "billete");
    }
    else if (t === "PARKING") concepto = "aparcamiento";
    else if (t === "PEAJES") concepto = "peaje";
    else if (t === "COMBUSTIBLES") concepto = "combustible";
    else if (t === "ITV") concepto = "itv";
    else if (t === "MULTAS_SANCIONES") concepto = "multa/sanción";
    else if (t === "SEGURO") concepto = "seguro";
    else if (t === "IMPUESTOS") concepto = "impuestos";
    else if (t === "OTROS_IMPUESTOS") concepto = "otros impuestos";
    else concepto = conceptFromType(t);

    return {
      id_gasto: nz(val(r, "id_gasto")),
      tipo_gasto: t,
      concepto: concepto,
      entidad: entidad,
      numero_factura: numFactura,
      fecha: fecha,
      importe: importe,
      coste_total: parseNum(val(r, "coste_total")) || importe,
      importe_pagar: parseNum(val(r, "importe_pagar")) || parseNum(val(r, "coste_total")) || importe,
      base_imponible: parseNum(val(r, "base_imponible")) || parseNum(val(r, "importe_sin_iva")),
      importe_sin_iva: parseNum(val(r, "importe_sin_iva")) || parseNum(val(r, "base_imponible")),
      iva_porcentaje: nz(val(r, "iva_porcentaje"), val(r, "iva_pct")),
      iva_pct: nz(val(r, "iva_pct"), val(r, "iva_porcentaje")),
      cuota_iva: parseNum(val(r, "cuota_iva")) || parseNum(val(r, "iva_eur")),
      iva_eur: parseNum(val(r, "iva_eur")) || parseNum(val(r, "cuota_iva")),
      proyecto: proyecto,
      id_viaje_propio: nz(val(r, "id_viaje_propio")),
      num_personas: numPersonas,
      numero_personas_billete: numPersonasBillete || (t === "GASTOS_BILLETES" ? numPersonas : ""),
      numero_personas_hospedaje: numPersonasHospedaje,
      numero_comensales_manutencion: numComensales,
      origen_billete: nz(val(r, "origen_billete")),
      destino_billete: nz(val(r, "destino_billete")),
      fecha_ida_billete: nz(val(r, "fecha_ida_billete")),
      fecha_vuelta_billete: nz(val(r, "fecha_vuelta_billete")),
      numero_reserva_billete: nz(val(r, "numero_reserva_billete")),
      compania_billete: nz(val(r, "compania_billete")),
      precio_total_billete: parseNum(val(r, "precio_total_billete")),
      tasas_billete: parseNum(val(r, "tasas_billete")),
      concepto_billete: nz(val(r, "concepto_billete")),
      work_package: nz(val(r, "work_package")),
      accion_proyecto: nz(val(r, "accion_proyecto"), val(r, "accion")),
      ticket_drive_url: nz(val(r, "ticket_drive_url")),
      ticket_drive_urls: nz(val(r, "ticket_drive_urls")),
      ticket_drive_urls_json: nz(val(r, "ticket_drive_urls_json")),
    };
  }

  var outRows = [];
  var numHoja = "";
  var usuarioEmail = "";
  var usuarioNombre = "";
  var codPers = "";
  var total = 0;
  var fechaEnvio = "";
  var matMap = {};
  var hojaDni = "";
  var hojaFechaFirma = "";
  var hojaFechaHoja = "";
  var hojaSheetMetaRaw = "";
  var lineMetaMap = {};

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var rid = String(val(row, "hoja_gasto_id") || "").trim();
    if (!rid || rid !== hojaId) continue;
    if (!numHoja) numHoja = String(val(row, "Num_Hoja_Gasto") || "").trim();
    if (!usuarioEmail) usuarioEmail = String(val(row, "responsable_email") || "").trim().toLowerCase();
    if (!usuarioNombre) {
      usuarioNombre = hgResolveHojaGastoDisplayNombre_({
        excel_trabajador_nombre: val(row, "excel_trabajador_nombre"),
        num_hoja_gasto: numHoja,
        usuario_email: usuarioEmail,
      });
    }
    if (!fechaEnvio) fechaEnvio = normalizeDateDMYCell_(val(row, "hoja_gasto_fecha_envio") || "");
    if (!hojaDni) hojaDni = String(val(row, "hoja_gasto_dni") || "").trim();
    if (!hojaFechaFirma) hojaFechaFirma = normalizeDateDMYCell_(val(row, "hoja_gasto_fecha_firma") || "");
    if (!hojaFechaHoja) hojaFechaHoja = normalizeDateDMYCell_(val(row, "hoja_gasto_fecha_hoja") || "");
    if (!hojaSheetMetaRaw) hojaSheetMetaRaw = String(val(row, "hoja_gasto_sheet_meta") || "").trim();
    total = Number(val(row, "hoja_gasto_total") || total || 0) || total;
    var mat = String(val(row, "matricula") || "").trim().toUpperCase();
    if (mat) matMap[mat] = true;
    var detailLn = detailFromRow(row);
    outRows.push(detailLn);
    var gid = String(detailLn.id_gasto || "").trim();
    if (gid && (detailLn.work_package || detailLn.accion_proyecto)) {
      lineMetaMap[gid] = {
        work_package: String(detailLn.work_package || "").trim(),
        accion_proyecto: String(detailLn.accion_proyecto || "").trim(),
      };
    }
  }

  if (!puedeVerHojaGastoResumen_(user, rol, usuarioEmail, matMap)) {
    throw new Error("No autorizado para ver esta hoja de gasto");
  }

  try {
    if (usuarioEmail && !usuarioNombre) {
      var u = apiUsuarioGet({ email: usuarioEmail });
      usuarioNombre = String((u && u.nombre) || "").trim();
      codPers = String((u && (u.cod_personal || u.COD_PERSONAL || u.Cod_Personal)) || "").trim();
    } else if (usuarioEmail) {
      var u2 = apiUsuarioGet({ email: usuarioEmail });
      codPers = String((u2 && (u2.cod_personal || u2.COD_PERSONAL || u2.Cod_Personal)) || "").trim();
    }
  } catch (_) {
    // nombre/cod opcionales
  }

  var sheetMeta = null;
  if (hojaSheetMetaRaw) {
    try {
      sheetMeta = JSON.parse(hojaSheetMetaRaw);
    } catch (_) {
      sheetMeta = null;
    }
  }
  if (!sheetMeta || typeof sheetMeta !== "object") {
    sheetMeta = {
      dni: hojaDni,
      fecha_firma: hojaFechaFirma || hojaFechaHoja,
      fecha_hoja: hojaFechaHoja || hojaFechaFirma,
      lineas: lineMetaMap,
    };
  } else {
    if (!sheetMeta.dni && hojaDni) sheetMeta.dni = hojaDni;
    if (!sheetMeta.fecha_firma && (hojaFechaFirma || hojaFechaHoja)) {
      sheetMeta.fecha_firma = hojaFechaFirma || hojaFechaHoja;
    }
    if (!sheetMeta.fecha_hoja && (hojaFechaHoja || hojaFechaFirma)) {
      sheetMeta.fecha_hoja = hojaFechaHoja || hojaFechaFirma;
    }
    if (!sheetMeta.lineas || typeof sheetMeta.lineas !== "object") sheetMeta.lineas = lineMetaMap;
  }

  return {
    hoja_gasto_id: hojaId,
    num_hoja_gasto: numHoja,
    usuario_email: usuarioEmail,
    usuario_nombre: usuarioNombre,
    cod_personal: codPers,
    hoja_gasto_fecha_envio: fechaEnvio,
    total_importe: total,
    dni: hojaDni || String((sheetMeta && sheetMeta.dni) || "").trim(),
    fecha_firma: hojaFechaFirma || hojaFechaHoja || String((sheetMeta && sheetMeta.fecha_firma) || "").trim(),
    fecha_hoja: hojaFechaHoja || hojaFechaFirma || String((sheetMeta && sheetMeta.fecha_hoja) || "").trim(),
    sheet_meta: sheetMeta,
    viaje: sheetMeta && sheetMeta.viaje && typeof sheetMeta.viaje === "object" ? sheetMeta.viaje : null,
    lineas: outRows,
  };
}

