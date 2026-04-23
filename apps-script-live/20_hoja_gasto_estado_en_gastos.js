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
  var fechaEnvio = String(payload.hoja_gasto_fecha_envio || payload.createdAtLocal || new Date().toISOString()).trim();
  var total = Number(payload.hoja_gasto_total || payload.total_importe || 0) || 0;
  var obs = String(payload.hoja_gasto_observaciones || payload.observaciones || "").trim();
  var revisadoPor = String(payload.hoja_gasto_revisado_por || "").trim();
  var fechaRevision = String(payload.hoja_gasto_fecha_revision || "").trim();
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
    var idg = String((lineas[i] && (lineas[i].id_gasto || lineas[i].expense_id)) || "").trim();
    if (idg) idSet[idg] = true;
  }
  var ids = Object.keys(idSet);
  if (!ids.length) throw new Error("lineas[] sin id_gasto/expense_id");

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
      n = n.replace(/\b([a-z])/g, function(m, p1) { return p1.toUpperCase(); });
    }
    return n || "Usuario";
  }

  var badNumHoja = !numHoja || /^HG-\d{8}-/i.test(numHoja) || !/^\d{4}_\d{4}\sR\.G\.T\.\s/i.test(numHoja);
  if (badNumHoja) {
    var dateParts = parseDateParts_(payload.createdAtLocal || payload.hoja_gasto_fecha_envio || fechaEnvio);
    var person = normalizeName_(payload.usuario_nombre, payload.usuario_email);
    var prefix = dateParts.yyyy + "_" + dateParts.mm + dateParts.dd + " R.G.T. " + person;
    var existingNums = sh.getRange(2, colNumHoja, Math.max(0, lastRow - 1), 1).getValues();
    var maxSeq = 0;
    for (var z = 0; z < existingNums.length; z++) {
      var cell = String((existingNums[z] && existingNums[z][0]) || "").trim();
      if (!cell) continue;
      if (cell === prefix) {
        if (maxSeq < 1) maxSeq = 1;
        continue;
      }
      var pref = prefix + " - ";
      if (cell.indexOf(pref) !== 0) continue;
      var roman = String(cell.slice(pref.length) || "").trim().toUpperCase();
      var romanMap = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      var totalRoman = 0;
      var prevRoman = 0;
      for (var r2 = roman.length - 1; r2 >= 0; r2--) {
        var currRoman = romanMap[roman[r2]] || 0;
        if (!currRoman) { totalRoman = 0; break; }
        if (currRoman < prevRoman) totalRoman -= currRoman;
        else { totalRoman += currRoman; prevRoman = currRoman; }
      }
      if (totalRoman > maxSeq) maxSeq = totalRoman;
    }
    var nextSeq = maxSeq + 1;
    numHoja = nextSeq <= 1 ? prefix : (prefix + " - " + toRoman_(nextSeq));
  }

  var idVals = sh.getRange(2, colId, lastRow - 1, 1).getValues();
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
      var wrongNum = !currentNumHoja || currentNumHoja === currentHoja || /^HG-\d{8}-/i.test(currentNumHoja);
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

  return {
    hoja_gasto_id: hojaId,
    num_hoja_gasto: numHoja,
    estado: estado,
    updated: updated,
    already_present: alreadyPresent,
    requested: ids.length,
    not_found_ids: notFound,
  };
}