import { ticketUrlToDataUri_ } from "./expenseTicketResolve";
import {
  TICKET_PDF_MARGIN_MM,
  TICKET_ANNEX_TITLE_MM,
  computeTicketAnnexImgBoxMm,
  ticketPdfPageBoxMm,
} from "./ticketImageLayout";

export const MM_TO_PT = 72 / 25.4;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_PT = A4_WIDTH_MM * MM_TO_PT;
export const A4_HEIGHT_PT = A4_HEIGHT_MM * MM_TO_PT;

function normalizeTicketAttachmentList_(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  return list
    .map((att, idx) => ({
      label: String(att?.label || `Ticket ${idx + 1}`).trim(),
      src: String(att?.dataUri || att?.data_uri || att?.src || att?.url || "").trim(),
      mime: String(att?.mime || att?.mimeType || att?.mime_type || "").trim(),
    }))
    .filter((att) => att.src);
}

export function base64ToUint8Array_(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  if (typeof atob === "function") {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(clean, "base64"));
  }
  throw new Error("Base64 no disponible en este entorno.");
}

export function uint8ArrayToBase64_(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(arr).toString("base64");
  }
  throw new Error("Base64 no disponible en este entorno.");
}

export function parseTicketImageDataUri_(dataUri) {
  const raw = String(dataUri || "").trim();
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(raw);
  if (!m) return null;
  const mime = String(m[1] || "image/jpeg").trim().toLowerCase() || "image/jpeg";
  const bytes = base64ToUint8Array_(m[2]);
  return { mime, bytes };
}

function imageFormatFromMime_(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "PNG";
  if (m.includes("webp")) return "WEBP";
  return "JPEG";
}

function imageFormatFromDataUri_(src) {
  const parsed = parseTicketImageDataUri_(src);
  if (parsed?.mime) return imageFormatFromMime_(parsed.mime);
  const s = String(src || "").toLowerCase();
  if (s.startsWith("data:image/png")) return "PNG";
  if (s.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

/** Resuelve data URI de imagen a máxima calidad (sin reescalar ni recomprimir JPEG). */
export async function resolveTicketImageDataUri_(src, options = {}) {
  let raw = String(src || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:image")) {
    raw = String(
      await ticketUrlToDataUri_(raw, {
        apiGet: options.apiGet,
        userEmail: options.userEmail,
      }) || ""
    ).trim();
  }
  if (!raw.startsWith("data:image")) return "";
  if (raw.startsWith("data:image/jpeg") || raw.startsWith("data:image/jpg") || raw.startsWith("data:image/png")) {
    return raw;
  }

  if (typeof document === "undefined" || typeof Image === "undefined") {
    return raw;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, img.naturalWidth || 800);
        canvas.height = Math.max(1, img.naturalHeight || 1100);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(raw);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.99));
      } catch {
        resolve(raw);
      }
    };
    img.onerror = () => resolve("");
    img.src = raw;
  });
}

async function loadImageNaturalSizeInBrowser_(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        naturalWidth: Math.max(1, img.naturalWidth || 800),
        naturalHeight: Math.max(1, img.naturalHeight || 1100),
      });
    };
    img.onerror = () => resolve({ naturalWidth: 1200, naturalHeight: 1600 });
    img.src = src;
  });
}

