/** Metadatos editables de hoja de gasto (local + PDF). WP/Acción por línea, DNI manual. */

import { expenseDate, normalizeDateToDmy, parseDateFlexible, extractDriveFileId, toDateMs } from "./format";
import {
  ticketUrlsFromExpenseRecord,
  isPdfOrImageTicketUrl,
  ticketFetchUrlForEmbed,
  ticketUrlToDataUri_,
  mapPool_,
  isRemoteTicketAttachmentUrl,
} from "./expenseTicketResolve";

/** ms de fecha de línea/gasto para ordenar (0 si no parseable). */
function sheetLineDateMs_(ln) {
  const raw = ln?.raw && typeof ln.raw === "object" ? ln.raw : ln;
  const candidates = [
    ln?.fecha,
    ln?.date,
    raw?.fecha,
    raw?.fecha_repostaje,
    raw?.fecha_peaje,
    raw?.fecha_aparcamiento,
    raw?.fecha_inspeccion,
    raw?.fecha_otros_gastos,
    raw?.fecha_multa,
    raw?.fecha_compra_mantenimiento,
    raw?.fecha_compra_repuestos,
    raw?.fecha_viaje_colaborador,
    raw?.createdAtLocal,
  ];
  for (const c of candidates) {
    const d = parseDateFlexible(c);
    if (d && Number.isFinite(d.getTime())) return d.getTime();
  }
  return 0;
}

function sheetLineInvoiceKey_(ln) {
  const raw = ln?.raw && typeof ln.raw === "object" ? ln.raw : ln;
  return String(
    ln?.numero_factura ||
      ln?.invoice ||
      raw?.numero_factura ||
      raw?.numero_ticket ||
      raw?.numero_factura_peaje ||
      raw?.numero_factura_otros ||
      raw?.numero_factura_mantenimiento ||
      raw?.numero_factura_repuestos ||
      raw?.numero_factura_itv ||
      ""
  )
    .trim()
    .toLowerCase();
}

/**
 * Orden canónico de líneas de hoja: fecha ascendente; a igual fecha, nº factura/tiquet.
 * Usar al crear, imprimir y anexar tiquets (mismo orden).
 */
export function sortExpenseSheetLinesByDateInvoice_(lines) {
  const list = Array.isArray(lines) ? lines.slice() : [];
  list.sort((a, b) => {
    const da = sheetLineDateMs_(a);
    const db = sheetLineDateMs_(b);
    if (da !== db) {
      if (!da && db) return 1;
      if (da && !db) return -1;
      return da - db;
    }
    const ia = sheetLineInvoiceKey_(a);
    const ib = sheetLineInvoiceKey_(b);
    return ia.localeCompare(ib, "es", { numeric: true, sensitivity: "base" });
  });
  return list;
}

export { ticketUrlsFromExpenseRecord as ticketUrlsFromExpense };
export { isPdfOrImageTicketUrl, ticketFetchUrlForEmbed, ticketUrlToDataUri_ };

const STOP_WORDS = new Set(["de", "del", "la", "los", "las", "y", "e"]);

/** COD PERSONAL = iniciales del nombre (palabras significativas, sin de/del/la/los/las/y/e).
 *  3 palabras o menos: iniciales de todas (Eduardo Cabrero Sánchez → ECS).
 *  4 palabras: cadenas 1, 3 y 4 (Juan José Iglesias Lebrija → JIL). */
export function codPersonalFromName(name) {
  let raw = String(name || "").trim();
  if (raw.includes("@")) raw = raw.split("@")[0] || raw;
  const words = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
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
    if (v) return v.toUpperCase().replace(/\s+/g, "");
  }
  return "";
}

/**
 * COD PERSONAL: 1) valor explícito de la hoja, 2) USUARIOS del titular,
 * 3) iniciales del nombre del titular.
 */
