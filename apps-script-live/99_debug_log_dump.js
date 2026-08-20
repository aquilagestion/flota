function debugDumpRecentGastoErrors_() {
  var sh = getSheet(CFG.SHEETS.LOG_API);
  var last = sh.getLastRow();
  if (last < 2) return { rows: [], last: last };
  var start = Math.max(2, last - 200);
  var values = sh.getRange(start, 1, last - start + 1, 6).getValues();
  var gastoRelated = [];
  var errors = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var endpoint = String(r[1] || "");
    var status = String(r[4] || "");
    var row = {
      ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ""),
      endpoint: endpoint,
      metodo: String(r[2] || ""),
      usuario: String(r[3] || ""),
      status: status,
      mensaje: String(r[5] || ""),
    };
    if (status === "error" || /error|fail|invalid|unauthor/i.test(status)) errors.push(row);
    if (/gasto|adjunto|ticket|hoja_gasto|viaje_vehiculo/i.test(endpoint) || status === "error") {
      gastoRelated.push(row);
    }
  }

  var gastosSh = getSheet(CFG.SHEETS.GASTOS);
  var gLast = gastosSh.getLastRow();
  var recentGastos = [];
  if (gLast >= 2) {
    var headers = gastosSh.getRange(1, 1, 1, gastosSh.getLastColumn()).getValues()[0];
    var idx = {};
    for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c;
    var gStart = Math.max(2, gLast - 25);
    var gVals = gastosSh.getRange(gStart, 1, gLast - gStart + 1, headers.length).getValues();
    for (var gi = 0; gi < gVals.length; gi++) {
      var gr = gVals[gi];
      recentGastos.push({
        id_gasto: String(gr[idx.id_gasto] || ""),
        tipo_gasto: String(gr[idx.tipo_gasto] || ""),
        matricula: String(gr[idx.matricula] || ""),
        responsable_email: String(gr[idx.responsable_email] || ""),
        fecha: String(gr[idx.fecha] || ""),
        coste_total: String(gr[idx.coste_total] || ""),
        hoja_gasto_id: String(gr[idx.hoja_gasto_id] || ""),
      });
    }
  }

  return {
    rows: gastoRelated.slice(-50),
    errors: errors.slice(-30),
    recentGastos: recentGastos.slice(-15),
    scannedFrom: start,
    last: last,
    gastosLast: gLast,
  };
}
