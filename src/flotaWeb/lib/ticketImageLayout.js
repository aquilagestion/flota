/** Proporción A4 vertical (210 × 297 mm). */
export const A4_ASPECT_RATIO = 210 / 297;

/** A4 a ~200 DPI: solo para vista previa en pantalla (no para exportar/subir). */
export const A4_PRINT_WIDTH_PX = 1654;
export const A4_PRINT_HEIGHT_PX = 2339;

/** Máximo lado largo al guardar ticket (≈300 DPI en A4). Sin deformar ni ampliar. */
export const TICKET_IMAGE_MAX_LONG_EDGE_PX = 3200;
export const TICKET_IMAGE_JPEG_QUALITY = 0.98;

/**
 * Dimensiones de exportación: solo reduce si el original es muy grande.
 * No añade márgenes A4 (eso se hace al imprimir la hoja de gasto).
 */
export function computeTicketExportDimensions(naturalW, naturalH, maxLongEdge = TICKET_IMAGE_MAX_LONG_EDGE_PX) {
  const nw = Math.max(1, Number(naturalW) || 1);
  const nh = Math.max(1, Number(naturalH) || 1);
  const long = Math.max(nw, nh);
  if (long <= maxLongEdge) {
    return { width: Math.round(nw), height: Math.round(nh), changed: false };
  }
  const scale = maxLongEdge / long;
  return {
    width: Math.round(nw * scale),
    height: Math.round(nh * scale),
    changed: true,
  };
}

/** Resize en expo-image-manipulator: una sola dimensión para no estirar. */
export function ticketImageResizeAction(targetW, targetH, naturalW, naturalH) {
  const nw = Math.max(1, Number(naturalW) || 1);
  const nh = Math.max(1, Number(naturalH) || 1);
  const tw = Math.max(1, Math.round(Number(targetW) || 1));
  const th = Math.max(1, Math.round(Number(targetH) || 1));
  if (nw >= nh) {
    return [{ resize: { width: tw } }];
  }
  return [{ resize: { height: th } }];
}

/** Altura de viewport A4 dado un ancho en px. */
export function a4ViewportHeightPx(widthPx) {
  const w = Math.max(1, Number(widthPx) || 1);
  return Math.round(w / A4_ASPECT_RATIO);
}

/** Caja A4 en pantalla respetando maxWidth y maxHeight (sin deformar). */
export function computeA4DisplayBox(maxWidth, maxHeight) {
  const mw = Math.max(120, Number(maxWidth) || 400);
  const mh = Math.max(160, Number(maxHeight) || 560);
  let width = mw;
  let height = a4ViewportHeightPx(width);
  if (height > mh) {
    height = mh;
    width = Math.round(height * A4_ASPECT_RATIO);
  }
  return { width, height };
}

/** DPI objetivo al rasterizar anexo HTML (expo-print / vista previa). */
export const TICKET_ANNEX_RENDER_DPI = 300;

/** A4 útil en mm (margen 8mm). */
export const TICKET_PDF_MARGIN_MM = 8;
export const TICKET_PDF_TITLE_MM = 8;

/** Área útil A4 con margen 8 mm (coincide con @page / jsPDF). */
export const TICKET_ANNEX_PAGE_W_MM = 210 - TICKET_PDF_MARGIN_MM * 2;
export const TICKET_ANNEX_PAGE_H_MM = 297 - TICKET_PDF_MARGIN_MM * 2;
export const TICKET_ANNEX_TITLE_MM = 10;

/** Estilos de respaldo cuando no hay dimensiones naturales (sin ancho fijo: evita estirar en expo-print). */
export const TICKET_ANNEX_IMG_STYLE =
  `display:block;margin:0 auto;max-width:${TICKET_ANNEX_PAGE_W_MM}mm;max-height:${TICKET_ANNEX_PAGE_H_MM - TICKET_ANNEX_TITLE_MM}mm;width:auto;height:auto;object-fit:contain;object-position:center;`;

/** Caja de imagen en mm para anexo PDF/HTML a partir de píxeles naturales. */
export function computeTicketAnnexImgBoxMm(naturalW, naturalH, { hasTitle = true } = {}) {
  const titleMm = hasTitle ? TICKET_ANNEX_TITLE_MM : 0;
  const maxW = TICKET_ANNEX_PAGE_W_MM;
  const maxH = Math.max(10, TICKET_ANNEX_PAGE_H_MM - titleMm);
  return computeImageFitBox(naturalW, naturalH, maxW, maxH);
}

/** Calcula caja de ajuste preservando proporción (permite ampliar imágenes pequeñas). */
export function computeImageFitBox(naturalW, naturalH, maxW, maxH) {
  const nw = Math.max(1, Number(naturalW) || 1);
  const nh = Math.max(1, Number(naturalH) || 1);
  const mw = Math.max(1, Number(maxW) || 1);
  const mh = Math.max(1, Number(maxH) || 1);
  const ratio = Math.min(mw / nw, mh / nh);
  return {
    width: nw * ratio,
    height: nh * ratio,
    ratio,
  };
}

export function ticketPdfPageBoxMm(pageWidthMm, pageHeightMm, hasLabel = false) {
  const margin = TICKET_PDF_MARGIN_MM;
  const titleH = hasLabel ? TICKET_ANNEX_TITLE_MM : 0;
  return {
    maxW: Math.max(10, pageWidthMm - margin * 2),
    maxH: Math.max(10, pageHeightMm - margin * 2 - titleH),
    margin,
    titleH,
  };
}
