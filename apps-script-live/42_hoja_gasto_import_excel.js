// Importación de hojas de gasto Excel (.xlsm) desde GESTIFLOTA.
// MVP: plantilla HOJA DE GASTOS CON VEHICULO PROPIO (HOJA GASTOS).

function hgImpCellEmpty_(v) {
  if (v === null || v === undefined || v === "") return true;
  if (typeof v === "string" && !String(v).trim()) return true;
  return false;
}

function hgImpNum_(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v).trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function hgImpRound2_(n) {
  if (n === null || n === undefined || n === "") return null;
  var x = Number(n);
  if (!isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function hgImpFindLabelRow_(ws, col, startRow, containsText) {
  var last = ws.getLastRow();
  var needle = String(containsText || "").toLowerCase();
  for (var r = startRow; r <= Math.min(last, startRow + 250); r++) {
    var v = String(ws.getRange(r, col).getValue() || "").toLowerCase();
    if (v.indexOf(needle) >= 0) return r;
  }
  return 0;
}

function hgImpOpenExcelAsTempSpreadsheet_(fileId) {
  assertDriveApi_();
  fileId = String(fileId || "").trim();
  if (!fileId) throw new Error("Falta file_id del Excel");

  var meta = driveGetFileMeta_(fileId);
  var mime = String(meta.mimeType || "").toLowerCase();
  var name = String(meta.name || "import.xlsm");
  if (
    mime.indexOf("spreadsheet") >= 0 &&
    mime.indexOf("google-apps") >= 0
  ) {
    return { ss: SpreadsheetApp.openById(fileId), tempId: "", sourceName: name };
  }

  var tempName = "GF_IMPORT_" + new Date().getTime();
  var copy = Drive.Files.copy(
    {
      name: tempName,
      mimeType: "application/vnd.google-apps.spreadsheet",
    },
    fileId,
    { supportsAllDrives: true }
  );
  if (!copy || !copy.id) throw new Error("No se pudo convertir el Excel a hoja de cálculo");
  return {
    ss: SpreadsheetApp.openById(copy.id),
    tempId: copy.id,
    sourceName: name,
  };
}

function hgImpDeleteTempSpreadsheet_(tempId) {
  tempId = String(tempId || "").trim();
  if (!tempId) return;
  try {
    Drive.Files.remove(tempId, { supportsAllDrives: true });
  } catch (e) {
    // no bloquear
  }
}

function hgImpResolveProyecto_(nombre) {
  var q = String(nombre || "").trim();
  if (!q) return { id_proyecto: "", nombre_proyecto: "", match: "" };
  var rows = rowsToObjects_(getSheet("PROYECTOS"));
  var qn = hgImpNormPersonName_(q).toLowerCase();
  var qKeys = hgImpExtractProyectoKeywords_(q);
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < rows.length; i++) {
    var n = String(rows[i].nombre_proyecto || "").trim();
    if (!n) continue;
    var nn = hgImpNormPersonName_(n).toLowerCase();
    if (nn === qn) {
      return {
        id_proyecto: String(rows[i].id_proyecto || "").trim(),
        nombre_proyecto: n,
        match: "exact",
      };
    }
    var score = 0;
    if (nn.indexOf(qn) >= 0 || qn.indexOf(nn) >= 0) score = 80;
    var nKeys = hgImpExtractProyectoKeywords_(n);
    var ki;
    for (ki = 0; ki < qKeys.length; ki++) {
      var qk = String(qKeys[ki] || "").trim().toLowerCase();
      if (!qk) continue;
      if (nn.indexOf(qk.replace(/\s+/g, "")) >= 0 || nn.indexOf(qk) >= 0) score += 35;
      for (var kj = 0; kj < nKeys.length; kj++) {
        var nk = String(nKeys[kj] || "").trim().toLowerCase();
        if (qk === nk) score += 40;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = rows[i];
    }
  }
  if (best && bestScore >= 35) {
    return {
      id_proyecto: String(best.id_proyecto || "").trim(),
      nombre_proyecto: String(best.nombre_proyecto || "").trim(),
      match: bestScore >= 80 ? "partial" : "keyword",
    };
  }
  return { id_proyecto: "", nombre_proyecto: q, match: "none" };
}

function hgImpExtractProyectoKeywords_(text) {
  var norm = hgImpNormPersonName_(String(text || "")).toLowerCase();
  var keys = [];
  var patterns = ["pygargus", "abilas", "rhodope", "vulture", "life sos", "life23", "natura2000", "natura 2000"];
  var i;
  for (i = 0; i < patterns.length; i++) {
    var p = patterns[i];
    if (norm.indexOf(p.replace(/\s+/g, "")) >= 0 || norm.indexOf(p) >= 0) keys.push(p);
  }
  var nums = String(text || "").match(/\d{6,}/g);
  if (nums) keys = keys.concat(nums);
  return keys;
}

function hgImpNormalizeImportViajeFecha_(raw) {
  var d = normalizeDateDMYCell_(raw);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(d || ""))) return d;
  var p = parseFechaFlexible_(raw);
  if (p && !isNaN(p.getTime())) return formatDateISO_(p);
  return "";
}

function hgImpResolveProyectoForImport_(parsed, ctx) {
  var sources = [
    ctx && ctx.id_proyecto,
    parsed && parsed.trabajador && parsed.trabajador.id_proyecto,
    parsed && parsed.trabajador && parsed.trabajador.proyecto_texto,
    parsed && parsed.trabajador && parsed.trabajador.proyecto_nombre,
    ctx && ctx.proyecto_nombre,
  ];
  var i;
  for (i = 0; i < sources.length; i++) {
    var src = String(sources[i] || "").trim();
    if (!src) continue;
    if (/^PROY-/i.test(src) || /^PRY-/i.test(src)) {
      return { id_proyecto: src, nombre_proyecto: ctx && ctx.proyecto_nombre ? ctx.proyecto_nombre : src, match: "id" };
    }
    var resolved = hgImpResolveProyecto_(src);
    if (resolved.id_proyecto) return resolved;
  }
  return { id_proyecto: "", nombre_proyecto: "", match: "" };
}

function hgImpSplitItinerario_(itinerario) {
  var s = String(itinerario || "").trim();
  if (!s) return { origen: "", destino: "" };
  var parts = s.split(/\s*-\s*/);
  if (parts.length >= 2) {
    return {
      origen: String(parts[0] || "").trim(),
      destino: String(parts[parts.length - 1] || "").trim(),
    };
  }
  return { origen: s, destino: s };
}

function hgImpIvaPctFromTipo_(tipoIva) {
  var t = String(tipoIva || "").trim().toUpperCase();
  if (t.indexOf("21") >= 0) return 21;
  if (t.indexOf("10") >= 0) return 10;
  if (t.indexOf("4") >= 0 && t.indexOf("14") < 0) return 4;
  if (t.indexOf("EXENT") >= 0) return 0;
  return 21;
}

