// Importación Excel plantillas LIFE (HHGG): VEHICULO PROPIO, VEHICULO GREFA, OTROS GASTOS.
// Ref. _ref_sheets/life-hhgg/xlsm/LIFE_OTROS_GASTOS_FORMULARIOS.xlsm (hoja CONSUMIBLES)

function hgImpLifeNorm_(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hgImpLifeSheetByName_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var ws = ss.getSheetByName(names[i]);
    if (ws) return ws;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var n = hgImpLifeNorm_(sheets[j].getName());
    for (var k = 0; k < names.length; k++) {
      if (n === hgImpLifeNorm_(names[k])) return sheets[j];
    }
  }
  return null;
}

function hgImpLifeResolveProyectoFromText_(text) {
  var t = String(text || "").trim();
  var resolved = hgImpResolveProyecto_(t);
  return {
    proyecto_texto: t,
    proyecto_nombre: resolved.nombre_proyecto || t,
    id_proyecto: resolved.id_proyecto || "",
    life_template_hint: hgImpLifeTemplateFromProyecto_(t),
  };
}

function hgImpLifeResolveProyectoFromSheet_(ws) {
  var idCell = String(ws.getRange("Y2").getValue() || "").trim();
  if (idCell) {
    var rows = rowsToObjects_(getSheet("PROYECTOS"));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id_proyecto || "").trim() === idCell) {
        var proyText = String(ws.getRange("B9").getValue() || rows[i].nombre_proyecto || "").trim();
        return {
          proyecto_texto: proyText,
          proyecto_nombre: String(rows[i].nombre_proyecto || "").trim(),
          id_proyecto: idCell,
          life_template_hint: hgImpLifeTemplateFromProyecto_(
            proyText + " " + String(ws.getRange("Y3").getValue() || "")
          ),
        };
      }
    }
    return {
      proyecto_texto: String(ws.getRange("B9").getValue() || "").trim(),
      proyecto_nombre: idCell,
      id_proyecto: idCell,
      life_template_hint: hgImpLifeTemplateFromProyecto_(String(ws.getRange("Y3").getValue() || "")),
    };
  }
  var proyLine = String(ws.getRange("B9").getValue() || ws.getRange("D11").getValue() || "").trim();
  return hgImpLifeResolveProyectoFromText_(proyLine);
}

function hgImpLifeTemplateFromProyecto_(text) {
  var p = hgImpLifeNorm_(text);
  if (p.indexOf("PYGARGUS") >= 0) return "LIFE_EMG_PYGARGUS";
  if (p.indexOf("ABILAS") >= 0) return "LIFE_EMG_ABILAS";
  if (p.indexOf("RHODOPE") >= 0 || (p.indexOf("LIFE") >= 0 && p.indexOf("VULTURE") >= 0)) {
    return "LIFE_EMG_RHODOPES";
  }
  return "";
}

