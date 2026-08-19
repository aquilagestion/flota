/** Metadatos editables de hoja de gasto (local + PDF). WP/Acción por línea, DNI manual. */

import { normalizeDateToDmy } from "./format";
import {
  ticketUrlsFromExpenseRecord,
  isPdfOrImageTicketUrl,
  ticketFetchUrlForEmbed,
  ticketUrlToDataUri_,
} from "./expenseTicketResolve";

export { ticketUrlsFromExpenseRecord as ticketUrlsFromExpense };
export { isPdfOrImageTicketUrl, ticketFetchUrlForEmbed, ticketUrlToDataUri_ };

const STOP_WORDS = new Set(["de", "del", "la", "los", "las", "y", "e"]);

/** COD PERSONAL = iniciales del nombre (palabras significativas, sin de/del/la/los/las/y/e).
 *  3 palabras o menos: iniciales de todas (Eduardo Cabrero Sánchez → ECS).
 *  4 palabras: cadenas 1, 3 y 4 (Juan José Iglesias Lebrija → JIL). */
export function codPersonalFromName(name) {
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
  const pick =
    words.length === 4
      ? [words[0], words[2], words[3]]
      : words.slice(0, 3);
  return pick.map((w) => w[0]?.toUpperCase() || "").join("");
}

/** Lee cod_personal de registro USUARIOS (columna L / header cod_personal). */
export function codPersonalFromUsuarioRecord(record) {
  if (!record || typeof record !== "object") return "";
  const keys = ["cod_personal", "COD_PERSONAL", "Cod_Personal", "codPersonal", "COD PERSONAL"];
  for (const k of keys) {
    const v = String(record[k] ?? "").trim();
    if (v) return v.toUpperCase();
  }
  return "";
}

/** COD PERSONAL oficial (USUARIOS) o iniciales del nombre como respaldo. */
export function resolveCodPersonalForSheet({ usuarioRecord, nombre } = {}) {
  const fromUsuarios = codPersonalFromUsuarioRecord(usuarioRecord);
  if (fromUsuarios) return fromUsuarios;
  const name = String(nombre || usuarioRecord?.nombre || "").trim();
  return codPersonalFromName(name);
}

function normalizeExpenseSheetCod_(cod) {
  return String(cod || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Prefijo T-MES-AÑO-COD_PERSONAL (p. ej. T-07-2026-ECS). */
export function expenseSheetNumberPrefix(codPersonal, date = new Date()) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const cod = normalizeExpenseSheetCod_(codPersonal) || "XXX";
  return `T-${mm}-${yyyy}-${cod}`;
}

function intToRomanForSheet_(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const table = [
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
  let rest = n;
  let out = "";
  for (const [value, sym] of table) {
    while (rest >= value) {
      out += sym;
      rest -= value;
    }
  }
  return out;
}

function romanToIntForSheet_(roman) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const s = String(roman || "")
    .trim()
    .toUpperCase();
  if (!s) return 0;
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const curr = map[s[i]] || 0;
    if (!curr) return 0;
    if (curr < prev) total -= curr;
    else {
      total += curr;
      prev = curr;
    }
  }
  return total;
}

export function maxExpenseSheetSeqForPrefix(prefix, existingNumbers) {
  const base = String(prefix || "").trim();
  if (!base) return 0;
  let maxSeq = 0;
  for (const raw of existingNumbers || []) {
    const cell = String(raw || "").trim();
    if (!cell) continue;
    if (cell === base) {
      if (maxSeq < 1) maxSeq = 1;
      continue;
    }
    const pref = `${base} - `;
    if (!cell.startsWith(pref)) continue;
    const roman = String(cell.slice(pref.length) || "").trim();
    const n = romanToIntForSheet_(roman);
    if (n > maxSeq) maxSeq = n;
  }
  return maxSeq;
}

/** Número de hoja T-MES-AÑO-COD con sufijo romano (II, III…) si ya existe en el mes. */
export function nextExpenseSheetNumber(codPersonal, date, existingNumbers) {
  const prefix = expenseSheetNumberPrefix(codPersonal, date);
  const maxSeq = maxExpenseSheetSeqForPrefix(prefix, existingNumbers);
  const nextSeq = maxSeq + 1;
  if (nextSeq <= 1) return prefix;
  return `${prefix} - ${intToRomanForSheet_(nextSeq)}`;
}

