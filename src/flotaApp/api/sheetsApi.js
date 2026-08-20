import { Platform } from "react-native";
import { env } from "../config/env";

const REQUEST_TIMEOUT_MS = 45000;

function isWebPostFallbackError_(err) {
  const msg = String(err?.message || err || "").trim();
  return /conectar|failed to fetch|network|cors|timeout|load failed|abort/i.test(msg);
}

function flattenPayloadForGetQuery_(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) out[key] = JSON.stringify(value);
    else if (typeof value === "boolean") out[key] = value ? "true" : "false";
    else if (typeof value === "object") out[key] = JSON.stringify(value);
    else out[key] = String(value);
  }
  return out;
}

function assertApiUrl_() {
  const base = String(env.apiUrl || "").trim();
  if (!base) {
    throw new Error("Falta EXPO_PUBLIC_API_URL (Apps Script)");
  }
  return base.replace(/\/+$/, "");
}

function getSecret_() {
  const s = String(env.apiSecret || "").trim();
  if (!s) throw new Error("Falta EXPO_PUBLIC_API_SECRET (para POST)");
  return s;
}

async function readJson_(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { status: "error", message: "Respuesta no JSON", raw: text };
  }
}

async function fetchWithTimeout_(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer = null;
  try {
    const fetchPromise = fetch(url, { ...(options || {}), signal: controller.signal });
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // silent
        }
        reject(new Error("Timeout de conexión con el servidor Sheets."));
      }, timeoutMs);
    });
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Timeout de conexión con el servidor Sheets.");
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const sheetsApi = {
  async get(action, params = {}, options = {}) {
    const base = assertApiUrl_();
    const qs = new URLSearchParams({ action, ...params });
    const url = `${base}?${qs.toString()}`;
    const res = await fetchWithTimeout_(url, { method: "GET" }, options?.timeoutMs || REQUEST_TIMEOUT_MS);
    const json = await readJson_(res);
    if (!res.ok || (json && json.status === "error")) {
      const msg = json?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  },

  /**
   * Base64 de un archivo Drive (imagen/PDF) para anexos de hoja en web.
   * Requiere secret (el router AS lo valida en GET ticket_drive_data).
   */
  ticketDriveData(fileId, userEmail, options = {}) {
    return this.get(
      "ticket_drive_data",
      {
        file_id: String(fileId || "").trim(),
        user_email: String(userEmail || "").trim().toLowerCase(),
        secret: getSecret_(),
      },
      { timeoutMs: options?.timeoutMs || 90000 }
    );
  },

  // OJO: tu Apps Script espera body plano: { action, secret, ...payload }
  // Content-Type text/plain evita preflight CORS en navegador (GAS + redirect).
  async post(action, payload = {}, meta = {}, options = {}) {
    const base = assertApiUrl_();
    const secret = getSecret_();
    const body = {
      action,
      secret,
      ...(meta?.user_email ? { user_email: String(meta.user_email).trim().toLowerCase() } : {}),
      ...(payload || {}),
    };
    try {
      const res = await fetchWithTimeout_(
        base,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(body),
          redirect: "follow",
        },
        options?.timeoutMs || REQUEST_TIMEOUT_MS
      );
      const json = await readJson_(res);
      if (!res.ok || (json && json.status === "error")) {
        const msg = json?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    } catch (e) {
      const raw = String(e?.message || e || "").trim();
      if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
        throw new Error(
          "No se pudo conectar con el servidor (red/CORS). Revisa conexión e inténtalo de nuevo. Si persiste en web, prueba también en la APK."
        );
      }
      throw e;
    }
  },

  /** En navegador: si POST falla por red/CORS, reintenta vía GET (Apps Script). */
  async postWebSafe(action, payload = {}, meta = {}, options = {}) {
    try {
      return await this.post(action, payload, meta, options);
    } catch (e) {
      if (Platform.OS !== "web" || !isWebPostFallbackError_(e)) throw e;
      const email = String(meta?.user_email || payload?.user_email || "").trim().toLowerCase();
      return this.get(
        action,
        {
          ...flattenPayloadForGetQuery_(payload),
          secret: getSecret_(),
          user_email: email,
        },
        { timeoutMs: options?.timeoutMs || REQUEST_TIMEOUT_MS }
      );
    }
  },

  /** Informe mensual de gobierno (GESTOR / ADMINISTRACION). */
  informeGobiernoMensual(userEmail, anio, mes) {
    return this.get("informe_gobierno_mensual", {
      user_email: String(userEmail || "").trim().toLowerCase(),
      anio: String(anio ?? ""),
      mes: String(mes ?? ""),
    });
  },

  /** Informe km viajes flota GREFA (GESTOR / ADMIN / RESPONSABLE a cargo). */
  informeKmFlota(userEmail, params = {}) {
    const email = String(userEmail || "").trim().toLowerCase();
    return this.get("informe_km_flota", {
      user_email: email,
      fecha_desde: String(params.fecha_desde || "").trim(),
      fecha_hasta: String(params.fecha_hasta || "").trim(),
      anio: String(params.anio ?? ""),
      mes: String(params.mes ?? ""),
      matricula: String(params.matricula || "").trim().toUpperCase(),
      usuario_email: String(params.usuario_email || params.conductor_email || "")
        .trim()
        .toLowerCase(),
      id_proyecto: String(params.id_proyecto || "").trim(),
      estado: String(params.estado || "CERRADO").trim().toUpperCase(),
    });
  },

  /** Actualiza la acción de un viaje de flota desde el informe. */
  async informeKmFlotaSetAccion(userEmail, idViaje, accion) {
    const email = String(userEmail || "").trim().toLowerCase();
    const payload = {
      id_viaje: String(idViaje || "").trim(),
      accion: String(accion || "").trim(),
      user_email: email,
    };
    return this.postWebSafe("informe_km_flota_set_accion", payload, { user_email: email });
  },

  /** Aprobadores de uso (RESPONSABLE/GESTOR/ADMIN) — para SLA/escalado. */
  usuariosAprobadoresUsoList(userEmail) {
    return this.get("usuarios_aprobadores_uso_list", {
      user_email: String(userEmail || "").trim().toLowerCase(),
    });
  },

  /** Liberar solicitud APROBADA (total o parcial). En web, si POST falla por CORS, usa GET. */
  async liberacionCrear(payload, userEmail) {
    const data = {
      id_solicitud: String(payload?.id_solicitud || "").trim(),
      fecha_inicio_liberacion: String(payload?.fecha_inicio_liberacion || "").trim(),
      fecha_fin_liberacion: String(payload?.fecha_fin_liberacion || "").trim(),
      hora_inicio_liberacion: String(payload?.hora_inicio_liberacion || "").trim(),
      hora_fin_liberacion: String(payload?.hora_fin_liberacion || "").trim(),
      motivo: String(payload?.motivo || "").trim(),
    };
    const email = String(userEmail || "").trim().toLowerCase();
    try {
      return await this.post("liberacion_crear", data, { user_email: email }, { timeoutMs: 45000 });
    } catch (e) {
      const msg = String(e?.message || "");
      const isNet = /conectar|failed to fetch|network|cors|Timeout/i.test(msg);
      if (!isNet) throw e;
      // Fallback GET (más compatible con CORS en Apps Script desde el navegador)
      return this.get(
        "liberacion_crear",
        {
          ...data,
          user_email: email,
          secret: getSecret_(),
        },
        { timeoutMs: 45000 }
      );
    }
  },

  /** Cancelar (retirar) solicitud PENDIENTE propia. */
  cancelarSolicitud(idSolicitud, trabajadorEmail) {
    const email = String(trabajadorEmail || "").trim().toLowerCase();
    return this.post(
      "cancelar_solicitud",
      {
        id_solicitud: String(idSolicitud || "").trim(),
        trabajador_email: email,
      },
      { user_email: email }
    );
  },
};

