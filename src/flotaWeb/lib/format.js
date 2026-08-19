/** Parsea dd/mm/aaaa, yyyy-mm-dd o ISO sin desfase de zona horaria. */
export function parseDateFlexible(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let dd = Number(slash[1]);
    let mm = Number(slash[2]);
    const yyyy = Number(slash[3]);
    // Si el 2.º grupo parece mes US (>12) y el 1.º día válido, interpretar mm/dd/aaaa.
    if (mm > 12 && dd >= 1 && dd <= 12) {
      const day = mm;
      mm = dd;
      dd = day;
    }
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
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
  const s = new Date(String(event?.desde || ""));
  const e = new Date(String(event?.hasta || ""));
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return false;
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
  const candidates = [
    expense?.fecha_viaje_colaborador,
    expense?.fecha_repostaje,
    expense?.fecha_compra_mantenimiento,
    expense?.fecha_compra_repuestos,
    expense?.fecha_aparcamiento,
    expense?.fecha_peaje,
    expense?.fecha_inspeccion,
    expense?.fecha_otros_gastos,
    expense?.fecha_multa,
    expense?.fecha,
    expense?.createdAtLocal,
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
