import { parseDateFlexible } from "./format";

export function viajeFechaSortKey_(value) {
  const d = parseDateFlexible(value);
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
}

/** Más reciente primero: fecha inicio (viaje), luego fecha cierre. */
export function compareViajesPorFechas_(a, b) {
  const fa = viajeFechaSortKey_(a?.fecha_viaje);
  const fb = viajeFechaSortKey_(b?.fecha_viaje);
  if (fb !== fa) return fb - fa;
  const ca = viajeFechaSortKey_(a?.fecha_cierre);
  const cb = viajeFechaSortKey_(b?.fecha_cierre);
  if (cb !== ca) return cb - ca;
  return String(b?.id_viaje || "").localeCompare(String(a?.id_viaje || ""));
}

export function sortViajesPorFechas_(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort(compareViajesPorFechas_);
}
