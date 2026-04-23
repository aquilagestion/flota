// ======================================================================
// 22_hoja_gasto_pago_en_gastos.gs
// Actualiza estado de pago de una hoja de gasto en la pestaña GASTOS
// buscando por hoja_gasto_id (o hoja_id_local).
// ======================================================================

function apiHojaGastoActualizarPago(payload) {
  payload = payload || {};

  var actor = String(
    payload.user_email || payload.pagado_por || payload.hoja_gasto_pagado_por || payload.responsable_email || ""
  ).trim().toLowerCase();
  requireRolAdministracionOnly_(actor);

  var hojaId = String(payload.hoja_gasto_id || payload.hoja_id_local || "").trim();
  if (!hojaId) throw new Error("Falta campo: hoja_gasto_id / hoja_id_local");

  var estadoPago = String(payload.hoja_gasto_estado_pago || payload.estado_pago || "PAGO_PENDIENTE")
    .trim()
    .toUpperCase();
  var pagadoPor = String(
    payload.hoja_gasto_pagado_por || payload.pagado_por || payload.user_email || payload.responsable_email || ""
  )
    .trim()
    .toLowerCase();
  var fechaPago = String(payload.hoja_gasto_fecha_pago || payload.fecha_pago || "").trim();
  var metodoPago = String(payload.hoja_gasto_metodo_pago || payload.metodo_pago || "").trim();
  var referenciaPago = String(payload.hoja_gasto_referencia_pago || payload.referencia_pago || "").trim();

  if (estadoPago === "PAGADA" && !fechaPago) {
    fechaPago = new Date().toISOString();
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) throw new Error("GASTOS no tiene datos");

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  var idxNorm = {};
  for (var c = 0; c < headers.length; c++) {
    var raw = String(headers[c] || "").trim();
    idx[raw] = c + 1;
    var norm = raw.toLowerCase().replace(/\s+/g, "_");
    if (norm) idxNorm[norm] = c + 1;
  }

  function need(col) {
    var exact = idx[col];
    if (exact) return exact;
    var norm = String(col || "").trim().toLowerCase().replace(/\s+/g, "_");
    var byNorm = idxNorm[norm];
    if (byNorm) return byNorm;
    throw new Error("Falta columna en GASTOS: " + col);
  }

  var colHoja = need("hoja_gasto_id");
  var colEstadoPago = need("hoja_gasto_estado_pago");
  var colPagadoPor = need("hoja_gasto_pagado_por");
  var colFechaPago = need("hoja_gasto_fecha_pago");
  var colMetodoPago = need("hoja_gasto_metodo_pago");
  var colRefPago = need("hoja_gasto_referencia_pago");

  var hojaVals = sh.getRange(2, colHoja, lastRow - 1, 1).getValues();
  var updated = 0;

  for (var r = 0; r < hojaVals.length; r++) {
    var rid = String(hojaVals[r][0] || "").trim();
    if (!rid || rid !== hojaId) continue;
    var row = r + 2;

    sh.getRange(row, colEstadoPago).setValue(estadoPago);
    sh.getRange(row, colPagadoPor).setValue(pagadoPor);
    sh.getRange(row, colFechaPago).setValue(fechaPago);
    sh.getRange(row, colMetodoPago).setValue(metodoPago);
    sh.getRange(row, colRefPago).setValue(referenciaPago);
    updated++;
  }

  return {
    hoja_gasto_id: hojaId,
    hoja_gasto_estado_pago: estadoPago,
    hoja_gasto_pagado_por: pagadoPor,
    hoja_gasto_fecha_pago: fechaPago,
    hoja_gasto_metodo_pago: metodoPago,
    hoja_gasto_referencia_pago: referenciaPago,
    updated: updated,
  };
}