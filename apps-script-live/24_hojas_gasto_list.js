// ======================================================================
// 24_hojas_gasto_list.gs
// Lista hojas de gasto agrupadas desde pestaña GASTOS.
//
// GET solo lectura: no interfiere con la sincronización POST de la app
// (hoja_gasto_actualizar_gastos / estado, cola outbox). OPERARIO y RESPONSABLE
// reciben lista filtrada; GESTOR y ADMINISTRACIÓN ven todas.
//
// Requiere en el proyecto: getRolUsuarioHojas_ (29_roles_aprobacion_hojas.gs),
// normalizeEmail_, getMatriculasACargo_, puedeVerHojaGastoResumen_ (14_filtro...).
// ======================================================================

function apiHojasGastoList(payload) {
  payload = payload || {};
  var user = String(payload.user_email || payload.requester_email || "").trim().toLowerCase();
  if (!user) throw new Error("Falta user_email");
  var rol = getRolUsuarioHojas_(user);
  if (!rol) throw new Error("Usuario no encontrado o sin rol en USUARIOS");
  if (!puedeVerHojaGasto_(rol)) {
    throw new Error("Permisos insuficientes para listar hojas de gasto");
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) return [];

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();

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
  var cMat = col("matricula");
  var cExcelNombre = col("excel_trabajador_nombre");
  var cNumHojaRow = col("Num_Hoja_Gasto");

  var grouped = {};
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var hojaId = String(val(row, cHojaId) || "").trim();
    if (!hojaId) continue;
    if (!grouped[hojaId]) {
      var email = String(val(row, cEmail) || "").trim().toLowerCase();
      var excelNombre = String(val(row, cExcelNombre) || "").trim();
      var numHojaRow = String(val(row, cNumHojaRow) || "").trim();
      var nombre = hgResolveHojaGastoDisplayNombre_({
        excel_trabajador_nombre: excelNombre,
        num_hoja_gasto: numHojaRow,
        usuario_email: email,
      });
      if (!nombre) {
        try {
          var u = apiUsuarioGet({ email: email });
          nombre = String((u && u.nombre) || "").trim();
        } catch (_) {
          nombre = "";
        }
      }
      grouped[hojaId] = {
        hoja_gasto_id: hojaId,
        num_hoja_gasto: String(val(row, cNum) || "").trim(),
        usuario_email: email,
        usuario_nombre: nombre,
        hoja_gasto_estado: String(val(row, cEstado) || "ENVIADA").trim().toUpperCase(),
        hoja_gasto_fecha_envio: normalizeDateDMYCell_(val(row, cFecha) || ""),
        hoja_gasto_total: Number(val(row, cTotal) || 0) || 0,
        hoja_gasto_observaciones: String(val(row, cObs) || "").trim(),
        hoja_gasto_revisado_por: String(val(row, cRevPor) || "").trim().toLowerCase(),
        hoja_gasto_fecha_revision: normalizeDateDMYCell_(val(row, cRevFecha) || ""),
        hoja_gasto_motivo_rechazo: String(val(row, cRevMotivo) || "").trim(),
        hoja_gasto_estado_pago: String(val(row, cEstadoPago) || "PAGO_PENDIENTE").trim().toUpperCase(),
        hoja_gasto_pagado_por: String(val(row, cPagadoPor) || "").trim().toLowerCase(),
        hoja_gasto_fecha_pago: normalizeDateDMYCell_(val(row, cFechaPago) || ""),
        hoja_gasto_metodo_pago: String(val(row, cMetodoPago) || "").trim(),
        hoja_gasto_referencia_pago: String(val(row, cRefPago) || "").trim(),
        lineas_count: 0,
        _matriculas: {},
      };
    }
    var mat = String(val(row, cMat) || "").trim().toUpperCase();
    if (mat) grouped[hojaId]._matriculas[mat] = true;
    grouped[hojaId].lineas_count += 1;
  }

  var out = Object.keys(grouped).map(function(k) {
    return grouped[k];
  });
  out.sort(function(a, b) {
    var na = String(a.num_hoja_gasto || a.hoja_gasto_id || "").trim();
    var nb = String(b.num_hoja_gasto || b.hoja_gasto_id || "").trim();
    var byName = nb.localeCompare(na);
    if (byName !== 0) return byName;
    return String(b.hoja_gasto_fecha_envio || "").localeCompare(String(a.hoja_gasto_fecha_envio || ""));
  });

  function stripInternal_(item) {
    var copy = {};
    for (var key in item) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      if (key === "_matriculas") continue;
      copy[key] = item[key];
    }
    return copy;
  }

  if (rol === "GESTOR" || rol === "ADMINISTRACION") {
    return out.map(function(item) {
      var stripped = stripInternal_(item);
      stripped.puede_revisar = true;
      return stripped;
    });
  }

  return out
    .filter(function(item) {
      return puedeVerHojaGastoResumen_(user, rol, item.usuario_email || "", item._matriculas || {});
    })
    .map(function(item) {
      var stripped = stripInternal_(item);
      stripped.puede_revisar = puedeRevisarHojaGasto_(user, item.usuario_email || "", item._matriculas || {});
      return stripped;
    });
}

