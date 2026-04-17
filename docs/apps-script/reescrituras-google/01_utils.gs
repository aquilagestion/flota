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
  const base = String(fecha).trim();
  const hhmm = String(hora || "00:00").trim();
  const d = new Date(base + "T" + hhmm + ":00");
  return isNaN(d.getTime()) ? null : d;
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
  const stamp = Utilities.formatDate(now, CFG.TIMEZONE, "yyyyMMddHHmmss");
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

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeDateDMYCell_(value) {
  const d = parseFechaFlexible_(value);
  if (!d) return String(value || "").trim();
  return formatDateISO_(d);
}

function appendRowByHeaders_(sheet, obj) {
  const headers = getHeaders_(sheet);
  if (!headers.length) {
    throw new Error("La hoja no tiene headers en fila 1: " + sheet.getName());
  }
  const row = headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? obj[h] : ""));
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
