import NetInfo from "@react-native-community/netinfo";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAvailable, firestore } from "../firebase/firebase";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system/legacy";

const DEFAULT_CORP_DRIVE_FOLDER_ID = "1QIff1sdYQYdr1rd2JA1ua7iF579Mrcdv";
const DEFAULT_CORP_SPREADSHEET_ID = "1v6YJ7Y3KjSUUaTog8tuw1elircOR5dbPZaddNkZ4gGY";

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

  const remaining = [];
  let pushed = 0;
  const errors = [];

  for (const job of outbox) {
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

        delete payload.ticketLocalUris;

        await sheetsApi.post("gasto_crear", payload, {
          user_email: payload.responsable_email || payload.usuario_email || "",
        });
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

        await sheetsApi.post("mantenimiento_crear", payload, {
          user_email: payload.responsable_email || payload.usuario_email || "",
        });
      } else if (job.kind === "vehicle") {
        // Mantén el comportamiento anterior para vehículos (normalmente ya se gestionan en la pantalla de Flota).
        if (!firebaseAvailable || !firestore) throw new Error("Firebase no disponible para sincronizar vehículos.");
        const v = job.payload;
        const id = v.id || uuid();
        await setDoc(doc(firestore, "vehicles", id), { ...v, updatedAt: serverTimestamp() }, { merge: true });
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
};

