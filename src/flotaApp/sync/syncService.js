import NetInfo from "@react-native-community/netinfo";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAvailable, firestore } from "../firebase/firebase";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system/legacy";
import { env } from "../config/env";
import { parseTicketUrlsFromRecord, parseTicketDriveUrlsOrdered, parseTicketDriveFileNamesOrdered, ticketDriveFieldsFromLists } from "../lib/expenseSheetTickets";
import { normalizeDateToDmy } from "../../flotaWeb/lib/format";

const DEFAULT_CORP_DRIVE_FOLDER_ID = "1QIff1sdYQYdr1rd2JA1ua7iF579Mrcdv";
const DEFAULT_CORP_SPREADSHEET_ID = "1v6YJ7Y3KjSUUaTog8tuw1elircOR5dbPZaddNkZ4gGY";
const DEFAULT_ODOMETER_OCR_URL = "http://192.168.0.53:8080";
const DEFAULT_TICKET_OCR_URL = "http://192.168.0.53:8080";

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeLocalUri_(uri) {
  const u = String(uri || "");
  // Android a veces entrega "file://data/..." en vez de "file:///data/..."
  let out = u;
  if (out.startsWith("file://") && !out.startsWith("file:///")) {
    out = out.replace(/^file:\/\//, "file:///");
  }
  // Algunos dispositivos devuelven "userr" en vez de "user" (path Android)
  out = out.replace(/\/userr\//g, "/user/");
  return out;
}

function guessMimeTypeFromUri_(uri) {
  const u = String(uri || "").trim();
  const lower = u.toLowerCase();
  const dataMime = /^data:([^;,]+)/i.exec(u);
  if (dataMime?.[1]) return String(dataMime[1]).trim().toLowerCase() || "application/octet-stream";
  if (lower.includes(".pdf") || lower.includes("application/pdf")) return "application/pdf";
  if (lower.endsWith(".png") || lower.includes("image/png")) return "image/png";
  if (lower.endsWith(".webp") || lower.includes("image/webp")) return "image/webp";
  if (lower.endsWith(".gif") || lower.includes("image/gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.includes("image/jpeg")) return "image/jpeg";
  return "image/jpeg";
}

function extensionForMime_(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

function isHttpUrl_(uri) {
  return /^https?:\/\//i.test(String(uri || "").trim());
}

function isLocalMediaUri_(uri) {
  const s = String(uri || "").trim();
  return (
    s.startsWith("file://") ||
    s.startsWith("content://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  );
}

function collectLocalUris_(values) {
  const out = [];
  for (const v of values) {
    if (!Array.isArray(v)) continue;
    for (const u of v) {
      const s = normalizeLocalUri_(u);
      if (s && isLocalMediaUri_(s)) out.push(s);
    }
  }
  return [...new Set(out)];
}

async function localUriExists_(uri) {
  const safe = normalizeLocalUri_(uri);
  if (!safe) return false;
  if (safe.startsWith("data:") || safe.startsWith("blob:")) return true;
  try {
    const info = await FileSystem.getInfoAsync(safe);
    return !!info?.exists;
  } catch {
    return false;
  }
}

async function uploadTicketImages_(payload, localUris) {
  const urls = [];
  const fileNames = [];
  const plate = payload.vehiclePlate || payload.matricula || "sin_matricula";
  for (const u of localUris) {
    if (!(await localUriExists_(u))) continue;
    const mime = guessMimeTypeFromUri_(u);
    const ext = extensionForMime_(mime);
    const fileName = `ticket-${uuid()}.${ext}`;
    const url = await uploadImage({
      localUri: u,
      path: `tickets/${plate}/${fileName}`,
    });
    urls.push(url);
    fileNames.push(fileName);
  }
  return { urls, fileNames };
}

async function uploadMaintenancePhotos_(payload, localUris) {
  const urls = [];
  const fileNames = [];
  const plate = payload.vehiclePlate || payload.matricula || "sin_matricula";
  for (const u of localUris) {
    if (!(await localUriExists_(u))) continue;
    const fileName = `foto-${uuid()}.jpg`;
    const url = await uploadImage({
      localUri: u,
      path: `maintenance/${plate}/${fileName}`,
    });
    urls.push(url);
    fileNames.push(fileName);
  }
  return { urls, fileNames };
}

function applyDriveUrlFields_(payload, { urls, fileNames, prefix }) {
  const uniqueUrls = [...new Set((urls || []).map((u) => String(u || "").trim()).filter(Boolean))];
  const names = Array.isArray(fileNames) ? fileNames.slice() : [];
  while (names.length < uniqueUrls.length) names.push("");
  payload[`${prefix}_drive_urls`] = uniqueUrls;
  payload[`${prefix}_drive_urls_json`] = JSON.stringify(uniqueUrls);
  payload[`${prefix}_drive_url`] = uniqueUrls[0] || "";
  payload[`${prefix}_drive_file_names`] = names.slice(0, uniqueUrls.length);
  payload[`${prefix}_drive_file_name`] = names[0] || "";
}

function isKmColabExpense_(payload) {
  const t = String(payload?.tipo_gasto || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return t === "KILOMETRAJE_COLABORADOR";
}

async function persistLocalExpensePatch_(localId, patch) {
  const id = String(localId || "").trim();
  if (!id || !patch || typeof patch !== "object") return;
  const current = await localDb.getExpenses();
  const next = current.map((e) => {
    const eid = String(e?.id || e?.local_id || "").trim();
    if (eid !== id) return e;
    return { ...e, ...patch };
  });
  await localDb.setExpenses(next);
}

async function blobUriStillReadable_(uri) {
  const u = String(uri || "").trim();
  if (!u.startsWith("blob:")) return true;
  if (typeof fetch !== "function") return false;
  try {
    const res = await fetch(u);
    return !!res?.ok;
  } catch {
    return false;
  }
}

async function pickUploadableLocalUri_(primary, fallbacks = []) {
  const candidates = [primary, ...(Array.isArray(fallbacks) ? fallbacks : [])]
    .map((u) => normalizeLocalUri_(u))
    .filter((u) => u && isLocalMediaUri_(u));
  const unique = [...new Set(candidates)];
  for (const c of unique) {
    if (!(await localUriExists_(c))) continue;
    if (!(await blobUriStillReadable_(c))) continue;
    return c;
  }
  return "";
}

async function ensureExpenseTicketFields_(payload, localRecord) {
  const explicitUris = Array.isArray(payload?.ticketLocalUris)
    ? payload.ticketLocalUris.map((u) => String(u || "").trim()).filter(Boolean)
    : null;
  const payloadTouchedTickets =
    explicitUris != null ||
    payload?.ticket_drive_url !== undefined ||
    payload?.ticket_drive_urls !== undefined ||
    payload?.ticket_drive_urls_json !== undefined;

  // Forzar paralelismo con la lista explícita (incl. huecos "" = pendiente de subida).
  const parallelDrive = parseTicketDriveUrlsOrdered({
    ...(payload || {}),
    ...(explicitUris ? { ticketLocalUris: explicitUris } : {}),
  });
  const parallelNames = parseTicketDriveFileNamesOrdered({
    ...(payload || {}),
    ...(explicitUris ? { ticketLocalUris: explicitUris } : {}),
  });

  let driveUrls = [];
  let fileNames = [];

  if (payloadTouchedTickets && explicitUris != null) {
    // Lista del payload es la fuente de verdad:
    // - [] = usuario quitó todos (intencional)
    // - [local, ...] con ticket_drive paralelo "" = hay nuevos pendientes de Drive
    while (parallelDrive.length < explicitUris.length) parallelDrive.push("");
    while (parallelNames.length < explicitUris.length) parallelNames.push("");
    const localFallbacks = collectLocalUris_([localRecord?.ticketLocalUris]);

    for (let i = 0; i < explicitUris.length; i++) {
      const u = explicitUris[i];
      if (isHttpUrl_(u)) {
        driveUrls.push(u);
        fileNames.push(parallelNames[i] || "");
        continue;
      }
      const existingDrive = String(parallelDrive[i] || "").trim();
      // Preview ya alineada con Drive: no re-subir. Hueco "" = pendiente (quitar+añadir).
      if (existingDrive && isHttpUrl_(existingDrive)) {
        driveUrls.push(existingDrive);
        fileNames.push(parallelNames[i] || "");
        continue;
      }
      const uploadUri = await pickUploadableLocalUri_(u, localFallbacks);
      if (uploadUri) {
        try {
          const uploaded = await uploadTicketImages_(payload, [uploadUri]);
          if (uploaded.urls[0]) {
            driveUrls.push(uploaded.urls[0]);
            fileNames.push(uploaded.fileNames[0] || parallelNames[i] || "");
          }
        } catch (upErr) {
          const detail = String(upErr?.message || upErr || "error de subida").trim();
          throw new Error(`No se pudo subir el tiquet: ${detail}`);
        }
      }
    }
  } else {
    const merged = { ...(localRecord || {}), ...(payload || {}) };
    driveUrls = parseTicketUrlsFromRecord(merged).filter(isHttpUrl_);
    const localUris = collectLocalUris_([payload?.ticketLocalUris, localRecord?.ticketLocalUris]);
    if (localUris.length) {
      const uploaded = await uploadTicketImages_(payload, localUris);
      driveUrls = [...new Set([...driveUrls, ...uploaded.urls])];
      if (uploaded.fileNames.length) {
        fileNames = uploaded.fileNames;
      }
    }
  }

  // [] intencional OK; si había locales nuevos y no quedó ninguna URL Drive → error (no enviar vacío a Sheet).
  if (!isKmColabExpense_(payload) && payloadTouchedTickets && explicitUris != null && explicitUris.length && !driveUrls.length) {
    throw new Error(
      "No se pudo subir el tiquet: el archivo local ya no está disponible. Vuelve a adjuntar la imagen o el PDF del tiquet y guarda de nuevo."
    );
  }
  if (
    !isKmColabExpense_(payload) &&
    payloadTouchedTickets &&
    explicitUris != null &&
    explicitUris.length &&
    driveUrls.length < explicitUris.length
  ) {
    throw new Error(
      "No se pudieron subir todos los tiquets nuevos. Vuelve a adjuntar los archivos que faltan y guarda de nuevo."
    );
  }
  if (!isKmColabExpense_(payload) && !payloadTouchedTickets) {
    const localUris = collectLocalUris_([payload?.ticketLocalUris, localRecord?.ticketLocalUris]);
    if (localUris.length && !driveUrls.length) {
      throw new Error(
        "No se pudo subir el tiquet: el archivo local ya no está disponible. Vuelve a adjuntar la imagen o el PDF del tiquet y guarda de nuevo."
      );
    }
  }

  const namesForApply =
    fileNames.length >= driveUrls.length
      ? fileNames
      : Array.isArray(payload.ticket_drive_file_names)
        ? payload.ticket_drive_file_names
        : parseTicketDriveFileNamesOrdered(payload);
  applyDriveUrlFields_(payload, { urls: driveUrls, fileNames: namesForApply, prefix: "ticket" });
  // Campos string/json compactos alineados con lo que espera Sheet.
  Object.assign(payload, ticketDriveFieldsFromLists(driveUrls, namesForApply));
  delete payload.ticketLocalUris;

  const localId = String(payload?.local_id || localRecord?.id || localRecord?.local_id || "").trim();
  if (localId && (payloadTouchedTickets || driveUrls.length)) {
    // Persistir también lista vacía tras quitar todos los adjuntos.
    const previewUris = driveUrls.map((u) => String(u || "").trim()).filter(Boolean);
    await persistLocalExpensePatch_(localId, {
      ...ticketDriveFieldsFromLists(driveUrls, namesForApply),
      ticketLocalUris: previewUris,
    });
  }
}

async function ensureMaintenancePhotoFields_(payload, localRecord) {
  const merged = { ...(localRecord || {}), ...(payload || {}) };
  const parseFotos = (src) => {
    const urls = [];
    const json = src?.fotos_drive_urls_json;
    if (json) {
      try {
        const parsed = JSON.parse(String(json));
        if (Array.isArray(parsed)) {
          for (const u of parsed) {
            const s = String(u || "").trim();
            if (s) urls.push(s);
          }
        }
      } catch {
        // ignore
      }
    }
    const multi = src?.fotos_drive_urls;
    if (multi) {
      for (const part of String(multi).split(/[;,]/)) {
        const s = String(part || "").trim();
        if (s) urls.push(s);
      }
    }
    const single = src?.fotos_drive_url;
    if (single) {
      const s = String(single).trim();
      if (s) urls.push(s);
    }
    return urls;
  };
  let driveUrls = parseFotos(merged).filter(isHttpUrl_);
  const localUris = collectLocalUris_([payload?.photoLocalUris, localRecord?.photoLocalUris]);
  if (localUris.length) {
    const uploaded = await uploadMaintenancePhotos_(payload, localUris);
    driveUrls = [...new Set([...driveUrls, ...uploaded.urls])];
    if (uploaded.fileNames.length) {
      payload.fotos_drive_file_names = uploaded.fileNames;
      payload.fotos_drive_file_name = uploaded.fileNames[0] || "";
    }
  }
  applyDriveUrlFields_(payload, { urls: driveUrls, fileNames: payload.fotos_drive_file_names, prefix: "fotos" });
  delete payload.photoLocalUris;
}

function findLocalExpenseById_(expenses, localId) {
  const id = String(localId || "").trim();
  if (!id) return null;
  const list = Array.isArray(expenses) ? expenses : [];
  return (
    list.find((e) => {
      const keys = [e?.id, e?.local_id, e?.id_gasto].map((k) => String(k || "").trim());
      return keys.includes(id);
    }) || null
  );
}

function findLocalMaintenanceRecord_(items, payload) {
  const list = Array.isArray(items) ? items : [];
  const created = String(payload?.createdAtLocal || "").trim();
  if (created) {
    const byCreated = list.find((m) => String(m?.createdAtLocal || "").trim() === created);
    if (byCreated) return byCreated;
  }
  const mat = String(payload?.matricula || payload?.vehiclePlate || "").trim().toUpperCase();
  const fecha = String(payload?.fecha || "").trim();
  const taller = String(payload?.taller || "").trim();
  if (!mat && !fecha && !taller) return null;
  return (
    list.find((m) => {
      const mMat = String(m?.matricula || m?.vehiclePlate || "").trim().toUpperCase();
      const mFecha = String(m?.fecha || "").trim();
      const mTaller = String(m?.taller || "").trim();
      return (!mat || mMat === mat) && (!fecha || mFecha === fecha) && (!taller || mTaller === taller);
    }) || null
  );
}

function buildDestination_(syncTargets) {
  const t = syncTargets || {};
  const hasPersonal = !!(t.userDriveFolder || t.userSpreadsheetId);
  const mode = t.mode || (hasPersonal ? "both" : "corporate");
  return {
    mode,
    corporate_drive_folder_id: t.corpDriveFolder || DEFAULT_CORP_DRIVE_FOLDER_ID,
    corporate_spreadsheet_id: t.corpSpreadsheetId || DEFAULT_CORP_SPREADSHEET_ID,
    personal_drive_folder_id: t.userDriveFolder || "",
    personal_spreadsheet_id: t.userSpreadsheetId || "",
    auto_create_personal: !!t.autoCreatePersonal,
  };
}

function parseKm_(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return String(parseInt(digits, 10));
}

async function optimizeImageForOcr_(safeUri) {
  try {
    const ImageManipulator = require("expo-image-manipulator");
    if (!ImageManipulator || typeof ImageManipulator.manipulateAsync !== "function") {
      return safeUri;
    }
    const out = await ImageManipulator.manipulateAsync(
      safeUri,
      [{ resize: { width: 1280 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return String(out?.uri || safeUri);
  } catch {
    return safeUri;
  }
}

function getOdometerOcrCandidates_() {
  const fromEnv = String(env.odometerOcrUrl || "")
    .trim()
    .replace(/\/+$/, "");
  // Priorizamos loopback para uso por USB con `adb reverse`.
  const candidates = ["http://127.0.0.1:8080", "http://10.0.2.2:8080", fromEnv, DEFAULT_ODOMETER_OCR_URL];
  const out = [];
  for (const c of candidates) {
    const v = String(c || "").trim().replace(/\/+$/, "");
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function getTicketOcrCandidates_() {
  const fromEnv = String(env.ticketOcrUrl || env.odometerOcrUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const candidates = ["http://127.0.0.1:8080", "http://10.0.2.2:8080", fromEnv, DEFAULT_TICKET_OCR_URL];
  const out = [];
  for (const c of candidates) {
    const v = String(c || "").trim().replace(/\/+$/, "");
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

async function postOdometerToPythonOcr_({ safeUri, base64, mime, base }) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, 12000);
  let res;
  try {
    res = await fetch(`${base}/odometer/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: `odometro-${uuid()}.jpg`,
        mime_type: mime,
        image_uri: safeUri,
        base64,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`OCR Python timeout en ${base}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = json?.detail || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`OCR Python HTTP ${res.status}: ${detail}`);
  }
  const raw = json?.kilometros ?? json?.km ?? "";
  const km = parseKm_(raw);
  if (!km) throw new Error("OCR Python sin km");
  return { km, raw: raw || km, provider: "python" };
}

function normalizeTicketAmount_(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const clean = raw.replace(/[^\d,.-]/g, "").replace(/\.(?=.*\.)/g, "");
  let n = Number(clean.replace(",", "."));
  if (!Number.isFinite(n)) {
    const m = raw.match(/(\d+[.,]\d{2})/);
    n = m ? Number(String(m[1]).replace(",", ".")) : NaN;
  }
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(2);
}

function normalizeTicketDate_(value) {
  return normalizeDateToDmy(value) || "";
}

async function postTicketToPythonOcr_({ safeUri, base64, mime, base }) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, 14000);
  let res;
  try {
    res = await fetch(`${base}/ticket/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: `ticket-${uuid()}.jpg`,
        mime_type: mime,
        image_uri: safeUri,
        base64,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`OCR ticket timeout en ${base}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = json?.detail || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`OCR ticket HTTP ${res.status}: ${detail}`);
  }
  const data = json?.data && typeof json.data === "object" ? json.data : json || {};
  const total = normalizeTicketAmount_(
    data.total ?? data.importe_total ?? data.amount ?? data.total_amount ?? data.importe ?? data.precio_total
  );
  const date = normalizeTicketDate_(data.fecha ?? data.date ?? data.ticket_date ?? data.fecha_ticket);
  const vendor = String(data.vendor ?? data.comercio ?? data.proveedor ?? data.establecimiento ?? "").trim();
  const invoiceNumber = String(data.invoice_number ?? data.numero_factura ?? data.ticket_number ?? data.numero_ticket ?? "").trim();
  if (!total && !date && !vendor && !invoiceNumber) {
    throw new Error("OCR ticket sin datos útiles");
  }
  return { total, date, vendor, invoiceNumber, raw: data, provider: "python" };
}

async function uriToBase64_(safeUri) {
  const u = String(safeUri || "").trim();
  if (!u) throw new Error("URI vacía");

  if (u.startsWith("data:")) {
    const comma = u.indexOf(",");
    if (comma < 0) throw new Error("Data URI inválida");
    const meta = u.slice(0, comma);
    const data = u.slice(comma + 1);
    if (meta.includes(";base64")) return data;
    if (typeof btoa === "function") return btoa(decodeURIComponent(data));
    throw new Error("Data URI sin base64 no soportada");
  }

  if (u.startsWith("blob:") && typeof fetch === "function") {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`No se pudo leer blob (${res.status})`);
    const blob = await res.blob();
    if (typeof FileReader !== "undefined") {
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return uriToBase64_(dataUri);
    }
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    if (typeof btoa === "undefined") throw new Error("btoa no disponible");
    return btoa(binary);
  }

  // expo-file-system puede fallar con algunas variantes de URI.
  // Probamos varias normalizaciones.
  const candidates = [];
  candidates.push(u);
  // sin scheme
  if (u.startsWith("file://")) candidates.push(u.replace(/^file:\/\//, ""));
  // decode por si hay caracteres escapados
  try {
    candidates.push(decodeURI(u));
    if (u.startsWith("file://")) candidates.push(decodeURI(u.replace(/^file:\/\//, "")));
  } catch {
    // ignore
  }

  let lastErr = null;
  for (const c of candidates) {
    if (!c) continue;
    try {
      // No dependemos de FileSystem.EncodingType (en algunas builds puede no existir).
      const encoding = FileSystem.EncodingType?.Base64 || "base64";
      const b64 = await FileSystem.readAsStringAsync(c, { encoding });
      if (typeof b64 === "string" && b64.trim()) return b64;
      throw new Error("base64 vacío/no string");
    } catch (err) {
      lastErr = err;
    }
  }
  const msg = lastErr?.message ? String(lastErr.message) : "unknown base64 read error";
  throw new Error(`readAsStringAsync Base64 failed: ${msg}`);
}

function stripLocalMediaFromSheetPayload_(payload) {
  if (!payload || typeof payload !== "object") return;
  delete payload.ticketLocalUris;
  delete payload.photoLocalUris;
  delete payload.odometroLocalUri;
  delete payload.odometro_local_uri;
  for (const key of Object.keys(payload)) {
    const v = payload[key];
    if (typeof v !== "string") continue;
    if ((v.startsWith("data:") || v.startsWith("blob:")) && v.length > 400) {
      delete payload[key];
    }
  }
}

async function uploadImage({ localUri, path }) {
  if (!localUri) throw new Error("uploadImage: localUri vacío");
  // Forzamos SIEMPRE Apps Script/Drive para evitar cualquier ruta Blob/ArrayBuffer.
  const safeUri = normalizeLocalUri_(localUri);
  const base64 = await uriToBase64_(safeUri);
  if (!base64 || String(base64).length < 32) {
    throw new Error("No se pudo leer el archivo del tiquet (base64 vacío). Vuelve a adjuntarlo.");
  }
  // ~6.5MB base64 ≈ ~5MB binario; por encima Apps Script / red suelen fallar o timeout.
  if (String(base64).length > 6.5 * 1024 * 1024) {
    throw new Error(
      "El tiquet es demasiado grande para subir. Usa una foto más ligera (o PDF más pequeño) y vuelve a intentarlo."
    );
  }
  const mime = guessMimeTypeFromUri_(safeUri);
  const syncTargets = (await localDb.getSyncTargets()) || {};
  const destination = buildDestination_(syncTargets);

  const fileName = String(path || `adjunto-${uuid()}.jpg`).split("/").pop() || `adjunto-${uuid()}.jpg`;
  const res = await sheetsApi.post(
    "adjunto_subir",
    {
      file_name: fileName,
      mime_type: mime,
      base64,
      mode: destination.mode,
      corporate_drive_folder_id: destination.corporate_drive_folder_id,
      corporate_spreadsheet_id: destination.corporate_spreadsheet_id,
      personal_drive_folder_id: destination.personal_drive_folder_id,
      personal_spreadsheet_id: destination.personal_spreadsheet_id,
      auto_create_personal: destination.auto_create_personal,
      destination,
    },
    {},
    { timeoutMs: 120000 }
  );
  const url = res?.data?.url || res?.url || "";
  if (!url) throw new Error("adjunto_subir sin url");
  return url;
}

async function flushOutboxOnce() {
  const outbox = await localDb.getOutbox();
  if (!outbox.length) return { pushed: 0, remainingCount: 0 };

  // Procesa en orden cronológico y dejando hojas al final para que
  // los gastos ya tengan id_gasto remoto antes de aplicar la hoja.
  const kindPriority = {
    expense: 10,
    expense_update: 15,
    maintenance: 20,
    vehicle: 30,
    expense_sheet: 90,
  };
  const orderedOutbox = outbox
    .map((job, idx) => ({ job, idx }))
    .sort((a, b) => {
      const ta = Number(a.job?.createdAt || 0);
      const tb = Number(b.job?.createdAt || 0);
      if (ta !== tb) return ta - tb;
      const pa = kindPriority[a.job?.kind] ?? 50;
      const pb = kindPriority[b.job?.kind] ?? 50;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    })
    .map((x) => x.job);

  const remaining = [];
  let pushed = 0;
  const errors = [];

  for (const job of orderedOutbox) {
    try {
      if (job.kind === "expense") {
        const payload = { ...job.payload, syncedAtLocal: new Date().toISOString() };
        const syncTargets = (await localDb.getSyncTargets()) || {};
        payload.destination = buildDestination_(syncTargets);
        payload.mode = payload.destination.mode;
        payload.corporate_drive_folder_id = payload.destination.corporate_drive_folder_id;
        payload.corporate_spreadsheet_id = payload.destination.corporate_spreadsheet_id;
        payload.personal_drive_folder_id = payload.destination.personal_drive_folder_id;
        payload.personal_spreadsheet_id = payload.destination.personal_spreadsheet_id;
        payload.auto_create_personal = payload.destination.auto_create_personal;

        // Necesitamos URLs públicas para que Apps Script pueda almacenarlas.
        const localId = String(payload.local_id || payload.id_gasto || "").trim();
        const localExpense = findLocalExpenseById_(await localDb.getExpenses(), localId);
        await ensureExpenseTicketFields_(payload, localExpense);

        if (payload.odometro_local_uri && !payload.odometro_drive_url) {
          const fileName = `odometro-${uuid()}.jpg`;
          const url = await uploadImage({
            localUri: payload.odometro_local_uri,
            path: `odometro/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
          });
          payload.odometro_drive_url = url;
          payload.odometro_drive_file_name = fileName;
        }

        delete payload.odometroLocalUri;
        stripLocalMediaFromSheetPayload_(payload);

        const createRes = await sheetsApi.post(
          "gasto_crear",
          payload,
          {
            user_email:
              payload.grabado_por_email || payload.usuario_email || payload.responsable_email || "",
          },
          { timeoutMs: 60000 }
        );
        const remoteId = String(createRes?.data?.id_gasto || createRes?.id_gasto || "").trim();
        const expenseLocalId = String(payload.local_id || "").trim();
        if (remoteId && expenseLocalId) {
          const ticketPatch = {
            id_gasto: remoteId,
            ticket_drive_url: payload.ticket_drive_url || "",
            ticket_drive_urls: Array.isArray(payload.ticket_drive_urls)
              ? payload.ticket_drive_urls.join(";")
              : String(payload.ticket_drive_urls || ""),
            ticket_drive_urls_json: payload.ticket_drive_urls_json || "",
            ticket_drive_file_name: payload.ticket_drive_file_name || "",
            ticket_drive_file_names: Array.isArray(payload.ticket_drive_file_names)
              ? payload.ticket_drive_file_names.join(";")
              : String(payload.ticket_drive_file_names || ""),
          };
          await persistLocalExpensePatch_(expenseLocalId, ticketPatch);
        }
      } else if (job.kind === "expense_update") {
        const payload = { ...job.payload, syncedAtLocal: new Date().toISOString() };
        const syncTargets = (await localDb.getSyncTargets()) || {};
        payload.destination = buildDestination_(syncTargets);
        payload.mode = payload.destination.mode;
        payload.corporate_drive_folder_id = payload.destination.corporate_drive_folder_id;
        payload.corporate_spreadsheet_id = payload.destination.corporate_spreadsheet_id;
        payload.personal_drive_folder_id = payload.destination.personal_drive_folder_id;
        payload.personal_spreadsheet_id = payload.destination.personal_spreadsheet_id;
        payload.auto_create_personal = payload.destination.auto_create_personal;

        const localId = String(payload.local_id || "").trim();
        const localExpense = findLocalExpenseById_(await localDb.getExpenses(), localId);
        await ensureExpenseTicketFields_(payload, localExpense);

        if (payload.odometro_local_uri && !payload.odometro_drive_url) {
          const fileName = `odometro-${uuid()}.jpg`;
          const url = await uploadImage({
            localUri: payload.odometro_local_uri,
            path: `odometro/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
          });
          payload.odometro_drive_url = url;
          payload.odometro_drive_file_name = fileName;
        }
        delete payload.odometro_local_uri;
        delete payload.odometroLocalUri;
        const localIdForUpdate = String(payload.local_id || localId || "").trim();
        delete payload.local_id;
        stripLocalMediaFromSheetPayload_(payload);

        const remoteId = String(payload.id_gasto || localExpense?.id_gasto || "").trim();
        if (!remoteId) throw new Error("Falta id_gasto remoto para actualizar el gasto.");
        payload.id_gasto = remoteId;

        await sheetsApi.post(
          "gasto_actualizar",
          payload,
          {
            user_email:
              payload.grabado_por_email || payload.usuario_email || payload.responsable_email || "",
          },
          { timeoutMs: 60000 }
        );

        // Restaurar local_id solo para el parche local (no va al Sheet).
        if (localIdForUpdate) payload.local_id = localIdForUpdate;

        if (localId) {
          const urls = parseTicketDriveUrlsOrdered(payload).filter(isHttpUrl_);
          const names = parseTicketDriveFileNamesOrdered(payload);
          const datePatch = {};
          for (const k of [
            "fecha",
            "fecha_repostaje",
            "fecha_peaje",
            "fecha_aparcamiento",
            "fecha_otros_gastos",
            "fecha_inspeccion",
            "fecha_compra_repuestos",
            "fecha_compra_mantenimiento",
            "fecha_multa",
            "fecha_viaje_colaborador",
            "fecha_inicio_seguro",
            "fecha_fin_seguro",
            "fecha_pago",
            "periodo_ivm",
          ]) {
            if (payload[k] !== undefined && payload[k] !== null && String(payload[k]).trim() !== "") {
              datePatch[k] = payload[k];
            }
          }
          await persistLocalExpensePatch_(localId, {
            ...ticketDriveFieldsFromLists(urls, names),
            // Conservar URLs Drive para preview APK↔web (también si quedó vacío tras quitar).
            ticketLocalUris: urls,
            ...datePatch,
          });
        }
      } else if (job.kind === "maintenance") {
        const payload = { ...job.payload, syncedAtLocal: new Date().toISOString() };
        const syncTargets = (await localDb.getSyncTargets()) || {};
        payload.destination = buildDestination_(syncTargets);
        payload.mode = payload.destination.mode;
        payload.corporate_drive_folder_id = payload.destination.corporate_drive_folder_id;
        payload.corporate_spreadsheet_id = payload.destination.corporate_spreadsheet_id;
        payload.personal_drive_folder_id = payload.destination.personal_drive_folder_id;
        payload.personal_spreadsheet_id = payload.destination.personal_spreadsheet_id;
        payload.auto_create_personal = payload.destination.auto_create_personal;

        const localMaintenance = findLocalMaintenanceRecord_(await localDb.getMaintenances(), payload);
        await ensureMaintenancePhotoFields_(payload, localMaintenance);

        if (payload.odometro_local_uri && !payload.odometro_drive_url) {
          const fileName = `odometro-${uuid()}.jpg`;
          const url = await uploadImage({
            localUri: payload.odometro_local_uri,
            path: `odometro/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
          });
          payload.odometro_drive_url = url;
          payload.odometro_drive_file_name = fileName;
        }
        delete payload.odometro_local_uri;
        delete payload.odometroLocalUri;

        payload.coste = Number(payload.coste) || 0;
        payload.kilometraje = Number(payload.kilometraje) || 0;

        const metaEmail = String(payload.responsable_email || payload.usuario_email || "").trim().toLowerCase();
        const actions = ["mantenimiento_crear", "mantenimiento_guardar", "mantenimiento_upsert"];
        let lastMantErr = null;
        let posted = false;
        for (let ai = 0; ai < actions.length; ai += 1) {
          try {
            await sheetsApi.post(actions[ai], payload, { user_email: metaEmail });
            posted = true;
            break;
          } catch (e) {
            lastMantErr = e;
            const msg = String(e?.message || "").toLowerCase();
            if (
              msg.includes("no reconocida") ||
              msg.includes("not recognized") ||
              msg.includes("unknown action") ||
              msg.includes("acción no reconocida") ||
              msg.includes("accion no reconocida")
            ) {
              continue;
            }
            throw e;
          }
        }
        if (!posted) {
          throw lastMantErr || new Error("No hay endpoint de mantenimiento reconocido en el servidor.");
        }
      } else if (job.kind === "vehicle") {
        // Mantén el comportamiento anterior para vehículos (normalmente ya se gestionan en la pantalla de Flota).
        if (!firebaseAvailable || !firestore) throw new Error("Firebase no disponible para sincronizar vehículos.");
        const v = job.payload;
        const id = v.id || uuid();
        await setDoc(doc(firestore, "vehicles", id), { ...v, updatedAt: serverTimestamp() }, { merge: true });
      } else if (job.kind === "expense_sheet") {
        const payload = { ...(job.payload || {}), syncedAtLocal: new Date().toISOString() };
        // Compatibilidad con hojas antiguas en cola: hidratar num_hoja_gasto desde localDb.
        const localSheetId = String(payload.hoja_id_local || payload.hoja_gasto_id || "").trim();
        if (!String(payload.num_hoja_gasto || payload.Num_Hoja_Gasto || "").trim() && localSheetId) {
          const allSheets = await localDb.getExpenseSheets();
          const match = (Array.isArray(allSheets) ? allSheets : []).find((s) => {
            const sid = String(s?.id || s?.hoja_id_local || s?.hoja_gasto_id || "").trim();
            return !!sid && sid === localSheetId;
          });
          const recoveredNum = String(match?.num_hoja_gasto || match?.Num_Hoja_Gasto || "").trim();
          if (recoveredNum) {
            payload.num_hoja_gasto = recoveredNum;
            payload.Num_Hoja_Gasto = recoveredNum;
          }
          const recoveredName = String(match?.usuario_nombre || "").trim();
          if (recoveredName && !String(payload.usuario_nombre || "").trim()) {
            payload.usuario_nombre = recoveredName;
          }
        }
        if (localSheetId && !String(payload.hoja_gasto_id || "").trim()) payload.hoja_gasto_id = localSheetId;
        if (localSheetId && !String(payload.hoja_id_local || "").trim()) payload.hoja_id_local = localSheetId;
        // Reparar id_gasto: no enviar IDs locales (timestamps) al sheet GASTOS.
        const lines = Array.isArray(payload.lineas) ? payload.lineas.slice() : [];
        if (lines.length) {
          const expenses = await localDb.getExpenses();
          const byLocalId = {};
          for (let i = 0; i < expenses.length; i += 1) {
            const e = expenses[i];
            const lid = String(e?.id || e?.local_id || "").trim();
            if (lid) byLocalId[lid] = e;
            const remote = String(e?.id_gasto || "").trim();
            if (remote && /^GAS/i.test(remote)) byLocalId[remote] = e;
          }
          const isRemoteGasId_ = (id) => /^GAS/i.test(String(id || "").trim());
          payload.lineas = lines.map((ln) => {
            const current = String(ln?.id_gasto || "").trim();
            if (isRemoteGasId_(current)) return ln;
            const localRef = String(ln?.expense_id || current || "").trim();
            const match = localRef ? byLocalId[localRef] : null;
            const remoteId = String(match?.id_gasto || "").trim();
            if (isRemoteGasId_(remoteId)) return { ...ln, id_gasto: remoteId };
            return { ...ln, id_gasto: "" };
          });
          const missingRemote = payload.lineas.filter((ln) => !isRemoteGasId_(ln?.id_gasto));
          if (missingRemote.length) {
            throw new Error(
              `La hoja tiene ${missingRemote.length} gasto(s) aún sin id remoto (GAS...). Sincroniza esos gastos primero y vuelve a sincronizar la hoja.`
            );
          }
        }
        const postMeta = { user_email: payload.usuario_email || "" };
        const postOpts = { timeoutMs: 30000 };
        let res = null;
        try {
          res = await sheetsApi.post("hoja_gasto_actualizar_gastos", payload, postMeta, postOpts);
        } catch (firstErr) {
          const msg = String(firstErr?.message || "").toLowerCase();
          const unknownAction = msg.includes("accion post no reconocida") || msg.includes("acción post no reconocida");
          if (!unknownAction) throw firstErr;
          // Fallback para despliegues con nombre de acción antiguo en el router.
          res = await sheetsApi.post("hoja_gasto_actualizar_estado", payload, postMeta, postOpts);
        }
        const updated = Number(res?.data?.updated ?? res?.updated ?? 0) || 0;
        const requested = Number(res?.data?.requested ?? res?.requested ?? 0) || 0;
        const alreadyPresent = Number(res?.data?.already_present ?? res?.already_present ?? 0) || 0;
        if (requested > 0 && updated + alreadyPresent <= 0) {
          const notFound = res?.data?.not_found_ids || res?.not_found_ids || [];
          throw new Error(
            `No se actualizaron gastos en GASTOS. not_found_ids: ${
              Array.isArray(notFound) && notFound.length ? notFound.join(", ") : "sin detalle"
            }`
          );
        }
        // Conservar el nº de hoja definitivo que devolvió el servidor (T-MES-AÑO-COD).
        // Si el servidor renumeró hermanas (I/II/III por fecha de emisión), aplicar todo el mapa.
        const serverNum = String(res?.data?.num_hoja_gasto || res?.num_hoja_gasto || "").trim();
        const renumberedRaw = res?.data?.renumbered || res?.renumbered || null;
        const renumbered =
          renumberedRaw && typeof renumberedRaw === "object" && !Array.isArray(renumberedRaw)
            ? renumberedRaw
            : null;
        if ((serverNum && localSheetId) || (renumbered && Object.keys(renumbered).length)) {
          const allSheets = await localDb.getExpenseSheets();
          const nextSheets = (Array.isArray(allSheets) ? allSheets : []).map((s) => {
            const sid = String(s?.id || s?.hoja_id_local || s?.hoja_gasto_id || "").trim();
            let next = s;
            if (serverNum && sid && sid === localSheetId) {
              next = { ...next, num_hoja_gasto: serverNum, Num_Hoja_Gasto: serverNum };
            }
            if (renumbered && sid && renumbered[sid]) {
              const n = String(renumbered[sid] || "").trim();
              if (n) next = { ...next, num_hoja_gasto: n, Num_Hoja_Gasto: n };
            }
            return next;
          });
          await localDb.setExpenseSheets(nextSheets);

          if (renumbered && Object.keys(renumbered).length) {
            const allExps = await localDb.getExpenses();
            const nextExps = (Array.isArray(allExps) ? allExps : []).map((e) => {
              const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
              if (!hid || !renumbered[hid]) return e;
              const n = String(renumbered[hid] || "").trim();
              if (!n) return e;
              return { ...e, num_hoja_gasto: n, Num_Hoja_Gasto: n };
            });
            await localDb.setExpenses(nextExps);
          } else if (serverNum && localSheetId) {
            const allExps = await localDb.getExpenses();
            const nextExps = (Array.isArray(allExps) ? allExps : []).map((e) => {
              const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
              if (hid !== localSheetId) return e;
              return { ...e, num_hoja_gasto: serverNum, Num_Hoja_Gasto: serverNum };
            });
            await localDb.setExpenses(nextExps);
          }
        }
      } else {
        throw new Error("Unknown outbox job");
      }
      pushed += 1;
    } catch (err) {
      const msg = err?.message ? String(err.message) : "Sync error";
      errors.push(msg);
      remaining.push({ ...job, _syncError: msg });
    }
  }

  await localDb.setOutbox(remaining);
  return { pushed, remainingCount: remaining.length, errors };
}

export const syncService = {
  async queue(job) {
    const outbox = await localDb.getOutbox();
    await localDb.setOutbox([{ id: uuid(), createdAt: Date.now(), ...job }, ...outbox]);
  },
  async flushIfOnline() {
    const state = await NetInfo.fetch();
    // Solo "sin red" si NetInfo confirma desconexión. isConnected=null es habitual
    // al arrancar en Android; en ese caso intentamos sincronizar igual.
    if (state.isConnected === false) {
      return { pushed: 0, remainingCount: 0, errors: [], online: false };
    }
    const res = await flushOutboxOnce();
    // online = había (o se asumía) red. Los pendientes por error de API no son "sin red".
    return { ...res, online: true };
  },
  async extractOdometerKmFromLocalUri(localUri) {
    const normalized = normalizeLocalUri_(localUri);
    const safeUri = await optimizeImageForOcr_(normalized);
    const info = await FileSystem.getInfoAsync(safeUri);
    const size = Number(info?.size || 0);
    if (size > 8 * 1024 * 1024) {
      throw new Error("La foto del odómetro es muy grande. Haz una foto más cerca y vuelve a intentarlo.");
    }
    const base64 = await uriToBase64_(safeUri);
    const mime = guessMimeTypeFromUri_(safeUri);
    const bases = getOdometerOcrCandidates_();
    if (!bases.length) {
      throw new Error("No hay endpoint OCR configurado.");
    }
    let lastErr = null;
    for (const base of bases) {
      try {
        return await postOdometerToPythonOcr_({ safeUri, base64, mime, base });
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(`OCR no disponible: ${String(lastErr?.message || "sin detalle")}`);
  },
  async extractTicketDataFromLocalUri(localUri) {
    const normalized = normalizeLocalUri_(localUri);
    const safeUri = await optimizeImageForOcr_(normalized);
    const info = await FileSystem.getInfoAsync(safeUri);
    const size = Number(info?.size || 0);
    if (size > 10 * 1024 * 1024) {
      throw new Error("La foto del ticket es muy grande. Haz una foto más cerca y vuelve a intentarlo.");
    }
    const base64 = await uriToBase64_(safeUri);
    const mime = guessMimeTypeFromUri_(safeUri);
    const bases = getTicketOcrCandidates_();
    if (!bases.length) throw new Error("No hay endpoint OCR de ticket configurado.");
    let lastErr = null;
    for (const base of bases) {
      try {
        return await postTicketToPythonOcr_({ safeUri, base64, mime, base });
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(`OCR ticket no disponible: ${String(lastErr?.message || "sin detalle")}`);
  },
};

