// ======================================================================
// 10_gastos_por_tipo.gs
// Estructura de gastos por tipo + catálogos + creación de gastos/mantenimientos
// ======================================================================

// ----- Columnas de adjuntos (comunes) -----
var ADJUNTO_COLS = [
  "ticket_drive_url",
  "ticket_drive_urls",
  "ticket_drive_urls_json",
  "ticket_drive_file_name",
  "ticket_drive_file_names",
  "ticket_drive_file_names_json"
];

var ADJUNTO_COLS_FOTOS = [
  "fotos_drive_url",
  "fotos_drive_urls",
  "fotos_drive_urls_json",
  "fotos_drive_file_name",
  "fotos_drive_file_names",
  "fotos_drive_file_names_json"
];

// ----- Columnas base -----
var BASE_COLS = ["id_gasto", "id_viaje_propio", "fecha", "matricula", "departamento_o_proyecto"];
var TAIL_COLS = ["responsable_email", "usuario_uid"];
/** Columnas de desglose IVA (al final, para no desalinear hojas ya existentes). */
var IVA_COLS = ["coste_total", "importe_sin_iva", "iva_porcentaje", "base_imponible", "cuota_iva"];

// ----- Headers por tipo -----
var HEADERS_POR_TIPO = {
  GASTOS_COMBUSTIBLE: BASE_COLS.concat([
    "fecha_repostaje", "lugar_repostaje", "marca", "tipo_combustible",
    "kilometros_repostaje", "tipo_repostaje", "litros_repostados",
    "precio_por_litro", "descuento", "puntos_obtenidos",
    "total_a_pagar", "numero_ticket"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_SEGURO: BASE_COLS.concat([
    "compania", "poliza", "cobertura",
    "fecha_inicio_seguro", "fecha_fin_seguro", "prima"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_PEAJES: BASE_COLS.concat([
    "fecha_peaje", "entidad_peaje", "numero_factura_peaje",
    "entrada_peaje", "salida_peaje", "importe_peaje"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_PARKING: BASE_COLS.concat([
    "fecha_aparcamiento", "tipo_zona",
    "hora_inicio_aparcamiento", "hora_fin_aparcamiento",
    "importe_aparcamiento"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_IMPUESTOS: BASE_COLS.concat([
    "periodo_ivm", "importe_ivm"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_OTROS_IMPUESTOS: BASE_COLS.concat([
    "tipo_impuesto", "fecha_pago", "fecha_proximo_pago",
    "importe_otros_impuestos"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_ITV: BASE_COLS.concat([
    "estacion_itv", "fecha_inspeccion",
    "fecha_proxima_inspeccion", "importe_itv"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_REPUESTOS: BASE_COLS.concat([
    "fecha_compra_repuestos", "proveedor_repuestos",
    "descripcion_repuestos", "numero_factura_repuestos",
    "importe_repuestos"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_MANTENIMIENTO_REPARACIONES: BASE_COLS.concat([
    "fecha_compra_mantenimiento", "proveedor_mantenimiento",
    "descripcion_mantenimiento", "numero_factura_mantenimiento",
    "importe_mantenimiento", "fecha_proximo_mantenimiento",
    "kilometros_proximo_mantenimiento"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_OTROS: BASE_COLS.concat([
    "fecha_otros_gastos", "proveedor_otros_gastos",
    "concepto_otros_gastos", "importe_otros_gastos",
    "numero_factura_otros",
    "numero_personas_hospedaje", "numero_comensales_manutencion",
    "subtipo_otros",
    "observaciones"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_BILLETES: BASE_COLS.concat([
    "fecha_ida_billete", "fecha_vuelta_billete",
    "origen_billete", "destino_billete",
    "numero_reserva_billete", "numero_personas_billete",
    "compania_billete", "precio_total_billete",
    "tasas_billete", "concepto_billete",
    "work_package", "accion_proyecto",
    "numero_factura_otros"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_MULTAS: BASE_COLS.concat([
    "conductor", "fecha_multa", "lugar",
    "organismo_denunciante", "tipo_infraccion", "importe"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(IVA_COLS),

  GASTOS_KILOMETRAJE_COLABORADOR: BASE_COLS.concat([
    "id_proyecto", "proyecto_nombre", "fecha_viaje_colaborador",
    "km_inicial_colaborador", "km_final_colaborador", "km_recorridos_colaborador",
    "origen_colaborador", "destino_colaborador", "motivo_colaborador",
    "accion_colaborador", "tarifa_eur_km_aplicada", "importe_km_colaborador",
    "forma_pago", "concepto", "proveedor", "coste_total", "importe_sin_iva"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS).concat(["iva_porcentaje", "base_imponible", "cuota_iva"])
};

// tipo -> pestaña
var TIPO_A_SHEET = {
  "SEGURO": "GASTOS_SEGURO",
  "IMPUESTOS": "GASTOS_IMPUESTOS",
  "OTROS_IMPUESTOS": "GASTOS_OTROS_IMPUESTOS",
  "REPUESTOS_RECAMBIO": "GASTOS_REPUESTOS",
  "MANTENIMIENTO_REPARACIONES": "GASTOS_MANTENIMIENTO_REPARACIONES",
  "COMBUSTIBLES": "GASTOS_COMBUSTIBLE",
  "PARKING": "GASTOS_PARKING",
  "PEAJES": "GASTOS_PEAJES",
  "ITV": "GASTOS_ITV",
  "GASTOS_BILLETES": "GASTOS_BILLETES",
  "OTROS": "GASTOS_OTROS",
  "HOSPEDAJE": "GASTOS_OTROS",
  "MANUTENCION": "GASTOS_OTROS",
  "MULTAS_SANCIONES": "GASTOS_MULTAS",
  "MULTAS": "GASTOS_MULTAS",
  "GASTOS_MULTAS": "GASTOS_MULTAS",
  "GASTOS_OTROS_IMPUESTOS": "GASTOS_OTROS_IMPUESTOS",
  "KILOMETRAJE_COLABORADOR": "GASTOS_KILOMETRAJE_COLABORADOR"
};

// ======================================================================
// Crea/actualiza pestañas por tipo y fuerza headers correctos en fila 1
// ======================================================================
function ensureColumnsAtEnd_(sh, cols) {
  if (!sh || !cols || !cols.length) return;
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var missing = [];
  for (var j = 0; j < cols.length; j++) {
    if (headers.indexOf(String(cols[j])) < 0) missing.push(String(cols[j]));
  }
  if (!missing.length) return;
  var nextCol = sh.getLastColumn() + 1;
  sh.getRange(1, nextCol, 1, missing.length).setValues([missing]);
}

function ensureCatTipoGastoRow_(tipo, label) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("CAT_TIPOS_GASTO") || ss.getSheetByName("CAT_TIPO_GASTOS");
  if (!sh) return;
  var last = sh.getLastRow();
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || "").trim().toLowerCase();
  });
  var vals = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  for (var i = 0; i < vals.length; i++) {
    var existing = String(vals[i][0] || "").trim().toUpperCase().replace(/\s+/g, "_");
    if (existing === tipo || existing === "BILLETES" || existing === "TICKET") return;
  }
  var row = [];
  for (var c = 0; c < lastCol; c++) row.push("");
  row[0] = tipo;
  var sampleB = last >= 2 ? String(sh.getRange(2, 2).getValue() || "").trim().toUpperCase() : "SI";
  var colBLooksActivo =
    sampleB === "SI" || sampleB === "NO" || sampleB === "S" || sampleB === "TRUE" || sampleB === "1" || sampleB === "";
  var h1 = headers[1] || "";
  if (h1.indexOf("activo") >= 0 || (colBLooksActivo && h1.indexOf("label") < 0)) {
    row[1] = "SI";
  } else {
    row[1] = label || tipo;
  }
  var idxLabel = headers.indexOf("label");
  if (idxLabel > 1) row[idxLabel] = label || tipo;
  sh.getRange(last + 1, 1, 1, lastCol).setValues([row]);
}

function ensureGastosBilletesColumns_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var extra = [
    "work_package",
    "accion_proyecto",
    "fecha_ida_billete",
    "fecha_vuelta_billete",
    "origen_billete",
    "destino_billete",
    "numero_reserva_billete",
    "numero_personas_billete",
    "compania_billete",
    "precio_total_billete",
    "tasas_billete",
    "concepto_billete",
    "numero_factura_otros",
    "numero_personas_hospedaje"
  ];
  var shG = ss.getSheetByName("GASTOS");
  if (shG) ensureColumnsAtEnd_(shG, IVA_COLS.concat(extra));
  var hdrs = HEADERS_POR_TIPO.GASTOS_BILLETES;
  var shB = ss.getSheetByName("GASTOS_BILLETES");
  if (!shB) {
    shB = ss.insertSheet("GASTOS_BILLETES");
    shB.getRange(1, 1, 1, hdrs.length).setValues([hdrs]);
    shB.setFrozenRows(1);
  } else {
    ensureColumnsAtEnd_(shB, hdrs);
  }
  ensureCatTipoGastoRow_("GASTOS_BILLETES", "GASTOS BILLETES");
}

function calcIvaBreakdownGasto_(totalConIva, ivaPorcentaje) {
  var total = Number(totalConIva) || 0;
  if (total < 0) total = 0;
  var rate = Number(String(ivaPorcentaje == null ? "" : ivaPorcentaje).toString().replace(",", "."));
  if (!isFinite(rate) || rate < 0) rate = 21;
  if (rate === 0) {
    return { total: total, iva_porcentaje: 0, base_imponible: total, cuota_iva: 0 };
  }
  var base = Math.round((total / (1 + rate / 100)) * 100) / 100;
  var cuota = Math.round((total - base) * 100) / 100;
  return { total: total, iva_porcentaje: rate, base_imponible: base, cuota_iva: cuota };
}

function setupGastosSheetsPorTipo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = Object.keys(HEADERS_POR_TIPO);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheetName = sheetNames[i];
    var headers = HEADERS_POR_TIPO[sheetName];

    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);

    // Si la hoja está vacía o solo cabecera: escribe headers completos.
    // Si ya hay datos: solo añade columnas IVA al final (no reordena).
    var lastRow = sh.getLastRow();
    if (lastRow <= 1) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else if (sheetName === "GASTOS_BILLETES") {
      ensureColumnsAtEnd_(sh, headers);
    } else {
      ensureColumnsAtEnd_(sh, sheetName === "GASTOS_KILOMETRAJE_COLABORADOR"
        ? ["iva_porcentaje", "base_imponible", "cuota_iva"]
        : IVA_COLS);
    }
    sh.setFrozenRows(1);
  }

  // GASTOS general: IVA + forma_pago + nº factura peaje + hospedaje/manutención
  var shGastos = ss.getSheetByName("GASTOS");
  if (shGastos) {
    ensureColumnsAtEnd_(shGastos, IVA_COLS.concat([
      "forma_pago",
      "numero_factura_peaje",
      "numero_personas_hospedaje",
      "numero_comensales_manutencion",
      "numero_factura_otros",
      "fecha_otros_gastos",
      "proveedor_otros_gastos",
      "concepto_otros_gastos",
      "importe_otros_gastos",
      "fecha_ida_billete",
      "fecha_vuelta_billete",
      "origen_billete",
      "destino_billete",
      "numero_reserva_billete",
      "numero_personas_billete",
      "compania_billete",
      "precio_total_billete",
      "tasas_billete",
      "concepto_billete",
      "work_package",
      "accion_proyecto"
    ]));
  }
  ensureGastosBilletesColumns_();
  var shPeajes = ss.getSheetByName("GASTOS_PEAJES");
  if (shPeajes) {
    ensureColumnsAtEnd_(shPeajes, ["entidad_peaje", "numero_factura_peaje"].concat(IVA_COLS));
  }

  // Manteniemientos: asegurar columnas fotos_*
  var shMant = ss.getSheetByName("MANTENIMIENTOS");
  if (shMant) {
    var mantHeaders = shMant.getRange(1, 1, 1, shMant.getLastColumn()).getValues()[0].map(String);
    var missing = [];
    for (var j = 0; j < ADJUNTO_COLS_FOTOS.length; j++) {
      if (mantHeaders.indexOf(ADJUNTO_COLS_FOTOS[j]) < 0) missing.push(ADJUNTO_COLS_FOTOS[j]);
    }
    if (missing.length) {
      var nextCol = shMant.getLastColumn() + 1;
      shMant.getRange(1, nextCol, 1, missing.length).setValues([missing]);
    }
  }

  // Catálogo gasto
  if (!ss.getSheetByName("CAT_TIPOS_GASTO")) {
    var shCat = ss.insertSheet("CAT_TIPOS_GASTO");
    shCat.getRange(1, 1, 1, 2).setValues([["tipo", "label"]]);
    shCat.getRange(2, 1, 12, 2).setValues([
      ["SEGURO", "SEGURO"],
      ["IMPUESTOS", "IMPUESTOS (I.V.M.)"],
      ["OTROS_IMPUESTOS", "OTROS IMPUESTOS"],
      ["REPUESTOS_RECAMBIO", "REPUESTOS / RECAMBIO"],
      ["MANTENIMIENTO_REPARACIONES", "MANTENIMIENTO / REPARACIONES"],
      ["COMBUSTIBLES", "COMBUSTIBLES"],
      ["PARKING", "PARKING"],
      ["PEAJES", "PEAJES"],
      ["ITV", "ITV"],
      ["MULTAS_SANCIONES", "MULTAS / SANCIONES"],
      ["GASTOS_BILLETES", "GASTOS BILLETES"],
      ["OTROS", "OTROS"]
    ]);
    shCat.setFrozenRows(1);
  } else {
    ensureCatTipoGastoRow_("GASTOS_BILLETES", "GASTOS BILLETES");
  }

  // Catálogo mantenimiento
  if (!ss.getSheetByName("CAT_TIPOS_MANTENIMIENTO")) {
    var shCatM = ss.insertSheet("CAT_TIPOS_MANTENIMIENTO");
    shCatM.getRange(1, 1, 1, 2).setValues([["tipo", "label"]]);
    shCatM.getRange(2, 1, 10, 2).setValues([
      ["Cambio de aceite", "Cambio de aceite"],
      ["Revision general", "Revision general"],
      ["Frenos", "Frenos"],
      ["Neumaticos", "Neumaticos"],
      ["Embrague", "Embrague"],
      ["Suspension", "Suspension"],
      ["Escape", "Escape"],
      ["Electricidad", "Electricidad"],
      ["Chapa y pintura", "Chapa y pintura"],
      ["Otros", "Otros"]
    ]);
    shCatM.setFrozenRows(1);
  }

  SpreadsheetApp.getUi().alert("Pestañas y catálogos actualizados.");
}

// ======================================================================
// Catálogos
// ======================================================================
function apiCatTiposGastoList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("CAT_TIPOS_GASTO") || ss.getSheetByName("CAT_TIPO_GASTOS");
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) {
    return String(h == null ? "" : h).replace(/^\uFEFF/, "").trim();
  });
  var result = [];
  for (var i = 1; i < data.length; i++) {
    // Columna A = tipo; columna B = activo (acepta Sí / SI)
    var tipo = String(data[i][0] == null ? "" : data[i][0]).trim();
    if (!tipo) continue;
    var activoRaw = data[i].length > 1 ? data[i][1] : "SI";
    var activoNorm = String(activoRaw == null ? "" : activoRaw)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (activoNorm && activoNorm !== "SI" && activoNorm !== "S" && activoNorm !== "TRUE" && activoNorm !== "1" && activoNorm !== "YES" && activoNorm !== "Y") {
      continue;
    }
    var obj = {
      tipo: tipo,
      Tipo_Gasto: tipo,
      activo: "SI",
    };
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (!key) continue;
      if (obj[key] == null || obj[key] === "") obj[key] = data[i][j] || "";
    }
    result.push(obj);
  }
  var hasBilletes = false;
  for (var k = 0; k < result.length; k++) {
    if (normalizeTipoGasto_(result[k].tipo || result[k].Tipo_Gasto || "") === "GASTOS_BILLETES") {
      hasBilletes = true;
      break;
    }
  }
  if (!hasBilletes) {
    result.push({
      tipo: "GASTOS_BILLETES",
      Tipo_Gasto: "GASTOS_BILLETES",
      activo: "SI",
      label: "GASTOS BILLETES",
    });
  }
  return result;
}

function apiCatTiposMantenimientoList() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CAT_TIPOS_MANTENIMIENTO");
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(String);
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j] || "";
    result.push(obj);
  }
  return result;
}

// ======================================================================
// Normaliza tipo gasto
// ======================================================================
function normalizeTipoGasto_(raw) {
  var v = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");

  if (v === "COMBUSTIBLE") return "COMBUSTIBLES";
  if (v === "MULTAS" || v === "MULTAS_SANCIONES" || v === "GASTOS_MULTAS") return "MULTAS_SANCIONES";
  if (v === "OTROS_IMPUESTOS" || v === "GASTOS_OTROS_IMPUESTOS") return "OTROS_IMPUESTOS";
  if (v === "KILOMETRAJE_COLAB" || v === "KILOMETRAJE_COLABORADOR") return "KILOMETRAJE_COLABORADOR";
  if (v === "BILLETES" || v === "GASTOS_BILLETES" || v === "GASTO_BILLETES" || v === "TICKET" || v === "BILLETE") {
    return "GASTOS_BILLETES";
  }
  if (v === "HOSPEDAJE") return "HOSPEDAJE";
  if (v === "MANUTENCION") return "MANUTENCION";
  return v;
}

function resolverTarifaKmColaborador_(fechaValue) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TARIFAS_KM");
  if (!sh) throw new Error("No existe hoja TARIFAS_KM");
  var all = sh.getDataRange().getValues();
  if (!all || all.length < 2) throw new Error("TARIFAS_KM sin datos");
  var headers = all[0].map(String);
  var idxEur = headerIndexCI_(headers, "eur_km");
  var idxFi = headerIndexCI_(headers, "fecha_inicio");
  var idxFf = headerIndexCI_(headers, "fecha_fin");
  var idxAct = headerIndexCI_(headers, "activo");
  if (idxEur < 0 || idxFi < 0 || idxFf < 0) throw new Error("TARIFAS_KM sin cabeceras requeridas");
  var ref = parseFechaFlexible_(fechaValue);
  if (!ref) throw new Error("Fecha de viaje inválida para tarifa");
  var refTs = ref.getTime();
  for (var i = 1; i < all.length; i++) {
    var eur = Number(all[i][idxEur]);
    var fi = parseFechaFlexible_(all[i][idxFi]);
    var ff = parseFechaFlexible_(all[i][idxFf]);
    var activo = idxAct >= 0 ? String(all[i][idxAct] || "").trim().toUpperCase() : "SI";
    if (activo && activo !== "SI" && activo !== "TRUE" && activo !== "1") continue;
    if (!isFinite(eur) || eur < 0 || !fi || !ff) continue;
    if (refTs >= fi.getTime() && refTs <= ff.getTime()) return eur;
  }
  throw new Error("No existe tarifa km activa para la fecha del viaje");
}

// ======================================================================
// Crea gasto en GASTOS (general) + pestaña por tipo
// ======================================================================
function apiGastoCrear(payload) {
  payload = payload || {};

  var tipoRaw = payload.tipo_gasto || payload.tipoGasto || payload.tipo || "";
  var tipo = normalizeTipoGasto_(tipoRaw);
  if (!tipo) throw new Error("Falta campo: tipo_gasto");
  var idViajePropio = String(payload.id_viaje_propio || "").trim();
  var isKmColab = tipo === "KILOMETRAJE_COLABORADOR";
  var mat = normalizeMatricula_(payload.matricula);
  if (!mat && !isKmColab && tipo !== "OTROS") throw new Error("Falta campo: matricula");
  if (!mat && isKmColab) mat = "COLABORADOR";
  if (!mat && tipo === "OTROS") mat = "OTROS";

  var responsable_email = String(
    payload.responsable_email || payload.usuario_email || payload.user_email || ""
  ).trim().toLowerCase();
  if (!responsable_email) throw new Error("Falta campo: responsable_email");

  var actor_email = String(
    payload.grabado_por_email || payload.actor_email || payload.usuario_email || ""
  )
    .trim()
    .toLowerCase();
  if (!actor_email) actor_email = responsable_email;
  if (actor_email !== responsable_email) {
    requireRolGestorOrAdministracion_(actor_email);
  }

  // usuario activo
  var u = getUsuarioByEmail_(responsable_email);
  if (!u) throw new Error("Usuario no existe o está inactivo");

  if (idViajePropio) {
    var shViajes = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("VIAJES_VEHICULO_PROPIO");
    if (!shViajes) throw new Error("No existe hoja VIAJES_VEHICULO_PROPIO");
    var viaje = null;
    var viajes = rowsToObjects_(shViajes);
    for (var vi = 0; vi < viajes.length; vi++) {
      if (String(viajes[vi].id_viaje || "").trim() === idViajePropio) {
        viaje = viajes[vi];
        break;
      }
    }
    if (!viaje) throw new Error("Viaje no encontrado");
    var owner = String(viaje.usuario_email || "").trim().toLowerCase();
    if (owner && owner !== responsable_email) throw new Error("No puedes asociar gastos a un viaje de otro usuario");
    if (String(viaje.estado || "").trim().toUpperCase() === "CERRADO") throw new Error("Viaje CERRADO: no admite más gastos");
  }

  // adjuntos de ticket (opcionales)
  var ticketUrlsArr = normalizeMultiArray_(
    payload.ticket_drive_urls || payload.ticketUrls || payload.ticket_drive_url
  );

  var ticketFileNamesArr = normalizeMultiArray_(
    payload.ticket_drive_file_names || payload.ticketFileNames || payload.ticket_drive_file_name
  );
  var safeTicketFileNamesArr = ensureSameLen_(ticketFileNamesArr, ticketUrlsArr.length);

  // fecha principal
  var fechaValue = payload.fecha;
  if (!fechaValue) {
    switch (tipo) {
      case "SEGURO": fechaValue = payload.fecha_inicio_seguro; break;
      case "IMPUESTOS": fechaValue = payload.periodo_ivm; break;
      case "OTROS_IMPUESTOS": fechaValue = payload.fecha_pago; break;
      case "REPUESTOS_RECAMBIO": fechaValue = payload.fecha_compra_repuestos; break;
      case "MANTENIMIENTO_REPARACIONES": fechaValue = payload.fecha_compra_mantenimiento; break;
      case "COMBUSTIBLES": fechaValue = payload.fecha_repostaje; break;
      case "PARKING": fechaValue = payload.fecha_aparcamiento; break;
      case "PEAJES": fechaValue = payload.fecha_peaje; break;
      case "ITV": fechaValue = payload.fecha_inspeccion; break;
      case "MULTAS_SANCIONES": fechaValue = payload.fecha_multa; break;
      case "GASTOS_BILLETES": fechaValue = payload.fecha_ida_billete; break;
      case "OTROS":
      case "HOSPEDAJE":
      case "MANUTENCION":
        fechaValue = payload.fecha_otros_gastos;
        break;
      case "KILOMETRAJE_COLABORADOR": fechaValue = payload.fecha_viaje_colaborador || payload.fecha_servicio; break;
      default: fechaValue = payload.fecha_compra_mantenimiento; break;
    }
  }

  var fechaDate = parseFechaFlexible_(fechaValue);
  if (!fechaDate) throw new Error("Fecha invalida o ausente");
  var fecha = formatDateISO_(fechaDate);

  // campos derivados para resumen general
  var concepto = String(payload.concepto || "").trim();
  var proveedor = String(payload.proveedor || "").trim();
  var coste_total = Number(payload.coste_total) || 0;
  var importe_sin_iva = Number(payload.importe_sin_iva) || 0;
  var iva_porcentaje = Number(String(payload.iva_porcentaje == null ? "" : payload.iva_porcentaje).toString().replace(",", "."));
  if (!isFinite(iva_porcentaje) || iva_porcentaje < 0) iva_porcentaje = 21;
  var base_imponible = Number(payload.base_imponible) || 0;
  var cuota_iva = Number(payload.cuota_iva) || 0;

  if (!coste_total || !concepto || !proveedor || !importe_sin_iva) {
    switch (tipo) {
      case "SEGURO":
        proveedor = proveedor || String(payload.compania || "").trim();
        concepto = concepto || String(payload.cobertura || "").trim();
        coste_total = coste_total || Number(payload.prima) || 0;
        break;
      case "IMPUESTOS":
        concepto = concepto || String(payload.periodo_ivm || "I.V.M.").trim();
        coste_total = coste_total || Number(payload.importe_ivm) || 0;
        break;
      case "OTROS_IMPUESTOS":
        concepto = concepto || String(payload.tipo_impuesto || payload.tipo_impuesto_otro || payload.tipo_otro_impuesto || "").trim();
        coste_total = coste_total || Number(payload.importe_otros_impuestos) || 0;
        break;
      case "REPUESTOS_RECAMBIO":
        proveedor = proveedor || String(payload.proveedor_repuestos || "").trim();
        concepto = concepto || String(payload.descripcion_repuestos || "").trim();
        coste_total = coste_total || Number(payload.importe_repuestos) || 0;
        break;
      case "MANTENIMIENTO_REPARACIONES":
        proveedor = proveedor || String(payload.proveedor_mantenimiento || "").trim();
        concepto = concepto || String(payload.descripcion_mantenimiento || "").trim();
        coste_total = coste_total || Number(payload.importe_mantenimiento) || 0;
        break;
      case "COMBUSTIBLES":
        proveedor = proveedor || String(payload.lugar_repostaje || payload.entidad_combustible || "").trim();
        concepto = concepto || String(payload.numero_ticket || payload.marca || "").trim();
        coste_total = coste_total || Number(payload.total_a_pagar) || 0;
        break;
      case "PARKING":
        proveedor = proveedor || String(payload.entidad_parking || "").trim();
        concepto = concepto || String(payload.tipo_zona || "").trim();
        coste_total = coste_total || Number(payload.importe_aparcamiento) || 0;
        break;
      case "PEAJES":
        proveedor = proveedor || String(payload.entidad_peaje || "").trim();
        concepto = concepto || (String(payload.entrada_peaje || "") + " -> " + String(payload.salida_peaje || "")).trim();
        coste_total = coste_total || Number(payload.importe_peaje) || 0;
        break;
      case "ITV":
        concepto = concepto || String(payload.estacion_itv || "").trim();
        coste_total = coste_total || Number(payload.importe_itv) || 0;
        break;
      case "MULTAS_SANCIONES":
        proveedor = proveedor || String(payload.organismo_denunciante || "").trim();
        concepto = concepto || String(payload.tipo_infraccion || "").trim();
        coste_total = coste_total || Number(payload.importe || payload.importe_multa || "") || 0;
        break;
      case "GASTOS_BILLETES":
        proveedor = proveedor || String(payload.compania_billete || "").trim();
        concepto =
          concepto ||
          String(payload.concepto_billete || "").trim() ||
          [String(payload.origen_billete || "").trim(), String(payload.destino_billete || "").trim()]
            .filter(Boolean)
            .join(" -> ");
        coste_total =
          coste_total ||
          (Number(payload.precio_total_billete) || 0) + (Number(payload.tasas_billete) || 0);
        if (!String(payload.numero_factura_otros || "").trim() && String(payload.numero_reserva_billete || "").trim()) {
          payload.numero_factura_otros = String(payload.numero_reserva_billete || "").trim();
        }
        if (
          !String(payload.numero_personas_billete || "").trim() &&
          String(payload.num_personas || payload.numero_personas || "").trim()
        ) {
          payload.numero_personas_billete = String(payload.num_personas || payload.numero_personas || "").trim();
        }
        break;
      case "OTROS":
      case "HOSPEDAJE":
      case "MANUTENCION":
        proveedor =
          proveedor ||
          String(payload.proveedor_otros_gastos || payload.entidad_hospedaje || payload.establecimiento_manutencion || "").trim();
        concepto =
          concepto ||
          String(payload.concepto_otros_gastos || "").trim() ||
          (tipo === "HOSPEDAJE" ? "Hospedaje" : tipo === "MANUTENCION" ? "Manutención" : "");
        coste_total =
          coste_total ||
          Number(payload.importe_otros_gastos || payload.importe_hospedaje || payload.importe_manutencion) ||
          0;
        if (!String(payload.numero_factura_otros || "").trim() && String(payload.numero_factura || "").trim()) {
          payload.numero_factura_otros = String(payload.numero_factura || "").trim();
        }
        if (
          tipo === "MANUTENCION" &&
          !String(payload.numero_comensales_manutencion || "").trim() &&
          String(payload.num_personas || payload.numero_comensales || "").trim()
        ) {
          payload.numero_comensales_manutencion = String(
            payload.num_personas || payload.numero_comensales || ""
          ).trim();
        }
        if (
          (tipo === "HOSPEDAJE" || tipo === "OTROS") &&
          !String(payload.numero_personas_hospedaje || "").trim() &&
          String(payload.num_personas || payload.numero_personas || "").trim()
        ) {
          payload.numero_personas_hospedaje = String(payload.num_personas || payload.numero_personas || "").trim();
        }
        break;
      case "KILOMETRAJE_COLABORADOR":
        var kmIni = Number(String(payload.km_inicial_colaborador || "").replace(",", "."));
        var kmFin = Number(String(payload.km_final_colaborador || "").replace(",", "."));
        var excelImport = String(payload.excel_import || "").trim().toUpperCase() === "SI";
        var excelSinKm = String(payload.excel_viaje_sin_km || "").trim().toUpperCase() === "SI";
        if (!isFinite(kmIni) || !isFinite(kmFin) || kmFin <= kmIni) {
          if (
            excelImport &&
            (excelSinKm ||
              String(payload.excel_viaje_fecha_inicio || payload.excel_viaje_origen || "").trim())
          ) {
            kmIni = 0;
            kmFin = 0;
            payload.km_recorridos_colaborador = 0;
            var impExcelKm = Number(payload.coste_total || payload.importe_km_colaborador || 0);
            if (isFinite(impExcelKm) && impExcelKm > 0) {
              coste_total = coste_total || impExcelKm;
            }
          } else {
            throw new Error("Kilometraje inválido: km_final debe ser mayor que km_inicial");
          }
        }
        if (!(excelImport && kmFin <= kmIni)) {
          var kms = kmFin - kmIni;
          var tarifa = Number(String(payload.tarifa_eur_km_aplicada || "").replace(",", "."));
          if (!isFinite(tarifa) || tarifa < 0) {
            tarifa = resolverTarifaKmColaborador_(fecha);
          }
          var importeKm = Number((kms * tarifa).toFixed(2));
          payload.km_recorridos_colaborador = kms;
          payload.tarifa_eur_km_aplicada = tarifa;
          payload.importe_km_colaborador = importeKm;
          coste_total = coste_total || importeKm;
        }
        concepto =
          concepto ||
          String(payload.motivo_colaborador || "").trim() ||
          ("Viaje " + String(payload.origen_colaborador || "").trim() + " -> " + String(payload.destino_colaborador || "").trim());
        proveedor = proveedor || String(payload.accion_colaborador || "COLABORADOR").trim();
        break;
    }
  }

  // Desglose IVA: prioriza lo enviado por la app; si falta, calcula desde total + %.
  var ivaBr = calcIvaBreakdownGasto_(coste_total, iva_porcentaje);
  if (tipo === "GASTOS_BILLETES") {
    var ticketBillete = Number(payload.precio_total_billete) || 0;
    var tasasBillete = Number(payload.tasas_billete) || 0;
    var ivaBillete = calcIvaBreakdownGasto_(ticketBillete, iva_porcentaje);
    iva_porcentaje = ivaBillete.iva_porcentaje;
    if (!importe_sin_iva) importe_sin_iva = Math.round((ivaBillete.base_imponible + tasasBillete) * 100) / 100;
    if (!base_imponible) base_imponible = importe_sin_iva;
    if (!cuota_iva && iva_porcentaje !== 0) cuota_iva = ivaBillete.cuota_iva;
  } else {
    iva_porcentaje = ivaBr.iva_porcentaje;
    if (!importe_sin_iva) importe_sin_iva = ivaBr.base_imponible;
    if (!base_imponible) base_imponible = importe_sin_iva || ivaBr.base_imponible;
    if (!cuota_iva && iva_porcentaje !== 0) cuota_iva = ivaBr.cuota_iva;
  }
  if (iva_porcentaje === 0) cuota_iva = 0;
  if (!cuota_iva && coste_total && importe_sin_iva) {
    cuota_iva = Math.round((coste_total - importe_sin_iva) * 100) / 100;
  }

  var id = genId_("GAS");

  var rowObj = {};
  var keys = Object.keys(payload);
  for (var k = 0; k < keys.length; k++) rowObj[keys[k]] = payload[keys[k]];

  rowObj.id_gasto = id;
  rowObj.id_viaje_propio = idViajePropio;
  rowObj.fecha = fecha;
  rowObj.matricula = mat;
  rowObj.tipo_gasto = tipoRaw || tipo;
  rowObj.responsable_email = responsable_email;
  rowObj.grabado_por_email = actor_email;
  rowObj.concepto = concepto;
  rowObj.importe_sin_iva = importe_sin_iva;
  rowObj.coste_total = coste_total;
  rowObj.iva_porcentaje = iva_porcentaje;
  rowObj.base_imponible = base_imponible;
  rowObj.cuota_iva = cuota_iva;
  rowObj.proveedor = proveedor;
  if (tipo === "GASTOS_BILLETES") {
    if (!String(rowObj.concepto_billete || "").trim()) rowObj.concepto_billete = concepto;
    if (!String(rowObj.compania_billete || "").trim()) rowObj.compania_billete = proveedor;
    if (!String(rowObj.numero_factura_otros || "").trim() && String(rowObj.numero_reserva_billete || "").trim()) {
      rowObj.numero_factura_otros = String(rowObj.numero_reserva_billete || "").trim();
    }
    if (!String(rowObj.numero_personas_hospedaje || "").trim() && String(rowObj.numero_personas_billete || "").trim()) {
      rowObj.numero_personas_hospedaje = String(rowObj.numero_personas_billete || "").trim();
    }
    if (!String(rowObj.num_personas || "").trim() && String(rowObj.numero_personas_billete || "").trim()) {
      rowObj.num_personas = String(rowObj.numero_personas_billete || "").trim();
    }
  }
  if (tipo === "OTROS" || tipo === "HOSPEDAJE" || tipo === "MANUTENCION") {
    if (!String(rowObj.concepto_otros_gastos || "").trim() && concepto) {
      rowObj.concepto_otros_gastos = concepto;
    }
    if (!String(rowObj.concepto || "").trim() && String(rowObj.concepto_otros_gastos || "").trim()) {
      rowObj.concepto = String(rowObj.concepto_otros_gastos).trim();
    }
  }

  rowObj.ticket_drive_url = ticketUrlsArr[0] || "";
  rowObj.ticket_drive_urls = ticketUrlsArr.join(";");
  rowObj.ticket_drive_urls_json = JSON.stringify(ticketUrlsArr);
  rowObj.ticket_drive_file_name = safeTicketFileNamesArr[0] || "";
  rowObj.ticket_drive_file_names = safeTicketFileNamesArr.join(";");
  rowObj.ticket_drive_file_names_json = JSON.stringify(safeTicketFileNamesArr);

  // alias
  rowObj.poliza = rowObj.poliza || String(payload.numero_poliza || "").trim();
  rowObj.marca = rowObj.marca || String(payload.marca_combustible || payload.marca || "").trim();
  rowObj.lugar_repostaje =
    rowObj.lugar_repostaje ||
    String(payload.lugar_repostaje || payload.entidad_combustible || "").trim();
  rowObj.tipo_impuesto = rowObj.tipo_impuesto || String(payload.tipo_otro_impuesto || payload.tipo_impuesto_otro || "").trim();
  rowObj.importe = rowObj.importe || String(payload.importe_multa || payload.importe || "").trim();
  rowObj.conductor = rowObj.conductor || String(payload.conductor_multa || payload.conductor || "").trim();
  rowObj.lugar = rowObj.lugar || String(payload.lugar_multa || payload.lugar || "").trim();
  rowObj.fecha_multa = rowObj.fecha_multa || String(payload.fecha_multa || "").trim();
  rowObj.fecha_viaje_colaborador = rowObj.fecha_viaje_colaborador || String(payload.fecha_viaje_colaborador || payload.fecha || "").trim();

  // normaliza fechas a dd/MM/yyyy
  var objKeys = Object.keys(rowObj);
  for (var n = 0; n < objKeys.length; n++) {
    var lk = String(objKeys[n]).toLowerCase();
    if (lk === "fecha" || lk.indexOf("fecha_") === 0 || lk.indexOf("_fecha") > -1 || lk === "periodo_ivm") {
      if (rowObj[objKeys[n]]) rowObj[objKeys[n]] = normalizeDateDMYCell_(rowObj[objKeys[n]]);
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (tipo === "GASTOS_BILLETES") ensureGastosBilletesColumns_();

  // 1) GASTOS general
  var shGeneral = ss.getSheetByName("GASTOS");
  if (shGeneral) {
    ensureColumnsAtEnd_(shGeneral, IVA_COLS.concat([
      "forma_pago",
      "concepto",
      "proveedor",
      "numero_factura_peaje",
      "numero_personas_hospedaje",
      "numero_comensales_manutencion",
      "numero_factura_otros",
      "fecha_otros_gastos",
      "proveedor_otros_gastos",
      "concepto_otros_gastos",
      "importe_otros_gastos",
      "fecha_ida_billete",
      "fecha_vuelta_billete",
      "origen_billete",
      "destino_billete",
      "numero_reserva_billete",
      "numero_personas_billete",
      "compania_billete",
      "precio_total_billete",
      "tasas_billete",
      "concepto_billete",
      "work_package",
      "accion_proyecto",
      "subtipo_otros",
      "grabado_por_email"
    ]));
    if (!String(rowObj.forma_pago || "").trim()) rowObj.forma_pago = "Usuario";
    appendRowByHeaders_(shGeneral, rowObj);
  }

  // 2) GASTOS por tipo
  var targetSheetName = TIPO_A_SHEET[tipo] || null;
  if (targetSheetName) {
    var shTipo = ss.getSheetByName(targetSheetName);
    if (!shTipo) {
      var hdrs = HEADERS_POR_TIPO[targetSheetName];
      if (hdrs) {
        shTipo = ss.insertSheet(targetSheetName);
        shTipo.getRange(1, 1, 1, hdrs.length).setValues([hdrs]);
        shTipo.setFrozenRows(1);
      }
    }
    if (shTipo) {
      ensureColumnsAtEnd_(
        shTipo,
        targetSheetName === "GASTOS_KILOMETRAJE_COLABORADOR"
          ? ["iva_porcentaje", "base_imponible", "cuota_iva"]
          : targetSheetName === "GASTOS_PEAJES"
            ? ["entidad_peaje", "numero_factura_peaje"].concat(IVA_COLS)
            : targetSheetName === "GASTOS_OTROS"
              ? ["subtipo_otros"].concat(IVA_COLS)
            : targetSheetName === "GASTOS_BILLETES"
              ? HEADERS_POR_TIPO.GASTOS_BILLETES
              : IVA_COLS
      );
      appendRowByHeaders_(shTipo, rowObj);
    }
  }

  return { id_gasto: id };
}

function findGastoRowsById_(idGasto) {
  var id = String(idGasto || "").trim();
  if (!id) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var seen = {};
  var sheetNames = ["GASTOS"];
  var tipoKeys = Object.keys(TIPO_A_SHEET);
  for (var t = 0; t < tipoKeys.length; t++) {
    var sn = TIPO_A_SHEET[tipoKeys[t]];
    if (sn && !seen[sn]) {
      seen[sn] = true;
      sheetNames.push(sn);
    }
  }
  var hits = [];
  for (var i = 0; i < sheetNames.length; i++) {
    var sh = ss.getSheetByName(sheetNames[i]);
    if (!sh) continue;
    var row = indexRowById_(rowsToObjects_(sh), "id_gasto", id);
    if (row) hits.push({ sheet: sh, row: row, sheetName: sheetNames[i] });
  }
  return hits;
}

function mergePayloadWithGastoRow_(existing, payload) {
  var merged = {};
  var keys = Object.keys(existing || {});
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === "_row") continue;
    merged[keys[i]] = existing[keys[i]];
  }
  var pk = Object.keys(payload || {});
  for (var j = 0; j < pk.length; j++) {
    if (pk[j] === "secret" || pk[j] === "action") continue;
    merged[pk[j]] = payload[pk[j]];
  }
  return merged;
}

function apiGastoActualizar(payload) {
  payload = payload || {};
  var id = String(payload.id_gasto || "").trim();
  if (!id) throw new Error("Falta id_gasto");

  var hits = findGastoRowsById_(id);
  if (!hits.length) throw new Error("Gasto no encontrado: " + id);

  var responsable_email = String(
    payload.responsable_email || payload.usuario_email || payload.user_email || hits[0].row.responsable_email || ""
  )
    .trim()
    .toLowerCase();
  if (!responsable_email) throw new Error("Falta responsable_email");
  var actor_email = String(
    payload.grabado_por_email || payload.actor_email || payload.usuario_email || ""
  )
    .trim()
    .toLowerCase();
  if (!actor_email) actor_email = responsable_email;
  if (actor_email !== responsable_email) {
    requireRolGestorOrAdministracion_(actor_email);
  }
  var u = getUsuarioByEmail_(responsable_email);
  if (!u) throw new Error("Usuario no existe o está inactivo");

  var changes = mergePayloadWithGastoRow_(hits[0].row, payload);
  changes.id_gasto = id;
  changes.responsable_email = responsable_email;
  changes.grabado_por_email = actor_email || String(hits[0].row.grabado_por_email || "").trim().toLowerCase();

  // Deriva proveedor/concepto/lugar desde campos tipados del formulario (igual que crear).
  var tipoUpd = normalizeTipoGasto_(changes.tipo_gasto || payload.tipo_gasto || hits[0].row.tipo_gasto || "");
  var proveedorUpd = String(changes.proveedor || "").trim();
  var conceptoUpd = String(changes.concepto || "").trim();
  switch (tipoUpd) {
    case "SEGURO":
      proveedorUpd = proveedorUpd || String(changes.compania || payload.compania || "").trim();
      conceptoUpd = conceptoUpd || String(changes.cobertura || payload.cobertura || "").trim();
      break;
    case "REPUESTOS_RECAMBIO":
      proveedorUpd = proveedorUpd || String(changes.proveedor_repuestos || payload.proveedor_repuestos || "").trim();
      conceptoUpd = conceptoUpd || String(changes.descripcion_repuestos || payload.descripcion_repuestos || "").trim();
      break;
    case "MANTENIMIENTO_REPARACIONES":
      proveedorUpd =
        proveedorUpd || String(changes.proveedor_mantenimiento || payload.proveedor_mantenimiento || "").trim();
      conceptoUpd =
        conceptoUpd || String(changes.descripcion_mantenimiento || payload.descripcion_mantenimiento || "").trim();
      break;
    case "COMBUSTIBLES":
      proveedorUpd =
        proveedorUpd ||
        String(
          changes.lugar_repostaje ||
            payload.lugar_repostaje ||
            changes.entidad_combustible ||
            payload.entidad_combustible ||
            ""
        ).trim();
      conceptoUpd =
        conceptoUpd || String(changes.numero_ticket || payload.numero_ticket || changes.marca || payload.marca || "").trim();
      changes.lugar_repostaje =
        String(changes.lugar_repostaje || payload.lugar_repostaje || changes.entidad_combustible || payload.entidad_combustible || "").trim();
      break;
    case "PARKING":
      proveedorUpd = proveedorUpd || String(changes.entidad_parking || payload.entidad_parking || "").trim();
      conceptoUpd = conceptoUpd || String(changes.tipo_zona || payload.tipo_zona || "").trim();
      break;
    case "PEAJES":
      proveedorUpd = proveedorUpd || String(changes.entidad_peaje || payload.entidad_peaje || "").trim();
      if (!conceptoUpd) {
        conceptoUpd = (
          String(changes.entrada_peaje || payload.entrada_peaje || "") +
          " -> " +
          String(changes.salida_peaje || payload.salida_peaje || "")
        ).trim();
      }
      break;
    case "ITV":
      conceptoUpd = conceptoUpd || String(changes.estacion_itv || payload.estacion_itv || "").trim();
      proveedorUpd = proveedorUpd || conceptoUpd;
      break;
    case "GASTOS_BILLETES":
      proveedorUpd = proveedorUpd || String(changes.compania_billete || payload.compania_billete || "").trim();
      conceptoUpd =
        conceptoUpd ||
        String(changes.concepto_billete || payload.concepto_billete || "").trim() ||
        [
          String(changes.origen_billete || payload.origen_billete || "").trim(),
          String(changes.destino_billete || payload.destino_billete || "").trim()
        ]
          .filter(Boolean)
          .join(" -> ");
      if (!String(changes.numero_factura_otros || "").trim() && String(changes.numero_reserva_billete || "").trim()) {
        changes.numero_factura_otros = String(changes.numero_reserva_billete || "").trim();
      }
      break;
    case "MULTAS_SANCIONES":
    case "MULTAS":
      proveedorUpd =
        proveedorUpd || String(changes.organismo_denunciante || payload.organismo_denunciante || "").trim();
      conceptoUpd = conceptoUpd || String(changes.tipo_infraccion || payload.tipo_infraccion || "").trim();
      break;
    case "OTROS":
    case "HOSPEDAJE":
    case "MANUTENCION":
      proveedorUpd =
        proveedorUpd ||
        String(
          changes.proveedor_otros_gastos ||
            payload.proveedor_otros_gastos ||
            changes.entidad_hospedaje ||
            payload.entidad_hospedaje ||
            changes.establecimiento_manutencion ||
            payload.establecimiento_manutencion ||
            ""
        ).trim();
      conceptoUpd =
        conceptoUpd ||
        String(changes.concepto_otros_gastos || payload.concepto_otros_gastos || "").trim() ||
        (tipoUpd === "HOSPEDAJE" ? "Hospedaje" : tipoUpd === "MANUTENCION" ? "Manutención" : "");
      if (proveedorUpd) changes.proveedor_otros_gastos = changes.proveedor_otros_gastos || proveedorUpd;
      break;
    case "KILOMETRAJE_COLABORADOR":
      proveedorUpd = proveedorUpd || String(changes.accion_colaborador || payload.accion_colaborador || "COLABORADOR").trim();
      break;
  }
  if (proveedorUpd) changes.proveedor = proveedorUpd;
  if (conceptoUpd) changes.concepto = conceptoUpd;

  // Fuente de verdad: payload del cliente (fecha canónica / tipada enviada).
  // No usar Date crudo de la fila (String(Date) → formato US y pisa el valor nuevo).
  var typedFechaKeyUpd = "";
  switch (tipoUpd) {
    case "SEGURO":
      typedFechaKeyUpd = "fecha_inicio_seguro";
      break;
    case "IMPUESTOS":
      typedFechaKeyUpd = "periodo_ivm";
      break;
    case "OTROS_IMPUESTOS":
      typedFechaKeyUpd = "fecha_pago";
      break;
    case "REPUESTOS_RECAMBIO":
      typedFechaKeyUpd = "fecha_compra_repuestos";
      break;
    case "MANTENIMIENTO_REPARACIONES":
      typedFechaKeyUpd = "fecha_compra_mantenimiento";
      break;
    case "COMBUSTIBLES":
      typedFechaKeyUpd = "fecha_repostaje";
      break;
    case "PARKING":
      typedFechaKeyUpd = "fecha_aparcamiento";
      break;
    case "PEAJES":
      typedFechaKeyUpd = "fecha_peaje";
      break;
    case "ITV":
      typedFechaKeyUpd = "fecha_inspeccion";
      break;
    case "MULTAS_SANCIONES":
    case "MULTAS":
      typedFechaKeyUpd = "fecha_multa";
      break;
    case "GASTOS_BILLETES":
      typedFechaKeyUpd = "fecha_ida_billete";
      break;
    case "OTROS":
    case "HOSPEDAJE":
    case "MANUTENCION":
      typedFechaKeyUpd = "fecha_otros_gastos";
      break;
    case "KILOMETRAJE_COLABORADOR":
      typedFechaKeyUpd = "fecha_viaje_colaborador";
      break;
  }
  var payloadFechaTxt = "";
  if (payload.fecha !== undefined && payload.fecha !== null && String(payload.fecha).trim() !== "") {
    payloadFechaTxt = normalizeDateDMYCell_(payload.fecha);
  }
  var payloadTypedTxt = "";
  if (
    typedFechaKeyUpd &&
    payload[typedFechaKeyUpd] !== undefined &&
    payload[typedFechaKeyUpd] !== null &&
    String(payload[typedFechaKeyUpd]).trim() !== ""
  ) {
    payloadTypedTxt = normalizeDateDMYCell_(payload[typedFechaKeyUpd]);
  }
  if (!payloadTypedTxt && tipoUpd === "KILOMETRAJE_COLABORADOR" && payload.fecha_servicio) {
    payloadTypedTxt = normalizeDateDMYCell_(payload.fecha_servicio);
  }
  var fechaValueUpd = payloadFechaTxt || payloadTypedTxt || "";
  if (!fechaValueUpd && changes.fecha !== undefined && changes.fecha !== null && String(changes.fecha).trim() !== "") {
    fechaValueUpd = normalizeDateDMYCell_(changes.fecha);
  }
  if (fechaValueUpd) {
    changes.fecha = fechaValueUpd;
    if (typedFechaKeyUpd) changes[typedFechaKeyUpd] = fechaValueUpd;
  }

  // Recalcula desglose IVA si viene total/% o faltan base/cuota
  var costeUpd = Number(changes.coste_total) || 0;
  var ivaUpd = Number(String(changes.iva_porcentaje == null ? "" : changes.iva_porcentaje).toString().replace(",", "."));
  if (!isFinite(ivaUpd) || ivaUpd < 0) ivaUpd = 21;
  if (
    costeUpd > 0 ||
    (changes.iva_porcentaje !== undefined && changes.iva_porcentaje !== null && changes.iva_porcentaje !== "")
  ) {
    var brUpd = calcIvaBreakdownGasto_(costeUpd, ivaUpd);
    changes.iva_porcentaje = brUpd.iva_porcentaje;
    if (!Number(changes.importe_sin_iva)) changes.importe_sin_iva = brUpd.base_imponible;
    if (!Number(changes.base_imponible)) changes.base_imponible = changes.importe_sin_iva || brUpd.base_imponible;
    if (brUpd.iva_porcentaje === 0) {
      changes.cuota_iva = 0;
    } else if (!Number(changes.cuota_iva)) {
      changes.cuota_iva = brUpd.cuota_iva;
    }
  }

  var fechaColsEnsure = ["fecha"];
  if (typedFechaKeyUpd) fechaColsEnsure.push(typedFechaKeyUpd);
  for (var eh = 0; eh < hits.length; eh++) {
    var colsEnsure =
      hits[eh].sheetName === "GASTOS_KILOMETRAJE_COLABORADOR"
        ? fechaColsEnsure.concat(["iva_porcentaje", "base_imponible", "cuota_iva"])
        : fechaColsEnsure.concat(IVA_COLS);
    ensureColumnsAtEnd_(hits[eh].sheet, colsEnsure);
  }

  var ticketTouched =
    payload.ticket_drive_urls !== undefined ||
    payload.ticket_drive_urls_json !== undefined ||
    payload.ticket_drive_url !== undefined ||
    payload.ticketUrls !== undefined ||
    payload.ticket_drive_file_names !== undefined ||
    payload.ticket_drive_file_names_json !== undefined ||
    payload.ticketFileNames !== undefined;
  var ticketUrlsArr = [];
  if (ticketTouched) {
    // Fuente de verdad del cliente (puede ser [] tras quitar adjuntos). No caer al valor antiguo de la fila.
    ticketUrlsArr = normalizeMultiArray_(
      payload.ticket_drive_urls_json !== undefined && payload.ticket_drive_urls_json !== null && payload.ticket_drive_urls_json !== ""
        ? payload.ticket_drive_urls_json
        : payload.ticket_drive_urls !== undefined && payload.ticket_drive_urls !== null
          ? payload.ticket_drive_urls
          : payload.ticketUrls !== undefined && payload.ticketUrls !== null
            ? payload.ticketUrls
            : payload.ticket_drive_url
    );
  } else {
    ticketUrlsArr = normalizeMultiArray_(
      changes.ticket_drive_urls_json || changes.ticket_drive_urls || changes.ticket_drive_url
    );
  }
  if (ticketTouched || ticketUrlsArr.length) {
    var ticketFileNamesArr = normalizeMultiArray_(
      ticketTouched
        ? payload.ticket_drive_file_names_json !== undefined &&
          payload.ticket_drive_file_names_json !== null &&
          payload.ticket_drive_file_names_json !== ""
          ? payload.ticket_drive_file_names_json
          : payload.ticket_drive_file_names !== undefined && payload.ticket_drive_file_names !== null
            ? payload.ticket_drive_file_names
            : payload.ticketFileNames !== undefined && payload.ticketFileNames !== null
              ? payload.ticketFileNames
              : payload.ticket_drive_file_name
        : changes.ticket_drive_file_names_json || changes.ticket_drive_file_names || changes.ticket_drive_file_name
    );
    var safeTicketFileNamesArr = ensureSameLen_(ticketFileNamesArr, ticketUrlsArr.length);
    changes.ticket_drive_url = ticketUrlsArr[0] || "";
    changes.ticket_drive_urls = ticketUrlsArr.join(";");
    changes.ticket_drive_urls_json = JSON.stringify(ticketUrlsArr);
    changes.ticket_drive_file_name = safeTicketFileNamesArr[0] || "";
    changes.ticket_drive_file_names = safeTicketFileNamesArr.join(";");
    changes.ticket_drive_file_names_json = JSON.stringify(safeTicketFileNamesArr);
  }

  var objKeys = Object.keys(changes);
  for (var n = 0; n < objKeys.length; n++) {
    var lk = String(objKeys[n]).toLowerCase();
    if (lk === "fecha" || lk.indexOf("fecha_") === 0 || lk.indexOf("_fecha") > -1 || lk === "periodo_ivm") {
      if (changes[objKeys[n]]) changes[objKeys[n]] = normalizeDateDMYCell_(changes[objKeys[n]]);
    }
  }

  for (var h = 0; h < hits.length; h++) {
    updateRowByHeaders_(hits[h].sheet, hits[h].row._row, changes);
  }
  return { id_gasto: id };
}

function apiGastoEliminar(payload) {
  payload = payload || {};
  var id = String(payload.id_gasto || "").trim();
  if (!id) throw new Error("Falta id_gasto");

  var hits = findGastoRowsById_(id);
  if (!hits.length) throw new Error("Gasto no encontrado: " + id);

  hits.sort(function (a, b) {
    return b.row._row - a.row._row;
  });
  for (var i = 0; i < hits.length; i++) {
    hits[i].sheet.deleteRow(hits[i].row._row);
  }
  return { id_gasto: id, deleted: true };
}

// ======================================================================
// apiMantenimientoCrear (dejar solo esta versión en todo el proyecto)
// ======================================================================
function apiMantenimientoCrear(payload) {
  payload = payload || {};

  var required = ["fecha", "matricula", "tipo", "taller"];
  for (var i = 0; i < required.length; i++) {
    if (payload[required[i]] === undefined || payload[required[i]] === null || payload[required[i]] === "") {
      throw new Error("Falta campo: " + required[i]);
    }
  }

  var responsable_email = String(
    payload.responsable_email || payload.usuario_email || payload.user_email || ""
  ).trim().toLowerCase();
  if (!responsable_email) throw new Error("Falta campo: responsable_email");

  // usuario activo
  var u = getUsuarioByEmail_(responsable_email);
  if (!u) throw new Error("Usuario no existe o está inactivo");

  // adjuntos obligatorios
  var fotosUrlsArr = normalizeMultiArray_(
    payload.fotos_drive_urls || payload.fotosUrls || payload.fotos_drive_url
  );
  if (!fotosUrlsArr.length) throw new Error("Falta campo: fotos_drive_urls (OBLIGATORIO)");

  var fotosFileNamesArr = normalizeMultiArray_(
    payload.fotos_drive_file_names || payload.fotosFileNames || payload.fotos_drive_file_name
  );
  var safeFotosFileNamesArr = ensureSameLen_(fotosFileNamesArr, fotosUrlsArr.length);

  var fechaDate = parseFechaFlexible_(payload.fecha);
  if (!fechaDate) throw new Error("Fecha invalida");

  var proximaFechaDate = payload.proxima_fecha ? parseFechaFlexible_(payload.proxima_fecha) : null;
  var sh = getSheet("MANTENIMIENTOS");
  var id = genId_("MAN");

  var rowObj = {
    id_mantenimiento: id,
    fecha: formatDateISO_(fechaDate),
    matricula: normalizeMatricula_(payload.matricula),
    departamento_o_proyecto: String(payload.departamento_o_proyecto || "").trim(),
    tipo: String(payload.tipo || "").trim(),
    taller: String(payload.taller || "").trim(),
    descripcion: String(payload.descripcion || payload.observaciones || "").trim(),
    coste: Number(payload.coste) || 0,
    kilometraje: Number(payload.kilometraje) || 0,
    observaciones: String(payload.observaciones || payload.descripcion || "").trim(),
    proximo_km: (payload.proximo_km !== undefined && payload.proximo_km !== null && payload.proximo_km !== "")
      ? Number(payload.proximo_km) : "",
    proxima_fecha: proximaFechaDate ? formatDateISO_(proximaFechaDate) : String(payload.proxima_fecha || "").trim(),
    responsable_email: responsable_email,
    paralizado: String(payload.paralizado || "NO").toUpperCase() === "SI" ? "SI" : "NO",
    paraliza_desde: String(payload.paraliza_desde || "").trim(),
    paraliza_hasta: String(payload.paraliza_hasta || "").trim(),
    fotos_drive_url: fotosUrlsArr[0] || "",
    fotos_drive_urls: fotosUrlsArr.join(";"),
    fotos_drive_urls_json: JSON.stringify(fotosUrlsArr),
    fotos_drive_file_name: safeFotosFileNamesArr[0] || "",
    fotos_drive_file_names: safeFotosFileNamesArr.join(";"),
    fotos_drive_file_names_json: JSON.stringify(safeFotosFileNamesArr),
    usuario_uid: payload.usuario_uid || ""
  };

  // normaliza fechas
  var objKeys = Object.keys(rowObj);
  for (var n = 0; n < objKeys.length; n++) {
    var lk = String(objKeys[n]).toLowerCase();
    if (lk === "fecha" || lk.indexOf("fecha_") === 0 || lk.indexOf("_fecha") > -1) {
      if (rowObj[objKeys[n]]) rowObj[objKeys[n]] = normalizeDateDMYCell_(rowObj[objKeys[n]]);
    }
  }

  appendRowByHeaders_(sh, rowObj);
  return { id_mantenimiento: id };
}