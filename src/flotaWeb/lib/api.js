import { env } from "../../flotaApp/config/env";

const WEB_API_TIMEOUT_MS = 15000;
export const WEB_SLOW_POST_TIMEOUT_MS = 60000;
const WEB_API_MAX_RETRIES = 3;

const APPS_SCRIPT_EXEC_RE = /\/macros\/s\/[^/]+\/exec$/i;

function getApiBaseUrl_() {
  const base = String(env.apiUrl || "").trim();
  if (!base) throw new Error("Falta EXPO_PUBLIC_API_URL (Apps Script) en la configuracion web.");
  const normalized = base.replace(/\/+$/, "");
  if (!APPS_SCRIPT_EXEC_RE.test(normalized)) {
    throw new Error(
      "EXPO_PUBLIC_API_URL debe ser la URL de despliegue de Apps Script (…/macros/s/…/exec), no la del Spreadsheet ni de Drive."
    );
  }
  return normalized;
}

function looksLikeHtmlResponse_(text) {
  const raw = String(text || "").trim();
  return raw.startsWith("<!DOCTYPE") || raw.startsWith("<html") || /<html[\s>]/i.test(raw);
}

function friendlyNonJsonMessage_(text, label, status) {
  const raw = String(text || "").trim();
  const httpStatus = Number(status || 0);
  if (looksLikeHtmlResponse_(raw)) {
    const drivePage =
      /No se pudo abrir el archivo|No se puede abrir el archivo|No se encontró la página|docs-drivelogo/i.test(raw);
    if (drivePage || httpStatus === 404 || httpStatus === 403) {
      if (httpStatus === 404) {
        return (
          "Google devolvió error 404 al contactar Apps Script (respuesta HTML). " +
          "Suele ser temporal: espera unos segundos y vuelve a intentarlo. " +
          "Si ocurre al eliminar un gasto, confirma que el despliegue publicado incluye gasto_eliminar y que el acceso es «Cualquier usuario»."
        );
      }
      return (
        "El servidor respondió con una página de Google Drive/Sheets en lugar de datos de la API. " +
        "Comprueba que EXPO_PUBLIC_API_URL apunta al despliegue de Apps Script (…/exec) y que el acceso del despliegue es «Cualquier usuario»."
      );
    }
    return `El servidor devolvió HTML en lugar de JSON (${label}).`;
  }
  if (!raw) return `Respuesta vacía del servidor (${label}).`;
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}

async function fetchWithTimeout_(url, options, timeoutMs) {
  const controller = new AbortController();
  const ms = Number(timeoutMs || WEB_API_TIMEOUT_MS);
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // silent
    }
  }, ms);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRetriableStatus_(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isLikelyNetworkError_(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("abort")
  );
}

async function sleep_(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableHtmlResponse_(res, bodyText) {
  const status = Number(res?.status || 0);
  if (!looksLikeHtmlResponse_(bodyText)) return false;
  return status === 404 || status === 403 || status === 502 || status === 503;
}

async function fetchWithRetries_(url, options, timeoutMs, retries = WEB_API_MAX_RETRIES) {
  let lastError = null;
  let lastRes = null;
  const maxAttempts = Number(retries) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout_(url, options, timeoutMs);
      lastRes = res;
      let bodyText = "";
      try {
        bodyText = await res.clone().text();
      } catch {
        bodyText = "";
      }
      const retriable = isRetriableStatus_(res.status) || isRetriableHtmlResponse_(res, bodyText);
      if (!retriable || attempt === maxAttempts) return res;
      await sleep_(400 * attempt);
    } catch (err) {
      lastError = err;
      if (!isLikelyNetworkError_(err) || attempt === maxAttempts) throw err;
      await sleep_(400 * attempt);
    }
  }
  if (lastRes) return lastRes;
  throw lastError || new Error("Error de red desconocido en fetchWithRetries_.");
}

async function parseJsonOrThrow_(res, label) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { status: "error", message: friendlyNonJsonMessage_(text, label, res.status) };
  }
  if (!res.ok || (json && json.status === "error")) {
    const msg = String(json?.message || "");
    throw new Error(
      looksLikeHtmlResponse_(msg) ? friendlyNonJsonMessage_(msg, label, res.status) : msg || `HTTP ${res.status}`
    );
  }
  return json;
}

export async function apiGetWithWebFallback(action, params = {}, options = {}) {
  const base = getApiBaseUrl_();
  const qs = new URLSearchParams({ action, ...(params || {}), _ts: String(Date.now()) });
  const url = `${base}?${qs.toString()}`;
  const res = await fetchWithRetries_(url, { method: "GET", cache: "no-store" }, options?.timeoutMs, options?.retries);
  return parseJsonOrThrow_(res, "GET");
}

export async function apiPostWithWebFallback(action, payload = {}, meta = {}, options = {}) {
  const base = getApiBaseUrl_();
  const body = {
    action,
    secret: String(env.apiSecret || "").trim(),
    ...(meta?.user_email ? { user_email: String(meta.user_email).trim().toLowerCase() } : {}),
    ...(payload || {}),
  };
  const res = await fetchWithRetries_(
    base,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    },
    options?.timeoutMs,
    options?.retries,
  );
  return parseJsonOrThrow_(res, "POST");
}

export function responseDataObject(res) {
  if (res == null || typeof res !== "object") return {};
  if (res.data != null && typeof res.data === "object" && !Array.isArray(res.data)) return res.data;
  return res;
}
