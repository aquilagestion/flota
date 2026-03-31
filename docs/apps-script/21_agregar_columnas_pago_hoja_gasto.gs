// ======================================================================
// 21_agregar_columnas_pago_hoja_gasto.gs
// Crea (si faltan) las columnas de pago de hoja de gasto en "GASTOS".
// ======================================================================

function ensureGastosPaymentColumns_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var required = [
    "hoja_gasto_estado_pago",      // PAGO_PENDIENTE | PAGADA | RECHAZADA_PAGO
    "hoja_gasto_pagado_por",       // email usuario que marca pago
    "hoja_gasto_fecha_pago",       // timestamp
    "hoja_gasto_metodo_pago",      // Transferencia, Bizum, etc.
    "hoja_gasto_referencia_pago",  // nº transferencia / referencia contable
  ];

  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error("La pestaña GASTOS no tiene cabecera");
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var existing = {};
  for (var i = 0; i < headers.length; i++) {
    existing[String(headers[i] || "").trim()] = true;
  }

  var added = [];
  for (var j = 0; j < required.length; j++) {
    var colName = required[j];
    if (existing[colName]) continue;
    var nextCol = sh.getLastColumn() + 1;
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, nextCol).setValue(colName);
    existing[colName] = true;
    added.push(colName);
  }

  return {
    sheet: "GASTOS",
    added: added,
    added_count: added.length,
    already_present_count: required.length - added.length,
  };
}

// Ejecuta esta función una vez desde el editor para crear las columnas.
function runEnsureGastosPaymentColumns() {
  var out = ensureGastosPaymentColumns_();
  Logger.log(JSON.stringify(out));
  return out;
}