export function isValidExpenseSheetNumber(num) {
  const s = String(num || "").trim();
  if (!s || /^HG-|^HGWEB-/i.test(s)) return false;
  if (/^\d{4}_\d{4}\sR\.G\.T\.\s/i.test(s)) return true;
  return /^T-\d{2}-\d{4}-[A-Z0-9]+(\s-\s[IVXLCDM]+)?$/i.test(s);
}

export function inferExpenseSheetNumber(sheet, codPersonal, date = new Date()) {
  const current = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (current) return current;
  return expenseSheetNumberPrefix(codPersonal, date);
}

/** Alias histórico (antes en format.js). */
export function buildSheetNumber(codPersonal, date = new Date(), existingNumbers = []) {
  return nextExpenseSheetNumber(codPersonal, date, existingNumbers);
}

/** Recoge números de hoja ya usados (listas web/APK). */
export function collectExpenseSheetNumbers(rows) {
  const out = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  for (const r of rows || []) {
    push(r?.num_hoja_gasto);
    push(r?.num);
    push(r?.Num_Hoja_Gasto);
  }
  return out;
}

/** Genera el número T-MES-AÑO-COD al crear hoja (cod_personal de USUARIOS columna L). */
export function resolveSheetNumberForCreate({ usuarioRecord, nombre, email, date = new Date(), existingNumbers = [] } = {}) {
  const cod = resolveCodPersonalForSheet({
    usuarioRecord,
    nombre: nombre || usuarioRecord?.nombre || String(email || "").split("@")[0],
  });
  return buildSheetNumber(cod, date, existingNumbers);
}

/** Conserva número existente o infiere prefijo T- si falta. */
export function inferSheetNumberFromRecord(sheet, options = {}) {
  const current = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (current) return current;
  return resolveSheetNumberForCreate(options);
}

/** Texto de fecha de firma en pie del PDF; en blanco hasta cerrar la hoja manualmente. */
export function signatureDateFooterText_(fechaFirma) {
  const formatted = normalizeDateToDmy(fechaFirma);
  if (formatted) return formatted;
  return "__/__/____";
}

export function todayDmySheet_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Validación antes de confeccionar / imprimir la hoja PDF. */
export function validateSheetConfectionMeta(dni, fechaFirma) {
  if (!String(dni || "").trim()) return "Indica el DNI del usuario.";
  const fecha = normalizeDateToDmy(fechaFirma) || String(fechaFirma || "").trim();
  if (!fecha) return "Indica la fecha de la hoja.";
  return "";
}

/** Filas del modal de confección (WP / acción opcionales por línea). */
export function buildSheetLineMetaRows_(lines, storedMeta, labelFn) {
  const m = normalizeSheetMeta_(storedMeta);
  const list = Array.isArray(lines) ? lines : [];
  const labelOf =
    typeof labelFn === "function"
      ? labelFn
      : (ln) => String(ln?.concepto || ln?.tipo_gasto || "Gasto").trim();
  return list
    .map((ln) => {
      const key = lineMetaKey_(ln);
      const fromMeta = m.lineas[key] || {};
      return {
        key,
        label: labelOf(ln),
        work_package: fromMeta.work_package || String(ln?.work_package || "").trim(),
        accion_proyecto: fromMeta.accion_proyecto || String(ln?.accion_proyecto || "").trim(),
      };
    })
    .filter((r) => r.key);
}

export function lineMetaMapFromRows_(rows) {
  const map = {};
  for (const r of rows || []) {
    const key = String(r?.key || "").trim();
    if (!key) continue;
    map[key] = {
      work_package: String(r?.work_package || "").trim(),
      accion_proyecto: String(r?.accion_proyecto || "").trim(),
    };
  }
  return map;
}

export const SHEET_FORMA_PAGO = {
  TRANSFERENCIA: "transferencia",
  EFECTIVO: "efectivo",
  TARJETA_EMPRESA: "tarjeta_empresa",
};

export const DEFAULT_SHEET_FORMA_PAGO = SHEET_FORMA_PAGO.TRANSFERENCIA;

