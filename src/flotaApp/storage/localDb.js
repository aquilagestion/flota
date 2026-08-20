import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const memory = {
  vehicles: null,
};

const KEYS = {
  vehicles: "@flota:vehicles:v2",
  expenses: "@flota:expenses:v2",
  maint: "@flota:maint:v2",
  expenseSheets: "@flota:expenseSheets:v1",
  expenseSheetMeta: "@flota:expenseSheetMeta:v1",
  outbox: "@flota:outbox:v1",
  expensesDraft: "@flota:expensesDraft:v1",
  syncTargets: "@flota:syncTargets:v1",
  projectSelectOptions: "@flota:projectSelectOptions:v1",
};

const HUGE_DATA_URI_MIN = 400;
const EXPENSES_SOFT_CAP = 120;

function isQuotaError_(err) {
  const name = String(err?.name || "");
  const msg = String(err?.message || err || "");
  return (
    name === "QuotaExceededError" ||
    /quota|setItem|exceeded the quota|QUOTA_EXCEEDED/i.test(msg)
  );
}

function isHttpUrl_(u) {
  return /^https?:\/\//i.test(String(u || "").trim());
}

function isHugeDataOrBlob_(u) {
  const s = String(u || "").trim();
  if (!s) return false;
  if (!(s.startsWith("data:") || s.startsWith("blob:"))) return false;
  return s.length > HUGE_DATA_URI_MIN;
}

function parseDriveUrlsFromExpense_(e) {
  const out = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s && isHttpUrl_(s) && !out.includes(s)) out.push(s);
  };
  push(e?.ticket_drive_url);
  const multi = String(e?.ticket_drive_urls || "").trim();
  if (multi) {
    for (const part of multi.split(/[;,]/)) push(part);
  }
  try {
    const parsed = JSON.parse(String(e?.ticket_drive_urls_json || "[]"));
    if (Array.isArray(parsed)) parsed.forEach(push);
  } catch {
    // ignore
  }
  return out;
}

/**
 * Compacta un gasto para localStorage: no guardar data:/blob: enormes si ya hay Drive.
 * En modo aggressive, elimina cualquier data:/blob: residual.
 */
function sanitizeExpenseRecord_(e, { aggressive = false } = {}) {
  if (!e || typeof e !== "object") return e;
  const next = { ...e };
  const driveUrls = parseDriveUrlsFromExpense_(next);

  if (Array.isArray(next.ticketLocalUris)) {
    next.ticketLocalUris = next.ticketLocalUris
      .map((u, i) => {
        const s = String(u || "").trim();
        if (!s) return "";
        if (isHttpUrl_(s)) return s;
        if (isHugeDataOrBlob_(s)) {
          const parallel = driveUrls[i] || driveUrls[0] || "";
          if (parallel) return parallel;
          if (aggressive) return "";
        }
        if (aggressive && (s.startsWith("data:") || s.startsWith("blob:"))) return "";
        return s;
      })
      .filter(Boolean);
    if (!next.ticketLocalUris.length && driveUrls.length) {
      next.ticketLocalUris = driveUrls.slice();
    }
  }

  const odoLocal = String(next.odometroLocalUri || next.odometro_local_uri || "").trim();
  const odoDrive = String(next.odometro_drive_url || "").trim();
  if (odoLocal && isHugeDataOrBlob_(odoLocal) && (odoDrive || aggressive)) {
    delete next.odometroLocalUri;
    delete next.odometro_local_uri;
  }

  for (const key of Object.keys(next)) {
    const v = next[key];
    if (typeof v !== "string") continue;
    if (!isHugeDataOrBlob_(v)) continue;
    if (aggressive || driveUrls.length || key.toLowerCase().includes("odometro")) {
      delete next[key];
    }
  }
  return next;
}

