import { extractDriveFileId } from "./format";
import { responseDataObject } from "./api";

/** URLs de ticket/factura unificadas desde un registro de gasto. */
export function ticketUrlsFromExpenseRecord(raw) {
  const out = [];
  const push = (u) => {
    const s = String(u || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(raw?.ticketLocalUris)) {
    for (const u of raw.ticketLocalUris) push(u);
  }
  if (Array.isArray(raw?.ticket_urls)) {
    for (const u of raw.ticket_urls) push(u);
  }
  if (Array.isArray(raw?.ticket_drive_urls)) {
    for (const u of raw.ticket_drive_urls) push(u);
  }
  const jsonRaw = String(raw?.ticket_drive_urls_json || "").trim();
  if (jsonRaw.startsWith("[")) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) {
        for (const u of parsed) push(u);
      }
    } catch {
      // ignore
    }
  }
  push(raw?.ticket_drive_url);
  const remote = String(raw?.ticket_drive_urls || "")
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const u of remote) push(u);
  return out;
}

/** URL descargable para incrustar (solo fallback sin API; preferir ticket_drive_data). */
export function ticketFetchUrlForEmbed(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("file:") || u.startsWith("content:")) return u;
  const fileId = extractDriveFileId(u);
  if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;
  return u;
}

export function isPdfOrImageTicketUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith("file:") || u.startsWith("content:")) return true;
  return /\.(pdf|jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) || u.includes("drive.google") || u.includes("googleusercontent");
}

/** URL remota (Drive/HTTP) frente a URI local o data URI. */
export function isRemoteTicketAttachmentUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith("file:") || u.startsWith("content:") || u.startsWith("data:")) return false;
  return true;
}

/** Evita guardar enlaces al Sheet o a la API en lugar del archivo del ticket. */
export function assertTicketUrlForExpenseSave(url) {
  const u = String(url || "").trim();
  if (!u) return;
  if (/docs\.google\.com\/spreadsheets/i.test(u)) {
    throw new Error(
      "La URL del ticket no puede ser la del Spreadsheet. Sube la imagen con el botón o pega un enlace de archivo en Drive."
    );
  }
  if (/script\.google\.com\/macros/i.test(u)) {
    throw new Error(
      "La URL del ticket no puede ser la de Apps Script. Tras subir la imagen, usa el enlace del archivo en Drive."
    );
  }
}

/** Normaliza adjuntos devueltos por hoja_gasto_detalle (base64 servidor). */
export function mapServerTicketAttachments_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((t, idx) => {
      const mime = String(t?.mimeType || t?.mime_type || "image/jpeg").trim() || "image/jpeg";
      const b64 = String(t?.base64 || "").trim();
      const dataUri =
        String(t?.dataUri || t?.data_uri || "").trim() ||
        (b64 ? `data:${mime};base64,${b64}` : "");
      const fileId = String(t?.file_id || extractDriveFileId(t?.url || "") || "").trim();
      return {
        label: String(t?.label || t?.file_name || `Ticket ${idx + 1}`).trim(),
        dataUri,
        url: String(t?.url || "").trim(),
        file_id: fileId,
        mime,
      };
    })
    .filter((t) => t.dataUri || t.file_id || t.url);
}

/** Descarga base64 de cada ticket vía API (evita CORS de Drive en el navegador). */
export async function hydrateTicketAttachmentsViaApi_(attachments, { apiGet, userEmail } = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (typeof apiGet !== "function" || !email) {
    return (Array.isArray(attachments) ? attachments : []).filter((t) =>
      String(t?.dataUri || "").startsWith("data:")
    );
  }
  const mapped = mapServerTicketAttachments_(attachments);
  const out = [];
  for (const att of mapped) {
    if (String(att?.dataUri || "").startsWith("data:")) {
      out.push(att);
      continue;
    }
    const fileId = String(att?.file_id || extractDriveFileId(att?.url || "") || "").trim();
    if (!fileId) continue;
    try {
      const res = await apiGet("ticket_drive_data", { file_id: fileId, user_email: email });
      const data = responseDataObject(res);
      const b64 = String(data?.base64 || "").trim();
      const mime = String(data?.mimeType || data?.mime_type || "image/jpeg").trim() || "image/jpeg";
      if (!b64 || !mime.startsWith("image/")) continue;
      out.push({
        label: att.label || "Ticket",
        dataUri: `data:${mime};base64,${b64}`,
        mime,
        file_id: fileId,
      });
    } catch {
      // Sin acceso Drive en servidor o archivo no legible
    }
  }
  return out;
}

function isDriveFetchBlockedInBrowser_(url) {
  const u = String(url || "").trim().toLowerCase();
  return u.includes("drive.google.com") || u.includes("googleusercontent.com");
}

/** Convierte URL remota o local a data URI (web: fetch; móvil: FileSystem). */
export async function ticketUrlToDataUri_(url, { readLocalFile, apiGet, userEmail } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;

  const fileId = extractDriveFileId(raw);
  if (fileId && typeof apiGet === "function" && userEmail) {
    try {
      const res = await apiGet("ticket_drive_data", {
        file_id: fileId,
        user_email: String(userEmail || "").trim().toLowerCase(),
      });
      const data = responseDataObject(res);
      const b64 = String(data?.base64 || "").trim();
      const mime = String(data?.mimeType || data?.mime_type || "image/jpeg").trim() || "image/jpeg";
      if (b64) return `data:${mime};base64,${b64}`;
    } catch {
      // Sin fallback a Drive en el navegador (CORS)
    }
    if (isDriveFetchBlockedInBrowser_(raw)) return "";
  }

  const fetchUrl = ticketFetchUrlForEmbed(raw);
  if (isDriveFetchBlockedInBrowser_(fetchUrl)) return "";
  if (fetchUrl.startsWith("file:") || fetchUrl.startsWith("content:")) {
    if (typeof readLocalFile === "function") {
      return readLocalFile(fetchUrl);
    }
    return fetchUrl;
  }
  if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
    return fetchUrl;
  }
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) return fetchUrl;
    const blob = await res.blob();
    if (typeof FileReader !== "undefined") {
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return dataUri || fetchUrl;
    }
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa !== "undefined" ? btoa(binary) : "";
    const mime = String(blob.type || "image/jpeg").trim() || "image/jpeg";
    return b64 ? `data:${mime};base64,${b64}` : fetchUrl;
  } catch {
    return fetchUrl;
  }
}