export const SHEET_FORMA_PAGO_OPTIONS = [
  { id: SHEET_FORMA_PAGO.TRANSFERENCIA, label: "Recibí por transferencia" },
  { id: SHEET_FORMA_PAGO.EFECTIVO, label: "Recibí en efectivo" },
  { id: SHEET_FORMA_PAGO.TARJETA_EMPRESA, label: "PAGADOS CON TARJETA EMPRESA" },
];

export function normalizeFormaPago_(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (v === SHEET_FORMA_PAGO.EFECTIVO) return SHEET_FORMA_PAGO.EFECTIVO;
  if (v === SHEET_FORMA_PAGO.TARJETA_EMPRESA || v === "pagados_con_tarjeta_empresa") {
    return SHEET_FORMA_PAGO.TARJETA_EMPRESA;
  }
  return DEFAULT_SHEET_FORMA_PAGO;
}

export function paymentMethodCheckboxesHtml_(formaPago, fontSize = "9px") {
  const sel = normalizeFormaPago_(formaPago);
  const box = (key, label) => {
    const mark = sel === key ? "☑" : "☐";
    return `${mark} ${label}`;
  };
  return `<div style="margin-top:8px; font-size:${fontSize};">${box(
    SHEET_FORMA_PAGO.TRANSFERENCIA,
    "Recibí por transferencia"
  )} &nbsp; ${box(SHEET_FORMA_PAGO.EFECTIVO, "Recibí en efectivo")} &nbsp; ${box(
    SHEET_FORMA_PAGO.TARJETA_EMPRESA,
    "PAGADOS CON TARJETA EMPRESA"
  )}</div>`;
}

export function emptySheetMeta_() {
  return {
    dni: "",
    fecha_firma: "",
    forma_pago: DEFAULT_SHEET_FORMA_PAGO,
    lineas: {},
    updatedAt: "",
  };
}

export function normalizeSheetMeta_(raw) {
  const base = emptySheetMeta_();
  if (!raw || typeof raw !== "object") return base;
  const lineas = {};
  const src = raw.lineas && typeof raw.lineas === "object" ? raw.lineas : {};
  for (const [key, val] of Object.entries(src)) {
    const id = String(key || "").trim();
    if (!id || !val || typeof val !== "object") continue;
    lineas[id] = {
      work_package: String(val.work_package || val.workPackage || "").trim(),
      accion_proyecto: String(val.accion_proyecto || val.accionProyecto || "").trim(),
    };
  }
  return {
    dni: String(raw.dni || "").trim(),
    fecha_firma: String(raw.fecha_firma || raw.fechaFirma || "").trim(),
    forma_pago: normalizeFormaPago_(raw.forma_pago || raw.formaPago),
    lineas,
    updatedAt: String(raw.updatedAt || "").trim(),
  };
}

/** Clave estable para metadatos de línea (id_gasto remoto o id local). */
export function lineMetaKey_(line) {
  return String(line?.id_gasto || line?.expense_id || line?.id || "").trim();
}

export function mergeLineMetaIntoLineas_(lineas, meta, expenseByKey) {
  const m = normalizeSheetMeta_(meta);
  const list = Array.isArray(lineas) ? lineas : [];
  return list.map((ln) => {
    const key = lineMetaKey_(ln);
    const fromMeta = m.lineas[key] || {};
    const raw = expenseByKey?.get?.(key) || expenseByKey?.[key] || null;
    const wp = String(fromMeta.work_package || ln.work_package || raw?.work_package || "").trim();
    const acc = String(fromMeta.accion_proyecto || ln.accion_proyecto || raw?.accion_proyecto || "").trim();
    return {
      ...ln,
      work_package: wp,
      accion_proyecto: acc,
    };
  });
}

