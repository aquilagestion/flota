/** Cálculo de base imponible, IVA e importe total para gastos y líneas de hoja. */

export const DEFAULT_IVA_PCT = "";

export function parseExpenseNum(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function hasIvaPctValue(ivaPct) {
  return ivaPct != null && String(ivaPct).trim() !== "";
}

export function computeIvaEur(base, pct) {
  return Number((parseExpenseNum(base) * parseExpenseNum(pct) / 100).toFixed(2));
}

export function computeTotalFromBase(base, pct) {
  const b = parseExpenseNum(base);
  const iva = computeIvaEur(b, pct);
  return Number((b + iva).toFixed(2));
}

/** Base = Total / (1 + IVA%/100) */
export function baseFromTotalAndPct(total, pct) {
  const t = parseExpenseNum(total);
  const p = parseExpenseNum(pct);
  if (!t) return 0;
  if (!p) return t;
  return Number((t / (1 + p / 100)).toFixed(2));
}

const PRIMARY_AMOUNT_FIELD = {
  COMBUSTIBLES: "total_a_pagar",
  PEAJES: "importe_peaje",
  HOSPEDAJE: "importe_hospedaje",
  MANUTENCION: "importe_manutencion",
  ITV: "importe_itv",
  REPUESTOS_RECAMBIO: "importe_repuestos",
  MANTENIMIENTO_REPARACIONES: "importe_mantenimiento",
  PARKING: "importe_aparcamiento",
  OTROS: "importe_otros_gastos",
  MULTAS_SANCIONES: "importe_multa",
  SEGURO: "prima",
  IMPUESTOS: "importe_ivm",
  OTROS_IMPUESTOS: "importe_otros_impuestos",
  KILOMETRAJE_COLABORADOR: "importe_km_colaborador",
};

export function primaryExpenseAmount(e, tipo) {
  const t = String(tipo || e?.tipo_gasto || "").trim().toUpperCase();
  const field = PRIMARY_AMOUNT_FIELD[t];
  if (field) {
    const n = parseExpenseNum(e?.[field]);
    if (n) return n;
  }
  return parseExpenseNum(e?.importe_pagar || e?.coste_total || e?.importe);
}

export function entityFromExpenseRecord(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") {
    return String(
      e?.entidad_combustible || e?.marca_combustible || e?.marca || e?.lugar_repostaje || e?.proveedor || e?.entidad || ""
    ).trim();
  }
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.proveedor_mantenimiento || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.proveedor_repuestos || "").trim();
  if (t === "OTROS") return String(e?.proveedor_otros_gastos || "").trim();
  if (t === "MULTAS_SANCIONES") return String(e?.organismo_denunciante || "").trim();
  if (t === "SEGURO") return String(e?.compania || "").trim();
  if (t === "ITV") return String(e?.estacion_itv || e?.proveedor || e?.entidad || "").trim();
  if (t === "PEAJES") {
    return String(e?.entidad_peaje || e?.salida_peaje || e?.entrada_peaje || e?.proveedor || e?.entidad || "").trim();
  }
  if (t === "PARKING") return String(e?.entidad_parking || e?.tipo_zona || e?.proveedor || e?.entidad || "").trim();
  if (t === "HOSPEDAJE") return String(e?.entidad_hospedaje || e?.proveedor || e?.entidad || "").trim();
  if (t === "MANUTENCION") return String(e?.establecimiento_manutencion || e?.proveedor || e?.entidad || "").trim();
  if (t === "KILOMETRAJE_COLABORADOR") return String(e?.accion_colaborador || e?.origen_colaborador || "").trim();
  return String(e?.proveedor || e?.entidad || "").trim();
}

/** Prioriza el importe del tipo (peaje, combustible…) si importe_pagar está vacío o desactualizado. */
export function resolveExpenseIvaTotalInput(importePagar, primaryTotal) {
  const primary = parseExpenseNum(primaryTotal);
  if (primary > 0) return primary;
  return parseExpenseNum(importePagar);
}

/** Sincroniza base / IVA anclados al importe principal del tipo de gasto. */
export function syncIvaFieldsFromPrimary({ iva_pct, importe_pagar, primaryTotal }) {
  const total = resolveExpenseIvaTotalInput(importe_pagar, primaryTotal);
  return recalcIvaFields({ iva_pct, importe_pagar: total, primaryTotal: total });
}

/**
 * Desglose IVA desde total a pagar + % IVA (manual).
 * Sin % IVA: base = total, IVA € = 0.
 * Con % IVA: base = total/(1+IVA/100), IVA € = base×IVA/100; el total conserva el importe indicado.
 */
