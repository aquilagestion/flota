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
  if (rol !== "GESTOR" && rol !== "ADMINISTRACION" && rol !== "RESPONSABLE" && rol !== "OPERARIO") {
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
  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
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
    return isNaN(n) ? 0 : n;
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
    else if (t === "OTROS") entidad = nz(val(r, "proveedor_otros_gastos"));
    else entidad = nz(val(r, "proveedor"), val(r, "concepto"));

    var numFactura = "";
    if (t === "COMBUSTIBLES") numFactura = nz(val(r, "numero_ticket"));
    else if (t === "MANTENIMIENTO_REPARACIONES") numFactura = nz(val(r, "numero_factura_mantenimiento"));
    else if (t === "REPUESTOS_RECAMBIO") numFactura = nz(val(r, "numero_factura_repuestos"));
    else if (t === "ITV") numFactura = nz(val(r, "numero_factura_itv"));
    else if (t === "OTROS") numFactura = nz(val(r, "numero_factura_otros"));
    else if (t === "PEAJES" || t === "PARKING") numFactura = "TIQUET";
    else numFactura = nz(val(r, "numero_ticket"));

    var fecha = nz(
      val(r, "fecha_repostaje"),
      val(r, "fecha_compra_mantenimiento"),
      val(r, "fecha_compra_repuestos"),
      val(r, "fecha_aparcamiento"),
      val(r, "fecha_peaje"),
      val(r, "fecha_inspeccion"),
      val(r, "fecha_otros_gastos"),
      val(r, "fecha_multa"),
      val(r, "fecha")
    );

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
    else if (t === "OTROS") importe = parseNum(val(r, "importe_otros_gastos"));

    var proyecto = nz(val(r, "departamento_o_proyecto"));
    var concepto = "";
    if (t === "REPUESTOS_RECAMBIO") concepto = nz(val(r, "descripcion_repuestos"), "repuestos");
    else if (t === "MANTENIMIENTO_REPARACIONES") concepto = nz(val(r, "descripcion_mantenimiento"), "mantenimiento");
    else if (t === "OTROS") concepto = nz(val(r, "concepto_otros_gastos"), "otros gastos");
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
      tipo_gasto: t,
      concepto: concepto,
      entidad: entidad,
      numero_factura: numFactura,
      fecha: fecha,
      importe: importe,
      proyecto: proyecto,
    };
  }

  var outRows = [];
  var numHoja = "";
  var usuarioEmail = "";
  var usuarioNombre = "";
  var total = 0;
  var fechaEnvio = "";
  var matMap = {};

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var rid = String(val(row, "hoja_gasto_id") || "").trim();
    if (!rid || rid !== hojaId) continue;
    if (!numHoja) numHoja = String(val(row, "Num_Hoja_Gasto") || "").trim();
    if (!usuarioEmail) usuarioEmail = String(val(row, "responsable_email") || "").trim().toLowerCase();
    if (!fechaEnvio) fechaEnvio = String(val(row, "hoja_gasto_fecha_envio") || "").trim();
    total = Number(val(row, "hoja_gasto_total") || total || 0) || total;
    var mat = String(val(row, "matricula") || "").trim().toUpperCase();
    if (mat) matMap[mat] = true;
    outRows.push(detailFromRow(row));
  }

  if (!puedeVerHojaGastoResumen_(user, rol, usuarioEmail, matMap)) {
    throw new Error("No autorizado para ver esta hoja de gasto");
  }

  try {
    if (usuarioEmail) {
      var u = apiUsuarioGet({ email: usuarioEmail });
      usuarioNombre = String((u && u.nombre) || "").trim();
    }
  } catch (_) {
    usuarioNombre = "";
  }

  return {
    hoja_gasto_id: hojaId,
    num_hoja_gasto: numHoja,
    usuario_email: usuarioEmail,
    usuario_nombre: usuarioNombre,
    hoja_gasto_fecha_envio: fechaEnvio,
    total_importe: total,
    lineas: outRows,
  };
}

