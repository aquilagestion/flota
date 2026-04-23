// ======================================================================
// 03_flota.gs
// FLOTA como fuente unica de consulta y alta/edicion de vehiculos.
// Headers esperados en hoja FLOTA:
// matricula,fecha_matriculacion,marca,modelo,combustible,propiedad,
// departamento_o_proyecto,responsable,itv_desde,itv_hasta,aseguradora,
// seguro_desde,seguro_hasta,poliza,e-mail_de_notificaciones,activo,observaciones
// ======================================================================

function apiFlotaList() {
  var sh = getSheet(CFG.SHEETS.FLOTA);
  var rows = rowsToObjects_(sh);

  return rows
    .map(function (r) {
      return {
        matricula: String(r.matricula || "").trim().toUpperCase(),
        fecha_matriculacion: normalizeFlotaDate_(r.fecha_matriculacion),
        marca: String(r.marca || "").trim(),
        modelo: String(r.modelo || "").trim(),
        combustible: String(r.combustible || "").trim(),
        propiedad: String(r.propiedad || "").trim(),
        departamento_o_proyecto: String(r.departamento_o_proyecto || "").trim(),
        responsable: String(r.responsable || "").trim(),
        itv_desde: normalizeFlotaDate_(r.itv_desde),
        itv_hasta: normalizeFlotaDate_(r.itv_hasta),
        aseguradora: String(r.aseguradora || "").trim(),
        seguro_desde: normalizeFlotaDate_(r.seguro_desde),
        seguro_hasta: normalizeFlotaDate_(r.seguro_hasta),
        poliza: String(r.poliza || "").trim(),
        "e-mail_de_notificaciones": String(r["e-mail_de_notificaciones"] || r.email_de_notificaciones || "").trim(),
        activo: String(r.activo || "").trim().toUpperCase(),
        observaciones: String(r.observaciones || "").trim(),
      };
    })
    .filter(function (v) {
      return !!v.matricula;
    });
}

function normalizeFlotaDate_(value) {
  if (value === undefined || value === null || value === "") return "";
  return normalizeDateDMYCell_(value);
}

function apiFlotaCrear(payload) {
  payload = payload || {};
  var mat = normalizeMatricula_(payload.matricula);
  if (!mat) throw new Error("Falta campo: matricula");

  var sh = getSheet(CFG.SHEETS.FLOTA);
  var headers = getHeaders_(sh);
  if (!headers || !headers.length) throw new Error("La hoja FLOTA no tiene headers");

  var rowObj = {
    matricula: mat,
    fecha_matriculacion: String(payload.fecha_matriculacion || "").trim(),
    marca: String(payload.marca || "").trim(),
    modelo: String(payload.modelo || "").trim(),
    combustible: String(payload.combustible || "").trim(),
    propiedad: String(payload.propiedad || "").trim(),
    departamento_o_proyecto: String(payload.departamento_o_proyecto || "").trim(),
    responsable: String(payload.responsable || "").trim(),
    itv_desde: String(payload.itv_desde || "").trim(),
    itv_hasta: String(payload.itv_hasta || "").trim(),
    aseguradora: String(payload.aseguradora || "").trim(),
    seguro_desde: String(payload.seguro_desde || "").trim(),
    seguro_hasta: String(payload.seguro_hasta || "").trim(),
    poliza: String(payload.poliza || "").trim(),
    "e-mail_de_notificaciones": String(payload["e-mail_de_notificaciones"] || payload.email_de_notificaciones || "").trim(),
    activo: String(payload.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
    observaciones: String(payload.observaciones || "").trim(),
  };

  // Normaliza fechas a dd/MM/yyyy para columnas de fecha.
  Object.keys(rowObj).forEach(function (k) {
    if (k === "fecha_matriculacion" || k === "itv_desde" || k === "itv_hasta" || k === "seguro_desde" || k === "seguro_hasta") {
      if (rowObj[k]) rowObj[k] = normalizeDateDMYCell_(rowObj[k]);
    }
  });

  var all = sh.getDataRange().getValues();
  var idxMat = headers.indexOf("matricula");
  if (idxMat < 0) throw new Error("No existe columna matricula en FLOTA");

  // Upsert por matricula.
  for (var r = 1; r < all.length; r++) {
    var current = normalizeMatricula_(all[r][idxMat]);
    if (current !== mat) continue;

    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (rowObj[h] !== undefined) {
        sh.getRange(r + 1, c + 1).setValue(rowObj[h]);
      }
    }
    return { matricula: mat, updated: true };
  }

  appendRowByHeaders_(sh, rowObj);
  return { matricula: mat, created: true };
}
