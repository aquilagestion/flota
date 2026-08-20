/** Margen útil en anexo PDF de tickets (mm). Alineado con flotaWeb/lib/ticketImageLayout.js */
export const TICKET_PDF_MARGIN_MM = 8;
export const TICKET_ANNEX_PAGE_W_MM = 210 - TICKET_PDF_MARGIN_MM * 2;
export const TICKET_ANNEX_PAGE_H_MM = 297 - TICKET_PDF_MARGIN_MM * 2;
export const TICKET_ANNEX_TITLE_MM = 10;
export const MM_TO_PT = 72 / 25.4;

function safeNum_(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Caja de imagen en mm para anexo PDF (sin deformar). Props: width/height (compat web). */
export function computeTicketAnnexImgBoxMm(naturalW, naturalH, opts = {}) {
  const hasTitle = opts.hasTitle !== false && opts.titleMm !== 0;
  const titleMm = hasTitle ? safeNum_(opts.titleMm ?? TICKET_ANNEX_TITLE_MM, TICKET_ANNEX_TITLE_MM) : 0;
  const pageW = Math.max(1, safeNum_(opts.pageW ?? TICKET_ANNEX_PAGE_W_MM, TICKET_ANNEX_PAGE_W_MM));
  const pageH = Math.max(10, safeNum_(opts.pageH ?? TICKET_ANNEX_PAGE_H_MM, TICKET_ANNEX_PAGE_H_MM) - titleMm);
  const nw = Math.max(1, safeNum_(naturalW, 1));
  const nh = Math.max(1, safeNum_(naturalH, 1));
  const scale = Math.min(pageW / nw, pageH / nh);
  const width = nw * scale;
  const height = nh * scale;
  return {
    width,
    height,
    // aliases legacy
    widthMm: width,
    heightMm: height,
    offsetXMm: (pageW - width) / 2 + TICKET_PDF_MARGIN_MM,
    offsetYMm: TICKET_PDF_MARGIN_MM + titleMm + (pageH - height) / 2,
    ratio: scale,
  };
}

export function mmToPt(mm) {
  const n = Number(mm);
  return Number.isFinite(n) ? n * MM_TO_PT : 0;
}
