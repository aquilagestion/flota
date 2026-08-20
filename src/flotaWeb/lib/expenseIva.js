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
  if (t === "GASTOS_BILLETES") {
    const total = parseExpenseNum(e?.coste_total || e?.importe_pagar || e?.importe);
    if (total) return total;
    return parseExpenseNum(e?.precio_total_billete) + parseExpenseNum(e?.tasas_billete);
  }
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
  if (t === "GASTOS_BILLETES") return String(e?.compania_billete || e?.proveedor || e?.entidad || "").trim();
  return String(e?.proveedor || e?.entidad || "").trim();
}

const GENERIC_SHEET_CONCEPTOS_ = new Set([
  "otros gastos",
  "hospedaje",
  "manutención",
  "manutencion",
  "combustible",
  "peaje",
  "aparcamiento",
  "dieta",
  "consumible",
  "gasto",
  "otros",
]);

const TIPO_SHEET_CONCEPTO_MAP_ = {
  COMBUSTIBLES: "combustible",
  DIETAS: "dieta",
  CONSUMIBLES: "consumible",
  MANTENIMIENTO_REPARACIONES: "mantenimiento",
  REPUESTOS_RECAMBIO: "repuestos",
  PARKING: "aparcamiento",
  PEAJES: "peaje",
  HOSPEDAJE: "hospedaje",
  MANUTENCION: "manutención",
  ITV: "itv",
  MULTAS_SANCIONES: "multa/sanción",
  OTROS: "otros gastos",
  KILOMETRAJE_COLABORADOR: "kilometraje colaborador",
  SEGURO: "seguro",
  IMPUESTOS: "impuestos",
  OTROS_IMPUESTOS: "otros impuestos",
  GASTOS_BILLETES: "billete",
};

function isGenericSheetConcepto_(text, tipo) {
  const s = String(text || "")
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (s === String(tipo || "").trim().toLowerCase()) return true;
  return GENERIC_SHEET_CONCEPTOS_.has(s);
}

/** Concepto descriptivo del gasto (p. ej. concepto_otros_gastos), no la etiqueta del tipo. */
export function conceptoFromExpenseRecord(expense) {
  const e = expense || {};
  const t = String(e.tipo_gasto || "")
    .trim()
    .toUpperCase();
  if (t === "REPUESTOS_RECAMBIO") return String(e.descripcion_repuestos || e.concepto || "").trim();
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e.descripcion_mantenimiento || e.concepto || "").trim();
  if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
    return String(e.concepto_otros_gastos || e.concepto || "").trim();
  }
  if (t === "PARKING") return String(e.tipo_zona || e.concepto || "").trim();
  if (t === "PEAJES") return String(e.concepto || "").trim();
  if (t === "COMBUSTIBLES") return String(e.numero_ticket || e.marca || e.concepto || "").trim();
  if (t === "ITV") return String(e.estacion_itv || e.concepto || "").trim();
  if (t === "MULTAS_SANCIONES") return String(e.tipo_infraccion || e.concepto || "").trim();
  if (t === "SEGURO") return String(e.cobertura || e.concepto || "").trim();
  if (t === "IMPUESTOS") return String(e.periodo_ivm || e.concepto || "I.V.M.").trim();
  if (t === "OTROS_IMPUESTOS") return String(e.tipo_otro_impuesto || e.tipo_impuesto || e.concepto || "").trim();
  if (t === "KILOMETRAJE_COLABORADOR") {
    const origen = String(e.origen_colaborador || "").trim();
    const destino = String(e.destino_colaborador || "").trim();
    return String(e.motivo_colaborador || e.concepto || (origen || destino ? `${origen} -> ${destino}` : "")).trim();
  }
  if (t === "GASTOS_BILLETES") {
    const origen = String(e.origen_billete || "").trim();
    const destino = String(e.destino_billete || "").trim();
    return String(e.concepto_billete || e.concepto || (origen || destino ? `${origen} -> ${destino}` : "")).trim();
  }
  return String(e.concepto || "").trim();
}

