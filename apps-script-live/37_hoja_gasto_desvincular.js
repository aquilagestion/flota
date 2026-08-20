// ======================================================================
// 37_hoja_gasto_desvincular.js
// Desvincula gastos de una hoja (reabrir parcial o total) si no está pagada.
// ======================================================================

/**
 * Puede modificar (desvincular) una hoja no pagada:
 * - GESTOR / ADMINISTRACION: todas
 * - RESPONSABLE: propias o con líneas en matrículas a su cargo
 * - OPERARIO / USUARIO / COLABORADOR: solo propias
 */
function puedeModificarHojaGasto_(requesterEmail, ownerEmail, matriculasMap) {
  var req = normalizeEmail_(requesterEmail);
  if (!req) return false;

  var rol = getRolUsuarioHojas_(req);
  if (!rol) return false;
  if (rol === "GESTOR" || rol === "ADMINISTRACION") return true;

  var owner = normalizeEmail_(ownerEmail);
  if (owner && owner === req) return true;

  if (rol === "RESPONSABLE") {
    var assigned = getMatriculasACargo_(req);
    matriculasMap = matriculasMap || {};
    for (var mat in matriculasMap) {
      if (!Object.prototype.hasOwnProperty.call(matriculasMap, mat)) continue;
      if (matriculasMap[mat] && assigned[mat]) return true;
    }
  }
  return false;
}

function requirePuedeModificarHojaGasto_(actorEmail, hojaId) {
  var actor = String(actorEmail || "").trim().toLowerCase();
  if (!actor) throw new Error("Falta user_email");

  var meta = getHojaGastoMeta_(hojaId);
  if (!meta) throw new Error("Hoja de gasto no encontrada: " + hojaId);

  if (!puedeModificarHojaGasto_(actor, meta.ownerEmail, meta.matriculasMap)) {
    throw new Error("Permisos insuficientes: no puedes modificar esta hoja de gasto");
  }
}

/**
 * payload:
 *  - hoja_gasto_id / hoja_id_local
 *  - user_email
 *  - reopen_all: true → desvincula todos los gastos de la hoja
 *  - id_gastos: string[] (GAS...) cuando reopen_all es false
 */
