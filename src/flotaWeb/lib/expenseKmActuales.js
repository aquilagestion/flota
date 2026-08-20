/** Kilómetros actuales del vehículo en gastos (cuentakilómetros). */

export const TIPOS_KM_ACTUALES_OBLIGATORIOS = new Set([
  "COMBUSTIBLES",
  "MANTENIMIENTO_REPARACIONES",
  "ITV",
]);

export const TIPO_REPOSTAJE_OPTIONS = [
  { value: "PARCIAL", label: "PARCIAL" },
  { value: "COMPLETO", label: "COMPLETO" },
];

export function isKmActualesRequired(tipo) {
  return TIPOS_KM_ACTUALES_OBLIGATORIOS.has(String(tipo || "").trim().toUpperCase());
}

export function showsKmActualesField(tipo) {
  return String(tipo || "").trim().toUpperCase() !== "KILOMETRAJE_COLABORADOR";
}

export function normalizeKmActualesValue(value) {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .trim();
}

/** Campos a fusionar en el payload si hay km (opcional u obligatorio). */
export function buildKmActualesPayloadExtra(kilometrosActuales, tipo) {
  const km = normalizeKmActualesValue(kilometrosActuales);
  if (!km) return {};
  const t = String(tipo || "").trim().toUpperCase();
  const out = { kilometros_actuales: km };
  if (t === "COMBUSTIBLES") {
    out.kilometros_repostaje = km;
  }
  return out;
}

export function validateKmActualesForTipo(tipo, kilometrosActuales) {
  if (!isKmActualesRequired(tipo)) return "";
  const km = normalizeKmActualesValue(kilometrosActuales);
  if (!km) return "Kilómetros actuales";
  return "";
}

export function validateTipoRepostajeForCombustible(tipo, tipoRepostaje) {
  if (String(tipo || "").trim().toUpperCase() !== "COMBUSTIBLES") return "";
  const tr = String(tipoRepostaje || "").trim().toUpperCase();
  if (!tr) return "Tipo repostaje";
  if (tr !== "PARCIAL" && tr !== "COMPLETO") {
    return "Tipo repostaje (PARCIAL o COMPLETO)";
  }
  return "";
}
