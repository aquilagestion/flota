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

// ----- Headers por tipo -----
var HEADERS_POR_TIPO = {
  GASTOS_COMBUSTIBLE: BASE_COLS.concat([
    "fecha_repostaje", "lugar_repostaje", "marca", "tipo_combustible",
    "kilometros_repostaje", "tipo_repostaje", "litros_repostados",
    "precio_por_litro", "descuento", "puntos_obtenidos",
    "total_a_pagar", "numero_ticket"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_SEGURO: BASE_COLS.concat([
    "compania", "poliza", "cobertura",
    "fecha_inicio_seguro", "fecha_fin_seguro", "prima"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_PEAJES: BASE_COLS.concat([
    "fecha_peaje", "entrada_peaje", "salida_peaje", "importe_peaje"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_PARKING: BASE_COLS.concat([
    "fecha_aparcamiento", "tipo_zona",
    "hora_inicio_aparcamiento", "hora_fin_aparcamiento",
    "importe_aparcamiento"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_IMPUESTOS: BASE_COLS.concat([
    "periodo_ivm", "importe_ivm"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_OTROS_IMPUESTOS: BASE_COLS.concat([
    "tipo_impuesto", "fecha_pago", "fecha_proximo_pago",
    "importe_otros_impuestos"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_ITV: BASE_COLS.concat([
    "estacion_itv", "fecha_inspeccion",
    "fecha_proxima_inspeccion", "importe_itv"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_REPUESTOS: BASE_COLS.concat([
    "fecha_compra_repuestos", "proveedor_repuestos",
    "descripcion_repuestos", "numero_factura_repuestos",
    "importe_repuestos"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_MANTENIMIENTO_REPARACIONES: BASE_COLS.concat([
    "fecha_compra_mantenimiento", "proveedor_mantenimiento",
    "descripcion_mantenimiento", "numero_factura_mantenimiento",
    "importe_mantenimiento", "fecha_proximo_mantenimiento",
    "kilometros_proximo_mantenimiento"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_OTROS: BASE_COLS.concat([
    "fecha_otros_gastos", "proveedor_otros_gastos",
    "concepto_otros_gastos", "importe_otros_gastos",
    "observaciones"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_MULTAS: BASE_COLS.concat([
    "conductor", "fecha_multa", "lugar",
    "organismo_denunciante", "tipo_infraccion", "importe"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS),

  GASTOS_KILOMETRAJE_COLABORADOR: BASE_COLS.concat([
    "id_proyecto", "proyecto_nombre", "fecha_viaje_colaborador",
    "km_inicial_colaborador", "km_final_colaborador", "km_recorridos_colaborador",
    "origen_colaborador", "destino_colaborador", "motivo_colaborador",
    "accion_colaborador", "tarifa_eur_km_aplicada", "importe_km_colaborador",
    "forma_pago", "concepto", "proveedor", "coste_total", "importe_sin_iva"
  ]).concat(TAIL_COLS).concat(ADJUNTO_COLS)
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
  "OTROS": "GASTOS_OTROS",
  "MULTAS_SANCIONES": "GASTOS_MULTAS",
  "MULTAS": "GASTOS_MULTAS",
  "GASTOS_MULTAS": "GASTOS_MULTAS",
  "GASTOS_OTROS_IMPUESTOS": "GASTOS_OTROS_IMPUESTOS",
  "KILOMETRAJE_COLABORADOR": "GASTOS_KILOMETRAJE_COLABORADOR"
};

// ======================================================================
// Crea/actualiza pestañas por tipo y fuerza headers correctos en fila 1
// ======================================================================
function setupGastosSheetsPorTipo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = Object.keys(HEADERS_POR_TIPO);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheetName = sheetNames[i];
    var headers = HEADERS_POR_TIPO[sheetName];

    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);

    // Fuerza headers correctos siempre
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
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
    shCat.getRange(2, 1, 11, 2).setValues([
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
      ["OTROS", "OTROS"]
    ]);
    shCat.setFrozenRows(1);
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
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CAT_TIPOS_GASTO");
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
  if (!mat && !isKmColab) throw new Error("Falta campo: matricula");
  if (!mat && isKmColab) mat = "COLABORADOR";

  var responsable_email = String(
    payload.responsable_email || payload.usuario_email || payload.user_email || ""
  ).trim().toLowerCase();
  if (!responsable_email) throw new Error("Falta campo: responsable_email");

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

  // adjuntos obligatorios
  var ticketUrlsArr = normalizeMultiArray_(
    payload.ticket_drive_urls || payload.ticketUrls || payload.ticket_drive_url
  );
  if (!isKmColab && !ticketUrlsArr.length) throw new Error("Falta campo: ticket_drive_urls (OBLIGATORIO)");

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
      case "OTROS": fechaValue = payload.fecha_otros_gastos; break;
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

  if (!coste_total || !concepto || !proveedor || !importe_sin_iva) {
    switch (tipo) {
      case "SEGURO":
        proveedor = proveedor || String(payload.compania || "").trim();
        concepto = concepto || String(payload.cobertura || "").trim();
        coste_total = coste_total || Number(payload.prima) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "IMPUESTOS":
        concepto = concepto || String(payload.periodo_ivm || "I.V.M.").trim();
        coste_total = coste_total || Number(payload.importe_ivm) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "OTROS_IMPUESTOS":
        concepto = concepto || String(payload.tipo_impuesto || payload.tipo_impuesto_otro || payload.tipo_otro_impuesto || "").trim();
        coste_total = coste_total || Number(payload.importe_otros_impuestos) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "REPUESTOS_RECAMBIO":
        proveedor = proveedor || String(payload.proveedor_repuestos || "").trim();
        concepto = concepto || String(payload.descripcion_repuestos || "").trim();
        coste_total = coste_total || Number(payload.importe_repuestos) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "MANTENIMIENTO_REPARACIONES":
        proveedor = proveedor || String(payload.proveedor_mantenimiento || "").trim();
        concepto = concepto || String(payload.descripcion_mantenimiento || "").trim();
        coste_total = coste_total || Number(payload.importe_mantenimiento) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "COMBUSTIBLES":
        proveedor = proveedor || String(payload.lugar_repostaje || "").trim();
        concepto = concepto || String(payload.numero_ticket || payload.marca || "").trim();
        coste_total = coste_total || Number(payload.total_a_pagar) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "PARKING":
        concepto = concepto || String(payload.tipo_zona || "").trim();
        coste_total = coste_total || Number(payload.importe_aparcamiento) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "PEAJES":
        concepto = concepto || (String(payload.entrada_peaje || "") + " -> " + String(payload.salida_peaje || "")).trim();
        coste_total = coste_total || Number(payload.importe_peaje) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "ITV":
        concepto = concepto || String(payload.estacion_itv || "").trim();
        coste_total = coste_total || Number(payload.importe_itv) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "MULTAS_SANCIONES":
        proveedor = proveedor || String(payload.organismo_denunciante || "").trim();
        concepto = concepto || String(payload.tipo_infraccion || "").trim();
        coste_total = coste_total || Number(payload.importe || payload.importe_multa || "") || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "OTROS":
        proveedor = proveedor || String(payload.proveedor_otros_gastos || "").trim();
        concepto = concepto || String(payload.concepto_otros_gastos || "").trim();
        coste_total = coste_total || Number(payload.importe_otros_gastos) || 0;
        importe_sin_iva = importe_sin_iva || coste_total;
        break;
      case "KILOMETRAJE_COLABORADOR":
        var kmIni = Number(String(payload.km_inicial_colaborador || "").replace(",", "."));
        var kmFin = Number(String(payload.km_final_colaborador || "").replace(",", "."));
        if (!isFinite(kmIni) || !isFinite(kmFin) || kmFin <= kmIni) {
          throw new Error("Kilometraje inválido: km_final debe ser mayor que km_inicial");
        }
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
        importe_sin_iva = importe_sin_iva || coste_total;
        concepto =
          concepto ||
          String(payload.motivo_colaborador || "").trim() ||
          ("Viaje " + String(payload.origen_colaborador || "").trim() + " -> " + String(payload.destino_colaborador || "").trim());
        proveedor = proveedor || String(payload.accion_colaborador || "COLABORADOR").trim();
        break;
    }
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
  rowObj.concepto = concepto;
  rowObj.importe_sin_iva = importe_sin_iva;
  rowObj.coste_total = coste_total;
  rowObj.proveedor = proveedor;

  rowObj.ticket_drive_url = ticketUrlsArr[0] || "";
  rowObj.ticket_drive_urls = ticketUrlsArr.join(";");
  rowObj.ticket_drive_urls_json = JSON.stringify(ticketUrlsArr);
  rowObj.ticket_drive_file_name = safeTicketFileNamesArr[0] || "";
  rowObj.ticket_drive_file_names = safeTicketFileNamesArr.join(";");
  rowObj.ticket_drive_file_names_json = JSON.stringify(safeTicketFileNamesArr);

  // alias
  rowObj.poliza = rowObj.poliza || String(payload.numero_poliza || "").trim();
  rowObj.marca = rowObj.marca || String(payload.marca_combustible || payload.marca || "").trim();
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

  // 1) GASTOS general
  var shGeneral = ss.getSheetByName("GASTOS");
  if (shGeneral) appendRowByHeaders_(shGeneral, rowObj);

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
    if (shTipo) appendRowByHeaders_(shTipo, rowObj);
  }

  return { id_gasto: id };
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