function safePt_(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeTicketAnnexPlacementPt_(naturalWidth, naturalHeight, { hasLabel = false, pageWidthPt = A4_WIDTH_PT, pageHeightPt = A4_HEIGHT_PT } = {}) {
  const pageWPt = safePt_(pageWidthPt, A4_WIDTH_PT);
  const pageHPt = safePt_(pageHeightPt, A4_HEIGHT_PT);
  const pageWidthMm = pageWPt / MM_TO_PT;
  const pageHeightMm = pageHPt / MM_TO_PT;
  const { maxW, margin, titleH } = ticketPdfPageBoxMm(pageWidthMm, pageHeightMm, hasLabel);
  const fit = computeTicketAnnexImgBoxMm(naturalWidth, naturalHeight, { hasTitle: hasLabel });
  const fitW = safePt_(fit.width, 100);
  const fitH = safePt_(fit.height, 140);
  const imgWPt = safePt_(fitW * MM_TO_PT, 280);
  const imgHPt = safePt_(fitH * MM_TO_PT, 400);
  const xPt = safePt_((margin + (maxW - fitW) / 2) * MM_TO_PT, margin * MM_TO_PT);
  const yPt = safePt_(pageHPt - margin * MM_TO_PT - titleH * MM_TO_PT - imgHPt, margin * MM_TO_PT);
  const labelYPt = safePt_(pageHPt - margin * MM_TO_PT - 4, pageHPt - 20);
  return {
    xPt,
    yPt,
    imgWPt,
    imgHPt,
    labelYPt,
    marginPt: safePt_(margin * MM_TO_PT, 22),
    maxWPt: safePt_(maxW * MM_TO_PT, pageWPt - 44),
  };
}

async function embedTicketInPdfLibPage_(pdfDoc, page, attachment, options = {}) {
  const imgDataUri = await resolveTicketImageDataUri_(attachment.src, options);
  if (!imgDataUri.startsWith("data:image")) return false;

  const parsed = parseTicketImageDataUri_(imgDataUri);
  if (!parsed?.bytes?.length) return false;

  let image;
  const fmt = imageFormatFromMime_(parsed.mime);
  try {
    if (fmt === "PNG") {
      image = await pdfDoc.embedPng(parsed.bytes);
    } else {
      image = await pdfDoc.embedJpg(parsed.bytes);
    }
  } catch {
    try {
      image = await pdfDoc.embedJpg(parsed.bytes);
    } catch {
      return false;
    }
  }

  const naturalWidth = image.width;
  const naturalHeight = image.height;
  const hasLabel = Boolean(attachment.label);
  const place = computeTicketAnnexPlacementPt_(naturalWidth, naturalHeight, { hasLabel });

  if (hasLabel) {
    const { StandardFonts, rgb } = await import("pdf-lib");
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const label = String(attachment.label || "").trim();
    const textWidth = font.widthOfTextAtSize(label, 10);
    const lx = safePt_(place.marginPt + Math.max(0, (place.maxWPt - textWidth) / 2), place.marginPt);
    const ly = safePt_(place.labelYPt, 20);
    if (Number.isFinite(lx) && Number.isFinite(ly)) {
      page.drawText(label, {
        x: lx,
        y: ly,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  if (
    Number.isFinite(place.xPt) &&
    Number.isFinite(place.yPt) &&
    Number.isFinite(place.imgWPt) &&
    Number.isFinite(place.imgHPt) &&
    place.imgWPt > 0 &&
    place.imgHPt > 0
  ) {
    page.drawImage(image, {
      x: place.xPt,
      y: place.yPt,
      width: place.imgWPt,
      height: place.imgHPt,
    });
    return true;
  }
  return false;
}

function isPdfAttachment_(attachment) {
  const mime = String(attachment?.mime || "").toLowerCase();
  const src = String(attachment?.src || "").trim();
  return mime.includes("pdf") || src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
}

async function resolveTicketPdfBytes_(src, options = {}) {
  let raw = String(src || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("data:")) {
    raw = String(
      await ticketUrlToDataUri_(raw, {
        apiGet: options.apiGet,
        userEmail: options.userEmail,
      }) || ""
    ).trim();
  }
  if (!raw.startsWith("data:")) return null;
  const parsed = parseTicketImageDataUri_(raw);
  if (!parsed?.bytes?.length) return null;
  if (!String(parsed.mime || "").toLowerCase().includes("pdf") && !raw.startsWith("data:application/pdf")) {
    // Algunos backends devuelven application/octet-stream; comprobar cabecera %PDF
    const b = parsed.bytes;
    if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) return null;
  }
  return parsed.bytes;
}

async function appendPdfTicketPages_(pdfDoc, attachment, options = {}) {
  const bytes = await resolveTicketPdfBytes_(attachment.src, options);
  if (!bytes?.length) return false;
  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(bytes);
  const pageIndices = srcDoc.getPageIndices();
  if (!pageIndices.length) return false;
  const copied = await pdfDoc.copyPages(srcDoc, pageIndices);
  for (const page of copied) pdfDoc.addPage(page);
  return true;
}

/** Añade páginas de tickets a un PDF existente (pdf-lib). Devuelve Uint8Array. */
export async function appendTicketAttachmentsWithPdfLib(pdfBytes, attachments, options = {}) {
  const { PDFDocument } = await import("pdf-lib");
  const list = normalizeTicketAttachmentList_(attachments);
  if (!list.length) return pdfBytes;

  const input = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes || []);
  const pdfDoc = await PDFDocument.load(input);

  for (const ticket of list) {
    if (isPdfAttachment_(ticket)) {
      const okPdf = await appendPdfTicketPages_(pdfDoc, ticket, options);
      if (okPdf) continue;
    }
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const ok = await embedTicketInPdfLibPage_(pdfDoc, page, ticket, options);
    if (!ok) {
      pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    }
  }

  return pdfDoc.save();
}

/** Añade páginas de tickets a un documento jsPDF (web). */
export async function appendTicketAttachmentsToJsPdf(pdf, attachments, options = {}) {
  const list = normalizeTicketAttachmentList_(attachments);
  for (const ticket of list) {
    const imgData = await resolveTicketImageDataUri_(ticket.src, options);
    if (!imgData.startsWith("data:image")) continue;

    const { naturalWidth, naturalHeight } = await loadImageNaturalSizeInBrowser_(imgData);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const { maxW, margin, titleH } = ticketPdfPageBoxMm(pageWidth, pageHeight, Boolean(ticket.label));
    const fit = computeTicketAnnexImgBoxMm(naturalWidth, naturalHeight, { hasTitle: Boolean(ticket.label) });
    const w = fit.width;
    const h = fit.height;
    const x = margin + (maxW - w) / 2;
    const y = margin + titleH;

    pdf.addPage();
    const imgFormat = imageFormatFromDataUri_(imgData);
    try {
      if (ticket.label) {
        pdf.setFontSize(10);
        pdf.text(ticket.label, margin, margin + 4, { maxWidth: maxW });
      }
      pdf.addImage(imgData, imgFormat, x, y, w, h, undefined, "NONE");
    } catch {
      try {
        pdf.addImage(imgData, "JPEG", x, y, w, h, undefined, "NONE");
      } catch {
        pdf.deletePage(pdf.getNumberOfPages());
      }
    }
  }
  return pdf;
}