export function recalcIvaFields({ iva_pct, importe_pagar, primaryTotal }) {
  const total = resolveExpenseIvaTotalInput(importe_pagar, primaryTotal);
  const pctDefined = hasIvaPctValue(iva_pct);

  if (!total) {
    return { base_imponible: 0, iva_pct: pctDefined ? parseExpenseNum(iva_pct) : "", iva_eur: 0, importe_pagar: 0 };
  }

  if (!pctDefined) {
    return {
      base_imponible: Number(total.toFixed(2)),
      iva_pct: "",
      iva_eur: 0,
      importe_pagar: Number(total.toFixed(2)),
    };
  }

  const pct = parseExpenseNum(iva_pct);
  const base = baseFromTotalAndPct(total, pct);
  const ivaEur = computeIvaEur(base, pct);

  return {
    base_imponible: base,
    iva_pct: pct,
    iva_eur: ivaEur,
    importe_pagar: Number(total.toFixed(2)),
  };
}

export function enrichExpensePayloadWithIva(payload) {
  const tipo = String(payload?.tipo_gasto || "").trim().toUpperCase();
  if (tipo === "KILOMETRAJE_COLABORADOR") {
    const total = parseExpenseNum(payload.importe_km_colaborador);
    return {
      ...payload,
      base_imponible: total,
      iva_pct: 0,
      iva_eur: 0,
      importe_pagar: total,
      coste_total: total,
      importe_sin_iva: total,
    };
  }

  const primary = primaryExpenseAmount(payload, tipo);
  const storedTotal = resolveExpenseIvaTotalInput(payload?.importe_pagar, primary);
  const storedBase = parseExpenseNum(payload?.base_imponible);
  const storedIva = parseExpenseNum(payload?.iva_eur);
  const pctDefined = hasIvaPctValue(payload?.iva_pct);

  if (pctDefined && (storedBase > 0 || storedIva > 0 || storedTotal > 0)) {
    const pct = parseExpenseNum(payload.iva_pct);
    const base = storedBase || baseFromTotalAndPct(storedTotal, pct);
    const ivaEur = storedIva || computeIvaEur(base, pct);
    const importePagar = storedTotal || Number((base + ivaEur).toFixed(2));
    return {
      ...payload,
      base_imponible: base,
      iva_pct: pct,
      iva_eur: ivaEur,
      importe_pagar: importePagar,
      coste_total: importePagar,
      importe_sin_iva: base,
    };
  }

  const fin = recalcIvaFields({
    iva_pct: payload?.iva_pct,
    importe_pagar: storedTotal,
    primaryTotal: primary,
  });

  return {
    ...payload,
    base_imponible: fin.base_imponible,
    iva_pct: fin.iva_pct === "" ? "" : fin.iva_pct,
    iva_eur: fin.iva_eur,
    importe_pagar: fin.importe_pagar,
    coste_total: fin.importe_pagar,
    importe_sin_iva: fin.base_imponible,
  };
}

export function enrichSheetLineaFinancialFromExpense(linea, rawExpense) {
  const ln = { ...(linea || {}) };
  const e = rawExpense && typeof rawExpense === "object" ? rawExpense : {};
  const fin = enrichExpensePayloadWithIva({ ...e, tipo_gasto: ln.tipo_gasto || e.tipo_gasto });
  const entidad = String(ln.entidad || "").trim() || entityFromExpenseRecord(e);

  return {
    ...ln,
    entidad,
    importe: fin.importe_pagar,
    base_imponible: fin.base_imponible,
    iva_pct: fin.iva_pct,
    iva_eur: fin.iva_eur,
    importe_pagar: fin.importe_pagar,
    num_personas: lifeSheetNumPersonasFromExpense(ln, e),
  };
}

/** Nº PERS. en hoja LIFE: solo hospedaje (Nº personas) y manutención (Nº comensales). */
export function lifeSheetNumPersonasFromExpense(linea, rawExpense) {
  const ln = linea && typeof linea === "object" ? linea : {};
  const e = rawExpense && typeof rawExpense === "object" ? rawExpense : {};
  const tipo = String(ln.tipo_gasto || e.tipo_gasto || "").trim().toUpperCase();
  if (tipo === "HOSPEDAJE") {
    return String(ln.numero_personas_hospedaje ?? e.numero_personas_hospedaje ?? "").trim();
  }
  if (tipo === "MANUTENCION") {
    return String(ln.numero_comensales_manutencion ?? e.numero_comensales_manutencion ?? "").trim();
  }
  return "";
}

export function lineBaseImponibleValue(line) {
  const pagar = parseExpenseNum(line?.importe_pagar ?? line?.importe ?? line?.coste_total);
  if (hasIvaPctValue(line?.iva_pct) && pagar) {
    return baseFromTotalAndPct(pagar, line.iva_pct);
  }
  const explicit = parseExpenseNum(line?.base_imponible);
  if (explicit > 0) return explicit;
  return pagar;
}