export function resolveCodPersonalForSheet({ usuarioRecord, nombre, codPersonal } = {}) {
  const fromExplicit = String(codPersonal || "").trim().toUpperCase().replace(/\s+/g, "");
  if (fromExplicit) return fromExplicit;
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

/** Prefijo de numeración: letterPrefix-MES-AÑO-COD (p. ej. T-07-2026-ECS, OG-05-2026-EMG). */
export function expenseSheetNumberPrefix(codPersonal, date = new Date(), letterPrefix = "T") {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const cod = normalizeExpenseSheetCod_(codPersonal) || "XXX";
  const letter = String(letterPrefix || "T")
    .trim()
    .toUpperCase() || "T";
  return `${letter}-${mm}-${yyyy}-${cod}`;
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

/** Base sin sufijo romano: T-06-2026-JCL - II → T-06-2026-JCL */
export function expenseSheetNumberBase(num) {
  const s = String(num || "").trim();
  const m = s.match(/^((?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+)/i);
  return m ? String(m[1]).toUpperCase() : "";
}

/** seq 1 → prefijo; seq 2 → prefijo - II; seq 3 → prefijo - III… */
export function formatExpenseSheetNumberSeq(prefix, seq) {
  const base = String(prefix || "").trim();
  const n = Number(seq || 0);
  if (!base) return "";
  if (!Number.isFinite(n) || n <= 1) return base;
  return `${base} - ${intToRomanForSheet_(n)}`;
}

export function maxExpenseSheetSeqForPrefix(prefix, existingNumbers) {
  const base = String(prefix || "").trim();
  if (!base) return 0;
  let maxSeq = 0;
  for (const raw of existingNumbers || []) {
    const cell = String(raw || "").trim();
    if (!cell) continue;
    const cellBase = expenseSheetNumberBase(cell);
    if (!cellBase || cellBase.toUpperCase() !== base.toUpperCase()) continue;
    if (cell.toUpperCase() === base.toUpperCase()) {
      if (maxSeq < 1) maxSeq = 1;
      continue;
    }
    const roman = String(cell.slice(base.length) || "")
      .replace(/^\s*-\s*/, "")
      .trim()
      .toUpperCase();
    const n = romanToIntForSheet_(roman);
    if (n > maxSeq) maxSeq = n;
  }
  return maxSeq;
}

/** Número de hoja {LETTER}-MES-AÑO-COD con sufijo romano (II, III…) si ya existe en el mes. */
export function nextExpenseSheetNumber(codPersonal, date, existingNumbers, letterPrefix = "T") {
  const prefix = expenseSheetNumberPrefix(codPersonal, date, letterPrefix);
  const maxSeq = maxExpenseSheetSeqForPrefix(prefix, existingNumbers);
  const nextSeq = maxSeq + 1;
  if (nextSeq <= 1) return prefix;
  return formatExpenseSheetNumberSeq(prefix, nextSeq);
}

/**
 * Ms de la fecha de gasto más antigua. Infinity si no hay fechas parseables.
 * Solo como respaldo si falta fecha de emisión de la hoja.
 */
export function oldestExpenseMsFromLines(lines) {
  let min = Number.POSITIVE_INFINITY;
  for (const ln of Array.isArray(lines) ? lines : []) {
    const ms =
      sheetLineDateMs_(ln) ||
      toDateMs(ln?.fecha || ln?.date || "") ||
      toDateMs(expenseDate(ln?.raw && typeof ln.raw === "object" ? ln.raw : ln));
    if (ms > 0 && ms < min) min = ms;
  }
  return min;
}

/** Ms de fecha de emisión (pie) de la hoja. 0 si no hay fecha parseable. */
export function emissionMsFromSheetMeta(sheetOrMeta) {
  const s = sheetOrMeta && typeof sheetOrMeta === "object" ? sheetOrMeta : {};
  const meta = s?.sheet_meta && typeof s.sheet_meta === "object" ? s.sheet_meta : {};
  const candidates = [
    s?.fecha_hoja,
    s?.fecha_firma,
    s?.hoja_gasto_fecha_hoja,
    s?.hoja_gasto_fecha_firma,
    s?.hoja_gasto_fecha_envio,
    meta?.fecha_hoja,
    meta?.fecha_firma,
    s?.createdAtLocal,
  ];
  for (const c of candidates) {
    const ms = toDateMs(c) || (() => {
      const d = parseDateFlexible(c);
      return d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
    })();
    if (ms > 0) return ms;
  }
  return 0;
}

/**
 * Hojas hermanas del mismo prefijo (T-MM-AAAA-COD) para renumerar por fecha de emisión.
 * Incluye hojas de listas + gastos ya numerados con ese prefijo.
 * Respaldo: fecha de gasto más antigua si falta emisión.
 */
export function collectSiblingSheetEntriesForPrefix({
  prefix,
  sheets = [],
  expenses = [],
  titularEmail = "",
  extraEntries = [],
} = {}) {
  const base = String(prefix || "").trim().toUpperCase();
  const titular = String(titularEmail || "").trim().toLowerCase();
  const byId = new Map();

  const push = (id, sortMs) => {
    const sid = String(id || "").trim();
    if (!sid || !base) return;
    const ms = Number(sortMs);
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : Number.POSITIVE_INFINITY;
    const prev = byId.get(sid);
    if (!prev || safeMs < prev.oldestMs) byId.set(sid, { id: sid, oldestMs: safeMs });
  };

  for (const s of Array.isArray(sheets) ? sheets : []) {
    const sid = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
    if (!sid) continue;
    const email = String(s?.usuario_email || s?.responsable_email || "").trim().toLowerCase();
    if (titular && email && email !== titular) continue;
    const num = String(s?.num_hoja_gasto || s?.Num_Hoja_Gasto || "").trim();
    const numBase = expenseSheetNumberBase(num);
    if (numBase && numBase !== base) continue;
    if (!numBase) continue;
    const linked = (Array.isArray(expenses) ? expenses : []).filter(
      (e) => String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim() === sid
    );
    const emissionMs = emissionMsFromSheetMeta(s);
    const fallbackMs = Math.min(oldestExpenseMsFromLines(s?.lineas), oldestExpenseMsFromLines(linked));
    push(sid, emissionMs > 0 ? emissionMs : fallbackMs);
  }

  for (const e of Array.isArray(expenses) ? expenses : []) {
    const num = String(e?.num_hoja_gasto || e?.Num_Hoja_Gasto || "").trim();
    const numBase = expenseSheetNumberBase(num);
    if (!numBase || numBase !== base) continue;
    const email = String(e?.responsable_email || e?.usuario_email || e?.user_email || "")
      .trim()
      .toLowerCase();
    if (titular && email && email !== titular) continue;
    const sid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
    if (!sid) continue;
    const emissionMs = emissionMsFromSheetMeta(e);
    push(sid, emissionMs > 0 ? emissionMs : oldestExpenseMsFromLines([e]));
  }

  for (const x of Array.isArray(extraEntries) ? extraEntries : []) {
    push(x?.id, x?.oldestMs ?? x?.sortMs ?? x?.emissionMs);
  }

  return Array.from(byId.values());
}

/**
 * Asigna números por fecha de emisión de la hoja (más antigua = sin sufijo).
 * No por orden de creación. 1.ª = prefijo; 2.ª = prefijo - II; 3.ª = prefijo - III…
 */
export function allocateExpenseSheetNumbersByOldest(prefix, sheets) {
  const base = String(prefix || "").trim();
  const list = (Array.isArray(sheets) ? sheets : [])
    .map((s) => ({
      id: String(s?.id || "").trim(),
      oldestMs: Number(s?.oldestMs ?? s?.sortMs ?? s?.emissionMs),
    }))
    .filter((s) => s.id);
  list.sort((a, b) => {
    const am = Number.isFinite(a.oldestMs) ? a.oldestMs : Number.POSITIVE_INFINITY;
    const bm = Number.isFinite(b.oldestMs) ? b.oldestMs : Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return a.id.localeCompare(b.id);
  });
  return list.map((s, idx) => ({
    id: s.id,
    oldestMs: s.oldestMs,
    seq: idx + 1,
    num: formatExpenseSheetNumberSeq(base, idx + 1),
  }));
}

export function isValidExpenseSheetNumber(num) {
  const s = String(num || "").trim();
  if (!s || /^HG-|^HGWEB-/i.test(s)) return false;
  if (/^\d{4}_\d{4}\sR\.G\.T\.\s/i.test(s)) return true;
  return /^(T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-[A-Z0-9]+(\s*-\s*[IVXLCDM]+)?$/i.test(s);
}

export function inferExpenseSheetNumber(sheet, codPersonal, date = new Date(), letterPrefix = "T") {
  const current = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (current) return current;
  return expenseSheetNumberPrefix(codPersonal, date, letterPrefix);
}

/** Alias histórico (antes en format.js). */
export function buildSheetNumber(codPersonal, date = new Date(), existingNumbers = [], letterPrefix = "T") {
  return nextExpenseSheetNumber(codPersonal, date, existingNumbers, letterPrefix);
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

/** Genera el número al crear hoja (cod_personal USUARIOS col. L). letterPrefix: T|OG|O|AL|ED|VET. */
export function resolveSheetNumberForCreate({
  usuarioRecord,
  nombre,
  email,
  date = new Date(),
  existingNumbers = [],
  letterPrefix = "T",
  codPersonal,
} = {}) {
  const cod = resolveCodPersonalForSheet({
    usuarioRecord,
    nombre: nombre || usuarioRecord?.nombre || String(email || "").split("@")[0],
    codPersonal,
  });
  return buildSheetNumber(cod, date, existingNumbers, letterPrefix);
}

/** True si el nº {LETTER}-mm-yyyy-COD corresponde al mes/año de `date`. */
export function expenseSheetNumberMatchesDate(num, date) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  if (!d) return false;
  const m = String(num || "")
    .trim()
    .match(/^(?:T|OG|O|AL|ED|VET|C)-(\d{2})-(\d{4})-/i);
  if (!m) return false;
  return Number(m[1]) === d.getMonth() + 1 && Number(m[2]) === d.getFullYear();
}

/**
 * Asegura Num_Hoja_Gasto según fecha de la hoja (conserva letra de prefijo si es válida).
 * Regenera si el mes/año o el COD PERSONAL del titular no coinciden.
 */
export function ensureExpenseSheetNumberForFecha({
  currentNumber,
  fechaHoja,
  usuarioRecord,
  nombre,
  email,
  existingNumbers = [],
  letterPrefix,
  codPersonal,
} = {}) {
  const d =
    fechaHoja instanceof Date && Number.isFinite(fechaHoja.getTime())
      ? fechaHoja
      : (() => {
          const dmy = normalizeDateToDmy(fechaHoja);
          if (dmy && /^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) {
            const [dd, mm, yyyy] = dmy.split("/");
            const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0, 0);
            return Number.isFinite(parsed.getTime()) ? parsed : null;
          }
          return parseDateFlexible(fechaHoja);
        })();
  const date = d && Number.isFinite(d.getTime()) ? d : new Date();
  const current = String(currentNumber || "").trim();
  const fromCurrent = String(current.match(/^(T|OG|O|AL|ED|VET|C)-/i)?.[1] || "").toUpperCase();
  const letter = String(letterPrefix || fromCurrent || "T")
    .trim()
    .toUpperCase() || "T";
  const expectedCod = normalizeExpenseSheetCod_(
    resolveCodPersonalForSheet({
      usuarioRecord,
      nombre,
      codPersonal,
    })
  );
  const currentCodMatch = String(current || "").match(
    /^(?:T|OG|O|AL|ED|VET|C)-\d{2}-\d{4}-([A-Z0-9]+)/i
  );
  const currentCod = normalizeExpenseSheetCod_(currentCodMatch?.[1] || "");
  const codMatches = !expectedCod || !currentCod || currentCod === expectedCod;
  if (
    current &&
    isValidExpenseSheetNumber(current) &&
    expenseSheetNumberMatchesDate(current, date) &&
    codMatches
  ) {
    const curLetter = String(current.match(/^(T|OG|O|AL|ED|VET|C)-/i)?.[1] || "").toUpperCase();
    if (!letterPrefix || curLetter === letter) return current;
  }
  const others = (Array.isArray(existingNumbers) ? existingNumbers : []).filter(
    (n) => String(n || "").trim() && String(n).trim() !== current
  );
  return resolveSheetNumberForCreate({
    usuarioRecord,
    nombre,
    email,
    date,
    existingNumbers: others,
    letterPrefix: letter,
    codPersonal: expectedCod || codPersonal,
  });
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
  if (
    v === SHEET_FORMA_PAGO.TARJETA_EMPRESA ||
    v === "pagados_con_tarjeta_empresa" ||
    v === "tarjeta_grefa" ||
    (v.includes("tarjeta") && (v.includes("grefa") || v.includes("empresa") || v.includes("corporativa")))
  ) {
    return SHEET_FORMA_PAGO.TARJETA_EMPRESA;
  }
  return DEFAULT_SHEET_FORMA_PAGO;
}

/** Deduce forma de pago de la hoja a partir de los gastos seleccionados. */
export function inferSheetFormaPagoFromExpenseRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let anyCorporate = false;
  for (const r of list) {
    const raw = r?.raw || r;
    const fp = String(raw?.forma_pago || r?.forma_pago || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (
      fp === "tarjeta grefa" ||
      fp === "tarjeta_grefa" ||
      (fp.includes("tarjeta") && (fp.includes("grefa") || fp.includes("empresa") || fp.includes("corporativa")))
    ) {
      anyCorporate = true;
      break;
    }
  }
  return anyCorporate ? SHEET_FORMA_PAGO.TARJETA_EMPRESA : DEFAULT_SHEET_FORMA_PAGO;
}

export function paymentMethodCheckboxesHtml_(formaPago, fontSize = "9px", options = {}) {
  const sel = normalizeFormaPago_(formaPago);
  const stacked = options === true || options?.stacked === true;
  const box = (key, label) => {
    const mark = sel === key ? "☑" : "☐";
    return `${mark} ${label}`;
  };
  if (stacked) {
    return `<div style="margin-top:8px; font-size:${fontSize}; line-height:1.5;">
      <div>${box(SHEET_FORMA_PAGO.TRANSFERENCIA, "Recibí por transferencia*.")}</div>
      <div style="margin:1px 0 6px 18px; font-size:8px;">*Adjuntar recibo de banco por parte de GREFA en caso de pago por transferencia</div>
      <div>${box(SHEET_FORMA_PAGO.EFECTIVO, "Recibí en efectivo*.")}</div>
      <div>${box(SHEET_FORMA_PAGO.TARJETA_EMPRESA, "PAGADOS CON TARJETA EMPRESA*.")}</div>
    </div>`;
  }
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
    viaje: null,
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
  const fechaFirma = String(
    raw.fecha_firma || raw.fechaFirma || raw.fecha_hoja || raw.fechaHoja || ""
  ).trim();
  let viaje = null;
  if (raw.viaje && typeof raw.viaje === "object") {
    const v = viajeFromTripRecord_(raw.viaje);
    if (
      v &&
      (v.fecha_inicio ||
        v.fecha_fin ||
        v.origen ||
        v.destino1 ||
        v.destino2 ||
        v.destino3 ||
        v.destino4 ||
        v.motivo)
    ) {
      viaje = v;
    }
  }
  return {
    dni: String(raw.dni || "").trim(),
    fecha_firma: fechaFirma,
    fecha_hoja: fechaFirma,
    forma_pago: normalizeFormaPago_(raw.forma_pago || raw.formaPago),
    lineas,
    viaje,
    updatedAt: String(raw.updatedAt || "").trim(),
  };
}

/** Construye mapa WP/Acción desde líneas + sheet_meta (si hay). */
export function buildLineMetaMapFromSheetSources_(sheet, lines) {
  const stored = normalizeSheetMeta_(sheet?.sheet_meta || sheet?.meta || {});
  const map = { ...stored.lineas };
  for (const ln of Array.isArray(lines) ? lines : []) {
    const key = lineMetaKey_(ln);
    if (!key) continue;
    const prev = map[key] || {};
    const wp = String(prev.work_package || ln?.work_package || "").trim();
    const acc = String(prev.accion_proyecto || ln?.accion_proyecto || "").trim();
    if (wp || acc) {
      map[key] = { work_package: wp, accion_proyecto: acc };
    }
  }
  return map;
}

/**
 * True si DNI + fecha pie + WP/Acción de cada línea están listos para PDF LIFE
 * sin volver a abrir el modal.
 */
export function isLifePrintMetaComplete_(dni, fechaHoja, lines, lineMetaMap) {
  if (!String(dni || "").trim()) return false;
  if (!(normalizeDateToDmy(fechaHoja) || String(fechaHoja || "").trim())) return false;
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return false;
  const map = lineMetaMap && typeof lineMetaMap === "object" ? lineMetaMap : {};
  for (const ln of list) {
    const key = lineMetaKey_(ln);
    if (!key) return false;
    const fromMap = map[key] || {};
    const wp = String(fromMap.work_package || ln?.work_package || "").trim();
    const acc = String(fromMap.accion_proyecto || ln?.accion_proyecto || "").trim();
    if (!wp || !acc) return false;
  }
  return true;
}

/**
 * Resuelve metadatos LIFE ya grabados (local/remoto) para Consultar/Compartir
 * sin modal. Devuelve { dni, fechaHoja, lineMetaMap } o null si faltan datos.
 */
export function resolveStoredLifePrintMeta_(sheet, lines, extraMeta) {
  const list = Array.isArray(lines) ? lines : [];
  const fromWeb =
    typeof extraMeta === "object" && extraMeta
      ? normalizeSheetMeta_(extraMeta)
      : emptySheetMeta_();
  const fromSheet = normalizeSheetMeta_(sheet?.sheet_meta || sheet?.meta || {});
  const dni = String(
    sheet?.dni || fromSheet.dni || fromWeb.dni || sheet?.viaje?.dni || ""
  ).trim();
  const fechaHoja =
    normalizeDateToDmy(
      sheet?.fecha_hoja ||
        sheet?.fecha_firma ||
        fromSheet.fecha_firma ||
        fromSheet.fecha_hoja ||
        fromWeb.fecha_firma ||
        ""
    ) || "";
  const lineMetaMap = {
    ...fromWeb.lineas,
    ...fromSheet.lineas,
    ...buildLineMetaMapFromSheetSources_(sheet, list),
  };
  if (!isLifePrintMetaComplete_(dni, fechaHoja, list, lineMetaMap)) return null;
  return { dni, fechaHoja, lineMetaMap };
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
  const fromExcel = viajeFromImportedExcelFields_(list);
  if (fromExcel && (fromExcel.fecha_inicio || fromExcel.origen || fromExcel.motivo)) {
    return fromExcel;
  }
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
      fecha_inicio: normalizeDateToDmy(km?.fecha_inicio || km?.fecha_viaje_colaborador || km?.fecha || "") || "",
      // No usar la fecha del gasto como Fecha Fin: en viaje propio es fecha_cierre.
      fecha_fin:
        normalizeDateToDmy(
          km?.fecha_fin || km?.fecha_fin_viaje_colaborador || km?.fecha_cierre || km?.fecha_fin_viaje || ""
        ) || "",
      origen,
      destino1,
      destino2: String(km?.destino2 || km?.destino_2 || "").trim(),
      destino3: String(km?.destino3 || km?.destino_3 || "").trim(),
      destino4: String(km?.destino4 || km?.destino_4 || "").trim(),
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
      fecha_inicio:
        normalizeDateToDmy(withTrip?.fecha_inicio || withTrip?.fecha_viaje_colaborador || withTrip?.fecha || "") || "",
      fecha_fin: normalizeDateToDmy(withTrip?.fecha_fin || withTrip?.fecha_fin_viaje_colaborador || "") || "",
      origen: String(withTrip?.origen_colaborador || withTrip?.origen || "").trim(),
      destino1: String(withTrip?.destino_colaborador || withTrip?.destino || withTrip?.destino1 || "").trim(),
      destino2: String(withTrip?.destino2 || withTrip?.destino_2 || "").trim(),
      destino3: String(withTrip?.destino3 || withTrip?.destino_3 || "").trim(),
      destino4: String(withTrip?.destino4 || withTrip?.destino_4 || "").trim(),
      motivo: String(withTrip?.motivo_colaborador || withTrip?.motivo_salida || withTrip?.motivo || "").trim(),
    };
  }

  const tripHint = options?.viaje || options?.trip || options?.tripRecord;
  if (tripHint) return viajeFromTripRecord_(tripHint);

  return emptyViajeSheet_();
}

export function emptyViajeSheet_() {
  return {
    fecha_inicio: "",
    fecha_fin: "",
    origen: "",
    destino1: "",
    destino2: "",
    destino3: "",
    destino4: "",
    motivo: "",
  };
}

/** Viaje leído del Excel importado (cabecera LIFE u otros metadatos en gastos). */
export function viajeFromImportedExcelFields_(lines) {
  const list = Array.isArray(lines) ? lines : [];
  for (const ln of list) {
    const raw = ln?.raw && typeof ln.raw === "object" ? ln.raw : ln;
    if (!raw || typeof raw !== "object") continue;
    const fi = String(raw.excel_viaje_fecha_inicio || "").trim();
    const origen = String(raw.excel_viaje_origen || "").trim();
    const motivo = String(raw.excel_viaje_motivo || "").trim();
    if (!fi && !origen && !motivo) continue;
    return {
      fecha_inicio: normalizeDateToDmy(fi) || fi,
      fecha_fin: normalizeDateToDmy(String(raw.excel_viaje_fecha_fin || "").trim()) || String(raw.excel_viaje_fecha_fin || "").trim(),
      fecha_viaje: normalizeDateToDmy(fi) || fi,
      fecha_cierre: normalizeDateToDmy(String(raw.excel_viaje_fecha_fin || "").trim()) || String(raw.excel_viaje_fecha_fin || "").trim(),
      origen,
      destino1: String(raw.excel_viaje_destino1 || "").trim(),
      destino2: String(raw.excel_viaje_destino2 || "").trim(),
      destino3: String(raw.excel_viaje_destino3 || "").trim(),
      destino4: String(raw.excel_viaje_destino4 || "").trim(),
      motivo,
      matricula: String(raw.excel_viaje_matricula || raw.matricula || "").trim(),
      dni: String(raw.excel_viaje_dni || "").trim(),
    };
  }
  return null;
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
  const fechaInicioRaw = String(t.fecha_viaje || t.fecha_inicio || t.fecha || "").trim();
  // Fecha fin: prioridad a fecha_cierre del viaje propio; si no, fecha_fin explícita; si no, inicio.
  const fechaFinRaw = String(
    t.fecha_cierre || t.fecha_fin || t.fecha_fin_viaje || fechaInicioRaw || ""
  ).trim();
  const fechaInicio = normalizeDateToDmy(fechaInicioRaw) || "";
  const fechaFin = normalizeDateToDmy(fechaFinRaw) || "";
  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    fecha_viaje: fechaInicio,
    fecha_cierre: fechaFin,
    origen: String(t.origen || t.origen_colaborador || "").trim(),
    destino1: String(t.destino1 || t.destino || t.destino_colaborador || "").trim(),
    destino2: String(t.destino2 || t.destino_2 || "").trim(),
    destino3: String(t.destino3 || t.destino_3 || "").trim(),
    destino4: String(t.destino4 || t.destino_4 || "").trim(),
    motivo: String(t.motivo || t.motivo_colaborador || t.motivo_viaje || t.motivo_salida || t.accion || "").trim(),
    work_package: String(t.work_package || "").trim(),
    accion_proyecto: String(t.accion_proyecto || t.accion || "").trim(),
    dni: String(t.dni || "").trim(),
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

function mergeViajeFields_(...parts) {
  const empty = {
    fecha_inicio: "",
    fecha_fin: "",
    origen: "",
    destino1: "",
    destino2: "",
    destino3: "",
    destino4: "",
    motivo: "",
  };
  const out = { ...empty };
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    for (const k of Object.keys(empty)) {
      const v = String(p[k] || "").trim();
      if (!v) continue;
      // Último valor no vacío gana (API del viaje pisa snapshot local desfasado).
      out[k] = k.startsWith("fecha") ? normalizeDateToDmy(v) || v : v;
    }
  }
  return out;
}

function viajeLooksComplete_(v) {
  return !!(v && String(v.origen || "").trim() && String(v.destino1 || "").trim());
}

/** Prioriza fecha_viaje / fecha_cierre del viaje propio como FECHA INICIO / FECHA FIN de la hoja. */
function preferFechaCierreAsFin_(merged, ...tripSources) {
  const out = { ...(merged || {}) };
  let inicio = "";
  let cierre = "";
  for (const src of tripSources) {
    if (!src || typeof src !== "object") continue;
    const unwrapped =
      src?.viaje && typeof src.viaje === "object"
        ? src.viaje
        : src?.data && typeof src.data === "object"
          ? src.data
          : src;
    if (!inicio) {
      inicio = normalizeDateToDmy(
        unwrapped.fecha_viaje || unwrapped.fecha_inicio || unwrapped.fecha || ""
      );
    }
    if (!cierre) {
      cierre = normalizeDateToDmy(
        unwrapped.fecha_cierre || unwrapped.fecha_fin || unwrapped.fecha_fin_viaje || ""
      );
    }
    if (inicio && cierre) break;
  }
  if (inicio) {
    out.fecha_inicio = inicio;
    out.fecha_viaje = inicio;
  }
  if (cierre) {
    out.fecha_fin = cierre;
    out.fecha_cierre = cierre;
  }
  return out;
}

export async function resolveViajeForExpenseSheetPrint_(lines, expenses, resolveTripDetail, options = {}) {
  const viajeHint = options?.viajeHint || options?.viaje;
  const fromHint = viajeHint ? viajeFromTripRecord_(viajeHint) : null;
  const fromLines = extractViajeFromLines_(lines, options);

  const idViaje = findViajePropioIdFromSheetSources_(lines, expenses);
  if (idViaje && typeof resolveTripDetail === "function") {
    try {
      const res = await resolveTripDetail(idViaje);
      const fromApi = viajeFromTripRecord_(res);
      // Excel / líneas después de API: fechas y destino del Excel prevalecen si el viaje sigue ABIERTO.
      return preferFechaCierreAsFin_(
        mergeViajeFields_(fromHint, fromApi, fromLines),
        fromApi,
        fromHint,
        viajeHint,
        res
      );
    } catch {
      /* fallback abajo */
    }
  }

  if (viajeLooksComplete_(fromHint) && String(fromHint.motivo || "").trim()) {
    return preferFechaCierreAsFin_(mergeViajeFields_(fromLines, fromHint), fromHint, viajeHint);
  }
  if (viajeLooksComplete_(fromLines) && String(fromLines.motivo || "").trim()) {
    return preferFechaCierreAsFin_(mergeViajeFields_(fromHint, fromLines), fromHint, viajeHint);
  }
  return preferFechaCierreAsFin_(mergeViajeFields_(fromHint, fromLines), fromHint, viajeHint);
}

/** URL pública para abrir el tiquet (Drive view / http); vacío si es local o data URI. */
export function publicTicketOpenUrl_(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("file:") || raw.startsWith("content:") || raw.startsWith("blob:")) {
    return "";
  }
  const fileId = extractDriveFileId(raw);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}