function sanitizeExpensesList_(list, opts = {}) {
  const rows = (Array.isArray(list) ? list : []).map((e) => sanitizeExpenseRecord_(e, opts));
  if (!opts.aggressive && rows.length <= EXPENSES_SOFT_CAP) return rows;
  // Preferir conservar pendientes de sync / sin id remoto GAS.
  const scored = rows.map((e, idx) => {
    const gid = String(e?.id_gasto || "").trim();
    const hasRemote = /^GAS/i.test(gid);
    const hasHoja = !!String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
    const ts = Date.parse(String(e?.createdAtLocal || e?.syncedAtLocal || "")) || idx;
    return { e, hasRemote, hasHoja, ts };
  });
  scored.sort((a, b) => {
    // Primero los que aún no están en Sheet (sin GAS).
    if (a.hasRemote !== b.hasRemote) return a.hasRemote ? 1 : -1;
    if (a.hasHoja !== b.hasHoja) return a.hasHoja ? 1 : -1;
    return b.ts - a.ts;
  });
  return scored.slice(0, EXPENSES_SOFT_CAP).map((x) => x.e);
}

function sanitizeDraft_(draft) {
  if (!draft || typeof draft !== "object") return draft;
  return sanitizeExpenseRecord_(draft, { aggressive: false });
}

function sanitizeOutbox_(list, { aggressive = false } = {}) {
  return (Array.isArray(list) ? list : []).map((job) => {
    if (!job || typeof job !== "object") return job;
    const payload = job.payload && typeof job.payload === "object" ? { ...job.payload } : job.payload;
    if (!payload || typeof payload !== "object") return job;
    const nextPayload = sanitizeExpenseRecord_(payload, { aggressive });
    // En outbox, si ya hay Drive, no hace falta data URI local.
    if (Array.isArray(nextPayload.ticketLocalUris)) {
      const drives = parseDriveUrlsFromExpense_(nextPayload);
      if (drives.length) {
        nextPayload.ticketLocalUris = nextPayload.ticketLocalUris.map((u) => {
          const s = String(u || "").trim();
          if (isHugeDataOrBlob_(s)) return "";
          return s;
        }).filter(Boolean);
        if (!nextPayload.ticketLocalUris.length) nextPayload.ticketLocalUris = drives.slice();
      }
    }
    return { ...job, payload: nextPayload };
  });
}

