import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { PDFDocument } from "pdf-lib";
import { collectTicketAttachmentsFromLines } from "./expenseSheetTickets";
import { loadTicketImageBytes } from "./expenseTicketResolve";
import {
  TICKET_PDF_MARGIN_MM,
  computeTicketAnnexImgBoxMm,
  mmToPt,
} from "./ticketImageLayout";

const A4_W_PT = mmToPt(210);
const A4_H_PT = mmToPt(297);
const ANNEX_CONCURRENCY = 3;

function safePt_(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uint8ToBase64_(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readPdfBytes_(uri) {
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: enc });
  return base64ToUint8Array_(b64);
}

function base64ToUint8Array_(b64) {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function writePdfBytes_(bytes, fileName) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) throw new Error("Sin carpeta temporal para PDF");
  const uri = `${dir}${fileName}`;
  const b64 = uint8ToBase64_(bytes);
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: enc });
  return uri;
}

async function resolveTicketSource_(ticket) {
  const dataUri = String(ticket?.dataUri || "").trim();
  if (dataUri.startsWith("data:")) {
    return loadTicketImageBytes(dataUri);
  }
  const url = String(ticket?.url || "").trim();
  if (!url) throw new Error("URL de ticket vacía");
  return loadTicketImageBytes(url);
}

async function mapPoolLocal_(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      out[i] = await mapper(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
}

async function appendTicketsToPdf_(pdfUri, tickets) {
  if (!tickets.length) return pdfUri;
  const mainBytes = await readPdfBytes_(pdfUri);
  const pdfDoc = await PDFDocument.load(mainBytes);

  const loadedList = await mapPoolLocal_(tickets, ANNEX_CONCURRENCY, async (ticket) => {
    try {
      const loaded = await resolveTicketSource_(ticket);
      return { ticket, ...loaded };
    } catch {
      return null;
    }
  });

  for (const item of loadedList) {
    if (!item) continue;
    const { bytes, kind } = item;

    if (kind === "pdf") {
      try {
        const srcDoc = await PDFDocument.load(bytes);
        const copied = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        for (const page of copied) pdfDoc.addPage(page);
      } catch {
        // omitir PDF ilegible
      }
      continue;
    }

    let embedded;
    let naturalW = 1;
    let naturalH = 1;
    try {
      if (kind === "png") {
        embedded = await pdfDoc.embedPng(bytes);
      } else {
        embedded = await pdfDoc.embedJpg(bytes);
      }
      naturalW = embedded.width;
      naturalH = embedded.height;
    } catch {
      continue;
    }

    const page = pdfDoc.addPage([A4_W_PT, A4_H_PT]);
    const marginPt = safePt_(mmToPt(TICKET_PDF_MARGIN_MM), 22);
    const box = computeTicketAnnexImgBoxMm(naturalW, naturalH, { hasTitle: false });
    const boxWMm = safePt_(box.width ?? box.widthMm, 100);
    const boxHMm = safePt_(box.height ?? box.heightMm, 140);
    const drawW = safePt_(mmToPt(boxWMm), 280);
    const drawH = safePt_(mmToPt(boxHMm), 400);
    const usableBottom = marginPt;
    const usableTop = safePt_(A4_H_PT - marginPt, A4_H_PT - 22);
    const usableH = Math.max(1, usableTop - usableBottom);
    const x = safePt_((A4_W_PT - drawW) / 2, marginPt);
    const y = safePt_(usableBottom + Math.max(0, (usableH - drawH) / 2), usableBottom);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(drawW) &&
      Number.isFinite(drawH) &&
      drawW > 0 &&
      drawH > 0
    ) {
      page.drawImage(embedded, { x, y, width: drawW, height: drawH });
    }
  }

  const outBytes = await pdfDoc.save();
  return writePdfBytes_(outBytes, `hoja_gasto_${Date.now()}.pdf`);
}

async function buildExpenseSheetPdfUri_({
  html,
  lines = [],
  localExpenses = [],
  ticketAttachments = null,
  skipTicketAnnex = false,
}) {
  const pdf = await Print.printToFileAsync({ html });
  let pdfUri = String(pdf?.uri || "").trim();
  if (!pdfUri) throw new Error("No se pudo generar el PDF.");

  if (!skipTicketAnnex) {
    const hydrated = Array.isArray(ticketAttachments)
      ? ticketAttachments.filter(
          (t) => String(t?.dataUri || "").startsWith("data:") || String(t?.url || "").trim()
        )
      : [];
    const tickets = hydrated.length
      ? hydrated.map((t) => ({
          label: t.label || "Ticket",
          url: String(t.dataUri || t.url || "").trim(),
          dataUri: String(t.dataUri || "").trim(),
        }))
      : collectTicketAttachmentsFromLines(lines, localExpenses);
    if (tickets.length) {
      pdfUri = await appendTicketsToPdf_(pdfUri, tickets);
    }
  }
  return pdfUri;
}

async function openPdfForPreview_(pdfUri) {
  const uri = String(pdfUri || "").trim();
  if (!uri) throw new Error("PDF vacío para vista previa.");
  try {
    const getContentUri = FileSystem.getContentUriAsync;
    if (typeof getContentUri === "function") {
      const contentUri = await getContentUri(uri);
      const IntentLauncher = await import("expo-intent-launcher");
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/pdf",
      });
      return uri;
    }
  } catch {
    // fallback sharing
  }
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Abrir vista previa",
      UTI: "com.adobe.pdf",
    });
    return uri;
  }
  throw new Error("No se pudo abrir la vista previa del PDF en este dispositivo.");
}

/** Genera PDF de hoja (HTML) y anexa tiquets (imagen/PDF) con pdf-lib. */
export async function printAndShareExpenseSheetPdf({
  html,
  lines = [],
  localExpenses = [],
  ticketAttachments = null,
  skipTicketAnnex = false,
  dialogTitle = "Compartir hoja",
}) {
  const pdfUri = await buildExpenseSheetPdfUri_({
    html,
    lines,
    localExpenses,
    ticketAttachments,
    skipTicketAnnex,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(pdfUri, {
      mimeType: "application/pdf",
      dialogTitle,
      UTI: "com.adobe.pdf",
    });
  } else {
    await Print.printAsync({ html });
  }
  return pdfUri;
}

/** Vista previa: genera PDF temporal y lo abre (visor del sistema). */
export async function previewExpenseSheetPdf({
  html,
  lines = [],
  localExpenses = [],
  ticketAttachments = null,
  skipTicketAnnex = false,
  dialogTitle = "Vista previa hoja",
}) {
  const pdfUri = await buildExpenseSheetPdfUri_({
    html,
    lines,
    localExpenses,
    ticketAttachments,
    skipTicketAnnex,
  });
  await openPdfForPreview_(pdfUri);
  return pdfUri;
}
