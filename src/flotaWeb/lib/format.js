/** Parsea dd/mm/aaaa, yyyy-mm-dd o ISO sin desfase de zona horaria.
 *  Convención canónica del producto: siempre día/mes/año (españa). */
export function parseDateFlexible(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }
  // Número: serial Sheets (~45xxx). Un año suelto (2026) no es fecha.
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1000 && value <= 9999) return null;
    if (value > 20000 && value < 120000) {
      // Epoch Sheets: 1899-12-30
      const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0) : null;
    }
    return null;
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return null;

  // Serial Excel como texto ("46132" desde OpenXML).
  if (/^\d{5,6}(\.\d+)?$/.test(raw)) {
    const sn = Number(raw);
    if (sn > 20000 && sn < 120000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(sn) * 86400000;
      const d = new Date(ms);
      if (Number.isFinite(d.getTime())) {
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0);
      }
    }
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let a = Number(slash[1]);
    let b = Number(slash[2]);
    const yyyy = Number(slash[3]);
    // Convención producto: a=día, b=mes (dd/mm/aaaa).
    // Si b>12 y a≤12, es mm/dd/aaaa (p. ej. 07/21/2026 desde locale US) → invertir.
    let dd = a;
    let mm = b;
    if (b > 12 && a >= 1 && a <= 12) {
      dd = b;
      mm = a;
    }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
    return Number.isFinite(d.getTime()) && d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd
      ? d
      : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const isoHead = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoHead) {
      const d = new Date(Number(isoHead[1]), Number(isoHead[2]) - 1, Number(isoHead[3]), 12, 0, 0, 0);
      return Number.isFinite(d.getTime()) ? d : null;
    }
  }
  // "Wed Jul 21 2026 …" u otros Date.toString() del servidor.
  if (/GMT[+-]|\bUTC\b|hora de verano|Central European|(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(raw)) {
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    }
  }
  // No usar new Date("02/12/2025"): en JS interpreta mm/dd (EEUU).
  return null;
}

export function dateObjectToDmy(d) {
  if (!d || !Number.isFinite(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Normaliza cualquier fecha reconocible a dd/mm/aaaa (cadena vacía si no hay valor). */
export function normalizeDateToDmy(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return dateObjectToDmy(value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const d = parseDateFlexible(raw);
  if (d) return dateObjectToDmy(d);
  // Si llegó yyyy-mm-dd sin hora, forzar a dd/mm/aaaa.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  // Nunca devolver crudo estilo mm/dd (p. ej. 07/21/2026): mejor vacío que formato US.
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const parts = raw.split("/");
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (b > 12 && a >= 1 && a <= 12) {
      return `${String(b).padStart(2, "0")}/${String(a).padStart(2, "0")}/${parts[2]}`;
    }
  }
  return raw;
}

/** Fecha visible en UI: siempre dd/mm/aaaa; «-» si no hay valor. */
export function formatDateEsValue(value) {
  const dmy = normalizeDateToDmy(value);
  return dmy || "-";
}

/** Fecha legal de firma: «15 de junio de 2026». Vacío si no hay fecha. */
export function formatSignatureDateEsValue(value) {
  const d = parseDateFlexible(value);
  if (!d) return "";
  const day = d.getDate();
  const month = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(d);
  const year = d.getFullYear();
  return `${day} de ${month} de ${year}`;
}

export function formatCurrencyEsValue(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

export function escapeHtmlValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Nº factura/tiquet para hoja: evita Date.toString() y seriales de fecha colados en el campo.
 */
export function sanitizeInvoiceNumberText(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // Serial Sheets ≈ fecha, no nº de factura.
    if (value > 20000 && value < 120000) return "";
    return String(value);
  }
  const s = String(value).trim();
  if (!s) return "";
  if (/GMT[+-]|\bUTC\b|hora de verano|Central European/i.test(s)) return "";
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|lun|mar|mié|jue|vie|sáb|dom)\b/i.test(s) && /\d{4}/.test(s)) {
    return "";
  }
  return s;
}

export function daysInMonth(year, month1to12) {
  const y = Number(year);
  const m = Number(month1to12);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 30;
  return new Date(y, m, 0).getDate();
}

export function monthLabelEs(year, month1to12) {
  const y = Number(year);
  const m = Number(month1to12);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function getMonthGridMonday(year, month1to12) {
  const y = Number(year);
  const m = Number(month1to12);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const totalDays = daysInMonth(y, m);
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function eventOverlapsDay(event, year, month1to12, day) {
  const s = parseDateFlexible(event?.desde);
  const e = parseDateFlexible(event?.hasta);
  if (!s || !e) return false;
  const d0 = new Date(year, month1to12 - 1, day, 0, 0, 0, 0);
  const d1 = new Date(year, month1to12 - 1, day, 23, 59, 59, 999);
  return s <= d1 && e >= d0;
}

export function extractDriveFileId(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const m1 = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m1?.[1]) return m1[1];
  const m2 = raw.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m2?.[1]) return m2[1];
  const m3 = raw.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m3?.[1]) return m3[1];
  return "";
}

export function ticketPreviewUrls(ticketUrl) {
  const openUrl = String(ticketUrl || "").trim();
  const fileId = extractDriveFileId(openUrl);
  if (!fileId) {
    return {
      openUrl,
      imageUrl: openUrl,
      iframeUrl: openUrl,
    };
  }
  return {
    openUrl: `https://drive.google.com/file/d/${fileId}/view`,
    imageUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w4096`,
    iframeUrl: `https://drive.google.com/file/d/${fileId}/preview`,
  };
}

export function inferTicketKind({ url = "", mimeType = "", fileName = "" } = {}) {
  const mime = String(mimeType || "").trim().toLowerCase();
  const name = String(fileName || "").trim().toLowerCase();
  const rawUrl = String(url || "").trim().toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf") || rawUrl.includes(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (/\.(jpg|jpeg|png|webp|gif|bmp|tiff)(\?|$)/i.test(rawUrl)) return "image";
  return "image";
}

export function expenseDate(expense) {
  const e = expense || {};
  const tipo = String(e.tipo_gasto || "").trim().toUpperCase();
  const byTipo = {
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
  const typedKey = byTipo[tipo];
  const typedRaw = typedKey ? String(e[typedKey] ?? "").trim() : "";
  const typed = typedRaw ? normalizeDateToDmy(e[typedKey]) || typedRaw : "";
  const canonicalRaw = String(e.fecha ?? "").trim();
  const canonical = canonicalRaw ? normalizeDateToDmy(e.fecha) || canonicalRaw : "";
  // Si divergen (tipada vieja vs fecha editada), manda la canónica.
  if (canonical && typed && canonical !== typed) return canonical;
  if (typed) return typed;
  if (canonical) return canonical;
  const candidates = [
    e.fecha_viaje_colaborador,
    e.fecha_repostaje,
    e.fecha_compra_mantenimiento,
    e.fecha_compra_repuestos,
    e.fecha_aparcamiento,
    e.fecha_peaje,
    e.fecha_inspeccion,
    e.fecha_otros_gastos,
    e.fecha_multa,
    e.fecha_inicio_seguro,
    e.fecha_pago,
    e.periodo_ivm,
    e.createdAtLocal,
  ];
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    return normalizeDateToDmy(value) || raw;
  }
  return "";
}

export function toDateMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const d = new Date(`${m[3]}-${mm}-${dd}T00:00:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}