/** Concepto para línea de hoja: prioriza el gasto real frente a «otros gastos» genérico. */
export function resolveSheetLineConcepto(linea, rawExpense) {
  const ln = linea && typeof linea === "object" ? linea : {};
  const e = rawExpense && typeof rawExpense === "object" ? rawExpense : {};
  const merged = { ...ln, ...e, tipo_gasto: ln.tipo_gasto || e.tipo_gasto };
  const fromExpense = conceptoFromExpenseRecord(merged);
  if (fromExpense && !isGenericSheetConcepto_(fromExpense, merged.tipo_gasto)) return fromExpense;
  const fromLine = String(ln.concepto || "").trim();
  if (fromLine && !isGenericSheetConcepto_(fromLine, merged.tipo_gasto)) return fromLine;
  if (fromExpense) return fromExpense;
  if (fromLine) return fromLine;
  const tipo = String(merged.tipo_gasto || "")
    .trim()
    .toUpperCase();
  return TIPO_SHEET_CONCEPTO_MAP_[tipo] || "gasto";
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

/** IVA% por defecto en hoja LIFE cuando el gasto no trae porcentaje guardado. */
export function defaultIvaPctForExpenseTipo(tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  if (t === "HOSPEDAJE" || t === "MANUTENCION" || t === "DIETAS") return 10;
  if (
    t === "COMBUSTIBLES" ||
    t === "PEAJES" ||
    t === "PARKING" ||
    t === "ITV" ||
    t === "REPUESTOS_RECAMBIO" ||
    t === "MANTENIMIENTO_REPARACIONES" ||
    t === "SEGURO" ||
    t === "OTROS"
  ) {
    return 21;
  }
  return "";
}

function normalizeIvaAliases_(payload) {
  const p = { ...(payload || {}) };
  if (!hasIvaPctValue(p.iva_pct) && hasIvaPctValue(p.iva_porcentaje)) {
    p.iva_pct = p.iva_porcentaje;
  }
  if (!parseExpenseNum(p.iva_eur) && parseExpenseNum(p.cuota_iva)) {
    p.iva_eur = p.cuota_iva;
  }
  if (!parseExpenseNum(p.base_imponible) && parseExpenseNum(p.importe_sin_iva)) {
    p.base_imponible = p.importe_sin_iva;
  }
  if (!parseExpenseNum(p.importe_pagar) && parseExpenseNum(p.coste_total)) {
    p.importe_pagar = p.coste_total;
  }
  return p;
}

export function enrichExpensePayloadWithIva(payload) {
  const normalized = normalizeIvaAliases_(payload);
  const tipo = String(normalized?.tipo_gasto || "").trim().toUpperCase();
  if (tipo === "KILOMETRAJE_COLABORADOR") {
    const total = parseExpenseNum(normalized.importe_km_colaborador);
    return {
      ...normalized,
      base_imponible: total,
      iva_pct: 0,
      iva_eur: 0,
      importe_pagar: total,
      coste_total: total,
      importe_sin_iva: total,
    };
  }

  let ivaPct = normalized?.iva_pct;
  if (!hasIvaPctValue(ivaPct)) {
    const def = defaultIvaPctForExpenseTipo(tipo);
    if (def !== "") ivaPct = def;
  }

  const primary = primaryExpenseAmount(normalized, tipo);
  const storedTotal = resolveExpenseIvaTotalInput(normalized?.importe_pagar, primary);
  const storedBase = parseExpenseNum(normalized?.base_imponible);
  const storedIva = parseExpenseNum(normalized?.iva_eur);
  const pctDefined = hasIvaPctValue(ivaPct);

  if (pctDefined && (storedBase > 0 || storedIva > 0 || storedTotal > 0)) {
    const pct = parseExpenseNum(ivaPct);
    const base = storedBase || baseFromTotalAndPct(storedTotal, pct);
    const ivaEur = storedIva || computeIvaEur(base, pct);
    const importePagar = storedTotal || Number((base + ivaEur).toFixed(2));
    return {
      ...normalized,
      base_imponible: base,
      iva_pct: pct,
      iva_eur: ivaEur,
      importe_pagar: importePagar,
      coste_total: importePagar,
      importe_sin_iva: base,
    };
  }

  const fin = recalcIvaFields({
    iva_pct: ivaPct,
    importe_pagar: storedTotal,
    primaryTotal: primary,
  });

  return {
    ...normalized,
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

/** Nº PERS. en hoja LIFE: hospedaje, manutención, otros y billetes. */
export function lifeSheetNumPersonasFromExpense(linea, rawExpense) {
  const ln = linea && typeof linea === "object" ? linea : {};
  const e = rawExpense && typeof rawExpense === "object" ? rawExpense : {};
  const tipo = String(ln.tipo_gasto || e.tipo_gasto || "").trim().toUpperCase();
  if (tipo === "HOSPEDAJE" || tipo === "OTROS" || tipo === "GASTOS_BILLETES") {
    return String(
      ln.num_personas ||
        ln.numero_personas_billete ||
        ln.numero_personas_hospedaje ||
        e.numero_personas_billete ||
        e.numero_personas_hospedaje ||
        e.num_personas ||
        ""
    ).trim();
  }
  if (tipo === "MANUTENCION") {
    return String(
      ln.num_personas ||
        ln.numero_comensales_manutencion ||
        e.numero_comensales_manutencion ||
        e.num_personas ||
        ""
    ).trim();
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