export function extractViajeFromLines_(lines, options = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const km = list.find((ln) => String(ln?.tipo_gasto || "").trim().toUpperCase() === "KILOMETRAJE_COLABORADOR");
  if (km) {
    const itinerario = String(km?.itinerario || "").trim();
    let origen = String(km?.origen_colaborador || km?.origen || "").trim();
    let destino1 = String(km?.destino_colaborador || km?.destino || km?.destino1 || "").trim();
    if (!origen && itinerario.includes(" - ")) {
      const parts = itinerario.split(" - ").map((x) => x.trim()).filter(Boolean);
      origen = parts[0] || "";
      destino1 = parts[1] || destino1;
    }
    return {
      fecha_inicio: String(km?.fecha_inicio || km?.fecha_viaje_colaborador || km?.fecha || "").trim(),
      fecha_fin: String(km?.fecha_fin || km?.fecha_fin_viaje_colaborador || km?.fecha || "").trim(),
      origen,
      destino1,
      motivo: String(km?.motivo_colaborador || km?.motivo_salida || km?.motivo || "").trim(),
    };
  }

  const withTrip = list.find((ln) => {
    const origen = String(ln?.origen_colaborador || ln?.origen || "").trim();
    const fecha = String(ln?.fecha_viaje_colaborador || ln?.fecha_inicio || "").trim();
    return origen || fecha;
  });
  if (withTrip) {
    return {
      fecha_inicio: String(withTrip?.fecha_inicio || withTrip?.fecha_viaje_colaborador || withTrip?.fecha || "").trim(),
      fecha_fin: String(withTrip?.fecha_fin || withTrip?.fecha_fin_viaje_colaborador || "").trim(),
      origen: String(withTrip?.origen_colaborador || withTrip?.origen || "").trim(),
      destino1: String(withTrip?.destino_colaborador || withTrip?.destino || withTrip?.destino1 || "").trim(),
      motivo: String(withTrip?.motivo_colaborador || withTrip?.motivo_salida || withTrip?.motivo || "").trim(),
    };
  }

  const tripHint = options?.viaje || options?.trip || options?.tripRecord;
  if (tripHint) return viajeFromTripRecord_(tripHint);

  return emptyViajeSheet_();
}

export function emptyViajeSheet_() {
  return { fecha_inicio: "", fecha_fin: "", origen: "", destino1: "", motivo: "" };
}

function unwrapTripApiResponse_(res) {
  if (res?.data != null && typeof res.data === "object" && !Array.isArray(res.data)) return res.data;
  return res;
}

export function viajeFromTripRecord_(trip) {
  const unwrapped = unwrapTripApiResponse_(trip);
  const t =
    unwrapped?.viaje && typeof unwrapped.viaje === "object"
      ? unwrapped.viaje
      : unwrapped && typeof unwrapped === "object"
        ? unwrapped
        : {};
  return {
    fecha_inicio: String(t.fecha_inicio || t.fecha_viaje || t.fecha || "").trim(),
    fecha_fin: String(t.fecha_fin || t.fecha_fin_viaje || "").trim(),
    origen: String(t.origen || t.origen_colaborador || "").trim(),
    destino1: String(t.destino1 || t.destino || t.destino_colaborador || "").trim(),
    motivo: String(t.motivo || t.motivo_colaborador || t.motivo_viaje || t.motivo_salida || "").trim(),
  };
}

export function findViajePropioIdFromSheetSources_(lines, expenses) {
  const sources = [...(Array.isArray(lines) ? lines : []), ...(Array.isArray(expenses) ? expenses : [])];
  for (const item of sources) {
    const raw = item?.raw && typeof item.raw === "object" ? item.raw : item;
    const id = String(raw?.id_viaje_propio || item?.id_viaje_propio || "").trim();
    if (id) return id;
  }
  return "";
}

export async function resolveViajeForExpenseSheetPrint_(lines, expenses, resolveTripDetail, options = {}) {
  const viajeHint = options?.viajeHint || options?.viaje;
  if (viajeHint) {
    const fromHint = viajeFromTripRecord_(viajeHint);
    if (fromHint.origen || fromHint.fecha_inicio) return fromHint;
  }

  const fromLines = extractViajeFromLines_(lines, options);
  if (fromLines.origen || fromLines.fecha_inicio) return fromLines;

  const idViaje = findViajePropioIdFromSheetSources_(lines, expenses);
  if (!idViaje || typeof resolveTripDetail !== "function") return fromLines;

  try {
    const res = await resolveTripDetail(idViaje);
    return viajeFromTripRecord_(res);
  } catch {
    return fromLines;
  }
}