function hgImpLifeNormalizeIvaPctFromExcel_(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  var n = Number(raw);
  if (!isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  if (n > 0 && n <= 1) return Math.round(n * 10000) / 100;
  return Math.round(n * 100) / 100;
}

function hgImpLifeParseViajeHeader_(ws) {
  var viaje = {
    fecha_inicio: "",
    fecha_fin: "",
    origen: "",
    destino1: "",
    destino2: "",
    destino3: "",
    destino4: "",
    motivo: "",
    matricula: String(ws.getRange("C13").getValue() || "").trim().toUpperCase(),
  };

  function cellDate(r, c) {
    return normalizeDateDMYCell_(ws.getRange(r, c).getValue());
  }
  function cellStr(r, c) {
    return String(ws.getRange(r, c).getValue() || "").trim();
  }
  function isDestinoLabel_(t) {
    return hgImpLifeNorm_(t).indexOf("DESTINO") >= 0;
  }

  // Layout fijo LIFE «VEHICULO PROYECTO» (filas 18-21).
  // C=origen, E=destino1, G=destino2, I=destino3, L=destino4
  var fiFix = cellDate(18, 3);
  var ffFix = cellDate(19, 3);
  if (fiFix) viaje.fecha_inicio = fiFix;
  if (ffFix) viaje.fecha_fin = ffFix;
  var origFix = cellStr(20, 3);
  if (origFix && hgImpLifeNorm_(origFix).indexOf("ORIGEN") < 0) viaje.origen = origFix;
  var d1Fix = cellStr(20, 5);
  if (d1Fix && !isDestinoLabel_(d1Fix)) viaje.destino1 = d1Fix;
  var d2Fix = cellStr(20, 7);
  if (d2Fix && !isDestinoLabel_(d2Fix)) viaje.destino2 = d2Fix;
  var d3Fix = cellStr(20, 9);
  if (d3Fix && !isDestinoLabel_(d3Fix)) viaje.destino3 = d3Fix;
  var d4Fix = cellStr(20, 12);
  if (d4Fix && !isDestinoLabel_(d4Fix)) viaje.destino4 = d4Fix;
  var motFix = cellStr(21, 3);
  if (motFix && hgImpLifeNorm_(motFix).indexOf("MOTIVO") < 0) viaje.motivo = motFix;

  var rIni = hgImpFindLabelRow_(ws, 2, 1, "fecha inicio");
  if (rIni > 0) {
    var fi = cellDate(rIni, 3);
    if (fi) viaje.fecha_inicio = fi;
  }
  var rFin = hgImpFindLabelRow_(ws, 2, 1, "fecha fin");
  if (rFin > 0) {
    var ff = cellDate(rFin, 3);
    if (ff) viaje.fecha_fin = ff;
  }
  var rOrig = hgImpFindLabelRow_(ws, 2, 1, "origen");
  if (rOrig > 0) {
    var orig = cellStr(rOrig, 3);
    if (orig) viaje.origen = orig;
    var d1 = cellStr(rOrig, 5);
    if (d1 && !isDestinoLabel_(d1)) viaje.destino1 = d1;
    var d2 = cellStr(rOrig, 7);
    if (d2 && !isDestinoLabel_(d2)) viaje.destino2 = d2;
    var d3 = cellStr(rOrig, 9);
    if (d3 && !isDestinoLabel_(d3)) viaje.destino3 = d3;
    var d4 = cellStr(rOrig, 12);
    if (d4 && !isDestinoLabel_(d4)) viaje.destino4 = d4;
  }
  var rMot = hgImpFindLabelRow_(ws, 2, 1, "motivo");
  if (rMot > 0) {
    var mot = cellStr(rMot, 3);
    if (mot) viaje.motivo = mot;
  }
  return viaje;
}

function hgImpLifeCodPersonalFromHoja2_(ss, nombre) {
  if (!nombre) return "";
  var q = hgImpLifeNorm_(nombre);
  if (!q) return "";
  var wsRef = hgImpLifeSheetByName_(ss, ["_REF_PERSONAL"]);
  if (wsRef) {
    var lastRef = wsRef.getLastRow();
    for (var r = 2; r <= Math.min(lastRef, 400); r++) {
      var nRef = hgImpLifeNorm_(wsRef.getRange(r, 1).getValue());
      if (nRef && nRef === q) {
        return String(wsRef.getRange(r, 3).getValue() || "").trim().toUpperCase();
      }
    }
  }
  var ws = hgImpLifeSheetByName_(ss, ["Hoja2", "Hoja 2"]);
  if (!ws) return "";
  var last = ws.getLastRow();
  for (var r2 = 1; r2 <= Math.min(last, 200); r2++) {
    var n = hgImpLifeNorm_(ws.getRange(r2, 1).getValue());
    if (n && n === q) {
      return String(ws.getRange(r2, 2).getValue() || "").trim().toUpperCase();
    }
  }
  return "";
}

function hgImpLifeConceptToTipo_(concept) {
  var c = hgImpLifeNorm_(concept);
  if (!c) return "OTROS";
  if (c.indexOf("FUEL") >= 0 || c.indexOf("COMBUST") >= 0 || c.indexOf("GASOL") >= 0) return "COMBUSTIBLES";
  if (c.indexOf("TOLL") >= 0 || c.indexOf("PEAJ") >= 0) return "PEAJES";
  if (c.indexOf("PARK") >= 0 || c.indexOf("APARC") >= 0) return "PARKING";
  if (c.indexOf("LODG") >= 0 || c.indexOf("HOTEL") >= 0 || c.indexOf("HOSPED") >= 0) return "HOSPEDAJE";
  if (c.indexOf("SUBSIST") >= 0 || c.indexOf("DIET") >= 0 || c.indexOf("COMID") >= 0 || c.indexOf("MANUT") >= 0) {
    return "MANUTENCION";
  }
  if (
    c.indexOf("TICKET") >= 0 ||
    c.indexOf("BILLET") >= 0 ||
    c.indexOf("TASAS BILLETE") >= 0
  ) {
    return "GASTOS_BILLETES";
  }
  return "OTROS";
}

function hgImpLifeSplitBilleteConcept_(concept) {
  var c = String(concept || "").replace(/^Tasas billete\s*[·•\-:]+\s*/i, "").trim();
  var parts = c.split(/\s*(?:->|→)\s*/);
  if (parts.length >= 2) {
    return { origen: parts[0].trim(), destino: parts.slice(1).join(" -> ").trim() };
  }
  return { origen: "", destino: "" };
}

function hgImpLifeIsTasasBilleteRow_(role, concept) {
  var r = String(role || "").trim().toUpperCase();
  if (r === "TASAS") return true;
  var c = hgImpLifeNorm_(concept);
  return c.indexOf("TASAS BILLETE") >= 0;
}

function hgImpLifeMapTipoGasto_(raw, conceptFallback, role) {
  var t = String(raw || "").trim().toUpperCase();
  if (typeof normalizeTipoGasto_ === "function" && t) t = normalizeTipoGasto_(t);
  if (t === "TICKET" || t === "BILLETE" || t === "BILLETES" || t === "GASTOS_BILLETES") {
    return "GASTOS_BILLETES";
  }
  var roleU = String(role || "").trim().toUpperCase();
  if (roleU === "BILLETE" || roleU === "TASAS") return "GASTOS_BILLETES";
  if (t && t !== "OTROS") return t;
  return hgImpLifeConceptToTipo_(conceptFallback);
}

function hgImpLifeNormalizeTipoComb_(raw) {
  var t = hgImpLifeNorm_(raw);
  if (!t) return "GASOLEO";
  if (t.indexOf("AD") >= 0 && t.indexOf("BLUE") >= 0) return "Adblue";
  if (t.indexOf("GASOL") >= 0 && t.indexOf("GASOLEO") < 0) return "GASOLINA 95";
  return "GASOLEO";
}

function hgImpLifeResolveTipoGastoRow_(ws, row, conceptFallback) {
  var meta = String(ws.getRange(row, 20).getValue() || "").trim().toUpperCase();
  var role = String(ws.getRange(row, 26).getValue() || "").trim();
  return hgImpLifeMapTipoGasto_(meta, conceptFallback, role);
}

function hgImpLifeIvaPctFromCuota_(base, cuota) {
  var b = Number(base);
  var c = Number(cuota);
  if (!isFinite(b) || b <= 0 || !isFinite(c) || c < 0) return null;
  return Math.round((c / b) * 10000) / 100;
}

function hgImpLifeCellText_(ws, row, col) {
  var rng = ws.getRange(row, col);
  var v = rng.getValue();
  if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  var merged = rng.getMergedRanges();
  if (merged && merged.length) {
    v = merged[0].getCell(1, 1).getValue();
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function hgImpLifePushAmountLine_(out, ctx) {
  var imp = ctx.importe;
  if (imp == null || imp <= 0) return;
  out.push({
    seccion: ctx.seccion,
    fila_excel: ctx.fila,
    fecha: ctx.fecha || "",
    concepto: ctx.concepto || "",
    work_package: ctx.work_package || "",
    accion_proyecto: ctx.accion_proyecto || "",
    proveedor: ctx.proveedor || "",
    num_factura: ctx.num_factura || "",
    tipo_gasto: ctx.tipo_gasto || "OTROS",
    importe: imp,
    importe_estimado: imp,
    base_imponible: ctx.base != null ? ctx.base : imp,
    cuota_iva: ctx.cuota_iva != null ? ctx.cuota_iva : null,
    iva_porcentaje: ctx.iva_pct != null ? ctx.iva_pct : null,
    num_personas: ctx.num_personas || "",
    matricula: ctx.matricula || "",
    litros: ctx.litros != null ? ctx.litros : null,
    km_repostaje: ctx.km_repostaje != null ? ctx.km_repostaje : null,
    tipo_combustible: ctx.tipo_combustible || "",
    origen_billete: ctx.origen_billete || "",
    destino_billete: ctx.destino_billete || "",
    fecha_vuelta_billete: ctx.fecha_vuelta_billete || "",
    tasas_billete: ctx.tasas_billete != null ? ctx.tasas_billete : null,
    concepto_billete: ctx.concepto_billete || "",
    precio_total_billete: ctx.precio_total_billete != null ? ctx.precio_total_billete : null,
  });
}

function hgImpLifeFindTotalRow_(ws, rHdr) {
  for (var r = rHdr + 1; r <= rHdr + 120; r++) {
    var f = String(ws.getRange(r, 10).getFormula() || "").toUpperCase();
    if (f.indexOf("SUM(J") >= 0) return r;
  }
  return rHdr + 21;
}

function hgImpLifeIsFooterConcept_(concept) {
  var c = hgImpLifeNorm_(concept);
  if (!c) return false;
  if (c.indexOf("RECIBI") >= 0) return true;
  if (c.indexOf("TRANSFERENCIA") >= 0) return true;
  if (c.indexOf("TARJETA EMPRESA") >= 0) return true;
  if (c.indexOf("FIRMO") >= 0 || c.indexOf("CONSTE") >= 0) return true;
  if (c.indexOf("FDO") === 0) return true;
  if (c.indexOf("ADJUNTAR RECIBO") >= 0) return true;
  if (c.indexOf("HE RECIBIDO") >= 0) return true;
  return false;
}

function hgImpParseLifeVehiculoGrefaSheet_(ws, ss) {
  var warnings = [];
  var nombre = String(ws.getRange("C11").getValue() || ws.getRange("D8").getValue() || "").trim();
  var proy = hgImpLifeResolveProyectoFromSheet_(ws);
  var cod = String(ws.getRange("K14").getValue() || "").trim().toUpperCase();
  if (!cod) cod = hgImpLifeCodPersonalFromHoja2_(ss, nombre);
  var mes = String(ws.getRange("L14").getValue() || "").trim();
  var anio = String(ws.getRange("M14").getValue() || "").trim();
  var viaje = hgImpLifeParseViajeHeader_(ws);
  var dni = String(ws.getRange("C12").getValue() || "").trim().toUpperCase();
  viaje.dni = dni;

  var trabajador = {
    nombre: nombre,
    dni: dni,
    puesto: "",
    proyecto_texto: proy.proyecto_texto,
    proyecto_nombre: proy.proyecto_nombre,
    id_proyecto: proy.id_proyecto,
    num_hoja: "",
    mes: mes,
    anio: anio,
    cod_personal: cod,
    life_template_hint: proy.life_template_hint,
  };

  var rHdr = hgImpFindLabelRow_(ws, 1, 20, "work package");
  if (rHdr <= 0) rHdr = hgImpFindLabelRow_(ws, 1, 20, "concepto");
  if (rHdr <= 0) rHdr = 23;
  var rTot = hgImpLifeFindTotalRow_(ws, rHdr);

  var lineas = [];
  var pendingBilleteIdx = -1;
  for (var r = rHdr + 1; r < rTot; r++) {
    var concept = String(ws.getRange(r, 2).getValue() || "").trim();
    var wp = String(ws.getRange(r, 4).getValue() || "").trim();
    var acc = String(ws.getRange(r, 5).getValue() || "").trim();
    var numPers = String(ws.getRange(r, 6).getValue() || "").trim();
    var ent = String(ws.getRange(r, 7).getValue() || "").trim();
    var numFac = String(ws.getRange(r, 8).getValue() || "").trim();
    var fecha = normalizeDateDMYCell_(ws.getRange(r, 9).getValue());
    var base = hgImpNum_(ws.getRange(r, 10).getValue());
    var ivaPctRaw = ws.getRange(r, 11).getValue();
    var cuota = hgImpNum_(ws.getRange(r, 12).getValue());
    var total = hgImpNum_(ws.getRange(r, 13).getValue());
    var imp = total != null ? total : base;
    var role = String(ws.getRange(r, 26).getValue() || "").trim();
    var fechaVuelta = normalizeDateDMYCell_(ws.getRange(r, 27).getValue());
    var origenMeta = String(ws.getRange(r, 28).getValue() || "").trim();
    var destMeta = String(ws.getRange(r, 29).getValue() || "").trim();
    if (hgImpLifeIsFooterConcept_(concept)) break;
    if (hgImpCellEmpty_(concept) && imp == null) continue;
    if (hgImpCellEmpty_(concept) && imp != null) continue;
    if (hgImpLifeNorm_(concept).indexOf("TOTAL") >= 0) break;

    var ivaPct = hgImpLifeNormalizeIvaPctFromExcel_(ivaPctRaw);
    if (ivaPct == null && base != null && cuota != null) {
      ivaPct = hgImpLifeIvaPctFromCuota_(base, cuota);
    }

    var tipo = hgImpLifeResolveTipoGastoRow_(ws, r, concept);
    if (hgImpLifeIsTasasBilleteRow_(role, concept)) {
      if (pendingBilleteIdx >= 0 && imp != null && imp > 0) {
        lineas[pendingBilleteIdx].tasas_billete = imp;
      }
      continue;
    }

    var splitBil = hgImpLifeSplitBilleteConcept_(concept);
    var origenB = origenMeta || splitBil.origen;
    var destB = destMeta || splitBil.destino;
    var conceptoBil =
      tipo === "GASTOS_BILLETES"
        ? [origenB, destB].filter(Boolean).join(" -> ") || concept
        : "";

    var beforeLen = lineas.length;
    hgImpLifePushAmountLine_(lineas, {
      seccion: "LIFE_VG",
      fila: r,
      fecha: fecha,
      concepto: conceptoBil || concept,
      work_package: wp,
      accion_proyecto: acc,
      proveedor: ent,
      num_factura: numFac,
      tipo_gasto: tipo,
      importe: imp,
      base: base,
      cuota_iva: cuota,
      iva_pct: ivaPct,
      num_personas: numPers,
      matricula: String(ws.getRange(r, 21).getValue() || "").trim().toUpperCase(),
      litros: hgImpNum_(ws.getRange(r, 22).getValue()),
      km_repostaje: hgImpNum_(ws.getRange(r, 23).getValue()),
      tipo_combustible: String(ws.getRange(r, 24).getValue() || "").trim(),
      origen_billete: tipo === "GASTOS_BILLETES" ? origenB : "",
      destino_billete: tipo === "GASTOS_BILLETES" ? destB : "",
      fecha_vuelta_billete: tipo === "GASTOS_BILLETES" ? fechaVuelta || "" : "",
      tasas_billete: tipo === "GASTOS_BILLETES" ? 0 : null,
      concepto_billete: conceptoBil,
      precio_total_billete: tipo === "GASTOS_BILLETES" ? imp : null,
    });
    pendingBilleteIdx = tipo === "GASTOS_BILLETES" && lineas.length > beforeLen ? lineas.length - 1 : -1;
  }

  if (!lineas.length) warnings.push("No se encontraron líneas de gasto en hoja LIFE Vehículo GREFA");

  return {
    plantilla: "LIFE_VEHICULO_GREFA",
    hoja_gasto_modelo: "LIFE",
    life_familia: "TRAVEL",
    trabajador: trabajador,
    viaje: viaje,
    matricula_hint: viaje.matricula || "",
    lineas: lineas,
    resumen: {
      lineas_viaje: lineas.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpParseLifeVehiculoPropioSheet_(ws, ss) {
  var warnings = [];
  var proyLine = String(ws.getRange("E12").getValue() || "").trim();
  var proy = hgImpLifeResolveProyectoFromText_(proyLine);
  var trabajador = {
    nombre: "",
    dni: "",
    puesto: String(ws.getRange("E11").getValue() || "").trim(),
    proyecto_texto: proy.proyecto_texto,
    proyecto_nombre: proy.proyecto_nombre,
    id_proyecto: proy.id_proyecto,
    num_hoja: "",
    mes: String(ws.getRange("N12").getValue() || ws.getRange("M12").getValue() || "").trim(),
    anio: "",
    cod_personal: String(ws.getRange("N13").getValue() || "").trim().toUpperCase(),
    life_template_hint: proy.life_template_hint,
  };

  var rHdr = hgImpFindLabelRow_(ws, 1, 20, "work package");
  if (rHdr <= 0) rHdr = 15;
  var rStart = rHdr + 2;
  var rEnd = hgImpFindLabelRow_(ws, 1, rStart, "vehiculo del proyecto");
  if (rEnd <= rStart) rEnd = rStart + 35;

  var lineas = [];
  for (var r = rStart; r < rEnd; r++) {
    var dia = ws.getRange(r, 2).getValue();
    var concepto = String(ws.getRange(r, 3).getValue() || "").trim();
    var wp = String(ws.getRange(r, 5).getValue() || "").trim();
    var acc = String(ws.getRange(r, 6).getValue() || "").trim();
    if (hgImpCellEmpty_(dia) && hgImpCellEmpty_(concepto)) continue;

    var blocks = [
      { col: 7, tipo: "MANUTENCION", label: "COMIDAS" },
      { col: 9, tipo: "PEAJES", label: "PEAJE" },
      { col: 11, tipo: "OTROS", label: "VARIOS" },
      { col: 13, tipo: "COMBUSTIBLES", label: "COMBUSTIBLE" },
    ];
    var any = false;
    for (var b = 0; b < blocks.length; b++) {
      var base = hgImpNum_(ws.getRange(r, blocks[b].col).getValue());
      var cuota = hgImpNum_(ws.getRange(r, blocks[b].col + 1).getValue());
      var imp = base != null && cuota != null ? base + cuota : base;
      if (imp == null || imp <= 0) continue;
      any = true;
      hgImpLifePushAmountLine_(lineas, {
        seccion: "LIFE_VP",
        fila: r,
        fecha: "",
        concepto: concepto || blocks[b].label,
        work_package: wp,
        accion_proyecto: acc,
        proveedor: "",
        num_factura: "",
        tipo_gasto: blocks[b].tipo,
        importe: imp,
        base: base,
        cuota_iva: cuota,
        iva_pct: hgImpLifeIvaPctFromCuota_(base, cuota),
      });
    }
    if (!any && concepto) {
      warnings.push("Fila " + r + " con concepto pero sin importes detectados");
    }
  }

  if (!trabajador.nombre) {
    var n = hgImpFindLabelRow_(ws, 1, 12, "nombre");
    if (n > 0) trabajador.nombre = String(ws.getRange(n, 3).getValue() || "").trim();
  }
  if (!trabajador.cod_personal && trabajador.nombre) {
    trabajador.cod_personal = hgImpLifeCodPersonalFromHoja2_(ss, trabajador.nombre);
  }

  if (!lineas.length) warnings.push("No se encontraron importes en rejilla LIFE Vehículo Propio");

  return {
    plantilla: "LIFE_VEHICULO_PROPIO",
    hoja_gasto_modelo: "LIFE",
    life_familia: "TRAVEL",
    trabajador: trabajador,
    matricula_hint: "",
    lineas: lineas,
    resumen: {
      lineas_viaje: lineas.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpLifeFindLabelRowAny_(ws, startRow, endRow, maxCol, containsText) {
  var needle = hgImpLifeNorm_(containsText);
  if (!needle) return 0;
  for (var r = startRow; r <= endRow; r++) {
    for (var c = 1; c <= maxCol; c++) {
      var v = hgImpLifeNorm_(ws.getRange(r, c).getValue());
      if (v.indexOf(needle) >= 0) return r;
    }
  }
  return 0;
}

function hgImpLifeFindConsumiblesTotalRow_(ws, rHdr) {
  var last = ws.getLastRow();
  for (var r = rHdr + 1; r <= Math.min(last, rHdr + 120); r++) {
    var concept = hgImpLifeNorm_(ws.getRange(r, 4).getValue());
    if (concept.indexOf("RECIB") >= 0 || concept.indexOf("TRANSFERENCIA") >= 0) return r;
    var fQ = String(ws.getRange(r, 17).getFormula() || "").toUpperCase();
    var fS = String(ws.getRange(r, 19).getFormula() || "").toUpperCase();
    if (fQ.indexOf("SUM(") >= 0 || fS.indexOf("SUM(") >= 0) return r;
  }
  return Math.min(last, rHdr + 24);
}

function hgImpLifeResolveProyectoFromConsumiblesSheet_(ws) {
  var idCell = String(ws.getRange("Y2").getValue() || "").trim();
  if (idCell) {
    var rows = rowsToObjects_(getSheet("PROYECTOS"));
    var i;
    for (i = 0; i < rows.length; i++) {
      if (String(rows[i].id_proyecto || "").trim() === idCell) {
        var proyText = String(ws.getRange("D11").getValue() || rows[i].nombre_proyecto || "").trim();
        return {
          proyecto_texto: proyText,
          proyecto_nombre: String(rows[i].nombre_proyecto || "").trim(),
          id_proyecto: idCell,
          life_template_hint: hgImpLifeTemplateFromProyecto_(
            proyText + " " + String(ws.getRange("Y3").getValue() || "")
          ),
        };
      }
    }
  }
  var proyLine = String(ws.getRange("D11").getValue() || ws.getRange("B9").getValue() || "").trim();
  return hgImpLifeResolveProyectoFromText_(proyLine);
}

function hgImpLifeParseConsumiblesLinea_(ws, r) {
  var concepto = hgImpLifeCellText_(ws, r, 4);
  var wp = hgImpLifeCellText_(ws, r, 2);
  var acc = hgImpLifeCellText_(ws, r, 3);
  if (hgImpCellEmpty_(concepto) && hgImpCellEmpty_(wp)) return null;
  if (hgImpLifeNorm_(concepto).indexOf("RECIB") >= 0) return null;
  var ent = hgImpLifeCellText_(ws, r, 6);
  var numFac = hgImpLifeCellText_(ws, r, 12);
  var fecha = hgImpNormalizeImportViajeFecha_(ws.getRange(r, 16).getValue());
  var base = hgImpRound2_(hgImpNum_(ws.getRange(r, 17).getValue()));
  var cuota = hgImpRound2_(hgImpNum_(ws.getRange(r, 18).getValue()));
  var total = hgImpRound2_(hgImpNum_(ws.getRange(r, 19).getValue()));
  var imp = total != null ? total : base;
  if (imp == null || imp <= 0) return null;
  imp = hgImpRound2_(imp);
  var ivaPct = hgImpLifeIvaPctFromCuota_(base, cuota);
  return {
    seccion: "LIFE_OTROS",
    fila_excel: r,
    fecha: fecha,
    concepto: concepto,
    work_package: wp,
    accion_proyecto: acc,
    proveedor: ent,
    num_factura: numFac,
    tipo_gasto: "OTROS",
    importe: imp,
    importe_estimado: imp,
    base_imponible: base,
    cuota_iva: cuota,
    iva_pct: ivaPct,
    iva_porcentaje: ivaPct,
  };
}
function hgImpParseLifeOtrosGastosSheet_(ws, ss) {
  var warnings = [];
  var nombre = String(ws.getRange("D8").getValue() || ws.getRange("C11").getValue() || "").trim();
  var dni = String(ws.getRange("D9").getValue() || ws.getRange("C12").getValue() || "").trim().toUpperCase();
  var proy = hgImpLifeResolveProyectoFromConsumiblesSheet_(ws);
  var cod = String(ws.getRange("Q14").getValue() || ws.getRange("K14").getValue() || "")
    .trim()
    .toUpperCase();
  var mes = String(ws.getRange("R14").getValue() || ws.getRange("L14").getValue() || "").trim();
  var anio = String(ws.getRange("S14").getValue() || ws.getRange("M14").getValue() || "").trim();
  if (!cod && nombre) cod = hgImpLifeCodPersonalFromHoja2_(ss, nombre);
  var trabajador = {
    nombre: nombre,
    dni: dni,
    puesto: "",
    proyecto_texto: proy.proyecto_texto,
    proyecto_nombre: proy.proyecto_nombre,
    id_proyecto: proy.id_proyecto,
    num_hoja: "",
    mes: mes,
    anio: anio,
    cod_personal: cod,
    life_template_hint: proy.life_template_hint,
  };
  if (!trabajador.nombre) {
    var nRow = hgImpLifeFindLabelRowAny_(ws, 1, 14, 8, "nombre");
    if (nRow > 0) trabajador.nombre = String(ws.getRange(nRow, 4).getValue() || "").trim();
  }
  if (!proy.id_proyecto && proy.proyecto_texto) {
    warnings.push("Proyecto no encontrado en catálogo: " + proy.proyecto_texto);
  } else if (proy.id_proyecto && proy.proyecto_texto) {
    var chk = hgImpResolveProyecto_(proy.proyecto_texto);
    if (chk.match === "keyword" || chk.match === "partial") {
      warnings.push(
        "Proyecto emparejado (" + chk.match + "): " + String(chk.nombre_proyecto || proy.proyecto_nombre)
      );
    }
  }

  var rHdr = hgImpLifeFindLabelRowAny_(ws, 1, 24, 12, "work package");
  if (rHdr <= 0) rHdr = hgImpLifeFindLabelRowAny_(ws, 1, 24, 12, "concepto");
  if (rHdr <= 0) rHdr = 16;
  var rTot = hgImpLifeFindConsumiblesTotalRow_(ws, rHdr);
  var lineas = [];
  for (var r = rHdr + 1; r < rTot; r++) {
    var ln = hgImpLifeParseConsumiblesLinea_(ws, r);
    if (ln) lineas.push(ln);
  }

  if (!lineas.length) warnings.push("No se encontraron líneas en hoja LIFE Otros/Consumibles");

  return {
    plantilla: "LIFE_OTROS_GASTOS",
    hoja_gasto_modelo: "LIFE",
    life_familia: "OTROS",
    trabajador: trabajador,
    matricula_hint: "OTROS",
    lineas: lineas,
    resumen: {
      gastos: lineas.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpParseLifeByPlantilla_(ss, plantilla) {
  plantilla = hgImpNormalizePlantillaEsperada_(plantilla);
  if (plantilla === "LIFE_VEHICULO_GREFA") {
    var wsG = hgImpLifeSheetByName_(ss, ["VEHICULO PROYECTO", "Vehiculo Proyecto"]);
    if (!wsG) throw new Error("No se encontró hoja VEHICULO PROYECTO (plantilla LIFE GREFA)");
    return hgImpParseLifeVehiculoGrefaSheet_(wsG, ss);
  }
  if (plantilla === "LIFE_VEHICULO_PROPIO") {
    var wsP = hgImpLifeSheetByName_(ss, ["vehiculo propio", "Vehiculo Propio"]);
    if (!wsP) throw new Error("No se encontró hoja vehiculo propio (plantilla LIFE Vehículo Propio)");
    return hgImpParseLifeVehiculoPropioSheet_(wsP, ss);
  }
  if (plantilla === "LIFE_OTROS_GASTOS") {
    var wsO = hgImpLifeSheetByName_(ss, ["CONSUMIBLES", "Consumibles"]);
    if (!wsO) throw new Error("No se encontró hoja CONSUMIBLES (plantilla LIFE Otros gastos)");
    return hgImpParseLifeOtrosGastosSheet_(wsO, ss);
  }
  throw new Error("Plantilla LIFE no reconocida: " + plantilla);
}

function hgImpTryDetectLife_(ss) {
  var wsCons = hgImpLifeSheetByName_(ss, ["CONSUMIBLES", "Consumibles"]);
  if (wsCons) {
    var t = hgImpLifeNorm_(
      wsCons.getRange("D10").getValue() + " " + wsCons.getRange("D11").getValue()
    );
    if (t.indexOf("CONSUMIBLES") >= 0 || t.indexOf("CONSUMIBLE") >= 0) {
      return hgImpParseLifeOtrosGastosSheet_(wsCons, ss);
    }
  }
  var wsG = hgImpLifeSheetByName_(ss, ["VEHICULO PROYECTO", "Vehiculo Proyecto"]);
  if (wsG) {
    var tg = hgImpLifeNorm_(wsG.getRange("B8").getValue() + " " + wsG.getRange("B9").getValue());
    if (tg.indexOf("DESPLAZAMIENTOS") >= 0 || tg.indexOf("LIFE23") >= 0 || tg.indexOf("LIFE SOS") >= 0) {
      return hgImpParseLifeVehiculoGrefaSheet_(wsG, ss);
    }
  }
  var wsP = hgImpLifeSheetByName_(ss, ["vehiculo propio", "Vehiculo Propio"]);
  if (wsP) {
    var tp = hgImpLifeNorm_(wsP.getRange("B8").getValue() + " " + wsP.getRange("E12").getValue());
    if (tp.indexOf("SUBSISTENCE") >= 0 || tp.indexOf("LIFE23") >= 0 || tp.indexOf("LIFE SOS") >= 0) {
      return hgImpParseLifeVehiculoPropioSheet_(wsP, ss);
    }
  }
  return null;
}