function apiHojaGastoDesvincularGastos(payload) {
  payload = payload || {};

  var actor = String(
    payload.user_email || payload.usuario_email || payload.responsable_email || ""
  )
    .trim()
    .toLowerCase();
  var hojaId = String(payload.hoja_gasto_id || payload.hoja_id_local || "").trim();
  if (!hojaId) throw new Error("Falta campo: hoja_gasto_id / hoja_id_local");

  requirePuedeModificarHojaGasto_(actor, hojaId);

  var reopenAll = !!payload.reopen_all || !!payload.reabrir_todo;
  var rawIds = payload.id_gastos || payload.ids || payload.lineas || [];
  if (typeof rawIds === "string") {
    try {
      rawIds = JSON.parse(rawIds);
    } catch (_) {
      rawIds = String(rawIds)
        .split(",")
        .map(function (x) {
          return String(x || "").trim();
        });
    }
  }
  if (!Array.isArray(rawIds)) rawIds = [];

  var idSet = {};
  if (!reopenAll) {
    for (var i = 0; i < rawIds.length; i++) {
      var item = rawIds[i];
      var idg = "";
      if (item && typeof item === "object") {
        idg = String(item.id_gasto || item.id || "").trim();
      } else {
        idg = String(item || "").trim();
      }
      if (!idg || !/^GAS/i.test(idg)) continue;
      idSet[idg] = true;
    }
    if (!Object.keys(idSet).length) {
      throw new Error("Indica id_gastos (GAS...) o reopen_all=true");
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("GASTOS");
  if (!sh) throw new Error("No existe la pestaña GASTOS");

  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 1 || lastRow < 2) throw new Error("GASTOS no tiene datos");

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  var idxNorm = {};
  for (var c = 0; c < headers.length; c++) {
    var raw = String(headers[c] || "").trim();
    idx[raw] = c + 1;
    var norm = raw.toLowerCase().replace(/\s+/g, "_");
    if (norm) idxNorm[norm] = c + 1;
  }

  function need(col) {
    var exact = idx[col];
    if (exact) return exact;
    var n = String(col || "").trim().toLowerCase().replace(/\s+/g, "_");
    var byNorm = idxNorm[n];
    if (byNorm) return byNorm;
    throw new Error("Falta columna en GASTOS: " + col);
  }

  function opt(col) {
    var exact = idx[col];
    if (exact) return exact;
    var n = String(col || "").trim().toLowerCase().replace(/\s+/g, "_");
    return idxNorm[n] || 0;
  }

  var colId = need("id_gasto");
  var colHoja = need("hoja_gasto_id");
  var colNumHoja = need("Num_Hoja_Gasto");
  var colEstado = need("hoja_gasto_estado");
  var colFechaEnvio = opt("hoja_gasto_fecha_envio");
  var colTotal = opt("hoja_gasto_total");
  var colObs = opt("hoja_gasto_observaciones");
  var colRev = opt("hoja_gasto_revisado_por");
  var colFechaRev = opt("hoja_gasto_fecha_revision");
  var colMotivo = opt("hoja_gasto_motivo_rechazo");
  var colEstadoPago = opt("hoja_gasto_estado_pago");
  var colPagadoPor = opt("hoja_gasto_pagado_por");
  var colFechaPago = opt("hoja_gasto_fecha_pago");
  var colMetodoPago = opt("hoja_gasto_metodo_pago");
  var colRefPago = opt("hoja_gasto_referencia_pago");
  var colImporte = opt("coste_total") || opt("importe_pagar") || opt("importe");

  var hojaVals = sh.getRange(2, colHoja, lastRow, 1).getValues();
  var idVals = sh.getRange(2, colId, lastRow, 1).getValues();

  // Bloquear si alguna línea de la hoja está pagada.
  for (var p = 0; p < hojaVals.length; p++) {
    if (String(hojaVals[p][0] || "").trim() !== hojaId) continue;
    if (colEstadoPago) {
      var pago = String(sh.getRange(p + 2, colEstadoPago).getValue() || "")
        .trim()
        .toUpperCase();
      if (pago === "PAGADA") {
        throw new Error("No se puede modificar una hoja ya pagada");
      }
    }
  }

  function clearSheetCols_(row) {
    sh.getRange(row, colHoja).setValue("");
    sh.getRange(row, colNumHoja).setValue("");
    sh.getRange(row, colEstado).setValue("");
    if (colFechaEnvio) sh.getRange(row, colFechaEnvio).setValue("");
    if (colTotal) sh.getRange(row, colTotal).setValue("");
    if (colObs) sh.getRange(row, colObs).setValue("");
    if (colRev) sh.getRange(row, colRev).setValue("");
    if (colFechaRev) sh.getRange(row, colFechaRev).setValue("");
    if (colMotivo) sh.getRange(row, colMotivo).setValue("");
    if (colEstadoPago) sh.getRange(row, colEstadoPago).setValue("");
    if (colPagadoPor) sh.getRange(row, colPagadoPor).setValue("");
    if (colFechaPago) sh.getRange(row, colFechaPago).setValue("");
    if (colMetodoPago) sh.getRange(row, colMetodoPago).setValue("");
    if (colRefPago) sh.getRange(row, colRefPago).setValue("");
  }

  var unlinked = [];
  var remainingRows = [];
  var remainingTotal = 0;
  var idSetUpper = {};
  for (var ik in idSet) {
    if (Object.prototype.hasOwnProperty.call(idSet, ik)) {
      idSetUpper[String(ik).toUpperCase()] = true;
    }
  }

  for (var r = 0; r < hojaVals.length; r++) {
    var hid = String(hojaVals[r][0] || "").trim();
    if (hid !== hojaId) continue;
    var row = r + 2;
    var gid = String(idVals[r][0] || "").trim();
    var shouldUnlink = reopenAll || (!!gid && !!idSetUpper[gid.toUpperCase()]);
    if (shouldUnlink) {
      clearSheetCols_(row);
      if (gid) unlinked.push(gid);
    } else {
      remainingRows.push(row);
      if (colImporte) {
        var n = Number(String(sh.getRange(row, colImporte).getValue() || "").replace(",", "."));
        if (!isNaN(n) && isFinite(n)) remainingTotal += n;
      }
    }
  }

  if (!reopenAll && !unlinked.length) {
    throw new Error(
      "Ningún gasto de la hoja coincidió con id_gastos. Comprueba que los id sean GAS… y pertenezcan a esta hoja."
    );
  }

  remainingTotal = Math.round(remainingTotal * 100) / 100;
  for (var j = 0; j < remainingRows.length; j++) {
    if (colTotal) sh.getRange(remainingRows[j], colTotal).setValue(remainingTotal);
  }

  return {
    hoja_gasto_id: hojaId,
    reopen_all: reopenAll,
    unlinked_ids: unlinked,
    unlinked: unlinked.length,
    remaining: remainingRows.length,
    remaining_total: remainingTotal,
  };
}