function hgImpResolveTipoConcepto_(concepto) {
  var c = String(concepto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (c.indexOf("peaje") >= 0 || c.indexOf("autopista") >= 0) return "PEAJES";
  if (c.indexOf("hosped") >= 0 || c.indexOf("hotel") >= 0 || c.indexOf("aloj") >= 0) return "HOSPEDAJE";
  if (c.indexOf("parking") >= 0 || c.indexOf("aparc") >= 0) return "PARKING";
  if (c.indexOf("dieta") >= 0 || c.indexOf("manutenc") >= 0 || c.indexOf("comida") >= 0 || c.indexOf("restaur") >= 0) {
    return "MANUTENCION";
  }
  return "OTROS";
}

function hgImpResolveTipoOtrosGrefa_(concepto) {
  return hgImpResolveTipoConcepto_(concepto);
}

function hgImpParseTrabajadorHeader_(ws, warnings) {
  var trabajador = {
    nombre: String(ws.getRange("B11").getValue() || "").trim(),
    dni: String(ws.getRange("B12").getValue() || "").trim().toUpperCase(),
    proyecto_texto: String(ws.getRange("B13").getValue() || "").trim(),
    num_hoja: String(ws.getRange("J1").getValue() || "").trim(),
    mes: String(ws.getRange("J2").getValue() || "").trim(),
    anio: String(ws.getRange("J3").getValue() || "").trim(),
  };
  var proy = hgImpResolveProyecto_(trabajador.proyecto_texto);
  trabajador.id_proyecto = proy.id_proyecto;
  trabajador.proyecto_nombre = proy.nombre_proyecto || trabajador.proyecto_texto;
  if (proy.match === "none" && trabajador.proyecto_texto) {
    warnings.push("Proyecto no encontrado en catálogo: " + trabajador.proyecto_texto);
  } else if (proy.match === "partial") {
    warnings.push("Proyecto emparejado parcialmente: " + trabajador.proyecto_texto + " → " + proy.nombre_proyecto);
  }
  return trabajador;
}

function hgImpCombHdrRow_(ws) {
  var rSec = hgImpFindLabelRow_(ws, 1, 15, "4.1");
  if (!rSec) rSec = hgImpFindLabelRow_(ws, 1, 15, "combustible");
  if (rSec > 0) {
    for (var r = rSec + 1; r <= rSec + 4; r++) {
      var v2 = String(ws.getRange(r, 2).getValue() || "").toLowerCase();
      var v7 = String(ws.getRange(r, 7).getValue() || "").toLowerCase();
      var v8 = String(ws.getRange(r, 8).getValue() || "").toLowerCase();
      if (v2.indexOf("matr") >= 0 || v7.indexOf("tipo iva") >= 0 || v8.indexOf("base imponible") >= 0) {
        return r;
      }
    }
  }
  var r = hgImpFindLabelRow_(ws, 8, 20, "base imponible");
  if (!r) r = hgImpFindLabelRow_(ws, 7, 20, "tipo iva");
  if (!r) r = hgImpFindLabelRow_(ws, 2, 20, "matr");
  return r > 0 ? r : 25;
}

function hgImpCombTotRow_(ws) {
  var rHdr = hgImpCombHdrRow_(ws);
  var r = hgImpFindLabelRow_(ws, 5, rHdr + 1, "total litros");
  if (!r) r = hgImpFindLabelRow_(ws, 5, rHdr + 1, "totales");
  if (!r || r <= rHdr) r = rHdr + 9;
  return r;
}

function hgImpCombRowHasData_(ws, r) {
  return !(
    hgImpCellEmpty_(ws.getRange(r, 3).getValue()) &&
    hgImpCellEmpty_(ws.getRange(r, 4).getValue()) &&
    hgImpCellEmpty_(ws.getRange(r, 10).getValue())
  );
}

function hgImpSumImportes_(lineas) {
  var total = 0;
  for (var li = 0; li < lineas.length; li++) {
    total += Number(lineas[li].importe_estimado || 0);
  }
  return Math.round(total * 100) / 100;
}

function hgImpFirstMatricula_(lineas) {
  for (var i = 0; i < lineas.length; i++) {
    var m = String(lineas[i].matricula || "").trim().toUpperCase();
    if (m && m !== "OTROS" && m !== "COLABORADOR") return m;
  }
  return "";
}

function hgImpParseVehiculoPropioSheet_(ws) {
  var warnings = [];
  var wsName = String(ws.getName() || "");
  if (wsName.toUpperCase().indexOf("HOJA") < 0 && wsName.toUpperCase().indexOf("GASTO") < 0) {
    warnings.push("La pestaña activa no parece ser HOJA GASTOS: " + wsName);
  }

  var trabajador = hgImpParseTrabajadorHeader_(ws, warnings);
  var tarifaKm = 0.26;
  var rTasa = hgImpFindLabelRow_(ws, 8, 20, "/km");
  if (!rTasa) rTasa = hgImpFindLabelRow_(ws, 8, 20, "€/km");
  if (rTasa > 0) {
    var t = hgImpNum_(ws.getRange(rTasa, 9).getValue());
    if (t != null && t > 0) tarifaKm = t;
  }

  var desplazamientos = [];
  var rSec41 = hgImpFindLabelRow_(ws, 1, 1, "4.1");
  if (rSec41 > 0) {
    var rHdr = rSec41 + 1;
    var rTot = hgImpFindLabelRow_(ws, 8, rHdr, "Total km");
    if (!rTot) rTot = hgImpFindLabelRow_(ws, 9, rHdr, "Total km");
    if (rTot > rHdr) {
      for (var r = rHdr + 1; r < rTot; r++) {
        var fecha = normalizeDateDMYCell_(ws.getRange(r, 2).getValue());
        var itinerario = String(ws.getRange(r, 3).getValue() || "").trim();
        var medio = String(ws.getRange(r, 7).getValue() || "").trim();
        var km = hgImpNum_(ws.getRange(r, 9).getValue());
        var impFac = hgImpNum_(ws.getRange(r, 10).getValue());
        if (hgImpCellEmpty_(fecha) && hgImpCellEmpty_(itinerario) && km == null && impFac == null) continue;
        var esAlquiler =
          medio.toLowerCase().indexOf("alquil") >= 0 ||
          (impFac != null && impFac > 0 && (km == null || km <= 0));
        var esViajeSinKm =
          !esAlquiler &&
          (km == null || km <= 0) &&
          (!hgImpCellEmpty_(itinerario) || !hgImpCellEmpty_(fecha));
        var item = {
          seccion: "4.1",
          fila_excel: r,
          fecha: fecha,
          itinerario: itinerario,
          medio: medio,
          km: km,
          importe_factura: impFac,
          tarifa_km: tarifaKm,
          tipo_gasto: esAlquiler ? "OTROS" : "KILOMETRAJE_COLABORADOR",
          sin_km: esViajeSinKm ? "SI" : "",
          importe_estimado: esAlquiler
            ? impFac || 0
            : esViajeSinKm
              ? impFac != null && impFac > 0
                ? impFac
                : 0
              : km != null && km > 0
                ? Math.round(km * tarifaKm * 100) / 100
                : 0,
        };
        if (esViajeSinKm || (item.importe_estimado != null && item.importe_estimado > 0) || (km != null && km > 0)) {
          desplazamientos.push(item);
        }
      }
    } else {
      warnings.push("No se encontró fila Total km en bloque 4.1");
    }
  } else {
    warnings.push("No se encontró sección 4.1 Desplazamientos");
  }

  var dietas = [];
  var rSec42 = hgImpFindLabelRow_(ws, 1, 1, "4.2");
  if (rSec42 > 0) {
    var rHdrD = rSec42 + 1;
    var rTotD = hgImpFindLabelRow_(ws, 7, rSec42, "Total Dietas");
    if (rTotD > rHdrD) {
      for (var rd = rHdrD + 1; rd < rTotD; rd++) {
        var fD = normalizeDateDMYCell_(ws.getRange(rd, 2).getValue());
        var pers = String(ws.getRange(rd, 3).getValue() || "").trim();
        var est = String(ws.getRange(rd, 4).getValue() || "").trim();
        var numFac = String(ws.getRange(rd, 7).getValue() || "").trim();
        var base = hgImpNum_(ws.getRange(rd, 8).getValue());
        var cuota = hgImpNum_(ws.getRange(rd, 9).getValue());
        var imp = hgImpNum_(ws.getRange(rd, 10).getValue());
        if (hgImpCellEmpty_(fD) && hgImpCellEmpty_(est) && imp == null) continue;
        dietas.push({
          seccion: "4.2",
          fila_excel: rd,
          fecha: fD,
          personas: pers,
          establecimiento: est,
          num_factura: numFac,
          base_imponible: base,
          cuota_iva: cuota,
          importe: imp,
          tipo_gasto: "MANUTENCION",
          importe_estimado: imp || 0,
        });
      }
    }
  }

  var otros = [];
  var rSec43 = hgImpFindLabelRow_(ws, 1, 1, "4.3");
  if (rSec43 > 0) {
    var rHdrO = rSec43 + 1;
    var rTotO = hgImpFindLabelRow_(ws, 7, rSec43, "Total Otros");
    if (rTotO > rHdrO) {
      for (var ro = rHdrO + 1; ro < rTotO; ro++) {
        var fO = normalizeDateDMYCell_(ws.getRange(ro, 2).getValue());
        var concepto = String(ws.getRange(ro, 3).getValue() || "").trim();
        var prov = String(ws.getRange(ro, 5).getValue() || "").trim();
        var numFacO = String(ws.getRange(ro, 7).getValue() || "").trim();
        var baseO = hgImpNum_(ws.getRange(ro, 8).getValue());
        var cuotaO = hgImpNum_(ws.getRange(ro, 9).getValue());
        var impO = hgImpNum_(ws.getRange(ro, 10).getValue());
        if (hgImpCellEmpty_(fO) && hgImpCellEmpty_(concepto) && impO == null) continue;
        otros.push({
          seccion: "4.3",
          fila_excel: ro,
          fecha: fO,
          concepto: concepto,
          proveedor: prov,
          num_factura: numFacO,
          base_imponible: baseO,
          cuota_iva: cuotaO,
          importe: impO,
          tipo_gasto: "OTROS",
          importe_estimado: impO || 0,
        });
      }
    }
  }

  var lineas = desplazamientos.concat(dietas).concat(otros);

  return {
    plantilla: "VEHICULO_PROPIO",
    hoja_gasto_modelo: "VEHICULO_PROPIO",
    trabajador: trabajador,
    tarifa_km: tarifaKm,
    matricula_hint: "",
    lineas: lineas,
    resumen: {
      desplazamientos: desplazamientos.length,
      dietas: dietas.length,
      otros: otros.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpParseVehiculosGrefaSheet_(ws) {
  var warnings = [];
  var wsName = String(ws.getName() || "");
  if (wsName.toUpperCase().indexOf("HOJA") < 0 && wsName.toUpperCase().indexOf("GASTO") < 0) {
    warnings.push("La pestaña activa no parece ser HOJA GASTOS: " + wsName);
  }

  var trabajador = hgImpParseTrabajadorHeader_(ws, warnings);

  var combustibles = [];
  var rHdrC = hgImpCombHdrRow_(ws);
  var rTotC = hgImpCombTotRow_(ws);
  if (rTotC > rHdrC + 1) {
    for (var rc = rHdrC + 1; rc < rTotC; rc++) {
      if (!hgImpCombRowHasData_(ws, rc)) continue;
      var mat = String(ws.getRange(rc, 2).getValue() || "").trim().toUpperCase();
      var fechaC = normalizeDateDMYCell_(ws.getRange(rc, 3).getValue());
      var numFacC = String(ws.getRange(rc, 4).getValue() || "").trim();
      var provC = String(ws.getRange(rc, 5).getValue() || "").trim();
      var litros = hgImpNum_(ws.getRange(rc, 6).getValue());
      var tipoIva = String(ws.getRange(rc, 7).getValue() || "").trim();
      var baseC = hgImpNum_(ws.getRange(rc, 8).getValue());
      var cuotaC = hgImpNum_(ws.getRange(rc, 9).getValue());
      var totalC = hgImpNum_(ws.getRange(rc, 10).getValue());
      var ivaPctC = hgImpIvaPctFromTipo_(tipoIva);
      combustibles.push({
        seccion: "4.1",
        fila_excel: rc,
        fecha: fechaC,
        matricula: mat,
        num_factura: numFacC,
        proveedor: provC,
        litros: litros,
        tipo_iva: tipoIva,
        base_imponible: baseC,
        cuota_iva: cuotaC,
        importe: totalC,
        tipo_gasto: "COMBUSTIBLES",
        importe_estimado: totalC || 0,
        iva_porcentaje: ivaPctC,
      });
    }
  } else {
    warnings.push("No se encontró bloque 4.1 Combustible");
  }

  var dietas = [];
  var rSec42 = hgImpFindLabelRow_(ws, 1, 1, "4.2");
  if (rSec42 > 0) {
    var rHdrD = rSec42 + 1;
    var rTotD = hgImpFindLabelRow_(ws, 7, rSec42, "total dietas");
    if (rTotD > rHdrD) {
      for (var rd = rHdrD + 1; rd < rTotD; rd++) {
        var fD = normalizeDateDMYCell_(ws.getRange(rd, 2).getValue());
        var pers = String(ws.getRange(rd, 3).getValue() || "").trim();
        var est = String(ws.getRange(rd, 4).getValue() || "").trim();
        var numFacD = String(ws.getRange(rd, 8).getValue() || "").trim();
        var impD = hgImpNum_(ws.getRange(rd, 10).getValue());
        if (hgImpCellEmpty_(fD) && hgImpCellEmpty_(est) && impD == null) continue;
        dietas.push({
          seccion: "4.2",
          fila_excel: rd,
          fecha: fD,
          personas: pers,
          establecimiento: est,
          num_factura: numFacD,
          importe: impD,
          tipo_gasto: "MANUTENCION",
          importe_estimado: impD || 0,
        });
      }
    }
  } else {
    warnings.push("No se encontró sección 4.2 Dietas");
  }

  var otros = [];
  var rSec43 = hgImpFindLabelRow_(ws, 1, 1, "4.3");
  if (rSec43 > 0) {
    var rHdrO = rSec43 + 1;
    var rTotO = hgImpFindLabelRow_(ws, 7, rSec43, "total otros");
    if (rTotO > rHdrO) {
      for (var ro = rHdrO + 1; ro < rTotO; ro++) {
        var fO = normalizeDateDMYCell_(ws.getRange(ro, 2).getValue());
        var concepto = String(ws.getRange(ro, 3).getValue() || "").trim();
        var provO = String(ws.getRange(ro, 6).getValue() || "").trim();
        var numFacO = String(ws.getRange(ro, 8).getValue() || "").trim();
        var impO = hgImpNum_(ws.getRange(ro, 10).getValue());
        if (hgImpCellEmpty_(fO) && hgImpCellEmpty_(concepto) && impO == null) continue;
        var tipoO = hgImpResolveTipoOtrosGrefa_(concepto);
        otros.push({
          seccion: "4.3",
          fila_excel: ro,
          fecha: fO,
          concepto: concepto,
          proveedor: provO,
          num_factura: numFacO,
          importe: impO,
          tipo_gasto: tipoO,
          importe_estimado: impO || 0,
        });
      }
    }
  } else {
    warnings.push("No se encontró sección 4.3 Otros gastos");
  }

  var lineas = combustibles.concat(dietas).concat(otros);
  var matHint = hgImpFirstMatricula_(combustibles);
  if (!matHint && lineas.length) {
    warnings.push("No hay matrícula en combustible; dietas/otros usarán matrícula genérica si aplica");
  }

  return {
    plantilla: "VEHICULOS_GREFA",
    hoja_gasto_modelo: "VEHICULOS_GREFA",
    trabajador: trabajador,
    matricula_hint: matHint,
    lineas: lineas,
    resumen: {
      combustibles: combustibles.length,
      dietas: dietas.length,
      otros: otros.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpResolveOtrosCostesWs_(ss) {
  var tryNames = ["HOJA DE GASTO", "Hoja de Gasto", "Hoja1", "HOJA GASTOS", "Hoja de gastos"];
  for (var i = 0; i < tryNames.length; i++) {
    var ws = ss.getSheetByName(tryNames[i]);
    if (ws) return ws;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var n = String(sheets[j].getName() || "").toLowerCase();
    if (n.indexOf("factura") >= 0 || n.indexOf("ref") >= 0 || n.indexOf("contab") >= 0) continue;
    if (
      hgImpFindLabelRow_(sheets[j], 1, 10, "total a pagar") > 0 ||
      hgImpFindLabelRow_(sheets[j], 1, 10, "declaro bajo") > 0 ||
      hgImpFindLabelRow_(sheets[j], 1, 14, "orden") > 0
    ) {
      return sheets[j];
    }
  }
  return null;
}

function hgImpOcGastoHdrRow_(ws) {
  var r = hgImpFindLabelRow_(ws, 1, 14, "orden");
  if (r > 0) return r;
  r = hgImpFindLabelRow_(ws, 1, 10, "concepto");
  if (r > 0) return r;
  r = hgImpFindLabelRow_(ws, 1, 10, "fecha");
  if (r > 0) return r;
  return 16;
}

function hgImpOcGastoTotRow_(ws) {
  var rHdr = hgImpOcGastoHdrRow_(ws);
  var last = ws.getLastRow();
  for (var i = rHdr + 1; i <= Math.min(last, rHdr + 80); i++) {
    var f = String(ws.getRange(i, 8).getFormula() || "").toUpperCase();
    if (f.indexOf("SUM(") >= 0) return i;
  }
  var rTot = hgImpFindLabelRow_(ws, 4, rHdr + 1, "total a pagar");
  if (rTot > rHdr) return rTot - 1;
  return rHdr + 16;
}

function hgImpOcRowHasData_(ws, r) {
  return !(
    hgImpCellEmpty_(ws.getRange(r, 2).getValue()) &&
    hgImpCellEmpty_(ws.getRange(r, 3).getValue()) &&
    hgImpCellEmpty_(ws.getRange(r, 10).getValue())
  );
}

function hgImpParseOtrosCostesSheet_(ws) {
  var warnings = [];
  var wsName = String(ws.getName() || "");

  var trabajador = {
    nombre: String(ws.getRange("B11").getValue() || "").trim(),
    dni: String(ws.getRange("B12").getValue() || "").trim().toUpperCase(),
    puesto: String(ws.getRange("B13").getValue() || "").trim(),
    proyecto_texto: "",
    num_hoja: String(ws.getRange("J1").getValue() || "").trim(),
    mes: String(ws.getRange("J2").getValue() || "").trim(),
    anio: String(ws.getRange("J3").getValue() || "").trim(),
  };
  trabajador.id_proyecto = "";
  trabajador.proyecto_nombre = "";

  var rHdr = hgImpOcGastoHdrRow_(ws);
  var rTot = hgImpOcGastoTotRow_(ws);
  var lineas = [];

  if (rTot > rHdr + 1) {
    for (var r = rHdr + 1; r < rTot; r++) {
      if (!hgImpOcRowHasData_(ws, r)) continue;
      var fecha = normalizeDateDMYCell_(ws.getRange(r, 2).getValue());
      var concepto = String(ws.getRange(r, 3).getValue() || "").trim();
      var proveedor = String(ws.getRange(r, 5).getValue() || "").trim();
      if (!proveedor) proveedor = String(ws.getRange(r, 4).getValue() || "").trim();
      var numFac = String(ws.getRange(r, 7).getValue() || "").trim();
      if (!numFac) numFac = String(ws.getRange(r, 6).getValue() || "").trim();
      var base = hgImpNum_(ws.getRange(r, 8).getValue());
      var cuota = hgImpNum_(ws.getRange(r, 9).getValue());
      var total = hgImpNum_(ws.getRange(r, 10).getValue());
      var tipo = hgImpResolveTipoConcepto_(concepto);
      var ivaPct = 21;
      if (base != null && cuota != null && base > 0) {
        ivaPct = Math.round((Number(cuota) / Number(base)) * 10000) / 100;
      } else if (tipo === "MANUTENCION") {
        ivaPct = 10;
      }
      lineas.push({
        seccion: "GASTOS",
        fila_excel: r,
        fecha: fecha,
        concepto: concepto,
        proveedor: proveedor,
        num_factura: numFac,
        base_imponible: base,
        cuota_iva: cuota,
        importe: total,
        tipo_gasto: tipo,
        importe_estimado: total || 0,
        iva_porcentaje: ivaPct,
      });
    }
  } else {
    warnings.push("No se encontró la tabla de gastos (cabecera/total)");
  }

  if (!trabajador.proyecto_texto) {
    warnings.push("La plantilla Otros Costes no incluye proyecto; asigna proyecto al confeccionar la hoja en GESTIFLOTA");
  }
  if (wsName.toUpperCase().indexOf("FACTURA") >= 0) {
    warnings.push("Pestaña inusual para Otros Costes: " + wsName);
  }

  return {
    plantilla: "OTROS_COSTES",
    hoja_gasto_modelo: "OTROS_COSTES",
    trabajador: trabajador,
    matricula_hint: "",
    lineas: lineas,
    resumen: {
      gastos: lineas.length,
      total_lineas: lineas.length,
      total_importe: hgImpSumImportes_(lineas),
    },
    warnings: warnings,
  };
}

function hgImpDetectAndParse_(ss, expectedPlantilla) {
  expectedPlantilla = hgImpNormalizePlantillaEsperada_(expectedPlantilla);
  if (expectedPlantilla.indexOf("LIFE_") === 0) {
    return hgImpParseLifeByPlantilla_(ss, expectedPlantilla);
  }

  var ws = ss.getSheetByName("HOJA GASTOS");
  if (ws) {
    var r41 = hgImpFindLabelRow_(ws, 1, 1, "4.1");
    if (r41 > 0) {
      var t41 = String(ws.getRange(r41, 1).getValue() || "").toLowerCase();
      if (t41.indexOf("combustible") >= 0) return hgImpParseVehiculosGrefaSheet_(ws);
      if (t41.indexOf("desplazamiento") >= 0) return hgImpParseVehiculoPropioSheet_(ws);
    }
    var probeLow =
      (String(ws.getRange("A24").getValue() || "") + String(ws.getRange("A1").getValue() || "")).toLowerCase();
    if (probeLow.indexOf("combustible") >= 0) return hgImpParseVehiculosGrefaSheet_(ws);
    if (probeLow.indexOf("desplazamiento") >= 0) return hgImpParseVehiculoPropioSheet_(ws);
  }

  var wsOc = hgImpResolveOtrosCostesWs_(ss);
  if (wsOc) {
    var has41oc = hgImpFindLabelRow_(wsOc, 1, 1, "4.1") > 0;
    if (!has41oc) {
      return hgImpParseOtrosCostesSheet_(wsOc);
    }
  }

  if (!ws) {
    var lifeAuto = hgImpTryDetectLife_(ss);
    if (lifeAuto) return lifeAuto;
    var sheets = ss.getSheets();
    ws = sheets.length ? sheets[0] : null;
  }
  if (!ws) throw new Error("El archivo no contiene hojas legibles");

  var lifeFallback = hgImpTryDetectLife_(ss);
  if (lifeFallback) return lifeFallback;

  throw new Error(
    "Plantilla Excel no reconocida. Use plantilla estándar (HOJA GASTOS) o LIFE (HHGG)."
  );
}

function hgImpFacturaPersonasFields_(tipo, linea) {
  var numFac = String(linea.num_factura || linea.numero_factura || "").trim();
  if (linea.num_factura != null && typeof linea.num_factura === "number") {
    numFac = String(linea.num_factura).trim();
  }
  var numPersRaw = linea.num_personas != null ? linea.num_personas : linea.personas;
  var numPers = numPersRaw != null && String(numPersRaw).trim() !== "" ? String(numPersRaw).trim() : "";
  var t = String(tipo || "").trim().toUpperCase();
  var out = {};
  if (t === "PEAJES") {
    out.numero_factura_peaje = numFac;
  } else if (t === "COMBUSTIBLES") {
    out.numero_ticket = numFac;
  } else if (t === "HOSPEDAJE") {
    out.numero_factura_otros = numFac;
    if (numPers) out.numero_personas_hospedaje = numPers;
  } else if (t === "MANUTENCION") {
    out.numero_factura_otros = numFac;
    if (numPers) out.numero_comensales_manutencion = numPers;
  } else if (t === "PARKING") {
    out.numero_factura_otros = numFac;
  } else if (t === "GASTOS_BILLETES") {
    out.numero_reserva_billete = numFac;
    out.numero_factura_otros = numFac;
    if (numPers) {
      out.numero_personas_billete = numPers;
      out.numero_personas_hospedaje = numPers;
      out.num_personas = numPers;
    }
  } else if (t === "OTROS") {
    out.numero_factura_otros = numFac;
    if (numPers) out.numero_personas_hospedaje = numPers;
  }
  if (numFac) out.numero_factura = numFac;
  return out;
}

function hgImpResolveIvaPctFromLinea_(linea) {
  if (!linea || typeof linea !== "object") return null;
  if (linea.iva_porcentaje != null && linea.iva_porcentaje !== "" && isFinite(Number(linea.iva_porcentaje))) {
    return Number(linea.iva_porcentaje);
  }
  if (linea.iva_pct != null && linea.iva_pct !== "" && isFinite(Number(linea.iva_pct))) {
    if (typeof hgImpLifeNormalizeIvaPctFromExcel_ === "function") {
      return hgImpLifeNormalizeIvaPctFromExcel_(linea.iva_pct);
    }
    var n = Number(linea.iva_pct);
    if (n > 0 && n <= 1) return Math.round(n * 10000) / 100;
    return n;
  }
  return null;
}

function hgImpBuildGastoPayload_(linea, ctx) {
  var tipo = String(linea.tipo_gasto || "").trim().toUpperCase();
  if (typeof normalizeTipoGasto_ === "function") tipo = normalizeTipoGasto_(tipo);
  if (tipo === "TICKET" || tipo === "BILLETE" || tipo === "BILLETES") tipo = "GASTOS_BILLETES";
  var proyNombre = String(ctx.proyecto_nombre || "").trim();
  var proyId = String(ctx.id_proyecto || "").trim();
  var plantilla = String(ctx.plantilla || ctx.hoja_gasto_modelo || "VEHICULO_PROPIO").trim();
  var isPropio = plantilla === "VEHICULO_PROPIO";
  var isGrefa = plantilla === "VEHICULOS_GREFA";
  var isOtrosCostes = plantilla === "OTROS_COSTES";
  var isLife = plantilla.indexOf("LIFE_") === 0;
  var isLifeGrefa = plantilla === "LIFE_VEHICULO_GREFA";
  var isLifePropio = plantilla === "LIFE_VEHICULO_PROPIO";
  var isLifeOtros = plantilla === "LIFE_OTROS_GASTOS" || String(ctx.life_familia || "").trim().toUpperCase() === "OTROS";
  var matHint = String(ctx.matricula_hint || linea.matricula || "").trim().toUpperCase();
  var trabNombre = String(ctx.trabajador_nombre || "").trim();
  var trabDni = String(ctx.trabajador_dni || "").trim().toUpperCase();
  var base = {
    responsable_email: ctx.responsable_email,
    grabado_por_email: ctx.actor_email,
    usuario_email: ctx.responsable_email,
    user_email: ctx.responsable_email,
    excel_trabajador_nombre: trabNombre,
    excel_trabajador_dni: trabDni,
    departamento_o_proyecto: proyNombre,
    id_proyecto: proyId,
    tratado_como_colaborador: isPropio || isOtrosCostes || isLifePropio || isLifeOtros ? "SI" : "NO",
    vehiculo_propio: isPropio || isLifePropio ? "SI" : "NO",
    forma_pago: isGrefa || isLifeGrefa ? "Tarjeta Grefa" : "Usuario",
    excel_import: "SI",
    excel_fila: linea.fila_excel,
    excel_seccion: linea.seccion,
    excel_source_file_id: String(ctx.source_file_id || "").trim(),
    work_package: String(linea.work_package || "").trim(),
    accion_proyecto: String(linea.accion_proyecto || "").trim(),
    accion_colaborador: String(linea.accion_proyecto || "").trim(),
  };
  if (isLife) {
    base.hoja_gasto_modelo = "LIFE";
  }
  if (ctx.id_viaje_propio) {
    base.id_viaje_propio = String(ctx.id_viaje_propio).trim();
  }

  if (tipo === "COMBUSTIBLES") {
    var impC = Number(linea.importe || linea.importe_estimado || 0);
    var ivaPctC = hgImpResolveIvaPctFromLinea_(linea);
    if (ivaPctC == null) ivaPctC = hgImpIvaPctFromTipo_(linea.tipo_iva);
    if (ivaPctC != null && ivaPctC > 0 && ivaPctC <= 1) ivaPctC = ivaPctC * 100;
    var matC = String(linea.matricula || matHint || "").trim().toUpperCase();
    if (!matC && isLifeGrefa) matC = "GREFA";
    if (!matC) throw new Error("Falta matrícula en fila combustible " + linea.fila_excel);
    var litrosC = linea.litros != null ? Number(linea.litros) : null;
    var kmC = linea.km_repostaje != null ? Number(linea.km_repostaje) : null;
    var tCombC =
      typeof hgImpLifeNormalizeTipoComb_ === "function"
        ? hgImpLifeNormalizeTipoComb_(linea.tipo_combustible || "GASOLEO")
        : String(linea.tipo_combustible || "GASOLEO").trim();
    return hgImpStampViajeImportMeta_(
      Object.assign({}, base, {
      tipo_gasto: "COMBUSTIBLES",
      matricula: matC,
      fecha_repostaje: linea.fecha,
      lugar_repostaje: linea.proveedor,
      entidad_combustible: linea.proveedor,
      numero_ticket: linea.num_factura,
      litros_repostados: litrosC,
      kilometros_repostaje: isFinite(kmC) ? kmC : "",
      tipo_combustible: tCombC,
      total_a_pagar: impC,
      coste_total: impC,
      importe_sin_iva: linea.base_imponible != null ? linea.base_imponible : impC,
      base_imponible: linea.base_imponible,
      cuota_iva: linea.cuota_iva,
      iva_porcentaje: ivaPctC,
      concepto: "Combustible " + matC,
      proveedor: linea.proveedor || "Estación servicio",
    }, hgImpFacturaPersonasFields_("COMBUSTIBLES", linea)),
      ctx
    );
  }

  if (tipo === "PEAJES") {
    var impP = Number(linea.importe || linea.importe_estimado || 0);
    var matP = String(linea.matricula || matHint || "OTROS").trim().toUpperCase();
    return hgImpStampViajeImportMeta_(
      Object.assign({}, base, {
      tipo_gasto: "PEAJES",
      matricula: matP,
      fecha_peaje: linea.fecha,
      entidad_peaje: linea.proveedor || "Peaje",
      importe_peaje: impP,
      coste_total: impP,
      importe_sin_iva: impP,
      iva_porcentaje: 21,
      concepto: String(linea.concepto || "Peaje").trim(),
      proveedor: linea.proveedor || "Peaje",
    }, hgImpFacturaPersonasFields_("PEAJES", linea)),
      ctx
    );
  }

  if (tipo === "HOSPEDAJE") {
    var impH = Number(linea.importe || linea.importe_estimado || 0);
    var matH = String(linea.matricula || matHint || "OTROS").trim().toUpperCase();
    return hgImpStampViajeImportMeta_(
      Object.assign({}, base, {
      tipo_gasto: "HOSPEDAJE",
      matricula: matH,
      fecha_otros_gastos: linea.fecha,
      entidad_hospedaje: linea.proveedor || linea.establecimiento || "Hospedaje",
      importe_hospedaje: impH,
      concepto_otros_gastos: String(linea.concepto || "Hospedaje").trim(),
      concepto: String(linea.concepto || "Hospedaje").trim(),
      proveedor: linea.proveedor || linea.establecimiento || "Hospedaje",
      coste_total: impH,
      importe_sin_iva: impH,
      iva_porcentaje: 10,
    }, hgImpFacturaPersonasFields_("HOSPEDAJE", linea)),
      ctx
    );
  }

  if (tipo === "PARKING") {
    var impPk = Number(linea.importe || linea.importe_estimado || 0);
    var matPk = String(linea.matricula || matHint || "OTROS").trim().toUpperCase();
    return hgImpStampViajeImportMeta_(
      Object.assign({}, base, {
      tipo_gasto: "PARKING",
      matricula: matPk,
      fecha_aparcamiento: linea.fecha,
      entidad_parking: linea.proveedor || "Parking",
      importe_aparcamiento: impPk,
      coste_total: impPk,
      importe_sin_iva: impPk,
      iva_porcentaje: 21,
      concepto: String(linea.concepto || "Parking").trim(),
      proveedor: linea.proveedor || "Parking",
    }, hgImpFacturaPersonasFields_("PARKING", linea)),
      ctx
    );
  }

  if (tipo === "KILOMETRAJE_COLABORADOR") {
    var km = Number(linea.km || 0);
    var tarifa = Number(linea.tarifa_km || ctx.tarifa_km || 0.26);
    var it = hgImpSplitItinerario_(linea.itinerario);
    var sinKm = String(linea.sin_km || "").toUpperCase() === "SI";
    var impViaje = Number(linea.importe_estimado || linea.importe_factura || 0);
    var payloadKm = Object.assign({}, base, {
      tipo_gasto: "KILOMETRAJE_COLABORADOR",
      matricula: "COLABORADOR",
      fecha_viaje_colaborador: linea.fecha,
      km_inicial_colaborador: sinKm ? 0 : 0,
      km_final_colaborador: sinKm ? (impViaje > 0 ? 1 : 0) : km,
      tarifa_eur_km_aplicada: tarifa,
      origen_colaborador: it.origen,
      destino_colaborador: it.destino,
      motivo_colaborador: linea.itinerario || linea.medio || "",
      accion_colaborador: linea.medio || "Vehículo propio",
      concepto: "Desplazamiento " + (linea.itinerario || linea.medio || ""),
      proveedor: linea.medio || "COLABORADOR",
      coste_total: sinKm
        ? impViaje
        : Math.round(km * tarifa * 100) / 100,
      importe_sin_iva: sinKm
        ? impViaje
        : Math.round(km * tarifa * 100) / 100,
      iva_porcentaje: 0,
      excel_viaje_sin_km: sinKm ? "SI" : "",
    });
    if (ctx.viaje && typeof ctx.viaje === "object") {
      payloadKm.excel_viaje_fecha_inicio = ctx.viaje.fecha_inicio || "";
      payloadKm.excel_viaje_fecha_fin = ctx.viaje.fecha_fin || "";
      payloadKm.excel_viaje_origen = ctx.viaje.origen || "";
      payloadKm.excel_viaje_destino1 = ctx.viaje.destino1 || "";
      payloadKm.excel_viaje_destino2 = ctx.viaje.destino2 || "";
      payloadKm.excel_viaje_destino3 = ctx.viaje.destino3 || "";
      payloadKm.excel_viaje_destino4 = ctx.viaje.destino4 || "";
      payloadKm.excel_viaje_motivo = ctx.viaje.motivo || "";
      payloadKm.excel_viaje_matricula = ctx.viaje.matricula || "";
    }
    return hgImpStampViajeImportMeta_(payloadKm, ctx);
  }

  if (tipo === "GASTOS_BILLETES") {
    var precioB =
      linea.precio_total_billete != null && linea.precio_total_billete !== ""
        ? Number(linea.precio_total_billete)
        : Number(linea.importe || linea.importe_estimado || 0);
    var tasasB =
      linea.tasas_billete != null && linea.tasas_billete !== "" ? Number(linea.tasas_billete) : 0;
    if (!isFinite(precioB)) precioB = 0;
    if (!isFinite(tasasB)) tasasB = 0;
    var impB = hgImpRound2_(precioB + tasasB);
    var ivaPctB = hgImpResolveIvaPctFromLinea_(linea);
    if (ivaPctB == null) ivaPctB = 21;
    var matB = String(linea.matricula || matHint || "BILLETES").trim().toUpperCase() || "BILLETES";
    var origenB = String(linea.origen_billete || "").trim();
    var destB = String(linea.destino_billete || "").trim();
    if ((!origenB || !destB) && typeof hgImpLifeSplitBilleteConcept_ === "function") {
      var splitB = hgImpLifeSplitBilleteConcept_(linea.concepto_billete || linea.concepto || "");
      origenB = origenB || splitB.origen;
      destB = destB || splitB.destino;
    }
    var conceptoB =
      String(linea.concepto_billete || "").trim() ||
      [origenB, destB].filter(Boolean).join(" -> ") ||
      String(linea.concepto || "Billete").trim();
    var baseB = linea.base_imponible != null ? hgImpRound2_(linea.base_imponible) : null;
    var cuotaB = linea.cuota_iva != null ? hgImpRound2_(linea.cuota_iva) : null;
    var sinIvaB = baseB != null ? hgImpRound2_(baseB + tasasB) : null;
    return hgImpStampViajeImportMeta_(
      Object.assign(
        {},
        base,
        {
          tipo_gasto: "GASTOS_BILLETES",
          matricula: matB,
          fecha_ida_billete: linea.fecha,
          fecha_vuelta_billete: linea.fecha_vuelta_billete || "",
          origen_billete: origenB,
          destino_billete: destB,
          numero_reserva_billete: String(linea.num_factura || "").trim(),
          numero_personas_billete: String(linea.num_personas || "").trim(),
          compania_billete: linea.proveedor || "",
          precio_total_billete: precioB,
          tasas_billete: tasasB,
          concepto_billete: conceptoB,
          concepto: conceptoB,
          proveedor: linea.proveedor || "",
          coste_total: impB,
          importe_sin_iva: sinIvaB,
          base_imponible: sinIvaB,
          cuota_iva: cuotaB,
          iva_porcentaje: ivaPctB,
        },
        hgImpFacturaPersonasFields_("GASTOS_BILLETES", linea)
      ),
      ctx
    );
  }

  if (tipo === "MANUTENCION") {
    var impD = Number(linea.importe || linea.importe_estimado || 0);
    var ivaPctD = hgImpResolveIvaPctFromLinea_(linea);
    if (ivaPctD == null) ivaPctD = 10;
    var baseD = linea.base_imponible != null ? Number(linea.base_imponible) : impD;
    var cuotaD = linea.cuota_iva != null ? Number(linea.cuota_iva) : null;
    var matD = isPropio || isOtrosCostes ? "COLABORADOR" : String(linea.matricula || matHint || "OTROS").trim().toUpperCase();
    return hgImpStampViajeImportMeta_(
      Object.assign({}, base, {
      tipo_gasto: "MANUTENCION",
      matricula: matD,
      fecha_otros_gastos: linea.fecha,
      establecimiento_manutencion: linea.establecimiento || linea.proveedor || linea.concepto,
      proveedor_otros_gastos: linea.establecimiento || linea.proveedor || linea.concepto,
      concepto_otros_gastos: String(linea.concepto || "Dieta / manutención").trim(),
      concepto: String(linea.concepto || "Dieta / manutención").trim(),
      proveedor: linea.establecimiento || linea.proveedor || linea.concepto,
      coste_total: impD,
      importe_manutencion: impD,
      importe_otros_gastos: impD,
      importe_sin_iva: baseD,
      base_imponible: baseD,
      cuota_iva: cuotaD,
      iva_porcentaje: ivaPctD,
      subtipo_otros: "MANUTENCION",
    }, hgImpFacturaPersonasFields_("MANUTENCION", linea)),
      ctx
    );
  }

  // OTROS (incl. alquiler vehículo y líneas Otros Costes / LIFE consumibles)
  var impO = hgImpRound2_(Number(linea.importe || linea.importe_factura || linea.importe_estimado || 0)) || 0;
  var conceptoO = String(linea.concepto || "").trim();
  if (!conceptoO && linea.itinerario) conceptoO = "Alquiler vehículo: " + linea.itinerario;
  if (!conceptoO && !isLifeOtros) conceptoO = "Otros gastos";
  var baseO = linea.base_imponible != null ? hgImpRound2_(linea.base_imponible) : null;
  var cuotaO = linea.cuota_iva != null ? hgImpRound2_(linea.cuota_iva) : null;
  if (baseO == null && impO) baseO = impO;
  var ivaPctO = hgImpResolveIvaPctFromLinea_(linea);
  if (ivaPctO == null) ivaPctO = 21;
  var matO = isPropio || isOtrosCostes || isLifeOtros ? "OTROS" : String(linea.matricula || matHint || "OTROS").trim().toUpperCase();
  return hgImpStampViajeImportMeta_(
    Object.assign({}, base, {
    tipo_gasto: "OTROS",
    matricula: matO,
    fecha_otros_gastos: linea.fecha,
    concepto_otros_gastos: conceptoO,
    proveedor_otros_gastos: linea.proveedor || linea.medio || "Varios",
    concepto: conceptoO,
    proveedor: linea.proveedor || linea.medio || "Varios",
    coste_total: impO,
    importe_otros_gastos: impO,
    importe_sin_iva: baseO,
    base_imponible: baseO,
    cuota_iva: cuotaO,
    iva_porcentaje: ivaPctO,
  }, hgImpFacturaPersonasFields_("OTROS", linea)),
    ctx
  );
}

function hgImpNormalizePlantillaEsperada_(v) {
  var s = String(v || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return "";
  if (s === "VP" || s.indexOf("VEHICULO PROPIO") >= 0 || s === "VEHICULO_PROPIO") return "VEHICULO_PROPIO";
  if (s.indexOf("VEHICULOS GREFA") >= 0 || s === "VEHICULOS_GREFA" || s === "GREFA") return "VEHICULOS_GREFA";
  if (s.indexOf("OTROS COSTES") >= 0 || s === "OTROS_COSTES" || s === "OTROS") return "OTROS_COSTES";
  if (s.indexOf("LIFE") >= 0 && s.indexOf("OTROS") >= 0) return "LIFE_OTROS_GASTOS";
  if (s.indexOf("LIFE") >= 0 && s.indexOf("GREFA") >= 0) return "LIFE_VEHICULO_GREFA";
  if (s.indexOf("LIFE") >= 0 && s.indexOf("PROPIO") >= 0) return "LIFE_VEHICULO_PROPIO";
  if (s === "LIFE_OTROS_GASTOS" || s === "LIFE_OTROS") return "LIFE_OTROS_GASTOS";
  if (s === "LIFE_VEHICULO_GREFA" || s === "LIFE_VG") return "LIFE_VEHICULO_GREFA";
  if (s === "LIFE_VEHICULO_PROPIO" || s === "LIFE_VP") return "LIFE_VEHICULO_PROPIO";
  return String(v || "").trim().toUpperCase();
}

function hgImpPlantillaLabel_(id) {
  var labels = {
    VEHICULO_PROPIO: "Viaje con Vehículo Propio",
    VEHICULOS_GREFA: "Viaje con Vehículo Grefa",
    OTROS_COSTES: "Otros gastos",
    LIFE_VEHICULO_PROPIO: "LIFE · Vehículo propio",
    LIFE_VEHICULO_GREFA: "LIFE · Vehículo Grefa",
    LIFE_OTROS_GASTOS: "LIFE · Otros gastos",
  };
  return labels[id] || id;
}

function hgImpLineAdjKey_(linea) {
  var sec = String(linea && linea.seccion ? linea.seccion : "").trim();
  var fila = Number(linea && linea.fila_excel);
  if (!fila) return "";
  return sec ? sec + ":" + fila : String(fila);
}

function hgImpNormalizeAdjuntosPorLinea_(raw) {
  var map = {};
  if (!raw) return map;
  var arr = Array.isArray(raw) ? raw : [];
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i] || {};
    var sec = String(item.seccion || "").trim();
    var fila = Number(item.fila_excel);
    if (!fila) continue;
    var urls = normalizeMultiArray_(item.ticket_drive_urls || item.urls || item.ticket_drive_url);
    if (!urls.length) continue;
    var names = normalizeMultiArray_(item.ticket_drive_file_names || item.names || item.ticket_drive_file_name);
    var key = sec ? sec + ":" + fila : String(fila);
    map[key] = {
      ticket_drive_urls: urls,
      ticket_drive_file_names: ensureSameLen_(names, urls.length),
    };
  }
  return map;
}

function hgImpMergeAdjuntosLinea_(payload, linea, adjMap) {
  if (!adjMap || !linea) return payload;
  var key = hgImpLineAdjKey_(linea);
  var adj = key ? adjMap[key] : null;
  if (!adj || !adj.ticket_drive_urls || !adj.ticket_drive_urls.length) return payload;
  return Object.assign({}, payload, {
    ticket_drive_urls: adj.ticket_drive_urls,
    ticket_drive_file_names: adj.ticket_drive_file_names,
  });
}

function hgImpNormPersonName_(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function hgImpResolveTitularFromTrabajador_(trabajador, actorEmail) {
  actorEmail = normalizeEmail_(actorEmail);
  var warnings = [];
  var cod = String((trabajador && trabajador.cod_personal) || "")
    .trim()
    .toUpperCase();
  var nombre = String((trabajador && trabajador.nombre) || "").trim();
  var dni = String((trabajador && trabajador.dni) || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  var list = [];
  try {
    list = apiUsuariosList();
  } catch (eList) {
    warnings.push("No se pudo leer USUARIOS para resolver titular del Excel.");
  }

  var i;
  if (dni) {
    for (i = 0; i < list.length; i++) {
      var uDni = list[i];
      if (String(uDni.activo || "").trim().toUpperCase() !== "SI") continue;
      var dniUser = String(uDni.dni || uDni.DNI || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (dniUser && dniUser === dni) {
        return {
          email: normalizeEmail_(uDni.email),
          warnings: warnings,
          matchedBy: "dni",
          nombre: String(uDni.nombre || nombre || "").trim(),
        };
      }
    }
  }

  for (i = 0; i < list.length; i++) {
    var u = list[i];
    if (String(u.activo || "").trim().toUpperCase() !== "SI") continue;
    var uCod = String(u.cod_personal || u.COD_PERSONAL || u.Cod_Personal || "")
      .trim()
      .toUpperCase();
    if (cod && uCod && uCod === cod) {
      return {
        email: normalizeEmail_(u.email),
        warnings: warnings,
        matchedBy: "cod_personal",
        nombre: String(u.nombre || nombre || "").trim(),
      };
    }
  }

  var q = hgImpNormPersonName_(nombre);
  if (q) {
    for (i = 0; i < list.length; i++) {
      var u2 = list[i];
      if (String(u2.activo || "").trim().toUpperCase() !== "SI") continue;
      var n = hgImpNormPersonName_(u2.nombre);
      if (n && (n === q || n.indexOf(q) >= 0 || q.indexOf(n) >= 0)) {
        return {
          email: normalizeEmail_(u2.email),
          warnings: warnings,
          matchedBy: "nombre",
          nombre: String(u2.nombre || nombre || "").trim(),
        };
      }
    }
  }

  if (nombre || cod) {
    warnings.push(
      "No se encontró usuario activo para «" +
        (nombre || cod) +
        "»; los gastos se asignarán al importador."
    );
  }
  return { email: actorEmail, warnings: warnings, matchedBy: "", nombre: nombre };
}

function hgImpEnsureImportMetaColumns_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GASTOS");
  if (!sh) return;
  if (typeof ensureGastosBilletesColumns_ === "function") {
    ensureGastosBilletesColumns_();
  }
  ensureColumnsAtEnd_(sh, [
    "excel_import",
    "work_package",
    "accion_proyecto",
    "excel_fila",
    "excel_seccion",
    "excel_source_file_id",
    "excel_viaje_fecha_inicio",
    "excel_viaje_fecha_fin",
    "excel_viaje_origen",
    "excel_viaje_destino1",
    "excel_viaje_destino2",
    "excel_viaje_destino3",
    "excel_viaje_destino4",
    "excel_viaje_motivo",
    "excel_viaje_matricula",
    "excel_viaje_sin_km",
    "excel_viaje_dni",
    "excel_trabajador_nombre",
    "excel_trabajador_dni",
  ]);
}

function hgResolveHojaGastoDisplayNombre_(opts) {
  opts = opts || {};
  var excelNombre = String(opts.excel_trabajador_nombre || "").trim();
  if (excelNombre && excelNombre.indexOf("@") < 0) return excelNombre;
  var num = String(opts.num_hoja_gasto || opts.Num_Hoja_Gasto || "").trim();
  var marker = " R.G.T. ";
  var p = num.indexOf(marker);
  if (p >= 0) {
    var nameFromNum = num.slice(p + marker.length).split(" - ")[0].trim();
    if (nameFromNum) return nameFromNum;
  }
  var stored = String(opts.usuario_nombre || "").trim();
  if (stored && stored.indexOf("@") < 0) return stored;
  var email = String(opts.usuario_email || opts.responsable_email || "")
    .trim()
    .toLowerCase();
  if (email) {
    try {
      var u = apiUsuarioGet({ email: email });
      var n = String((u && u.nombre) || "").trim();
      if (n) return n;
    } catch (_) {}
  }
  return stored || excelNombre || "";
}

function hgImpFindDuplicateImport_(fileId, seccion, fila, responsableEmail) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GASTOS");
  if (!sh) return "";
  var rows = rowsToObjects_(sh);
  var fid = String(fileId || "").trim();
  var sec = String(seccion || "").trim();
  var rowNum = Number(fila);
  var owner = normalizeEmail_(responsableEmail);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.excel_import || "").trim().toUpperCase() !== "SI") continue;
    if (String(r.excel_source_file_id || "").trim() !== fid) continue;
    if (String(r.excel_seccion || "").trim() !== sec) continue;
    if (Number(r.excel_fila) !== rowNum) continue;
    if (normalizeEmail_(r.responsable_email) !== owner) continue;
    return String(r.id_gasto || "").trim();
  }
  return "";
}

function hgImpStampViajeImportMeta_(payload, ctx) {
  if (!payload || !ctx || !ctx.viaje || typeof ctx.viaje !== "object") return payload;
  var v = ctx.viaje;
  payload.excel_viaje_fecha_inicio = String(v.fecha_inicio || "").trim();
  payload.excel_viaje_fecha_fin = String(v.fecha_fin || "").trim();
  payload.excel_viaje_origen = String(v.origen || "").trim();
  payload.excel_viaje_destino1 = String(v.destino1 || "").trim();
  payload.excel_viaje_destino2 = String(v.destino2 || "").trim();
  payload.excel_viaje_destino3 = String(v.destino3 || "").trim();
  payload.excel_viaje_destino4 = String(v.destino4 || "").trim();
  payload.excel_viaje_motivo = String(v.motivo || "").trim();
  payload.excel_viaje_matricula = String(v.matricula || "").trim();
  payload.excel_viaje_dni = String(v.dni || "").trim();
  return payload;
}

function hgImpPlantillaCreatesViaje_(plantilla) {
  var p = String(plantilla || "").trim().toUpperCase();
  return (
    p === "LIFE_VEHICULO_GREFA" ||
    p === "LIFE_VEHICULO_PROPIO" ||
    p === "VEHICULOS_GREFA" ||
    p === "VEHICULO_PROPIO"
  );
}

function hgImpEnsureViajeImportCols_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("VIAJES_VEHICULO_PROPIO");
  if (!sh) return;
  ensureColumnsAtEnd_(sh, ["excel_import", "excel_source_file_id"]);
}

function hgImpViajeRowExists_(idViaje) {
  idViaje = String(idViaje || "").trim();
  if (!idViaje) return false;
  ensureProyectoModuleSheets_();
  var rows = rowsToObjects_(getSheet("VIAJES_VEHICULO_PROPIO"));
  return !!indexRowById_(rows, "id_viaje", idViaje);
}

function hgImpFindViajeFromExcelSource_(fileId, titularEmail) {
  ensureProyectoModuleSheets_();
  var sh = getSheet("VIAJES_VEHICULO_PROPIO");
  if (!sh) return "";
  var rows = rowsToObjects_(sh);
  var fid = String(fileId || "").trim();
  var owner = normalizeEmail_(titularEmail);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.excel_import || "").trim().toUpperCase() !== "SI") continue;
    if (String(r.excel_source_file_id || "").trim() !== fid) continue;
    if (owner && normalizeEmail_(r.usuario_email) !== owner) continue;
    var id = String(r.id_viaje || "").trim();
    if (id) return id;
  }
  return "";
}

