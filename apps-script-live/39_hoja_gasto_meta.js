// ======================================================================
// 39_hoja_gasto_meta.js
// Persiste DNI / fecha pie / WP-Acción por línea en GASTOS (hoja enviada).
// Columnas opcionales (se crean al final si faltan).
// ======================================================================

var HOJA_GASTO_META_COLS_ = [
  "hoja_gasto_dni",
  "hoja_gasto_fecha_firma",
  "hoja_gasto_fecha_hoja",
  "work_package",
  "accion_proyecto",
  "hoja_gasto_sheet_meta",
];

function ensureHojaGastoMetaColumns_(sh) {
  if (typeof ensureColumnsAtEnd_ === "function") {
    ensureColumnsAtEnd_(sh, HOJA_GASTO_META_COLS_);
    return;
  }
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var missing = [];
  for (var j = 0; j < HOJA_GASTO_META_COLS_.length; j++) {
    if (headers.indexOf(HOJA_GASTO_META_COLS_[j]) < 0) missing.push(HOJA_GASTO_META_COLS_[j]);
  }
  if (!missing.length) return;
  var nextCol = sh.getLastColumn() + 1;
  sh.getRange(1, nextCol, 1, missing.length).setValues([missing]);
}

/**
 * POST hoja_gasto_actualizar_meta
 * payload: hoja_gasto_id, dni, fecha_firma/fecha_hoja, lineas[{id_gasto, work_package, accion_proyecto}], sheet_meta?
 */
function apiHojaGastoActualizarMeta(payload) {
  payload = payload || {};
  var hojaId = String(payload.hoja_gasto_id || payload.hoja_id_local || "").trim();
  if (!hojaId) throw new Error("Falta campo: hoja_gasto_id / hoja_id_local");

  var dni = String(payload.dni || "").trim();
  var fechaFirma = String(payload.fecha_firma || payload.fecha_hoja || "").trim();
  var fechaHoja = String(payload.fecha_hoja || payload.fecha_firma || fechaFirma || "").trim();
  var numHoja = String(payload.num_hoja_gasto || payload.Num_Hoja_Gasto || "").trim();

  var lineas = payload.lineas;
  if (typeof lineas === "string") {
    try {
      lineas = JSON.parse(lineas);
    } catch (_) {
      lineas = [];
    }
  }
  if (!Array.isArray(lineas)) lineas = [];

  var byId = {};
  for (var i = 0; i < lineas.length; i++) {
    var ln = lineas[i] || {};
    var idg = String(ln.id_gasto || ln.expense_id || "").trim();
    if (!idg) continue;
    byId[idg] = {
      work_package: String(ln.work_package || "").trim(),
      accion_proyecto: String(ln.accion_proyecto || ln.accion || "").trim(),
    };
  }

  var sheetMetaRaw = payload.sheet_meta || payload.meta || null;
  var sheetMetaJson = "";
  try {
    if (sheetMetaRaw && typeof sheetMetaRaw === "object") {
      sheetMetaJson = JSON.stringify(sheetMetaRaw);
    } else if (typeof sheetMetaRaw === "string" && sheetMetaRaw.trim()) {
      sheetMetaJson = sheetMetaRaw.trim();
    } else {
      sheetMetaJson = JSON.stringify({
        dni: dni,
        fecha_firma: fechaFirma,
        fecha_hoja: fechaHoja,
        lineas: byId,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (_) {
    sheetMetaJson = "";
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  ensureHojaGastoMetaColumns_(sh);

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) {
    return { hoja_gasto_id: hojaId, updated: 0 };
  }

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c + 1;

  function col(name) {
    return idx[name] || 0;
  }

  var colHoja = col("hoja_gasto_id");
  var colId = col("id_gasto");
  if (!colHoja || !colId) throw new Error("Faltan columnas hoja_gasto_id / id_gasto en GASTOS");

  var colDni = col("hoja_gasto_dni");
  var colFechaFirma = col("hoja_gasto_fecha_firma");
  var colFechaHoja = col("hoja_gasto_fecha_hoja");
  var colWp = col("work_package");
  var colAcc = col("accion_proyecto");
  var colMeta = col("hoja_gasto_sheet_meta");
  var colNumHoja = col("Num_Hoja_Gasto");

  var hojaVals = sh.getRange(2, colHoja, lastRow, 1).getValues();
  var idVals = sh.getRange(2, colId, lastRow, 1).getValues();
  var updated = 0;

  for (var r = 0; r < hojaVals.length; r++) {
    var ridHoja = String((hojaVals[r] && hojaVals[r][0]) || "").trim();
    if (!ridHoja || ridHoja !== hojaId) continue;
    var row = r + 2;
    var ridGasto = String((idVals[r] && idVals[r][0]) || "").trim();

    if (colDni && dni) sh.getRange(row, colDni).setValue(dni);
    if (colFechaFirma && fechaFirma) sh.getRange(row, colFechaFirma).setValue(fechaFirma);
    if (colFechaHoja && fechaHoja) sh.getRange(row, colFechaHoja).setValue(fechaHoja);
    if (colNumHoja && numHoja) sh.getRange(row, colNumHoja).setValue(numHoja);
    if (colMeta && sheetMetaJson) sh.getRange(row, colMeta).setValue(sheetMetaJson);

    var metaLn = byId[ridGasto] || null;
    if (metaLn) {
      if (colWp && metaLn.work_package) sh.getRange(row, colWp).setValue(metaLn.work_package);
      if (colAcc && metaLn.accion_proyecto) sh.getRange(row, colAcc).setValue(metaLn.accion_proyecto);
    }
    updated++;
  }

  return {
    hoja_gasto_id: hojaId,
    updated: updated,
    dni: dni,
    fecha_firma: fechaFirma,
    fecha_hoja: fechaHoja,
    num_hoja_gasto: numHoja,
  };
}