/**
 * Enlaces de tiquet/factura por línea (orden fecha + nº factura).
 * No descarga ni embebe imagen/PDF: solo URL para el anexo de la hoja.
 */
export function buildTicketLinkRowsForLines_(lines, expenseList) {
  const expenseByKey = new Map();
  for (const e of expenseList || []) {
    const keys = [
      String(e?.id_gasto || "").trim(),
      String(e?.local_id || "").trim(),
      String(e?.id || "").trim(),
    ].filter(Boolean);
    for (const k of keys) expenseByKey.set(k, e);
  }
  const list = sortExpenseSheetLinesByDateInvoice_(Array.isArray(lines) ? lines : []);
  const out = [];
  const seen = new Set();
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
    const labelBase = String(ln?.concepto || ln?.tipo_gasto || `Gasto ${i + 1}`).trim();
    const fecha = String(ln?.fecha || "").trim();
    const factura = String(ln?.numero_factura || "").trim();
    let linkIdx = 0;
    for (const url of urls) {
      if (!isPdfOrImageTicketUrl(url) && !isRemoteTicketAttachmentUrl(url)) continue;
      const openUrl = publicTicketOpenUrl_(url);
      if (!openUrl) continue;
      if (seen.has(openUrl)) continue;
      seen.add(openUrl);
      linkIdx += 1;
      out.push({
        label: urls.length > 1 ? `${labelBase} (${linkIdx})` : labelBase,
        url: openUrl,
        fecha,
        numero_factura: factura,
        kind: /\.pdf(\?|$)/i.test(url) || /pdf/i.test(url) ? "pdf" : "imagen",
      });
    }
  }
  return out;
}

