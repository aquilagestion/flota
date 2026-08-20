import { Platform } from "react-native";
import * as Application from "expo-application";

/** ID Android de la APK RESERVAS-AUTOS (módulo uso). */
const USO_ANDROID_APP_ID = "com.monteromiguel.app.uso";

/** Modo de producto: GESTIFLOTA completo o módulo independiente de uso de vehículos. */
const raw = String(process.env.EXPO_PUBLIC_APP_MODE || "full")
  .trim()
  .toLowerCase();

const envUso = raw === "uso" || raw === "flota-uso";

function nativePackageIsUso_() {
  if (Platform.OS === "web") return false;
  try {
    return String(Application.applicationId || "").trim().toLowerCase() === USO_ANDROID_APP_ID;
  } catch {
    return false;
  }
}

/** Hosting gestiflota-uso: fuerza menú/navegación USO aunque el bundle viniera mal etiquetado. */
function webHostIsUso_() {
  if (Platform.OS !== "web") return false;
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const h = String(window.location.hostname || "").toLowerCase();
    if (!h) return false;
    return h.includes("gestiflota-uso") || h.includes("reservas-autos");
  } catch {
    return false;
  }
}

function resolveAppMode_() {
  if (envUso || nativePackageIsUso_() || webHostIsUso_()) return "uso";
  return "full";
}

/** Web: EXPO_PUBLIC_APP_MODE (+ hostname). APK RESERVAS-AUTOS: applicationId .uso. */
export const APP_MODE = resolveAppMode_();
export const isUsoApp = APP_MODE === "uso";

/** Reevaluación en runtime (p. ej. hostname); preferir esto en menús. */
export function isUsoRuntime() {
  return resolveAppMode_() === "uso";
}

export const APP_BRAND = isUsoApp ? "RESERVAS-AUTOS" : "FLOTA";
export const APP_PAGE_TITLE = isUsoApp ? "RESERVAS-AUTOS GREFA" : "GESTIFLOTA";

export const FULL_WEB_URL = String(process.env.EXPO_PUBLIC_FULL_WEB_URL || "https://gestiflota.web.app").trim();
export const USO_WEB_URL = String(process.env.EXPO_PUBLIC_USO_WEB_URL || "https://gestiflota-uso.web.app").trim();
