function jsonOk(data, message) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "success",
      message: message || "OK",
      data: data || null,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message, errorCode) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "error",
      message: message || "Error",
      errorCode: errorCode || "GENERIC_ERROR",
      data: null,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("No existe la hoja: " + name);
  return sh;
}

function getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map((h) => String(h || "").trim());
}

function rowsToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h || "").trim());
  return values.slice(1).map((row, i) => {
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = row[j];
    });
    obj._row = i + 2;
    return obj;
  });
}

function parseFechaHora_(fecha, hora) {
  if (!fecha) return null;
  const base = parseFechaFlexible_(fecha);
  if (!base) return null;
  const hhmm = String(hora || "00:00").trim();
  const m = hhmm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    base.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0);
  }
  return isNaN(base.getTime()) ? null : base;
}

function formatDateISO_(d) {
  if (!(d instanceof Date)) return "";
  return Utilities.formatDate(d, CFG.TIMEZONE, "dd/MM/yyyy");
}

function formatDateTimeISO_(d) {
  if (!(d instanceof Date)) return "";
  return Utilities.formatDate(d, CFG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function genId_(prefix) {
  const now = new Date();
  const stamp = Utilities.formatDate(now, CFG.TIMEZONE, "yyyymmddHHmmss");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return prefix + "-" + stamp + "-" + rand;
}

function logApi_(endpoint, metodo, usuario, status, mensaje) {
  try {
    const sh = getSheet(CFG.SHEETS.LOG_API);
    sh.appendRow([new Date(), endpoint || "", metodo || "", usuario || "", status || "", mensaje || ""]);
  } catch (e) {
    // no bloquear respuesta por fallo de log
  }
}

function getSecretKey_() {
  return PropertiesService.getScriptProperties().getProperty("API_SECRET_KEY") || CFG.SECRET_KEY || "";
}

function validarSecret_(secret) {
  return !!secret && String(secret).trim() === String(getSecretKey_()).trim();
}

function normalizeMultiArray_(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }

  const s = String(value).trim();
  if (!s) return [];

  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((v) => String(v || "").trim()).filter(Boolean);
      }
    } catch (e) {}
  }

  return s.split(";").map((v) => String(v || "").trim()).filter(Boolean);
}

function parseFechaFlexible_(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  // Número: serial de Sheets (~45xxx en 2026). Un año suelto (p. ej. 2026)
  // NO es serial: 2026 → ~18/07/1905 y provoca fechas "1905/1906".
  if (typeof value === "number" && isFinite(value)) {
    if (value >= 1000 && value <= 9999) return null;
    if (value > 20000 && value < 120000 && typeof sheetsSerialToDateTime_ === "function") {
      var fromSerial = sheetsSerialToDateTime_(value);
      if (fromSerial && !isNaN(fromSerial.getTime())) return fromSerial;
    }
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // Solo dígitos 4 cifras = año mal enviado, no fecha.
  if (/^\d{4}$/.test(s)) return null;

  // Serial Excel como texto (OpenXML sin tipo fecha: "46132").
  if (/^\d{5,6}(\.\d+)?$/.test(s)) {
    var sn = Number(s);
    if (sn > 20000 && sn < 120000 && typeof sheetsSerialToDateTime_ === "function") {
      var ds = sheetsSerialToDateTime_(sn);
      if (ds && !isNaN(ds.getTime())) return ds;
    }
  }

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var a = Number(m[1]);
    var b = Number(m[2]);
    var yyyy = Number(m[3]);
    // Producto: dd/mm/aaaa. Si 2.º grupo >12 (p. ej. 07/21/2026 US) → invertir.
    var dd = a;
    var mm = b;
    if (b > 12 && a >= 1 && a <= 12) {
      dd = b;
      mm = a;
    }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    var dSlash = new Date(yyyy, mm - 1, dd, 12, 0, 0);
    return isNaN(dSlash.getTime()) || dSlash.getDate() !== dd || dSlash.getMonth() !== mm - 1
      ? null
      : dSlash;
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Evitar new Date("02/12/2025") (interpreta mm/dd en engines US).
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeDateDMYCell_(value) {
  const d = parseFechaFlexible_(value);
  if (!d) return String(value || "").trim();
  return formatDateISO_(d);
}

/**
 * Serializa un objeto de fila para API JSON: todas las columnas fecha_* / fecha
 * salen siempre como texto dd/MM/aaaa (nunca Date crudo → ISO/yyyy-mm-dd en el cliente).
 */
function serializeRowFechasForApi_(obj) {
  if (!obj || typeof obj !== "object") return obj;
  var out = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "_row") continue;
    var v = obj[k];
    if (isFechaHeader_(k)) {
      out[k] = v === "" || v === null || v === undefined ? "" : normalizeDateDMYCell_(v);
    } else if (v instanceof Date && !isNaN(v.getTime())) {
      out[k] = formatDateTimeISO_(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Cabeceras de fecha (evita que Sheets reinterprette "dd/mm/aaaa" según locale US). */
function isFechaHeader_(h) {
  var lk = String(h || "").toLowerCase().trim();
  return (
    lk === "fecha" ||
    lk.indexOf("fecha_") === 0 ||
    lk.indexOf("_fecha") > -1 ||
    lk === "periodo_ivm" ||
    lk === "desde_ts" ||
    lk === "hasta_ts"
  );
}

/**
 * Valor Date canónico (mediodía local) a partir de dd/mm/aaaa o Date.
 * Escribir Date evita el swap día/mes al parsear strings en hojas con locale US.
 */
function dateValueForSheetWrite_(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
  }
  var d = parseFechaFlexible_(value);
  if (!d || isNaN(d.getTime())) return value;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function cellValueForHeaderWrite_(header, value) {
  if (value === undefined || value === null) return "";
  if (value === "") return "";
  if (isFechaHeader_(header)) return dateValueForSheetWrite_(value);
  return value;
}

function appendRowByHeaders_(sheet, obj) {
  const headers = getHeaders_(sheet);
  if (!headers.length) {
    throw new Error("La hoja no tiene headers en fila 1: " + sheet.getName());
  }
  const row = headers.map((h) =>
    obj[h] !== undefined && obj[h] !== null ? cellValueForHeaderWrite_(h, obj[h]) : ""
  );
  sheet.appendRow(row);
}

function ensureSameLen_(arr, len) {
  const out = Array.isArray(arr) ? arr.slice(0) : [];
  while (out.length < len) out.push("");
  return out;
}

function normalizeMatricula_(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeMatricula_is(value) {
  return normalizeMatricula_(value);
}
