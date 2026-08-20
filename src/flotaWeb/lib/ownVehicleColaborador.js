/**
 * Vehículo propio / kilometraje colaborador: misma liquidación y modelo de hoja
 * para cualquier rol que grabe viajes o gastos en este contexto.
 */

export const HOJA_GASTO_MODELO_PROPIO = "VEHICULO_PROPIO";
export const HOJA_GASTO_MODELO_EMPRESA = "VEHICULO_EMPRESA";

function normTipo_(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isTruthyFlag_(value) {
  const s = String(value == null ? "" : value)
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "si" || s === "sí" || s === "yes";
}

export function isOwnVehicleTripTipo(tipoVehiculo) {
  return normTipo_(tipoVehiculo) === "PROPIO";
}

/**
 * Gasto o línea de hoja que debe tratarse como colaborador (km + modelo hoja propio).
 */
export function isOwnVehicleExpenseRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (isTruthyFlag_(record.tratado_como_colaborador) || isTruthyFlag_(record.vehiculo_propio)) return true;

  const tipo = normTipo_(record.tipo_gasto || record.concepto || "");
  if (tipo === "KILOMETRAJE_COLABORADOR") return true;

  const mat = String(record.matricula || record.vehiclePlate || "")
    .trim()
    .toUpperCase();
  if (mat === "COLABORADOR") return true;

  const tripTipo = normTipo_(record.tipo_vehiculo_viaje || record.tipo_vehiculo || "");
  if (String(record.id_viaje_propio || "").trim() && isOwnVehicleTripTipo(tripTipo)) return true;
  if (String(record.id_viaje_propio || "").trim() && !tripTipo) {
    // Viaje propio sin tipo en caché: asumir PROPIO (módulo Grabar viajes).
    return true;
  }

  const hasKmMarkers =
    Number(record.km_recorridos_colaborador || record.km || record.kms || 0) > 0 ||
    Number(record.tarifa_eur_km_aplicada || record.eur_km || record.tarifa_km || 0) > 0 ||
    !!String(record.origen_colaborador || "").trim() ||
    !!String(record.destino_colaborador || "").trim() ||
    !!String(record.itinerario || "").trim() ||
    !!String(record.motivo_colaborador || record.motivo_salida || "").trim();

  return hasKmMarkers;
}

export function appliesColaboradorExpenseWorkflow(record, tripContext) {
  if (isOwnVehicleExpenseRecord(record)) return true;
  const ctx = tripContext || {};
  if (ctx.tripOwnVehicle === true) return true;
  if (isOwnVehicleTripTipo(ctx.tipo_vehiculo || ctx.tipoVehiculo)) return true;
  return false;
}

/**
 * Marca el payload antes de gasto_crear / cola local.
 */
export function normalizeExpensePayloadForColaboradorWorkflow(payload, context) {
  const p = { ...(payload || {}) };
  const ctx = context || {};
  const tripTipo = normTipo_(
    ctx.tipo_vehiculo || ctx.tipoVehiculo || p.tipo_vehiculo_viaje || (ctx.tripOwnVehicle ? "PROPIO" : "")
  );
  const idViaje = String(p.id_viaje_propio || ctx.id_viaje_propio || "").trim();

  if (idViaje && tripTipo && !isOwnVehicleTripTipo(tripTipo)) {
    return p;
  }

  const own =
    appliesColaboradorExpenseWorkflow(p, {
      tipo_vehiculo: tripTipo || (idViaje || ctx.tripOwnVehicle ? "PROPIO" : ""),
      tripOwnVehicle: ctx.tripOwnVehicle === true,
    }) || (idViaje && isOwnVehicleTripTipo(tripTipo || "PROPIO"));

  if (!own) return p;

  const tipo = normTipo_(p.tipo_gasto || "");
  const out = {
    ...p,
    tratado_como_colaborador: "SI",
    vehiculo_propio: "SI",
    tipo_vehiculo_viaje: tripTipo || p.tipo_vehiculo_viaje || "PROPIO",
  };

  if (tipo === "KILOMETRAJE_COLABORADOR") {
    if (!String(out.accion_colaborador || "").trim()) out.accion_colaborador = "coche propio";
    if (!String(out.proveedor || "").trim()) out.proveedor = "COLABORADOR";
  }

  if (idViaje && !String(out.accion_colaborador || "").trim()) {
    out.accion_colaborador = "coche propio";
  }

  return out;
}

