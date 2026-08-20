/** Desglose de IVA a partir del importe total (con IVA) y el % indicado. */

export const IVA_RATE_OTRO = "__OTRO__";

/** Presets del desplegable (orden de UI). */
export const IVA_RATE_PRESET_VALUES = ["4", "10", "21", "0"];

export const IVA_RATE_OPTIONS = [
  { value: "4", label: "4 %" },
  { value: "10", label: "10 %" },
  { value: "21", label: "21 %" },
  { value: "0", label: "0 %" },
  { value: IVA_RATE_OTRO, label: "Otro" },
];

/** Valor del SelectField a partir del % guardado (número o vacío tras elegir «Otro»). */
export function ivaSelectValueFromStored_(ivaPorcentaje) {
  const s = String(ivaPorcentaje ?? "").trim();
  if (!s || s === IVA_RATE_OTRO) return IVA_RATE_OTRO;
  if (IVA_RATE_PRESET_VALUES.includes(s)) return s;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "21";
  for (const p of IVA_RATE_PRESET_VALUES) {
    if (Number(p) === n) return p;
  }
  return IVA_RATE_OTRO;
}

export function isIvaOtroSelected_(ivaPorcentaje) {
  return ivaSelectValueFromStored_(ivaPorcentaje) === IVA_RATE_OTRO;
}

/** Normaliza % IVA numérico; si inválido, usa fallback (por defecto 21). */
export function normalizeIvaRate_(ivaPorcentaje, fallback = 21) {
  const rate = Number(String(ivaPorcentaje ?? "").trim().replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0) return fallback;
  return rate;
}

export function parseMoneyAmount_(value) {
  const n = Number(
    String(value || "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "")
  );
  return Number.isFinite(n) ? n : 0;
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4_(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function formatMoneyStr_(n) {
  return round2_(n).toFixed(2);
}

function formatUnitPriceStr_(n) {
  // €/L: hasta 4 decimales, mínimo 2
  const r = round4_(n);
  const s = r.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (!s.includes(".")) return `${s}.00`;
  const [, dec = ""] = s.split(".");
  return dec.length >= 2 ? s : `${s}${"0".repeat(2 - dec.length)}`;
}

/**
 * totalConIva = importe pagado / total factura.
 * base = total / (1 + iva/100); cuota = total - base.
 * Acepta cualquier % >= 0 (presets 0/4/10/21 u «otro»).
 */
export function calcIvaBreakdown_(totalConIva, ivaPorcentaje) {
  const total = Math.max(0, parseMoneyAmount_(totalConIva));
  const rate = normalizeIvaRate_(ivaPorcentaje, 21);
  if (rate === 0) {
    return {
      total,
      iva_porcentaje: 0,
      base_imponible: round2_(total),
      cuota_iva: 0,
      base_imponible_str: formatMoneyStr_(total),
      cuota_iva_str: "0.00",
    };
  }
  const base = round2_(total / (1 + rate / 100));
  const cuota = round2_(total - base);
  return {
    total,
    iva_porcentaje: rate,
    base_imponible: base,
    cuota_iva: cuota,
    base_imponible_str: formatMoneyStr_(base),
    cuota_iva_str: formatMoneyStr_(cuota),
  };
}

/**
 * Combustible: el usuario indica litros + total pagado + IVA.
 * Precio/L con IVA = total / litros
 * Precio/L sin IVA = (total / litros) / (1 + iva/100)
 * Neto (base) = total / (1 + iva/100)
 */
export function calcFuelFromTotalLitrosIva_(totalPagado, litros, ivaPorcentaje) {
  const total = Math.max(0, parseMoneyAmount_(totalPagado));
  const lit = Math.max(0, parseMoneyAmount_(litros));
  const iva = calcIvaBreakdown_(total, ivaPorcentaje);
  if (!lit) {
    return {
      ...iva,
      litros: 0,
      precio_litro_con_iva: 0,
      precio_litro_sin_iva: 0,
      precio_litro_con_iva_str: "",
      precio_litro_sin_iva_str: "",
    };
  }
  const pCon = round4_(total / lit);
  const divisor = 1 + iva.iva_porcentaje / 100;
  const pSin = round4_(pCon / divisor);
  return {
    ...iva,
    litros: lit,
    precio_litro_con_iva: pCon,
    precio_litro_sin_iva: pSin,
    precio_litro_con_iva_str: formatUnitPriceStr_(pCon),
    precio_litro_sin_iva_str: formatUnitPriceStr_(pSin),
  };
}

/** Billetes: el IVA solo afecta al precio del billete; las tasas se suman aparte sin IVA. */
export function calcBilleteBreakdown_(precioBillete, tasasBillete, ivaPorcentaje) {
  const ticket = calcIvaBreakdown_(precioBillete, ivaPorcentaje);
  const tasas = Math.max(0, parseMoneyAmount_(tasasBillete));
  const total = round2_(ticket.total + tasas);
  const base = round2_(ticket.base_imponible + tasas);
  return {
    total,
    iva_porcentaje: ticket.iva_porcentaje,
    base_imponible: base,
    cuota_iva: ticket.cuota_iva,
    tasas,
    total_str: formatMoneyStr_(total),
    tasas_str: formatMoneyStr_(tasas),
    base_imponible_str: formatMoneyStr_(base),
    cuota_iva_str: formatMoneyStr_(ticket.cuota_iva),
    precio_billete_str: formatMoneyStr_(ticket.total),
  };
}

/** Importe total (con IVA) según tipo de gasto del formulario. */
export function expenseTotalForIva_(form) {
  const t = String(form?.tipo_gasto || "").trim().toUpperCase();
  switch (t) {
    case "COMBUSTIBLES":
      return form?.total_a_pagar;
    case "SEGURO":
      return form?.prima;
    case "IMPUESTOS":
      return form?.importe_ivm;
    case "OTROS_IMPUESTOS":
      return form?.importe_otros_impuestos;
    case "REPUESTOS_RECAMBIO":
      return form?.importe_repuestos;
    case "MANTENIMIENTO_REPARACIONES":
      return form?.importe_mantenimiento;
    case "PARKING":
      return form?.importe_aparcamiento;
    case "PEAJES":
      return form?.importe_peaje;
    case "GASTOS_BILLETES":
      return form?.precio_total_billete;
    case "ITV":
      return form?.importe_itv;
    case "OTROS":
    case "HOSPEDAJE":
    case "MANUTENCION":
      return form?.importe_otros_gastos;
    case "MULTAS_SANCIONES":
      return form?.importe_multa;
    case "KILOMETRAJE_COLABORADOR":
      return form?.importe_km_colaborador;
    default:
      return form?.coste_total || form?.importe || "";
  }
}

export function expenseNeedsIvaBreakdown_(tipoGasto) {
  const t = String(tipoGasto || "").trim().toUpperCase();
  return !!t;
}