/** Resuelve adjuntos de tickets para el anexo del PDF (orden = líneas; descargas en paralelo). */
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
  // Orden de anexo = orden de líneas de la hoja (fecha + nº factura).
  const list = sortExpenseSheetLinesByDateInvoice_(Array.isArray(lines) ? lines : []);
  const jobs = [];
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
      const labelBase = String(ln?.concepto || ln?.tipo_gasto || `Gasto ${i + 1}`).trim();
      jobs.push({
        order: jobs.length,
        url,
        label: urls.length > 1 ? `${labelBase} (${j + 1})` : labelBase,
      });
    }
  }
  const resolvedList = await mapPool_(jobs, 4, async (job) => {
    const resolved = await toDataUri(job.url);
    const dataUri = String(resolved || "").startsWith("data:") ? resolved : "";
    return {
      _order: job.order,
      label: job.label,
      dataUri,
      url: dataUri ? job.url : resolved || job.url,
      mime:
        /\.pdf(\?|$)/i.test(job.url) ||
        String(dataUri || "").startsWith("data:application/pdf") ||
        String(resolved || "").toLowerCase().includes("application/pdf")
          ? "application/pdf"
          : "image/jpeg",
    };
  });
  return resolvedList
    .slice()
    .sort((a, b) => (Number(a?._order) || 0) - (Number(b?._order) || 0))
    .map(({ _order, ...rest }) => rest);
}

export async function persistSheetMeta_(localDb, hojaId, dni, lineMetaMap, fechaFirma, formaPago, viaje) {
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
  const viajeNorm = viaje && typeof viaje === "object" ? viajeFromTripRecord_(viaje) : null;
  await localDb.setExpenseSheetMeta(hid, {
    dni: String(dni || "").trim(),
    fecha_firma: String(fechaFirma || "").trim(),
    forma_pago: normalizeFormaPago_(formaPago),
    lineas,
    viaje: viajeNorm,
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

export function persistSheetMetaToWebStorage_(hojaId, dni, lineMetaMap, fechaFirma, formaPago, viaje) {
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
  const viajeNorm = viaje && typeof viaje === "object" ? viajeFromTripRecord_(viaje) : null;
  map[hid] = {
    dni: String(dni || "").trim(),
    fecha_firma: String(fechaFirma || "").trim(),
    forma_pago: normalizeFormaPago_(formaPago),
    lineas,
    viaje: viajeNorm,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(WEB_META_KEY, JSON.stringify(map));
}
