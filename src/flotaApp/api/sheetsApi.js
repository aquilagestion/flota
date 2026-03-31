import { env } from "../config/env";

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

export const sheetsApi = {
  async get(action, params = {}) {
    const base = assertApiUrl_();
    const qs = new URLSearchParams({ action, ...params });
    const url = `${base}?${qs.toString()}`;
    const res = await fetch(url, { method: "GET" });
    const json = await readJson_(res);
    if (!res.ok || (json && json.status === "error")) {
      const msg = json?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  },

  // OJO: tu Apps Script espera body plano: { action, secret, ...payload }
  async post(action, payload = {}, meta = {}) {
    const base = assertApiUrl_();
    const secret = getSecret_();
    const body = {
      action,
      secret,
      ...(meta?.user_email ? { user_email: String(meta.user_email).trim().toLowerCase() } : {}),
      ...(payload || {}),
    };
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson_(res);
    if (!res.ok || (json && json.status === "error")) {
      const msg = json?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  },
};