function hgImpFindViajeFromPriorImport_(fileId, titularEmail) {
  var fromViaje = hgImpFindViajeFromExcelSource_(fileId, titularEmail);
  if (fromViaje && hgImpViajeRowExists_(fromViaje)) return fromViaje;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GASTOS");
  if (!sh) return "";
  var fid = String(fileId || "").trim();
  var owner = normalizeEmail_(titularEmail);
  var rows = rowsToObjects_(sh);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.excel_import || "").trim().toUpperCase() !== "SI") continue;
    if (String(r.excel_source_file_id || "").trim() !== fid) continue;
    if (normalizeEmail_(r.responsable_email) !== owner) continue;
    var idv = String(r.id_viaje_propio || "").trim();
    if (idv && hgImpViajeRowExists_(idv)) return idv;
  }
  return "";
}

function hgImpFirstLineWpAcc_(lineas) {
  var lines = Array.isArray(lineas) ? lineas : [];
  for (var i = 0; i < lines.length; i++) {
    var wp = String(lines[i].work_package || "").trim();
    var acc = String(lines[i].accion_proyecto || "").trim();
    if (wp || acc) return { work_package: wp, accion: acc };
  }
  return { work_package: "", accion: "" };
}

/** Crea (o reutiliza) un viaje en VIAJES_VEHICULO_PROPIO y devuelve id_viaje para enlazar gastos. */
function hgImpEnsureViajeForImport_(parsed, ctx) {
  var warnings = [];
  if (!hgImpPlantillaCreatesViaje_(parsed.plantilla)) {
    return { id_viaje: "", created: false, warnings: warnings };
  }
  var v = parsed.viaje;
  if (!v || typeof v !== "object") {
    return { id_viaje: "", created: false, warnings: warnings };
  }
  var fi = String(v.fecha_inicio || "").trim();
  var origen = String(v.origen || "").trim();
  var destino = String(v.destino1 || v.destino2 || v.destino3 || v.destino4 || "").trim();
  var motivo = String(v.motivo || "").trim();
  if (!fi && !origen && !destino && !motivo) {
    warnings.push("Cabecera de viaje vacía: los gastos se importarán sin viaje asociado.");
    return { id_viaje: "", created: false, warnings: warnings };
  }

  var existing = hgImpFindViajeFromPriorImport_(ctx.source_file_id, ctx.responsable_email);
  if (existing) {
    warnings.push("Viaje reutilizado de importación anterior: " + existing);
    return { id_viaje: existing, created: false, warnings: warnings };
  }

  var proyResolved = hgImpResolveProyectoForImport_(parsed, ctx);
  var idProyecto = String(proyResolved.id_proyecto || "").trim();
  if (!idProyecto) {
    warnings.push(
      "No se pudo crear viaje: proyecto no resuelto en el Excel (" +
        String((parsed.trabajador && parsed.trabajador.proyecto_texto) || ctx.proyecto_nombre || "sin texto") +
        ")."
    );
    return { id_viaje: "", created: false, warnings: warnings };
  }
  if (proyResolved.match === "keyword" || proyResolved.match === "partial") {
    warnings.push(
      "Proyecto del viaje emparejado (" +
        proyResolved.match +
        "): " +
        String(proyResolved.nombre_proyecto || idProyecto)
    );
  }

  var matricula = String(v.matricula || ctx.matricula_hint || "").trim().toUpperCase();
  if (!matricula) {
    var lines = parsed.lineas || [];
    for (var li = 0; li < lines.length; li++) {
      var m = String(lines[li].matricula || "").trim().toUpperCase();
      if (m && m !== "OTROS" && m !== "COLABORADOR") {
        matricula = m;
        break;
      }
    }
  }
  if (!matricula) matricula = "COLABORADOR";

  var wpAcc = hgImpFirstLineWpAcc_(parsed.lineas);
  var fechaViaje = hgImpNormalizeImportViajeFecha_(fi);
  if (!fechaViaje) fechaViaje = hgImpNormalizeImportViajeFecha_(new Date());
  var fechaCierreViaje = hgImpNormalizeImportViajeFecha_(v.fecha_fin || "");
  if (!origen) origen = "Import Excel";
  if (!destino) destino = origen;

  hgImpEnsureViajeImportCols_();
  try {
    var viajeRes = apiViajeVehiculoPropioCrear({
      user_email: ctx.actor_email,
      usuario_email: ctx.responsable_email,
      usuario_nombre: String(ctx.trabajador_nombre || (parsed.trabajador && parsed.trabajador.nombre) || "").trim(),
      fecha_viaje: fechaViaje,
      fecha_cierre: fechaCierreViaje,
      fecha_fin: fechaCierreViaje,
      origen: origen,
      destino: destino,
      km_inicial: 0,
      matricula: matricula,
      id_proyecto: idProyecto,
      proyecto_nombre:
        proyResolved.nombre_proyecto ||
        ctx.proyecto_nombre ||
        (parsed.trabajador && parsed.trabajador.proyecto_nombre) ||
        "",
      motivo: motivo,
      dni: String(v.dni || (parsed.trabajador && parsed.trabajador.dni) || "").trim().toUpperCase(),
      work_package: wpAcc.work_package,
      accion: wpAcc.accion,
      excel_import: "SI",
      excel_source_file_id: String(ctx.source_file_id || "").trim(),
    });
    var idViaje = String(viajeRes.id_viaje || "").trim();
    if (idViaje) {
      warnings.push(
        "Viaje creado ABIERTO (" +
          idViaje +
          "): " +
          fechaViaje +
          (origen ? " · " + origen : "") +
          (destino && destino !== origen ? " → " + destino : "") +
          ". Ciérralo en «Grabar viajes» cuando tengas km inicial y final."
      );
    }
    return { id_viaje: idViaje, created: !!idViaje, warnings: warnings };
  } catch (eViaje) {
    warnings.push(
      "No se pudo crear viaje: " + (eViaje && eViaje.message ? String(eViaje.message) : String(eViaje))
    );
    return { id_viaje: "", created: false, warnings: warnings };
  }
}

