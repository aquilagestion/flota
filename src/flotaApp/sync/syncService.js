import NetInfo from "@react-native-community/netinfo";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAvailable, firestore } from "../firebase/firebase";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system/legacy";
import { env } from "../config/env";

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
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
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
  const s = String(value || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  // expo-file-system puede fallar con algunas variantes de URI.
  // Probamos varias normalizaciones.
  const candidates = [];
  const u = String(safeUri || "");
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

async function uploadImage({ localUri, path }) {
  if (!localUri) throw new Error("uploadImage: localUri vacío");
  // Forzamos SIEMPRE Apps Script/Drive para evitar cualquier ruta Blob/ArrayBuffer.
  const safeUri = normalizeLocalUri_(localUri);
  const base64 = await uriToBase64_(safeUri);
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
    {}
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
        if (Array.isArray(payload.ticketLocalUris) && payload.ticketLocalUris.length && !Array.isArray(payload.ticket_drive_urls)) {
          const urls = [];
          const fileNames = [];
          for (const u of payload.ticketLocalUris) {
            const fileName = `ticket-${uuid()}.jpg`;
            const url = await uploadImage({
              localUri: u,
              path: `tickets/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
            });
            urls.push(url);
            fileNames.push(fileName);
          }
          payload.ticket_drive_urls = urls;
          payload.ticket_drive_url = urls[0] || "";
          payload.ticket_drive_file_names = fileNames;
          payload.ticket_drive_file_name = fileNames[0] || "";
        }

        if (payload.odometro_local_uri && !payload.odometro_drive_url) {
          const fileName = `odometro-${uuid()}.jpg`;
          const url = await uploadImage({
            localUri: payload.odometro_local_uri,
            path: `odometro/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
          });
          payload.odometro_drive_url = url;
          payload.odometro_drive_file_name = fileName;
        }

        delete payload.ticketLocalUris;
        delete payload.odometroLocalUri;

        const createRes = await sheetsApi.post("gasto_crear", payload, {
          user_email: payload.responsable_email || payload.usuario_email || "",
        });
        const remoteId = String(createRes?.data?.id_gasto || createRes?.id_gasto || "").trim();
        const localId = String(payload.local_id || "").trim();
        if (remoteId && localId) {
          const current = await localDb.getExpenses();
          const next = current.map((e) => {
            const eid = String(e?.id || e?.local_id || "").trim();
            if (eid !== localId) return e;
            return { ...e, id_gasto: remoteId };
          });
          await localDb.setExpenses(next);
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

        if (Array.isArray(payload.photoLocalUris) && payload.photoLocalUris.length && !Array.isArray(payload.fotos_drive_urls)) {
          const urls = [];
          const fileNames = [];
          for (const u of payload.photoLocalUris) {
            const fileName = `foto-${uuid()}.jpg`;
            const url = await uploadImage({
              localUri: u,
              path: `maintenance/${payload.vehiclePlate || payload.matricula || "sin_matricula"}/${fileName}`,
            });
            urls.push(url);
            fileNames.push(fileName);
          }
          payload.fotos_drive_urls = urls;
          payload.fotos_drive_url = urls[0] || "";
          payload.fotos_drive_file_names = fileNames;
          payload.fotos_drive_file_name = fileNames[0] || "";
        }

        delete payload.photoLocalUris;

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
        // Intento de reparación: completar id_gasto remoto en líneas antiguas usando expense_id/local_id.
        const lines = Array.isArray(payload.lineas) ? payload.lineas.slice() : [];
        if (lines.length) {
          const expenses = await localDb.getExpenses();
          const byLocalId = {};
          for (let i = 0; i < expenses.length; i += 1) {
            const e = expenses[i];
            const lid = String(e?.id || e?.local_id || "").trim();
            if (lid) byLocalId[lid] = e;
          }
          payload.lineas = lines.map((ln) => {
            const currentRemote = String(ln?.id_gasto || "").trim();
            if (currentRemote) return ln;
            const localRef = String(ln?.expense_id || "").trim();
            if (!localRef) return ln;
            const match = byLocalId[localRef];
            const remoteId = String(match?.id_gasto || "").trim();
            if (!remoteId) return ln;
            return { ...ln, id_gasto: remoteId };
          });
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
    if (!state.isConnected) return { pushed: 0, online: false };
    const res = await flushOutboxOnce();
    const online = state.isConnected && res.remainingCount === 0;
    return { ...res, online };
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