import { enrichSheetLineaFinancialFromExpense, resolveSheetLineConcepto } from "./expenseIva";
import { expenseDate, normalizeDateToDmy } from "./format";

export function enrichSheetLineaFromExpense(linea, rawExpense) {
  let ln = enrichSheetLineaFinancialFromExpense(linea, rawExpense);
  const e = rawExpense && typeof rawExpense === "object" ? rawExpense : {};
  // Preferir fecha actual del gasto (tras editar); el snapshot de la hoja puede estar desfasado.
  const fromExpense = expenseDate({ ...ln, ...e, tipo_gasto: ln.tipo_gasto || e.tipo_gasto });
  const fecha =
    normalizeDateToDmy(fromExpense || "") ||
    normalizeDateToDmy(e.fecha || "") ||
    normalizeDateToDmy(ln.fecha || "") ||
    String(ln.fecha || "").trim();
  ln = { ...ln, fecha };

  const concepto = resolveSheetLineConcepto(ln, e);
  ln = { ...ln, concepto };

  if (!isOwnVehicleExpenseRecord(e) && !isOwnVehicleExpenseRecord(ln)) return ln;

  const km = Number(
    ln.distancia_km ??
      ln.km ??
      e.km_recorridos_colaborador ??
      e.km ??
      0
  );
  const eurKm = Number(
    ln.eur_km ?? ln.tarifa_km ?? e.tarifa_eur_km_aplicada ?? e.eur_km ?? 0
  );
  const origen = String(e.origen_colaborador || "").trim();
  const destino = String(e.destino_colaborador || "").trim();
  const itinerario =
    String(ln.itinerario || "").trim() ||
    (origen || destino ? `${origen}${origen && destino ? " - " : ""}${destino}` : "");

  return {
    ...ln,
    distancia_km: km || ln.distancia_km || 0,
    eur_km: eurKm || ln.eur_km || 0,
    medio_transporte: String(ln.medio_transporte || e.accion_colaborador || "coche propio").trim(),
    motivo_salida: String(ln.motivo_salida || e.motivo_colaborador || "").trim(),
    fecha_inicio: normalizeDateToDmy(e.fecha_viaje_colaborador || e.fecha || ln.fecha_inicio || "") || "",
    fecha_fin:
      normalizeDateToDmy(e.fecha_fin_viaje_colaborador || e.fecha_fin_viaje || e.fecha_viaje_colaborador || ln.fecha_fin || "") ||
      "",
    itinerario,
  };
}

export function resolveExpenseSheetModel(lineas, sheetMeta) {
  const metaRaw = String(
    sheetMeta?.hoja_gasto_modelo || sheetMeta?.hoja_modelo || sheetMeta?.tipo_hoja || sheetMeta?.hoja_gasto_tipo || ""
  )
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (metaRaw.includes("PROPIO") || metaRaw.includes("KILOMETRAJE") || metaRaw.includes("COLABORADOR")) {
    return HOJA_GASTO_MODELO_PROPIO;
  }
  if (metaRaw.includes("EMPRESA") || metaRaw.includes("FLOTA") || metaRaw.includes("ESTANDAR")) {
    return HOJA_GASTO_MODELO_EMPRESA;
  }
  const safe = Array.isArray(lineas) ? lineas : [];
  if (safe.some((line) => isOwnVehicleExpenseRecord(line))) return HOJA_GASTO_MODELO_PROPIO;
  return HOJA_GASTO_MODELO_EMPRESA;
}

export function sheetMetaForModel(model) {
  const m = model === HOJA_GASTO_MODELO_PROPIO ? HOJA_GASTO_MODELO_PROPIO : HOJA_GASTO_MODELO_EMPRESA;
  return {
    hoja_gasto_modelo: m,
    hoja_gasto_tipo: m === HOJA_GASTO_MODELO_PROPIO ? "COLABORADOR" : "EMPRESA",
  };
}