function hgImpPlantillaGenericToLife_(expected, detected) {
  if (expected === "VEHICULOS_GREFA" && detected === "LIFE_VEHICULO_GREFA") return true;
  if (expected === "VEHICULO_PROPIO" && detected === "LIFE_VEHICULO_PROPIO") return true;
  if (expected === "OTROS_COSTES" && detected === "LIFE_OTROS_GASTOS") return true;
  return false;
}

function hgImpPlantillaLifeToGeneric_(expected, detected) {
  if (expected === "LIFE_VEHICULO_GREFA" && detected === "VEHICULOS_GREFA") return true;
  if (expected === "LIFE_VEHICULO_PROPIO" && detected === "VEHICULO_PROPIO") return true;
  if (expected === "LIFE_OTROS_GASTOS" && detected === "OTROS_COSTES") return true;
  return false;
}

function hgImpAssertPlantillaEsperada_(expectedRaw, parsed) {
  var expected = hgImpNormalizePlantillaEsperada_(expectedRaw);
  if (!expected) return;
  var detected = String(parsed.plantilla || "").trim();
  if (!detected) throw new Error("No se pudo identificar la plantilla del Excel");
  if (expected === detected) return;

  if (hgImpPlantillaGenericToLife_(expected, detected)) {
    if (!parsed.warnings) parsed.warnings = [];
    parsed.warnings.push(
      "El Excel es plantilla LIFE (" +
        hgImpPlantillaLabel_(detected) +
        "). Se importó con el parser LIFE aunque seleccionaste " +
        hgImpPlantillaLabel_(expected) +
        "."
    );
    return;
  }

  var extra = "";
  if (hgImpPlantillaLifeToGeneric_(expected, detected)) {
    extra =
      " El archivo parece la plantilla estándar, no LIFE. Elige «Proyecto estándar (no LIFE)» en el paso 1.";
  } else if (expected === "LIFE_VEHICULO_GREFA" && detected === "VEHICULOS_GREFA") {
    extra =
      " El archivo parece la plantilla estándar GREFA. En el paso 1 elige «Proyecto estándar (no LIFE)».";
  } else if (expected === "LIFE_VEHICULO_PROPIO" && detected === "VEHICULO_PROPIO") {
    extra = " El archivo parece vehículo propio estándar, no LIFE.";
  } else if (expected === "LIFE_OTROS_GASTOS" && detected === "OTROS_COSTES") {
    extra = " El archivo parece otros costes estándar, no LIFE.";
  }

  var err = new Error(
    "El archivo no corresponde a la plantilla seleccionada. " +
      "Seleccionado: " +
      hgImpPlantillaLabel_(expected) +
      ". Detectado en el archivo: " +
      hgImpPlantillaLabel_(detected) +
      "." +
      extra
  );
  err.name = "PLANTILLA_MISMATCH";
  throw err;
}

