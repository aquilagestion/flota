// ======================================================================
// 19_hoja_gasto_estado_en_gastos.gs
// Actualiza columnas de hoja de gasto en la pestaña GASTOS
// usando id_gasto (sin crear tablas nuevas).
// ======================================================================

function apiHojaGastoActualizarGastos(payload) {
  payload = payload || {};
  var hojaId = String(payload.hoja_gasto_id || payload.hoja_id_local || "").trim();
  if (!hojaId) throw new Error("Falta campo: hoja_gasto_id / hoja_id_local");
  var numHoja = String(payload.num_hoja_gasto || payload.Num_Hoja_Gasto || "").trim();

  var estado = String(payload.hoja_gasto_estado || payload.estado || "ENVIADA").trim().toUpperCase();
  var fechaEnvioRaw = String(
    payload.hoja_gasto_fecha_envio || payload.fecha_hoja || payload.fecha_firma || payload.createdAtLocal || ""
  ).trim();
  var fechaEnvio = normalizeDateDMYCell_(fechaEnvioRaw || new Date());
  var total = Number(payload.hoja_gasto_total || payload.total_importe || 0) || 0;
  var obs = String(payload.hoja_gasto_observaciones || payload.observaciones || "").trim();
  var revisadoPor = String(payload.hoja_gasto_revisado_por || "").trim();
  var fechaRevision = String(payload.hoja_gasto_fecha_revision || "").trim();
  if (fechaRevision) fechaRevision = normalizeDateDMYCell_(fechaRevision);
  var motivoRechazo = String(payload.hoja_gasto_motivo_rechazo || "").trim();

  var lineas = payload.lineas;
  if (typeof lineas === "string") {
    try {
      lineas = JSON.parse(lineas);
    } catch (_) {
      lineas = [];
    }
  }
  if (!Array.isArray(lineas) || !lineas.length) throw new Error("Falta campo: lineas[]");

  var idSet = {};
  for (var i = 0; i < lineas.length; i++) {
    // Solo IDs remotos de gasto (GAS...). Nunca expense_id local (timestamps).
    var idg = String((lineas[i] && lineas[i].id_gasto) || "").trim();
    if (!idg) continue;
    if (!/^GAS/i.test(idg)) continue;
    idSet[idg] = true;
  }
  var ids = Object.keys(idSet);
  if (!ids.length) {
    throw new Error(
      "lineas[] sin id_gasto remoto (GAS...). Sincroniza primero los gastos individuales y vuelve a enviar la hoja."
    );
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) throw new Error("GASTOS no tiene datos");

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c + 1;
  var idxNorm = {};
  for (var c2 = 0; c2 < headers.length; c2++) {
    var raw = String(headers[c2] || "").trim();
    var norm = raw.toLowerCase().replace(/\s+/g, "_");
    if (norm) idxNorm[norm] = c2 + 1;
  }

  function need(col) {
    var exact = idx[col];
    if (exact) return exact;
    var norm = String(col || "").trim().toLowerCase().replace(/\s+/g, "_");
    var byNorm = idxNorm[norm];
    if (byNorm) return byNorm;
    throw new Error("Falta columna en GASTOS: " + col);
  }

  var colId = need("id_gasto");
  var colHoja = need("hoja_gasto_id");
  var colNumHoja = need("Num_Hoja_Gasto");
  var colEstado = need("hoja_gasto_estado");
  var colFechaEnvio = need("hoja_gasto_fecha_envio");
  var colTotal = need("hoja_gasto_total");
  var colObs = need("hoja_gasto_observaciones");
  var colRev = need("hoja_gasto_revisado_por");
  var colFechaRev = need("hoja_gasto_fecha_revision");
  var colMotivo = need("hoja_gasto_motivo_rechazo");

  function toRoman_(n) {
    var num = Number(n || 0);
    if (!num || num < 1) return "";
    var map = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    var out = "";
    var v = Math.floor(num);
    for (var iR = 0; iR < map.length; iR++) {
      while (v >= map[iR][0]) {
        out += map[iR][1];
        v -= map[iR][0];
      }
    }
    return out;
  }

  function parseDateParts_(iso) {
    var raw = String(iso || "").trim();
    // dd/mm/aaaa (fecha de hoja / pie)
    var slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      var ddS = String(Number(slash[1]));
      var mmS = String(Number(slash[2]));
      if (ddS.length < 2) ddS = "0" + ddS;
      if (mmS.length < 2) mmS = "0" + mmS;
      return { yyyy: slash[3], mm: mmS, dd: ddS };
    }
    var d = raw ? new Date(raw) : new Date();
    if (!d || isNaN(d.getTime())) d = new Date();
    var yyyy = String(d.getFullYear());
    var mm = String(d.getMonth() + 1);
    if (mm.length < 2) mm = "0" + mm;
    var dd = String(d.getDate());
    if (dd.length < 2) dd = "0" + dd;
    return { yyyy: yyyy, mm: mm, dd: dd };
  }

  function normalizeName_(name, email) {
    var n = String(name || "").trim();
    if (n && n.indexOf("@") >= 0) n = "";
    if (!n) {
      try {
        var u = apiUsuarioGet({ email: String(email || "").trim().toLowerCase() });
        n = String((u && u.nombre) || "").trim();
      } catch (_) {
        // fallback local-part
      }
    }
    if (!n) {
      var local = String(email || "").trim().toLowerCase().split("@")[0] || "";
      n = local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
      n = n.replace(/\b([a-z])/g, function (m, p1) {
        return p1.toUpperCase();
      });
    }
    return n || "Usuario";
  }

  function codPersonalFromUsuario_(email, payloadCod) {
    var fromPayload = String(payloadCod || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (fromPayload) return fromPayload;
    try {
      var u = apiUsuarioGet({ email: String(email || "").trim().toLowerCase() });
      var cod = String((u && (u.cod_personal || u.COD_PERSONAL || u.Cod_Personal)) || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (cod) return cod;
    } catch (_) {}
    var name = normalizeName_(payload.usuario_nombre, email);
    var initials = "";
    try {
      var stop = { de: 1, del: 1, la: 1, los: 1, las: 1, y: 1, e: 1 };
      var words = String(name || "")
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .map(function (w) {
          return String(w || "").trim();
        })
        .filter(function (w) {
          return w && !stop[w.toLowerCase()];
        });
      var pick = words.length === 4 ? [words[0], words[2], words[3]] : words.slice(0, 3);
      initials = pick
        .map(function (w) {
          return (w[0] || "").toUpperCase();
        })
        .join("");
    } catch (_) {
      initials = "";
    }
    return initials || "XXX";
  }

  /** Acepta T|OG|O|AL|ED|VET|C-MES-AÑO-COD y legacy R.G.T. */
  function isValidExpenseSheetNum_(num) {
    var s = String(num || "").trim();
    if (!s || /^HG-/i.test(s)) return false;
    if (/^(T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+(\s*-\s*[IVXLCDM]+)?$/i.test(s)) return true;
    if (/^\d{4}_\d{4}\sR\.G\.T\.\s/i.test(s)) return true;
    if (/^R\.G\.T\.\s/i.test(s)) return true;
    return false;
  }

  function sheetNumBase_(num) {
    var m = String(num || "").trim().match(/^((?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+)/i);
    return m ? String(m[1]).toUpperCase() : "";
  }

  function formatSheetNumSeq_(prefix, seq) {
    var base = String(prefix || "").trim();
    var n = Number(seq || 0);
    if (!base) return "";
    if (!n || n <= 1) return base;
    return base + " - " + toRoman_(n);
  }

  function gastoFechaMs_(rowObj) {
    // Preferir la fecha canónica / tipada del gasto (no promediar basura de otras columnas).
    var tipo = String(rowObj.tipo_gasto || "").trim().toUpperCase();
    var byTipo = {
      COMBUSTIBLES: "fecha_repostaje",
      PEAJES: "fecha_peaje",
      PARKING: "fecha_aparcamiento",
      HOSPEDAJE: "fecha_otros_gastos",
      MANUTENCION: "fecha_otros_gastos",
      ITV: "fecha_inspeccion",
      REPUESTOS_RECAMBIO: "fecha_compra_repuestos",
      MANTENIMIENTO_REPARACIONES: "fecha_compra_mantenimiento",
      OTROS: "fecha_otros_gastos",
      MULTAS_SANCIONES: "fecha_multa",
      MULTAS: "fecha_multa",
      KILOMETRAJE_COLABORADOR: "fecha_viaje_colaborador",
      SEGURO: "fecha_inicio_seguro",
      SEGUROS: "fecha_inicio_seguro",
      IMPUESTOS: "periodo_ivm",
      OTROS_IMPUESTOS: "fecha_pago",
    };
    var preferred = [];
    if (byTipo[tipo]) preferred.push(byTipo[tipo]);
    preferred.push("fecha");
    preferred.push(
      "fecha_repostaje",
      "fecha_peaje",
      "fecha_aparcamiento",
      "fecha_inspeccion",
      "fecha_otros_gastos",
      "fecha_multa",
      "fecha_compra_mantenimiento",
      "fecha_compra_repuestos",
      "fecha_viaje_colaborador",
      "fecha_inicio_seguro",
      "fecha_pago",
      "periodo_ivm"
    );
    var seen = {};
    for (var ki = 0; ki < preferred.length; ki++) {
      var key = preferred[ki];
      if (seen[key]) continue;
      seen[key] = true;
      var raw = rowObj[key];
      if (raw === "" || raw == null) continue;
      var d = null;
      try {
        d = parseFechaFlexible_(raw);
      } catch (_) {
        d = null;
      }
      if (d && !isNaN(d.getTime())) return d.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  }

  /** Fecha de emisión de la hoja (pie). MAX_SAFE_INTEGER si falta. */
  function hojaEmisionMs_(rowObj) {
    var preferred = [
      "hoja_gasto_fecha_hoja",
      "hoja_gasto_fecha_firma",
      "hoja_gasto_fecha_envio",
    ];
    for (var ki = 0; ki < preferred.length; ki++) {
      var raw = rowObj[preferred[ki]];
      if (raw === "" || raw == null) continue;
      var d = null;
      try {
        d = parseFechaFlexible_(raw);
      } catch (_) {
        d = null;
      }
      if (d && !isNaN(d.getTime())) return d.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  }

  /**
   * Renumerar hojas del mismo prefijo (mes+COD) por fecha de emisión (pie).
   * 1.ª = prefijo; 2.ª = prefijo - II; … Respaldo: fecha de gasto más antigua.
   */
  function renumberSiblingHojasByOldestExpense_(basePrefix, focusHojaId) {
    var base = String(basePrefix || "").trim().toUpperCase();
    var focus = String(focusHojaId || "").trim();
    if (!base) return { numByHoja: {}, focusNum: "" };

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return { numByHoja: {}, focusNum: "" };
    var hdrs = data[0];
    var hIdx = {};
    for (var hc = 0; hc < hdrs.length; hc++) {
      hIdx[String(hdrs[hc] || "").trim()] = hc;
    }
    function cell(rowArr, name) {
      var i = hIdx[name];
      return i == null ? "" : rowArr[i];
    }

    var groups = {}; // hojaId -> { emMs, minGastoMs, rowNums: [] }
    for (var r = 1; r < data.length; r++) {
      var rowArr = data[r];
      var hid = String(cell(rowArr, "hoja_gasto_id") || "").trim();
      if (!hid) continue;
      var numCell = String(cell(rowArr, "Num_Hoja_Gasto") || cell(rowArr, "num_hoja_gasto") || "").trim();
      var rowBase = sheetNumBase_(numCell);
      var include = false;
      if (hid === focus) include = true;
      else if (rowBase && rowBase === base) include = true;
      if (!include) continue;

      var rowObj = {};
      for (var hk in hIdx) {
        if (!Object.prototype.hasOwnProperty.call(hIdx, hk)) continue;
        rowObj[hk] = rowArr[hIdx[hk]];
      }
      var emMs = hojaEmisionMs_(rowObj);
      var gastoMs = gastoFechaMs_(rowObj);
      if (!groups[hid]) groups[hid] = { emMs: emMs, minGastoMs: gastoMs, rowNums: [] };
      if (emMs < groups[hid].emMs) groups[hid].emMs = emMs;
      if (gastoMs < groups[hid].minGastoMs) groups[hid].minGastoMs = gastoMs;
      groups[hid].rowNums.push(r + 1); // 1-based sheet row
    }

    function sortKey_(g) {
      if (g.emMs < Number.MAX_SAFE_INTEGER) return g.emMs;
      return g.minGastoMs;
    }

    var ids = Object.keys(groups);
    ids.sort(function (a, b) {
      var am = sortKey_(groups[a]);
      var bm = sortKey_(groups[b]);
      if (am !== bm) return am - bm;
      return String(a).localeCompare(String(b));
    });

    var numByHoja = {};
    for (var si = 0; si < ids.length; si++) {
      var assigned = formatSheetNumSeq_(base, si + 1);
      numByHoja[ids[si]] = assigned;
      var rowsOf = groups[ids[si]].rowNums || [];
      for (var ri = 0; ri < rowsOf.length; ri++) {
        sh.getRange(rowsOf[ri], colNumHoja).setValue(assigned);
      }
    }
    return { numByHoja: numByHoja, focusNum: numByHoja[focus] || "" };
  }

  var badNumHoja = !isValidExpenseSheetNum_(numHoja);
  var computedPrefix = "";
  if (badNumHoja) {
    // Preferir fecha de la hoja (pie); si no, fecha de envío/creación.
    var dateParts = parseDateParts_(
      payload.fecha_hoja ||
        payload.fecha_firma ||
        payload.hoja_gasto_fecha_hoja ||
        payload.hoja_gasto_fecha_firma ||
        payload.createdAtLocal ||
        payload.hoja_gasto_fecha_envio ||
        fechaEnvio
    );
    var cod = codPersonalFromUsuario_(payload.usuario_email, payload.cod_personal);
    var letterPref = String(payload.hoja_gasto_prefijo || payload.letter_prefix || "").trim().toUpperCase();
    if (!/^(T|OG|O|AL|ED|VET|C)$/.test(letterPref)) {
      var mLetter = String(numHoja || "").match(/^(T|OG|O|AL|ED|VET|C)-/i);
      letterPref = mLetter ? String(mLetter[1]).toUpperCase() : "T";
    }
    computedPrefix = letterPref + "-" + dateParts.mm + "-" + dateParts.yyyy + "-" + cod;
    // Número provisional; la renumeración por fecha de emisión asigna I/II/III.
    numHoja = computedPrefix;
  } else {
    var mBase = String(numHoja || "").match(/^((?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+)/i);
    computedPrefix = mBase ? String(mBase[1]).toUpperCase() : "";
  }

  var idVals = sh.getRange(2, colId, lastRow, 1).getValues();
  var updated = 0;
  var alreadyPresent = 0;
  var notFound = [];
  var foundMap = {};

  for (var r = 0; r < idVals.length; r++) {
    var rid = String(idVals[r][0] || "").trim();
    if (!rid || !idSet[rid]) continue;
    var row = r + 2;
    var currentHoja = String(sh.getRange(row, colHoja).getValue() || "").trim();
    var currentNumHoja = String(sh.getRange(row, colNumHoja).getValue() || "").trim();

    // Regla: solo sincronizar datos que no existan en el sheet.
    // Si la fila ya tiene hoja_gasto_id (misma o distinta), no se pisan datos.
    // Excepción: si falta Num_Hoja_Gasto y la fila ya pertenece a esta hoja, se completa.
    if (!currentHoja) {
      sh.getRange(row, colHoja).setValue(hojaId);
      sh.getRange(row, colNumHoja).setValue(numHoja);
      sh.getRange(row, colEstado).setValue(estado);
      sh.getRange(row, colFechaEnvio).setValue(fechaEnvio);
      sh.getRange(row, colTotal).setValue(total);
      sh.getRange(row, colObs).setValue(obs);
      sh.getRange(row, colRev).setValue(revisadoPor);
      sh.getRange(row, colFechaRev).setValue(fechaRevision);
      sh.getRange(row, colMotivo).setValue(motivoRechazo);
      updated++;
    } else if (currentHoja === hojaId) {
      // Completar/corregir nº: HG- local, vacío, legacy R.G.T., o renumeración (I/II/III).
      var wrongNum =
        !currentNumHoja ||
        currentNumHoja === currentHoja ||
        /^HG-\d{8}-/i.test(currentNumHoja) ||
        (!isValidExpenseSheetNum_(currentNumHoja) && isValidExpenseSheetNum_(numHoja)) ||
        (/R\.G\.T\./i.test(currentNumHoja) && /^T-\d{2}-\d{4}-/i.test(numHoja)) ||
        (numHoja && currentNumHoja !== numHoja);
      if (wrongNum && numHoja) sh.getRange(row, colNumHoja).setValue(numHoja);
      alreadyPresent++;
    } else {
      // Ya pertenece a otra hoja de gasto: no sobrescribir.
      alreadyPresent++;
    }

    foundMap[rid] = true;
  }

  for (var k = 0; k < ids.length; k++) {
    if (!foundMap[ids[k]]) notFound.push(ids[k]);
  }

  // Tras vincular: ordenar I / II / III por fecha de emisión de la hoja (no por creación).
  var baseForRenum = computedPrefix || sheetNumBase_(numHoja);
  var renum = { numByHoja: {}, focusNum: "" };
  if (baseForRenum) {
    renum = renumberSiblingHojasByOldestExpense_(baseForRenum, hojaId);
    if (renum.focusNum) numHoja = renum.focusNum;
  }

  return {
    hoja_gasto_id: hojaId,
    num_hoja_gasto: numHoja,
    renumbered: renum.numByHoja || {},
    estado: estado,
    updated: updated,
    already_present: alreadyPresent,
    requested: ids.length,
    not_found_ids: notFound,
  };
}

/**
 * Renumerar todas las hojas con el mismo prefijo T-MM-AAAA-COD
 * según la fecha de emisión (pie) (1.ª sin sufijo, 2.ª - II, …).
 * Respaldo: fecha de gasto más antigua. Útil para reparar numeraciones incorrectas.
 */
function apiHojaGastoRenumerarPorPrefijo(payload) {
  payload = payload || {};
  var raw = String(payload.prefix || payload.num_hoja_gasto || payload.Num_Hoja_Gasto || "").trim();
  var m = raw.match(/^((?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+)/i);
  var base = m ? String(m[1]).toUpperCase() : "";
  if (!base) throw new Error("Falta prefix (ej. T-06-2026-JCL)");

  var sh = getSheet("GASTOS");
  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) return { prefix: base, renumbered: {}, hojas: 0 };

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) idx[String(headers[c] || "").trim()] = c + 1;
  var colNumHoja = idx["Num_Hoja_Gasto"] || idx["num_hoja_gasto"];
  var colHoja = idx["hoja_gasto_id"];
  if (!colNumHoja || !colHoja) throw new Error("Faltan columnas hoja_gasto_id / Num_Hoja_Gasto");

  function toRoman_(n) {
    var num = Number(n || 0);
    if (!num || num < 1) return "";
    var map = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    var out = "";
    var v = Math.floor(num);
    for (var iR = 0; iR < map.length; iR++) {
      while (v >= map[iR][0]) {
        out += map[iR][1];
        v -= map[iR][0];
      }
    }
    return out;
  }

  function sheetNumBase_(num) {
    var mm = String(num || "").trim().match(/^((?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+)/i);
    return mm ? String(mm[1]).toUpperCase() : "";
  }

  function formatSheetNumSeq_(prefix, seq) {
    var b = String(prefix || "").trim();
    var n = Number(seq || 0);
    if (!b) return "";
    if (!n || n <= 1) return b;
    return b + " - " + toRoman_(n);
  }

  function gastoFechaMs_(rowObj) {
    var tipo = String(rowObj.tipo_gasto || "").trim().toUpperCase();
    var byTipo = {
      COMBUSTIBLES: "fecha_repostaje",
      PEAJES: "fecha_peaje",
      PARKING: "fecha_aparcamiento",
      HOSPEDAJE: "fecha_otros_gastos",
      MANUTENCION: "fecha_otros_gastos",
      ITV: "fecha_inspeccion",
      REPUESTOS_RECAMBIO: "fecha_compra_repuestos",
      MANTENIMIENTO_REPARACIONES: "fecha_compra_mantenimiento",
      OTROS: "fecha_otros_gastos",
      MULTAS_SANCIONES: "fecha_multa",
      MULTAS: "fecha_multa",
      KILOMETRAJE_COLABORADOR: "fecha_viaje_colaborador",
    };
    var preferred = [];
    if (byTipo[tipo]) preferred.push(byTipo[tipo]);
    preferred.push("fecha", "fecha_repostaje", "fecha_peaje", "fecha_aparcamiento", "fecha_inspeccion", "fecha_otros_gastos", "fecha_compra_mantenimiento", "fecha_compra_repuestos", "fecha_viaje_colaborador");
    var seen = {};
    for (var ki = 0; ki < preferred.length; ki++) {
      var key = preferred[ki];
      if (seen[key]) continue;
      seen[key] = true;
      var raw = rowObj[key];
      if (raw === "" || raw == null) continue;
      var d = null;
      try {
        d = parseFechaFlexible_(raw);
      } catch (_) {
        d = null;
      }
      if (d && !isNaN(d.getTime())) return d.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function hojaEmisionMs_(rowObj) {
    var preferred = [
      "hoja_gasto_fecha_hoja",
      "hoja_gasto_fecha_firma",
      "hoja_gasto_fecha_envio",
    ];
    for (var ki = 0; ki < preferred.length; ki++) {
      var raw = rowObj[preferred[ki]];
      if (raw === "" || raw == null) continue;
      var d = null;
      try {
        d = parseFechaFlexible_(raw);
      } catch (_) {
        d = null;
      }
      if (d && !isNaN(d.getTime())) return d.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  }

  var data = sh.getDataRange().getValues();
  var hdrs = data[0];
  var hIdx = {};
  for (var hc = 0; hc < hdrs.length; hc++) hIdx[String(hdrs[hc] || "").trim()] = hc;
  function cell(rowArr, name) {
    var i = hIdx[name];
    return i == null ? "" : rowArr[i];
  }

  var groups = {};
  for (var r = 1; r < data.length; r++) {
    var rowArr = data[r];
    var hid = String(cell(rowArr, "hoja_gasto_id") || "").trim();
    if (!hid) continue;
    var numCell = String(cell(rowArr, "Num_Hoja_Gasto") || cell(rowArr, "num_hoja_gasto") || "").trim();
    var rowBase = sheetNumBase_(numCell);
    if (!rowBase || rowBase !== base) continue;
    var rowObj = {};
    for (var hk in hIdx) {
      if (!Object.prototype.hasOwnProperty.call(hIdx, hk)) continue;
      rowObj[hk] = rowArr[hIdx[hk]];
    }
    var emMs = hojaEmisionMs_(rowObj);
    var gastoMs = gastoFechaMs_(rowObj);
    if (!groups[hid]) groups[hid] = { emMs: emMs, minGastoMs: gastoMs, rowNums: [] };
    if (emMs < groups[hid].emMs) groups[hid].emMs = emMs;
    if (gastoMs < groups[hid].minGastoMs) groups[hid].minGastoMs = gastoMs;
    groups[hid].rowNums.push(r + 1);
  }

  function sortKey_(g) {
    if (g.emMs < Number.MAX_SAFE_INTEGER) return g.emMs;
    return g.minGastoMs;
  }

  var ids = Object.keys(groups);
  ids.sort(function (a, b) {
    var am = sortKey_(groups[a]);
    var bm = sortKey_(groups[b]);
    if (am !== bm) return am - bm;
    return String(a).localeCompare(String(b));
  });

  var numByHoja = {};
  for (var si = 0; si < ids.length; si++) {
    var assigned = formatSheetNumSeq_(base, si + 1);
    numByHoja[ids[si]] = assigned;
    var rowsOf = groups[ids[si]].rowNums || [];
    for (var ri = 0; ri < rowsOf.length; ri++) {
      sh.getRange(rowsOf[ri], colNumHoja).setValue(assigned);
    }
  }
  return { prefix: base, renumbered: numByHoja, hojas: ids.length };
}