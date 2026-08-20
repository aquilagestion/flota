import { sheetsApi } from "../api/sheetsApi";

export const MESES_ES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

export function buildYearOptions_(yearsBack = 3) {
  const now = new Date().getFullYear();
  const out = [];
  for (let y = now; y >= now - yearsBack; y--) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

export function currentPeriod_() {
  const now = new Date();
  return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
}

export function parseInformeGobierno_(res) {
  const data = res?.data || res || {};
  return {
    periodo: data.periodo || {},
    criterios: data.criterios || {},
    hojas_por_estado: data.hojas_por_estado || {},
    hojas_totales: Number(data.hojas_totales || 0) || 0,
    gastos_sin_hoja: Array.isArray(data.gastos_sin_hoja) ? data.gastos_sin_hoja : [],
    gastos_sin_hoja_totales: Number(data.gastos_sin_hoja_totales || 0) || 0,
    vehiculos_sin_responsable: Array.isArray(data.vehiculos_sin_responsable) ? data.vehiculos_sin_responsable : [],
    vehiculos_sin_responsable_count: Number(data.vehiculos_sin_responsable_count || 0) || 0,
    tiempo_aprobacion: data.tiempo_aprobacion || { horas_media: 0, muestras: 0 },
    generado_en: String(data.generado_en || "").trim(),
  };
}

export function formatHorasMedia_(horas) {
  const n = Number(horas || 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 24) return `${n.toFixed(1).replace(".", ",")} h`;
  const days = Math.floor(n / 24);
  const rest = Math.round(n % 24);
  return rest > 0 ? `${days} d ${rest} h` : `${days} d`;
}

export function estadoLabel_(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "EN_REVISION") return "EN REVISIÓN";
  return c || "—";
}

export async function fetchInformeGobiernoMensual(userEmail, anio, mes) {
  return sheetsApi.informeGobiernoMensual(userEmail, anio, mes);
}
