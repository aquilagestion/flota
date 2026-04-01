// ======================================================================
// 24_hojas_gasto_list.gs
// Lista hojas de gasto agrupadas desde pestaña GASTOS.
// ======================================================================

function apiHojasGastoList(payload) {
  payload = payload || {};
  var user = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  requireRolGestorOrAdministracion_(user);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) return [];

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c;

  function col(name) {
    if (idx[name] === undefined) return -1;
    return idx[name];
  }

  function val(r, i) {
    return i >= 0 ? r[i] : "";
  }

  var cHojaId = col("hoja_gasto_id");
  var cNum = col("Num_Hoja_Gasto");
  var cEstado = col("hoja_gasto_estado");
  var cFecha = col("hoja_gasto_fecha_envio");
  var cTotal = col("hoja_gasto_total");
  var cObs = col("hoja_gasto_observaciones");
  var cRevPor = col("hoja_gasto_revisado_por");
  var cRevFecha = col("hoja_gasto_fecha_revision");
  var cRevMotivo = col("hoja_gasto_motivo_rechazo");
  var cEstadoPago = col("hoja_gasto_estado_pago");
  var cPagadoPor = col("hoja_gasto_pagado_por");
  var cFechaPago = col("hoja_gasto_fecha_pago");
  var cMetodoPago = col("hoja_gasto_metodo_pago");
  var cRefPago = col("hoja_gasto_referencia_pago");
  var cEmail = col("responsable_email");

  var grouped = {};
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var hojaId = String(val(row, cHojaId) || "").trim();
    if (!hojaId) continue;
    if (!grouped[hojaId]) {
      var email = String(val(row, cEmail) || "").trim().toLowerCase();
      var nombre = "";
      try {
        var u = apiUsuarioGet({ email: email });
        nombre = String((u && u.nombre) || "").trim();
      } catch (_) {
        nombre = "";
      }
      grouped[hojaId] = {
        hoja_gasto_id: hojaId,
        num_hoja_gasto: String(val(row, cNum) || "").trim(),
        usuario_email: email,
        usuario_nombre: nombre,
        hoja_gasto_estado: String(val(row, cEstado) || "ENVIADA").trim().toUpperCase(),
        hoja_gasto_fecha_envio: String(val(row, cFecha) || "").trim(),
        hoja_gasto_total: Number(val(row, cTotal) || 0) || 0,
        hoja_gasto_observaciones: String(val(row, cObs) || "").trim(),
        hoja_gasto_revisado_por: String(val(row, cRevPor) || "").trim().toLowerCase(),
        hoja_gasto_fecha_revision: String(val(row, cRevFecha) || "").trim(),
        hoja_gasto_motivo_rechazo: String(val(row, cRevMotivo) || "").trim(),
        hoja_gasto_estado_pago: String(val(row, cEstadoPago) || "PAGO_PENDIENTE").trim().toUpperCase(),
        hoja_gasto_pagado_por: String(val(row, cPagadoPor) || "").trim().toLowerCase(),
        hoja_gasto_fecha_pago: String(val(row, cFechaPago) || "").trim(),
        hoja_gasto_metodo_pago: String(val(row, cMetodoPago) || "").trim(),
        hoja_gasto_referencia_pago: String(val(row, cRefPago) || "").trim(),
        lineas_count: 0,
      };
    }
    grouped[hojaId].lineas_count += 1;
  }

  var out = Object.keys(grouped).map(function(k) { return grouped[k]; });
  out.sort(function(a, b) {
    return String(b.hoja_gasto_fecha_envio || "").localeCompare(String(a.hoja_gasto_fecha_envio || ""));
  });
  return out;
}

