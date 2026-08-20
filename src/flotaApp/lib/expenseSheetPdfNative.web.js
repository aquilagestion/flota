/**
 * Web: genera e imprime la plantilla HTML de la hoja (LIFE/GREFA).
 * Anexa tiquets embebidos (imagen A4 contain; PDF rasterizado a JPEG).
 * NO usar expo-print aquí: en web solo hace window.print() de la SPA.
 */
import { collectTicketAttachmentsFromLines } from "./expenseSheetTickets";
import { loadTicketImageBytes } from "./expenseTicketResolve";
import { hydrateTicketAttachmentsViaApi_ } from "../../flotaWeb/lib/expenseTicketResolve";
import {
  isPdfTicketDataUri_,
  rasterizePdfDataUriToJpegPages_,
} from "../../flotaWeb/lib/pdfTicketRasterize";

function escapeHtml_(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uint8ToBase64_(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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

function imageAnnexPageHtml_(dataUri, label) {
  const safeLabel = escapeHtml_(label);
  return `
    <div class="ticket-annex-page" style="page-break-before:always;page-break-after:always;page-break-inside:avoid;width:210mm;height:297mm;margin:0;padding:8mm;box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;">
      <img src="${dataUri}" alt="${safeLabel}" style="display:block;width:auto;height:auto;max-width:194mm;max-height:281mm;object-fit:contain;object-position:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />
    </div>
  `;
}

async function buildTicketAnnexFromHydrated_(tickets) {
  const pages = await mapPoolLocal_(tickets, 2, async (ticket) => {
    try {
      const dataUri = String(ticket?.dataUri || "").trim();
      const label = String(ticket.label || "Ticket").trim();
      if (isPdfTicketDataUri_(dataUri, ticket?.mime) && dataUri.startsWith("data:application/pdf")) {
        const jpegPages = await rasterizePdfDataUriToJpegPages_(dataUri, { scale: 2 });
        if (jpegPages.length) {
          return jpegPages
            .map((img, p) =>
              imageAnnexPageHtml_(img, jpegPages.length > 1 ? `${label} (pág. ${p + 1})` : label)
            )
            .join("");
        }
        return `
          <div class="ticket-annex-page" style="page-break-before:always;page-break-after:always;page-break-inside:avoid;width:210mm;height:297mm;margin:0;padding:12mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px;text-align:center;">${escapeHtml_(label)}</div>
            <div style="font-size:12px;text-align:center;line-height:1.4;max-width:160mm;">
              No se pudo embeber este PDF del tiquet.
            </div>
          </div>
        `;
      }
      if (dataUri.startsWith("data:image/")) {
        return imageAnnexPageHtml_(dataUri, label);
      }
      const src = dataUri.startsWith("data:") ? dataUri : String(ticket?.url || "").trim();
      if (!src) return "";
      const { bytes, kind } = await loadTicketImageBytes(src);
      if (kind === "pdf") {
        const uri = `data:application/pdf;base64,${uint8ToBase64_(bytes)}`;
        const jpegPages = await rasterizePdfDataUriToJpegPages_(uri, { scale: 2 });
        if (jpegPages.length) {
          return jpegPages
            .map((img, p) =>
              imageAnnexPageHtml_(img, jpegPages.length > 1 ? `${label} (pág. ${p + 1})` : label)
            )
            .join("");
        }
        return "";
      }
      const mime = kind === "png" ? "image/png" : "image/jpeg";
      const uri = `data:${mime};base64,${uint8ToBase64_(bytes)}`;
      return imageAnnexPageHtml_(uri, label);
    } catch {
      return "";
    }
  });
  return pages.filter(Boolean).join("");
}

function htmlAlreadyHasTicketAnnex_(html) {
  return /ticket-annex-page|ticket-attachment-page/i.test(String(html || ""));
}

async function resolveAnnexHtml_({
  skipTicketAnnex,
  ticketAttachments,
  lines,
  localExpenses,
  apiGet,
  userEmail,
  html,
}) {
  if (skipTicketAnnex || htmlAlreadyHasTicketAnnex_(html)) return "";
  try {
    let hydrated = Array.isArray(ticketAttachments)
      ? ticketAttachments.filter((t) => String(t?.dataUri || "").startsWith("data:"))
      : [];
    if (!hydrated.length && Array.isArray(ticketAttachments) && ticketAttachments.length) {
      hydrated = await hydrateTicketAttachmentsViaApi_(ticketAttachments, { apiGet, userEmail });
      hydrated = hydrated.filter((t) => String(t?.dataUri || "").startsWith("data:"));
    }
    if (hydrated.length) {
      return buildTicketAnnexFromHydrated_(hydrated);
    }
    const tickets = collectTicketAttachmentsFromLines(lines, localExpenses);
    if (!tickets.length) return "";
    const asAttachments = tickets.map((t) => ({
      label: t.label || "Ticket",
      url: t.url,
      dataUri: "",
      file_id: String(t?.file_id || "").trim(),
    }));
    const viaApi = await hydrateTicketAttachmentsViaApi_(asAttachments, { apiGet, userEmail });
    const ready = viaApi.filter((t) => String(t?.dataUri || "").startsWith("data:"));
    if (ready.length) return buildTicketAnnexFromHydrated_(ready);
    return buildTicketAnnexFromHydrated_(
      tickets.map((t) => ({ label: t.label, url: t.url, dataUri: "" }))
    );
  } catch {
    return "";
  }
}

function mergeHtmlWithAnnex_(html, annexHtml) {
  const body = String(html || "");
  if (!annexHtml) return body;
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${annexHtml}</body>`);
  return `${body}${annexHtml}`;
}

function ensureFullHtmlDocument_(html, title) {
  const raw = String(html || "").trim();
  const safeTitle = escapeHtml_(title || "Hoja de gasto");
  if (/<html[\s>]/i.test(raw)) {
    if (/<title>.*?<\/title>/i.test(raw)) return raw;
    return raw.replace(/<head([^>]*)>/i, `<head$1><title>${safeTitle}</title>`);
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
@page{size:A4;margin:0}
html,body{margin:0;padding:0}
.ticket-annex-page,.ticket-attachment-page{page-break-inside:avoid}
img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style>
</head><body>${raw}</body></html>`;
}

function triggerDownload_(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 2000);
}

async function buildFullSheetHtml_(opts) {
  if (!String(opts?.html || "").trim()) {
    throw new Error("No hay contenido HTML de la hoja para imprimir.");
  }
  const annexHtml = await resolveAnnexHtml_({ ...opts, html: opts.html });
  return mergeHtmlWithAnnex_(opts.html, annexHtml);
}

async function printSheetHtmlWindow_(html, dialogTitle) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Impresión web no disponible.");
  }
  const title = String(dialogTitle || "Hoja de gasto").trim() || "Hoja de gasto";
  const docHtml = ensureFullHtmlDocument_(html, title);
  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  const safeFile = title.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ .]+/gi, "_").slice(0, 80) || "hoja_gasto";
  triggerDownload_(`${safeFile}.html`, blob);

  const printWin = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWin) {
    URL.revokeObjectURL(blobUrl);
    throw new Error(
      "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para gestiflota.web.app y vuelve a pulsar «Compartir PDF»."
    );
  }

  await new Promise((resolve) => {
    const done = () => resolve();
    printWin.onload = () => setTimeout(done, 400);
    setTimeout(done, 1500);
  });

  try {
    printWin.focus();
    printWin.print();
  } catch (e) {
    throw new Error(e?.message || "No se pudo abrir el diálogo de impresión de la hoja.");
  } finally {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    }, 60_000);
  }
}