/** Resuelve adjuntos de tickets para el anexo del PDF. */
export async function buildTicketAttachmentsForLines_(lines, expenseList, uriToDataUri) {
  const toDataUri = typeof uriToDataUri === "function" ? uriToDataUri : async (u) => u;
  const expenseByKey = new Map();
  for (const e of expenseList || []) {
    const keys = [
      String(e?.id_gasto || "").trim(),
      String(e?.local_id || "").trim(),
      String(e?.id || "").trim(),
    ].filter(Boolean);
    for (const k of keys) expenseByKey.set(k, e);
  }
  const attachments = [];
  const list = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < list.length; i += 1) {
    const ln = list[i];
    const key = lineMetaKey_(ln);
    const raw =
      expenseByKey.get(key) ||
      expenseByKey.get(String(ln?.expense_id || "").trim()) ||
      expenseByKey.get(String(ln?.id_gasto || "").trim()) ||
      ln;
    const urls = [...ticketUrlsFromExpenseRecord(raw), ...ticketUrlsFromExpenseRecord(ln)].filter(
      (u, idx, arr) => u && arr.indexOf(u) === idx
    );
    for (let j = 0; j < urls.length; j += 1) {
      const url = urls[j];
      if (!isPdfOrImageTicketUrl(url)) continue;
      const resolved = await toDataUri(url);
      const labelBase = String(ln?.concepto || ln?.tipo_gasto || `Gasto ${i + 1}`).trim();
      const dataUri = String(resolved || "").startsWith("data:") ? resolved : "";
      attachments.push({
        label: urls.length > 1 ? `${labelBase} (${j + 1})` : labelBase,
        dataUri,
        url: dataUri ? url : resolved || url,
        mime: /\.pdf(\?|$)/i.test(url) ? "application/pdf" : "image/jpeg",
      });
    }
  }
  return attachments;
}

export async function persistSheetMeta_(localDb, hojaId, dni, lineMetaMap, fechaFirma, formaPago) {
  const hid = String(hojaId || "").trim();
  if (!hid) return;
  const lineas = {};
  const src = lineMetaMap && typeof lineMetaMap === "object" ? lineMetaMap : {};
  for (const [key, val] of Object.entries(src)) {
    const id = String(key || "").trim();
    if (!id || !val || typeof val !== "object") continue;
    lineas[id] = {
      work_package: String(val.work_package || "").trim(),
      accion_proyecto: String(val.accion_proyecto || "").trim(),
    };
  }
  await localDb.setExpenseSheetMeta(hid, {
    dni: String(dni || "").trim(),
    fecha_firma: String(fechaFirma || "").trim(),
    forma_pago: normalizeFormaPago_(formaPago),
    lineas,
    updatedAt: new Date().toISOString(),
  });
}

const WEB_META_KEY = "@flota:expenseSheetMeta:v1";

export function loadSheetMetaFromWebStorage_(hojaId) {
  const hid = String(hojaId || "").trim();
  if (!hid || typeof localStorage === "undefined") return emptySheetMeta_();
  try {
    const map = JSON.parse(localStorage.getItem(WEB_META_KEY) || "{}");
    return normalizeSheetMeta_(map && typeof map === "object" ? map[hid] : null);
  } catch {
    return emptySheetMeta_();
  }
}

export function persistSheetMetaToWebStorage_(hojaId, dni, lineMetaMap, fechaFirma, formaPago) {
  const hid = String(hojaId || "").trim();
  if (!hid || typeof localStorage === "undefined") return;
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(WEB_META_KEY) || "{}");
    if (!map || typeof map !== "object") map = {};
  } catch {
    map = {};
  }
  const lineas = {};
  const src = lineMetaMap && typeof lineMetaMap === "object" ? lineMetaMap : {};
  for (const [key, val] of Object.entries(src)) {
    const id = String(key || "").trim();
    if (!id || !val || typeof val !== "object") continue;
    lineas[id] = {
      work_package: String(val.work_package || "").trim(),
      accion_proyecto: String(val.accion_proyecto || "").trim(),
    };
  }
  map[hid] = {
    dni: String(dni || "").trim(),
    fecha_firma: String(fechaFirma || "").trim(),
    forma_pago: normalizeFormaPago_(formaPago),
    lineas,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(WEB_META_KEY, JSON.stringify(map));
}