async function getJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function setJsonRaw_(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function recoverWebStorageQuota_() {
  // Borrador con fotos en base64 suele ser el culpable principal en web.
  try {
    await AsyncStorage.removeItem(KEYS.expensesDraft);
  } catch {
    // ignore
  }
  try {
    const expenses = await getJson(KEYS.expenses, []);
    await setJsonRaw_(KEYS.expenses, sanitizeExpensesList_(expenses, { aggressive: true }));
  } catch {
    // ignore
  }
  try {
    const outbox = await getJson(KEYS.outbox, []);
    await setJsonRaw_(KEYS.outbox, sanitizeOutbox_(outbox, { aggressive: true }));
  } catch {
    // ignore
  }
  try {
    const sheets = await getJson(KEYS.expenseSheets, []);
    const slim = (Array.isArray(sheets) ? sheets : []).map((s) => {
      if (!s || typeof s !== "object") return s;
      const next = { ...s };
      if (Array.isArray(next.lineas)) {
        next.lineas = next.lineas.map((ln) => {
          if (!ln || typeof ln !== "object") return ln;
          const row = { ...ln };
          for (const k of Object.keys(row)) {
            if (typeof row[k] === "string" && isHugeDataOrBlob_(row[k])) delete row[k];
          }
          return row;
        });
      }
      return next;
    });
    await setJsonRaw_(KEYS.expenseSheets, slim);
  } catch {
    // ignore
  }
}

async function setJson(key, value) {
  try {
    await setJsonRaw_(key, value);
  } catch (err) {
    if (!isQuotaError_(err)) throw err;
    // Solo tiene sentido en web (localStorage ~5MB).
    if (Platform.OS === "web") {
      await recoverWebStorageQuota_();
      try {
        await setJsonRaw_(key, value);
        return;
      } catch (err2) {
        if (!isQuotaError_(err2)) throw err2;
        // Último intento: si es expenses, guardar versión agresiva compactada.
        if (key === KEYS.expenses) {
          await setJsonRaw_(key, sanitizeExpensesList_(value, { aggressive: true }));
          return;
        }
        if (key === KEYS.expensesDraft) {
          await setJsonRaw_(key, sanitizeDraft_(value));
          return;
        }
        if (key === KEYS.outbox) {
          await setJsonRaw_(key, sanitizeOutbox_(value, { aggressive: true }));
          return;
        }
        throw new Error(
          "Almacenamiento local del navegador lleno (tiquets/fotos en caché). Recarga la página o borra datos del sitio y vuelve a sincronizar."
        );
      }
    }
    throw new Error(
      "No hay espacio local suficiente para guardar. Libera almacenamiento e inténtalo de nuevo."
    );
  }
}

function sortVehiclesByMatricula_(list) {
  const rows = Array.isArray(list) ? list.slice() : [];
  rows.sort((a, b) => {
    const av = String(a?.matricula || "").trim().toUpperCase();
    const bv = String(b?.matricula || "").trim().toUpperCase();
    return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
  });
  return rows;
}

export const localDb = {
  getVehiclesMemory() {
    return Array.isArray(memory.vehicles) ? memory.vehicles : [];
  },
  async getVehicles() {
    if (Array.isArray(memory.vehicles)) return memory.vehicles;
    const list = await getJson(KEYS.vehicles, []);
    memory.vehicles = sortVehiclesByMatricula_(list);
    return memory.vehicles;
  },
  async setVehicles(list) {
    memory.vehicles = sortVehiclesByMatricula_(list);
    await setJson(KEYS.vehicles, memory.vehicles);
  },
  async getExpenses() {
    return await getJson(KEYS.expenses, []);
  },
  async setExpenses(list) {
    await setJson(KEYS.expenses, sanitizeExpensesList_(list, { aggressive: false }));
  },
  async getMaintenances() {
    return await getJson(KEYS.maint, []);
  },
  async setMaintenances(list) {
    await setJson(KEYS.maint, list);
  },
  async getExpenseSheets() {
    return await getJson(KEYS.expenseSheets, []);
  },
  async setExpenseSheets(list) {
    await setJson(KEYS.expenseSheets, list);
  },
  /** Meta LIFE (DNI/fecha/WP) por hoja_gasto_id — espejo nativo de localStorage web. */
  async getExpenseSheetMeta(hojaId) {
    const hid = String(hojaId || "").trim();
    if (!hid) return null;
    const map = await getJson(KEYS.expenseSheetMeta, {});
    const row = map && typeof map === "object" ? map[hid] : null;
    return row && typeof row === "object" ? row : null;
  },
  async setExpenseSheetMeta(hojaId, meta) {
    const hid = String(hojaId || "").trim();
    if (!hid) return;
    const map = await getJson(KEYS.expenseSheetMeta, {});
    const next = map && typeof map === "object" ? { ...map } : {};
    if (meta == null) delete next[hid];
    else next[hid] = meta;
    await setJson(KEYS.expenseSheetMeta, next);
  },
  async getOutbox() {
    return await getJson(KEYS.outbox, []);
  },
  async setOutbox(list) {
    await setJson(KEYS.outbox, sanitizeOutbox_(list, { aggressive: false }));
  },
  async getExpensesDraft() {
    return await getJson(KEYS.expensesDraft, null);
  },
  async setExpensesDraft(draft) {
    if (draft == null) {
      await setJson(KEYS.expensesDraft, null);
      return;
    }
    await setJson(KEYS.expensesDraft, sanitizeDraft_(draft));
  },
  async getSyncTargets() {
    return await getJson(KEYS.syncTargets, null);
  },
  async setSyncTargets(targets) {
    await setJson(KEYS.syncTargets, targets);
  },
  async getProjectSelectOptions(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return [];
    const map = await getJson(KEYS.projectSelectOptions, {});
    const list = map && typeof map === "object" ? map[e] : null;
    return Array.isArray(list) ? list : [];
  },
  async setProjectSelectOptions(email, options) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return;
    const map = await getJson(KEYS.projectSelectOptions, {});
    const next = map && typeof map === "object" ? { ...map } : {};
    next[e] = Array.isArray(options) ? options : [];
    await setJson(KEYS.projectSelectOptions, next);
  },
  /** Libera cuota web: compacta gastos/outbox y borra borrador. */
  async compactLocalStorageForQuota() {
    await recoverWebStorageQuota_();
  },
};