async function openSheetHtmlPreview_(html, dialogTitle) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Vista previa web no disponible.");
  }
  const title = String(dialogTitle || "Vista previa hoja").trim() || "Vista previa hoja";
  const docHtml = ensureFullHtmlDocument_(html, title);
  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const previewWin = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!previewWin) {
    URL.revokeObjectURL(blobUrl);
    throw new Error(
      "El navegador bloqueó la vista previa. Permite ventanas emergentes para gestiflota.web.app."
    );
  }
  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 120_000);
  return { html: docHtml, blobUrl };
}

export async function printAndShareExpenseSheetPdf({
  html,
  lines = [],
  localExpenses = [],
  ticketAttachments = null,
  skipTicketAnnex = false,
  dialogTitle = "Compartir hoja",
  apiGet,
  userEmail,
}) {
  const fullHtml = await buildFullSheetHtml_({
    html,
    lines,
    localExpenses,
    ticketAttachments,
    skipTicketAnnex,
    apiGet,
    userEmail,
  });
  await printSheetHtmlWindow_(fullHtml, dialogTitle);
  return "printed-window";
}

export async function previewExpenseSheetPdf({
  html,
  lines = [],
  localExpenses = [],
  ticketAttachments = null,
  skipTicketAnnex = false,
  dialogTitle = "Vista previa hoja",
  apiGet,
  userEmail,
}) {
  const fullHtml = await buildFullSheetHtml_({
    html,
    lines,
    localExpenses,
    ticketAttachments,
    skipTicketAnnex,
    apiGet,
    userEmail,
  });
  return openSheetHtmlPreview_(fullHtml, dialogTitle);
}