function apiHojaGastoExcelPreview(payload) {
  payload = payload || {};
  var fileId = String(payload.file_id || payload.drive_file_id || "").trim();
  if (!fileId) throw new Error("Falta file_id del archivo Excel");

  var actor = normalizeEmail_(payload.user_email || payload.grabado_por_email || "");
  if (!actor) throw new Error("Falta user_email");
  requireRolImportExcelHojaGasto_(actor);

  var opened = hgImpOpenExcelAsTempSpreadsheet_(fileId);
  try {
    var parsed = hgImpDetectAndParse_(
      opened.ss,
      payload.plantilla_esperada || payload.expected_plantilla
    );
    hgImpAssertPlantillaEsperada_(payload.plantilla_esperada || payload.expected_plantilla, parsed);
    var titularResolved = hgImpResolveTitularFromTrabajador_(parsed.trabajador, actor);
    parsed.titular_email = titularResolved.email || actor;
    if (titularResolved.warnings && titularResolved.warnings.length) {
      parsed.warnings = (parsed.warnings || []).concat(titularResolved.warnings);
    }
    parsed.source_file_id = fileId;
    parsed.source_file_name = opened.sourceName;
    parsed.plantilla_esperada = hgImpNormalizePlantillaEsperada_(
      payload.plantilla_esperada || payload.expected_plantilla
    );
    return parsed;
  } finally {
    hgImpDeleteTempSpreadsheet_(opened.tempId);
  }
}

