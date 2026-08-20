import { env } from "../../flotaApp/config/env";
import { extractDriveFileId } from "./format";
import { responseDataObject } from "./api";

/** Caché en memoria por file_id (sesión) para no re-pedir ticket_drive_data. */
const ticketDriveDataCache_ = new Map();
const TICKET_CACHE_MAX = 80;
const TICKET_HYDRATE_CONCURRENCY = 6;
/** Base64 de imagen/PDF vía Apps Script puede superar el timeout GET por defecto (15s). */
const TICKET_DRIVE_DATA_TIMEOUT_MS = 45000;

function callTicketDriveDataApi_(apiGet, params) {
  if (typeof apiGet !== "function") {
    return Promise.reject(new Error("apiGet no disponible"));
  }
  // Preferir firma (action, params, options); si el wrapper solo acepta 2 args, igual funciona.
  try {
    return apiGet("ticket_drive_data", params, { timeoutMs: TICKET_DRIVE_DATA_TIMEOUT_MS });
  } catch (e) {
    return Promise.reject(e);
  }
}

function cacheGetTicket_(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  return ticketDriveDataCache_.get(id) || null;
}

function cacheSetTicket_(fileId, entry) {
  const id = String(fileId || "").trim();
  if (!id || !entry) return;
  if (ticketDriveDataCache_.size >= TICKET_CACHE_MAX) {
    const first = ticketDriveDataCache_.keys().next().value;
    if (first) ticketDriveDataCache_.delete(first);
  }
  ticketDriveDataCache_.set(id, entry);
}

/** Ejecuta trabajos con concurrencia limitada. */
export async function mapPool_(items, concurrency, mapper) {
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
  if (u.startsWith("file:") || u.startsWith("content:") || u.startsWith("data:")) return true;
  // Cualquier URL/id de Drive (aunque no lleve extensión .jpg/.pdf)
  if (extractDriveFileId(u) || u.includes("drive.google") || u.includes("googleusercontent")) return true;
  return /\.(pdf|jpg|jpeg|png|webp|gif)(\?|$)/i.test(u);
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
      const url = String(t?.url || "").trim();
      const inferredPdf =
        mime.includes("pdf") ||
        /\.pdf(\?|$)/i.test(url) ||
        String(dataUri).startsWith("data:application/pdf");
      return {
        label: String(t?.label || t?.file_name || `Ticket ${idx + 1}`).trim(),
        dataUri,
        url,
        file_id: fileId,
        mime: inferredPdf ? "application/pdf" : mime,
      };
    })
    .filter((t) => t.dataUri || t.file_id || t.url);
}

async function fetchTicketDriveDataUri_(fileId, apiGet, userEmail) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  const cached = cacheGetTicket_(id);
  if (cached?.dataUri) return cached;
  // Apps Script exige secret en GET ticket_drive_data; sin él → UNAUTHORIZED (y en web no hay fallback CORS a Drive).
  const secret = String(env.apiSecret || "").trim();
  if (!secret) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[ticket_drive_data] Falta EXPO_PUBLIC_API_SECRET; no se puede hidratar el ticket en web.");
    }
    return null;
  }
  const res = await callTicketDriveDataApi_(apiGet, {
    file_id: id,
    user_email: String(userEmail || "").trim().toLowerCase(),
    secret,
  });
  const data = responseDataObject(res);
  const b64 = String(data?.base64 || "").trim();
  const mime = String(data?.mimeType || data?.mime_type || "image/jpeg").trim() || "image/jpeg";
  if (!b64) return null;
  const okMime = mime.startsWith("image/") || mime === "application/pdf" || mime.includes("pdf");
  if (!okMime) return null;
  const entry = { dataUri: `data:${mime};base64,${b64}`, mime, file_id: id };
  cacheSetTicket_(id, entry);
  return entry;
}

/** Descarga base64 de cada ticket vía API (evita CORS de Drive en el navegador). */
export async function hydrateTicketAttachmentsViaApi_(attachments, { apiGet, userEmail, concurrency } = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (typeof apiGet !== "function" || !email) {
    return (Array.isArray(attachments) ? attachments : []).filter((t) =>
      String(t?.dataUri || "").startsWith("data:")
    );
  }
  const mapped = mapServerTicketAttachments_(attachments);
  const limit = Math.max(1, Number(concurrency) || TICKET_HYDRATE_CONCURRENCY);
  const results = await mapPool_(mapped, limit, async (att) => {
    if (String(att?.dataUri || "").startsWith("data:")) {
      const fileId = String(att?.file_id || extractDriveFileId(att?.url || "") || "").trim();
      if (fileId) {
        cacheSetTicket_(fileId, {
          dataUri: att.dataUri,
          mime: att.mime || "image/jpeg",
          file_id: fileId,
        });
      }
      return att;
    }
    const fileId = String(att?.file_id || extractDriveFileId(att?.url || "") || "").trim();
    if (!fileId) return null;
    try {
      const got = await fetchTicketDriveDataUri_(fileId, apiGet, email);
      if (!got?.dataUri) return null;
      return {
        label: att.label || "Ticket",
        dataUri: got.dataUri,
        mime: got.mime,
        file_id: fileId,
        url: att.url || "",
      };
    } catch (err) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[hydrateTicketAttachmentsViaApi_]", fileId, err?.message || err);
      }
      return null;
    }
  });
  return results.filter(Boolean);
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
      const got = await fetchTicketDriveDataUri_(fileId, apiGet, userEmail);
      if (got?.dataUri) return got.dataUri;
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
