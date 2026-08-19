import { ticketUrlToDataUri_ } from "./expenseTicketResolve";
import {
  TICKET_IMAGE_JPEG_QUALITY,
  TICKET_IMAGE_MAX_LONG_EDGE_PX,
  computeTicketExportDimensions,
} from "./ticketImageLayout";

function loadImageElement_(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

function readFileAsDataUrl_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64_(dataUrl) {
  const raw = String(dataUrl || "");
  const idx = raw.indexOf(",");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

function canvasToBlob_(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), mimeType, quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      fetch(dataUrl)
        .then((r) => r.blob())
        .then(resolve)
        .catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function renderTicketExportCanvas_(dataUrl, options = {}) {
  const quality = options.quality ?? TICKET_IMAGE_JPEG_QUALITY;
  const maxLong = options.maxLongEdgePx ?? TICKET_IMAGE_MAX_LONG_EDGE_PX;
  const fileNameBase = String(options.fileNameBase || "ticket").replace(/\.[^.]+$/, "") || "ticket";

  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:image")) {
    throw new Error("El adjunto no es una imagen válida.");
  }

  const img = await loadImageElement_(raw);
  const naturalWidth = Math.max(1, img.naturalWidth || 1);
  const naturalHeight = Math.max(1, img.naturalHeight || 1);
  const exp = computeTicketExportDimensions(naturalWidth, naturalHeight, maxLong);

  const canvas = document.createElement("canvas");
  canvas.width = exp.width;
  canvas.height = exp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el lienzo.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, exp.width, exp.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, exp.width, exp.height);

  const outDataUrl = canvas.toDataURL("image/jpeg", quality);
  const blob = await canvasToBlob_(canvas, "image/jpeg", quality);

  return {
    dataUrl: outDataUrl,
    base64: dataUrlToBase64_(outDataUrl),
    blob,
    mimeType: "image/jpeg",
    fileName: `${fileNameBase}-ticket.jpg`,
  };
}

/**
 * Optimiza ticket para subir (web): proporción original, sin márgenes A4, alta calidad.
 */
export async function prepareTicketImageForA4FromDataUrl(dataUrl, options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Preparación de imagen no disponible fuera del navegador.");
  }
  return renderTicketExportCanvas_(dataUrl, options);
}

/**
 * Descarga un ticket remoto y lo reoptimiza para subir (web).
 */
export async function reprocessRemoteTicketForA4Web(ticketUrl, { apiGet, userEmail, fileNameBase = "ticket" } = {}) {
  const url = String(ticketUrl || "").trim();
  if (!url) throw new Error("No hay adjunto de ticket para reajustar.");

  const dataUri = await ticketUrlToDataUri_(url, { apiGet, userEmail });
  if (!String(dataUri || "").startsWith("data:image")) {
    throw new Error("No se pudo descargar la imagen del ticket (¿PDF o sin acceso?).");
  }

  return prepareTicketImageForA4FromDataUrl(dataUri, { fileNameBase });
}

/**
 * Optimiza un fichero de ticket para subir (web).
 */
export async function prepareTicketImageForA4FromFile(file, options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined" || !file) return null;

  const mime = String(file?.type || "").trim().toLowerCase();
  if (mime.includes("pdf")) return null;

  const dataUrl = await readFileAsDataUrl_(file);
  const baseName = String(file?.name || "ticket.jpg").replace(/\.[^.]+$/, "") || "ticket";
  return renderTicketExportCanvas_(dataUrl, { ...options, fileNameBase: baseName });
}