function apiHojaGastoExcelImport(payload) {
  payload = payload || {};
  var fileId = String(payload.file_id || payload.drive_file_id || "").trim();
  if (!fileId) throw new Error("Falta file_id del archivo Excel");

  var actor = normalizeEmail_(payload.user_email || payload.grabado_por_email || "");
  var titular = normalizeEmail_(payload.usuario_email || payload.responsable_email || actor);
  if (!titular) throw new Error("Falta usuario_email / responsable_email");
  if (!actor) throw new Error("Falta user_email");
  requireRolImportExcelHojaGasto_(actor);
  if (actor && actor !== titular) {
    requireRolGestorOrAdministracion_(actor);
  }

  var opened = hgImpOpenExcelAsTempSpreadsheet_(fileId);
  var created = [];
  var errors = [];
  try {
    var parsed = hgImpDetectAndParse_(
      opened.ss,
      payload.plantilla_esperada || payload.expected_plantilla
    );
    hgImpAssertPlantillaEsperada_(payload.plantilla_esperada || payload.expected_plantilla, parsed);
    var titularResolved = hgImpResolveTitularFromTrabajador_(parsed.trabajador, actor);
    var titularFinal = titularResolved.email || titular;
    if (titularFinal !== actor) {
      requireRolGestorOrAdministracion_(actor);
    }
    // Solo forzar titular distinto cuando el gestor importa explícitamente a nombre de otro usuario.
    var forced = normalizeEmail_(payload.usuario_email || payload.responsable_email || "");
    if (forced && forced !== actor) {
      requireRolGestorOrAdministracion_(actor);
      titularFinal = forced;
    } else if (titularResolved.email && titularResolved.matchedBy) {
      titularFinal = titularResolved.email;
    } else if (forced) {
      titularFinal = forced;
    }
    hgImpEnsureImportMetaColumns_();
    var importWarnings = Array.isArray(parsed.warnings) ? parsed.warnings.slice() : [];
    if (titularResolved.warnings && titularResolved.warnings.length) {
      importWarnings = importWarnings.concat(titularResolved.warnings);
    }
    if (titularResolved.matchedBy) {
      importWarnings.push(
        "Titular del Excel: " +
          (parsed.trabajador && parsed.trabajador.nombre ? parsed.trabajador.nombre : titularResolved.nombre) +
          " → " +
          titularFinal +
          " (" +
          titularResolved.matchedBy +
          ")"
      );
    }
    var proyResolved = hgImpResolveProyectoForImport_(parsed, {
      id_proyecto: parsed.trabajador.id_proyecto,
      proyecto_nombre: parsed.trabajador.proyecto_nombre,
    });
    if (proyResolved.id_proyecto && proyResolved.match && proyResolved.match !== "exact") {
      importWarnings.push(
        "Proyecto importación (" +
          proyResolved.match +
          "): " +
          String(proyResolved.nombre_proyecto || proyResolved.id_proyecto)
      );
    }
    var ctx = {
      actor_email: actor || titularFinal,
      responsable_email: titularFinal,
      trabajador_nombre: String(
        (parsed.trabajador && parsed.trabajador.nombre) || titularResolved.nombre || ""
      ).trim(),
      trabajador_dni: String((parsed.trabajador && parsed.trabajador.dni) || "").trim().toUpperCase(),
      proyecto_nombre: proyResolved.nombre_proyecto || parsed.trabajador.proyecto_nombre,
      id_proyecto: proyResolved.id_proyecto || parsed.trabajador.id_proyecto,
      tarifa_km: parsed.tarifa_km,
      plantilla: parsed.plantilla,
      hoja_gasto_modelo: parsed.hoja_gasto_modelo,
      life_familia: parsed.life_familia || "",
      matricula_hint: parsed.matricula_hint || "",
      source_file_id: fileId,
      viaje: parsed.viaje || null,
    };

    var viajeImport = hgImpEnsureViajeForImport_(parsed, ctx);
    if (viajeImport.warnings && viajeImport.warnings.length) {
      importWarnings = importWarnings.concat(viajeImport.warnings);
    }
    if (viajeImport.id_viaje) {
      ctx.id_viaje_propio = viajeImport.id_viaje;
    }

    if (payload.validar_dni === true || payload.validar_dni === "true") {
      var u = getUsuarioByEmail_(titularFinal);
      var dniUser = String(u && u.dni ? u.dni : "").trim().toUpperCase();
      var dniXls = String(parsed.trabajador.dni || "").trim().toUpperCase();
      if (dniUser && dniXls && dniUser !== dniXls) {
        throw new Error("El DNI del Excel (" + dniXls + ") no coincide con el usuario (" + dniUser + ")");
      }
    }

    var lineas = parsed.lineas || [];
    var adjMap = hgImpNormalizeAdjuntosPorLinea_(payload.adjuntos_por_linea);
    var skipped = [];
    for (var i = 0; i < lineas.length; i++) {
      try {
        var dupId = hgImpFindDuplicateImport_(
          fileId,
          lineas[i].seccion,
          lineas[i].fila_excel,
          titularFinal
        );
        if (dupId) {
          skipped.push({
            fila_excel: lineas[i].fila_excel,
            seccion: lineas[i].seccion,
            id_gasto: dupId,
            message: "Ya importado (duplicado omitido)",
          });
          continue;
        }
        var gastoPayload = hgImpBuildGastoPayload_(lineas[i], ctx);
        gastoPayload = hgImpMergeAdjuntosLinea_(gastoPayload, lineas[i], adjMap);
        var res = apiGastoCrear(gastoPayload);
        created.push({
          id_gasto: res.id_gasto || res.id || "",
          tipo_gasto: lineas[i].tipo_gasto,
          fecha: lineas[i].fecha,
          importe: lineas[i].importe_estimado,
          fila_excel: lineas[i].fila_excel,
          adjuntos: gastoPayload.ticket_drive_urls ? gastoPayload.ticket_drive_urls.length : 0,
        });
      } catch (eLine) {
        errors.push({
          fila_excel: lineas[i].fila_excel,
          seccion: lineas[i].seccion,
          message: eLine && eLine.message ? String(eLine.message) : String(eLine),
        });
      }
    }

    return {
      plantilla: parsed.plantilla,
      source_file_id: fileId,
      source_file_name: opened.sourceName,
      trabajador: parsed.trabajador,
      viaje: Object.assign({}, parsed.viaje || {}, {
        id_viaje: ctx.id_viaje_propio || viajeImport.id_viaje || "",
      }),
      id_viaje_propio: ctx.id_viaje_propio || viajeImport.id_viaje || "",
      titular_email: titularFinal,
      resumen: parsed.resumen,
      warnings: importWarnings,
      gastos_creados: created,
      errores: errors,
      omitidos_duplicados: skipped,
      importados: created.length,
      fallidos: errors.length,
      omitidos: skipped.length,
    };
  } finally {
    hgImpDeleteTempSpreadsheet_(opened.tempId);
  }
}
