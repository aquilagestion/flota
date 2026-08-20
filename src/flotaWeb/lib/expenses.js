import { escapeHtmlValue, expenseDate, formatCurrencyEsValue, formatDateEsValue, normalizeDateToDmy, parseDateFlexible, sanitizeInvoiceNumberText } from "./format";
import { isOwnVehicleExpenseRecord, resolveExpenseSheetModel } from "./ownVehicleColaborador";

export function normalizeRemoteSheetRow(row) {
  const parseAmount = (value) => parseNumeric(value);
  const rid = String(row?.hoja_gasto_id || row?.hoja_id_local || row?.id || "").trim();
  const num = String(row?.num_hoja_gasto || row?.Num_Hoja_Gasto || "").trim();
  const estado = String(row?.hoja_gasto_estado || row?.estado || "ENVIADA").trim().toUpperCase();
  const estadoPago = String(row?.hoja_gasto_estado_pago || row?.estado_pago || "").trim().toUpperCase();
  const fecha = String(row?.hoja_gasto_fecha_envio || row?.createdAtLocal || "").trim();
  const total = parseAmount(row?.hoja_gasto_total ?? row?.total_importe ?? 0);
  const nombre = String(row?.usuario_nombre || row?.nombre || "").trim();
  const email = String(row?.usuario_email || row?.responsable_email || "").trim().toLowerCase();
  return {
    id: rid || (num ? `num:${num}` : ""),
    hoja_gasto_id: rid,
    num: num || rid || "Sin numero",
    estado,
    estadoPago,
    fecha,
    total,
    nombre,
    email,
  };
}

export function amountFromExpense(expense) {
  const parse = (v) => parseNumeric(v);
  const fb = (...vals) => {
    for (const v of vals) {
      const n = parse(v);
      if (n) return n;
    }
    return (
      parse(expense?.importe_pagar) ||
      parse(expense?.coste_total) ||
      parse(expense?.importe_sin_iva) ||
      parse(expense?.importe) ||
      0
    );
  };
  const type = String(expense?.tipo_gasto || "").trim().toUpperCase();
  switch (type) {
    case "COMBUSTIBLES":
      return fb(expense?.total_a_pagar);
    case "SEGURO":
      return fb(expense?.prima);
    case "IMPUESTOS":
      return fb(expense?.importe_ivm);
    case "OTROS_IMPUESTOS":
      return fb(expense?.importe_otros_impuestos);
    case "REPUESTOS_RECAMBIO":
      return fb(expense?.importe_repuestos);
    case "MANTENIMIENTO_REPARACIONES":
      return fb(expense?.importe_mantenimiento);
    case "PARKING":
      return fb(expense?.importe_aparcamiento);
    case "PEAJES":
      return fb(expense?.importe_peaje);
    case "GASTOS_BILLETES":
      return fb(
        expense?.coste_total,
        expense?.importe_pagar,
        parse(expense?.precio_total_billete) + parse(expense?.tasas_billete)
      );
    case "HOSPEDAJE":
      return fb(expense?.importe_hospedaje, expense?.importe_otros_gastos);
    case "MANUTENCION":
      return fb(expense?.importe_manutencion, expense?.importe_otros_gastos);
    case "ITV":
      return fb(expense?.importe_itv);
    case "MULTAS_SANCIONES":
      return fb(expense?.importe_multa, expense?.importe);
    case "OTROS":
      return fb(expense?.importe_otros_gastos);
    case "KILOMETRAJE_COLABORADOR":
      return fb(expense?.importe_km_colaborador);
    default:
      return fb(expense?.total);
  }
}

/** Suma importes de gastos vinculados a un viaje (excluye km colaborador). */
export function sumTripLinkedExpenses(gastos) {
  return (Array.isArray(gastos) ? gastos : []).reduce((acc, g) => {
    const tipo = String(g?.tipo_gasto || "").trim().toUpperCase();
    if (tipo === "KILOMETRAJE_COLABORADOR") return acc;
    return acc + Number(amountFromExpense(g) || 0);
  }, 0);
}

export function parseNumeric(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw.replace(/[^\d,.-]/g, "");
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function expenseTypeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "GASTO";
  const normalized = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const compact = normalized.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const hasCombustible = compact.includes("COMBUSTIBLE") || compact.includes("COMBUSTIBLES");
  const hasMateriales = compact.includes("MATERIALES") || compact.includes("MATERIAL");
  if (hasCombustible && (hasMateriales || compact === "COMBUSTIBLES" || compact === "COMBUSTIBLE")) {
    return "COMBUSTIBLE";
  }
  const hasItv = compact.includes("ITV");
  const hasTelevision = compact.includes("TELEVISION");
  if (hasItv && (hasTelevision || compact === "ITV")) {
    return "Revisión ITV";
  }
  return raw;
}

export function expenseTypeSelectLabel(option) {
  const value = String(option?.value || "").trim().toUpperCase();
  if (value === "COMBUSTIBLES") return "COMBUSTIBLE";
  if (value === "ITV") return "Revisión ITV";
  if (value === "GASTOS_BILLETES") return "GASTOS BILLETES";
  if (value === "HOSPEDAJE") return "Hospedaje";
  if (value === "MANUTENCION") return "Manutención";
  return String(option?.label || option?.value || "").trim();
}

export function expenseTypeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-]+/g, "_");
}

export { conceptoFromExpenseRecord, resolveSheetLineConcepto } from "./expenseIva";

/** Etiqueta de concepto en hoja de gasto PDF: solo tipo (combustible, peaje…), sin proyecto. */
export function expenseSheetConceptLabel(lineOrTipo) {
  const map = {
    COMBUSTIBLES: "combustible",
    DIETAS: "dieta",
    CONSUMIBLES: "consumible",
    MANTENIMIENTO_REPARACIONES: "mantenimiento",
    REPUESTOS_RECAMBIO: "repuestos",
    PARKING: "aparcamiento",
    PEAJES: "peaje",
    GASTOS_BILLETES: "billete",
    HOSPEDAJE: "hospedaje",
    MANUTENCION: "manutención",
    ITV: "itv",
    MULTAS_SANCIONES: "multa/sanción",
    OTROS: "otros gastos",
    KILOMETRAJE_COLABORADOR: "kilometraje colaborador",
    SEGURO: "seguro",
    IMPUESTOS: "impuestos",
    OTROS_IMPUESTOS: "otros impuestos",
  };
  const conceptoExplicit =
    typeof lineOrTipo === "object"
      ? String(lineOrTipo?.concepto_otros_gastos || lineOrTipo?.concepto || "").trim()
      : "";
  if (conceptoExplicit) {
    const conceptoKey = conceptoExplicit.toUpperCase().replace(/[\s\-]+/g, "_");
    if (map[conceptoKey]) return map[conceptoKey];
    return conceptoExplicit;
  }
  const tipo =
    typeof lineOrTipo === "object"
      ? String(lineOrTipo?.tipo_gasto || "").trim().toUpperCase()
      : String(lineOrTipo || "").trim().toUpperCase();
  if (map[tipo]) return map[tipo];
  const conceptoRaw =
    typeof lineOrTipo === "object" ? String(lineOrTipo?.concepto || "").trim() : String(lineOrTipo || "").trim();
  if (conceptoRaw.includes(":")) {
    const tail = conceptoRaw.split(":").pop().trim().toLowerCase();
    if (tail) return tail;
  }
  const conceptoKey = conceptoRaw.toUpperCase().replace(/[\s\-]+/g, "_");
  if (map[conceptoKey]) return map[conceptoKey];
  if (conceptoRaw) return conceptoRaw.toLowerCase();
  return "gasto";
}

export function isOwnVehicleExpenseLine(line) {
  if (isOwnVehicleExpenseRecord(line)) return true;
  const type = expenseTypeCode(line?.tipo_gasto || line?.concepto || "");
  if (type === "KILOMETRAJE_COLABORADOR") return true;
  const hasKmMarkers =
    Number(line?.km || line?.kms || line?.km_recorridos || 0) > 0 ||
    Number(line?.eur_km || line?.tarifa_km || 0) > 0 ||
    !!String(line?.itinerario || "").trim() ||
    !!String(line?.motivo_salida || "").trim();
  return hasKmMarkers;
}

export function detectExpenseSheetModel(sheetMeta, lines) {
  return resolveExpenseSheetModel(lines, sheetMeta);
}

import { entityFromExpenseRecord, primaryExpenseAmount, resolveSheetLineConcepto } from "./expenseIva";

export function expenseLineEntityOrProvider(line) {
  const value = String(line?.entidad || "").trim() || entityFromExpenseRecord(line);
  return value || "-";
}

export function isDietExpenseLine(line) {
  const raw = String(line?.tipo_gasto || line?.concepto || "").trim().toUpperCase();
  return raw.includes("DIETA") || raw.includes("MANUTENCION") || raw.includes("ALOJAMIENTO") || raw.includes("HOSPEDAJE");
}

export function lineImporteValue(line) {
  return Number(line?.importe || line?.coste_total || line?.total || 0) || 0;
}

export function buildOwnVehicleModelHtml({ sheetOrderText, person, createdDate, lines, totalFallback }) {
  const normalizedLines = (Array.isArray(lines) ? lines : []).map((l) => ({
    ...l,
    fecha: normalizeDateToDmy(l?.fecha || "") || "",
    concepto: expenseSheetConceptLabel(l),
  }));
  const ownLines = normalizedLines.filter((l) => isOwnVehicleExpenseLine(l));
  const otherLines = normalizedLines.filter((l) => !isOwnVehicleExpenseLine(l));
  const kmValueFrom = (l) => Number(l?.km || l?.kms || l?.km_recorridos || 0) || 0;
  const eurKmValue = Number(ownLines[0]?.eur_km || ownLines[0]?.tarifa_km || 0) || 0;
  const totalKm = ownLines.reduce((acc, l) => acc + kmValueFrom(l), 0);
  const subtotalDesplazamientos = Number((totalKm * eurKmValue).toFixed(2));
  const dietasLines = otherLines.filter((l) => isDietExpenseLine(l));
  const otrosLines = otherLines.filter((l) => !isDietExpenseLine(l));
  const totalDietas = Number(dietasLines.reduce((acc, l) => acc + lineImporteValue(l), 0).toFixed(2));
  const totalOtros = Number(otrosLines.reduce((acc, l) => acc + lineImporteValue(l), 0).toFixed(2));
  const totalPagar = Number((subtotalDesplazamientos + totalDietas + totalOtros).toFixed(2)) || Number(totalFallback || 0) || 0;
  const proyecto = escapeHtmlValue(String(ownLines[0]?.proyecto || otherLines[0]?.proyecto || "").trim() || "-");
  const safeDate = createdDate || escapeHtmlValue(formatDateEsValue(new Date().toISOString()));
  const monthFromDate = (() => {
    const d = parseDateFlexible(safeDate);
    if (!d) return { mes: "__", anio: "____" };
    return { mes: String(d.getMonth() + 1).padStart(2, "0"), anio: String(d.getFullYear()) };
  })();

  const kmRows = [];
  for (let i = 0; i < 24; i += 1) kmRows.push(ownLines[i] || {});
  const kmRowsHtml = kmRows
    .map((l, idx) => {
      const km = kmValueFrom(l);
      const importe = Number(l?.importe || (km ? km * eurKmValue : 0)) || 0;
      return `<tr>
        <td style="border:1px solid #333; padding:3px; text-align:center;">${l?.fecha ? idx + 1 : ""}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(formatDateEsValue(l?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px; text-align:right;">${l?.fecha ? escapeHtmlValue(String(km)) : ""}</td>
        <td style="border:1px solid #333; padding:3px; text-align:right;">${l?.fecha ? `${escapeHtmlValue(formatCurrencyEsValue(importe))} €` : ""}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(String(l?.numero_factura || l?.numero_ticket || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(String(l?.itinerario || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(String(l?.medio_transporte || "Vehículo propio").trim())}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(String(l?.motivo_salida || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px;">${String(l?.ticket_urls || "").trim() ? "Sí" : ""}</td>
      </tr>`;
    })
    .join("");

  const dietRows = [];
  for (let i = 0; i < 6; i += 1) dietRows.push(dietasLines[i] || {});
  const dietRowsHtml = dietRows
    .map(
      (l, idx) => `<tr>
        <td style="border:1px solid #333; padding:3px; text-align:center;">${l?.fecha ? idx + 1 : ""}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(formatDateEsValue(l?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(expenseSheetConceptLabel(l))}</td>
        <td style="border:1px solid #333; padding:3px; text-align:right;">${l?.fecha ? `${escapeHtmlValue(formatCurrencyEsValue(lineImporteValue(l)))} €` : ""}</td>
      </tr>`
    )
    .join("");

  const otherRows = [];
  for (let i = 0; i < 6; i += 1) otherRows.push(otrosLines[i] || {});
  const otherRowsHtml = otherRows
    .map(
      (l, idx) => `<tr>
        <td style="border:1px solid #333; padding:3px; text-align:center;">${l?.fecha ? idx + 1 : ""}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(formatDateEsValue(l?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px;">${escapeHtmlValue(expenseSheetConceptLabel(l))}</td>
        <td style="border:1px solid #333; padding:3px; text-align:right;">${l?.fecha ? `${escapeHtmlValue(formatCurrencyEsValue(lineImporteValue(l)))} €` : ""}</td>
      </tr>`
    )
    .join("");

  return `
<html>
<body style="font-family: Arial, sans-serif; color:#111; padding:16px; font-size:11px;">
  <h2 style="text-align:center; margin:0 0 6px 0;">LIQUIDACION DE GASTOS DE VIAJE Y MANUTENCIÓN</h2>
  <div style="font-size:10px; margin-bottom:8px;">
    (Válido solo para gastos de viajes y manutención pagados directamente por un trabajador incluido en la tabla de RRHH o voluntarios y ponentes cuya participación en el proyecto esté acreditada en la Memoria Técnica)
  </div>

  <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
    <div><b>Mes:</b> ${escapeHtmlValue(monthFromDate.mes)}</div>
    <div><b>Año:</b> ${escapeHtmlValue(monthFromDate.anio)}</div>
    <div><b>Nº orden:</b> ${sheetOrderText}</div>
  </div>

  <div style="border:1px solid #333; padding:6px; margin-bottom:6px;">
    <div style="font-weight:700; margin-bottom:4px;">1. DATOS DE LA ENTIDAD</div>
    <div><b>Nombre:</b> Grupo de Rehabilitación de la Fauna Autóctona y su Hábitat (GREFA)</div>
    <div><b>Dirección:</b> C/ Monte del Pilar s/n 28220 Majadahonda, Madrid</div>
    <div><b>CIF:</b> G78456118</div>
  </div>

  <div style="border:1px solid #333; padding:6px; margin-bottom:6px;">
    <div style="font-weight:700; margin-bottom:4px;">2. DATOS DEL TRABAJADOR / VOLUNTARIO / AUTÓNOMO</div>
    <div><b>Nombre:</b> ${person}</div>
    <div><b>DNI:</b> ____________________</div>
  </div>

  <div style="border:1px solid #333; padding:6px; margin-bottom:6px;">
    <div style="font-weight:700; margin-bottom:4px;">3. ORDEN DE SALIDA</div>
    <div><b>Proyecto:</b> ${proyecto}</div>
    <div><b>Nº orden:</b> ${sheetOrderText}</div>
  </div>

  <div style="font-weight:700; margin:8px 0 4px 0;">4. DETALLE DE SALIDAS</div>
  <div style="margin-bottom:4px;"><b>4.1. Desplazamientos.</b> Especificar el medio de transporte utilizado y, en su caso, si es vehículo propio o alquiler.</div>
  <table style="width:100%; border-collapse:collapse; font-size:10px; table-layout:fixed;">
    <thead>
      <tr>
        <th style="border:1px solid #333; padding:3px; width:5%;">Nº orden</th>
        <th style="border:1px solid #333; padding:3px; width:10%;">Fecha</th>
        <th style="border:1px solid #333; padding:3px; width:8%;">Distancia (Km)</th>
        <th style="border:1px solid #333; padding:3px; width:9%;">Importe</th>
        <th style="border:1px solid #333; padding:3px; width:10%;">Factura (IVA incl.)</th>
        <th style="border:1px solid #333; padding:3px; width:19%;">Itinerario completo</th>
        <th style="border:1px solid #333; padding:3px; width:12%;">Medio de transporte</th>
        <th style="border:1px solid #333; padding:3px; width:17%;">Motivo salida</th>
        <th style="border:1px solid #333; padding:3px; width:10%;">Documentación justificativa</th>
      </tr>
    </thead>
    <tbody>${kmRowsHtml}</tbody>
  </table>
  <div style="margin-top:4px; text-align:right;">
    <div><b>Total km</b> ${escapeHtmlValue(String(totalKm))} · <b>€/km</b> ${escapeHtmlValue(formatCurrencyEsValue(eurKmValue))} € · <b>Subtotal</b> ${escapeHtmlValue(formatCurrencyEsValue(subtotalDesplazamientos))} €</div>
    <div><b>Total Desplazamientos</b> ${escapeHtmlValue(formatCurrencyEsValue(subtotalDesplazamientos))} €</div>
  </div>

  <div style="margin-top:8px; margin-bottom:4px;"><b>4.2. Dietas (gastos de alojamiento y manutención)</b></div>
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <thead><tr>
      <th style="border:1px solid #333; padding:3px; width:10%;">Nº orden</th>
      <th style="border:1px solid #333; padding:3px; width:18%;">Fecha</th>
      <th style="border:1px solid #333; padding:3px;">Conceptos (se debe aportar ticket o factura)</th>
      <th style="border:1px solid #333; padding:3px; width:18%;">Importe</th>
    </tr></thead>
    <tbody>${dietRowsHtml}</tbody>
  </table>
  <div style="margin-top:4px; text-align:right;"><b>Total Dietas</b> ${escapeHtmlValue(formatCurrencyEsValue(totalDietas))} €</div>

  <div style="margin-top:8px; margin-bottom:4px;"><b>4.3. Otros gastos (costes de aparcamiento, peajes, taxi, etc.)</b></div>
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <thead><tr>
      <th style="border:1px solid #333; padding:3px; width:10%;">Nº orden</th>
      <th style="border:1px solid #333; padding:3px; width:18%;">Fecha</th>
      <th style="border:1px solid #333; padding:3px;">Conceptos (se debe aportar ticket o factura)</th>
      <th style="border:1px solid #333; padding:3px; width:18%;">Importe</th>
    </tr></thead>
    <tbody>${otherRowsHtml}</tbody>
  </table>
  <div style="margin-top:4px; text-align:right;"><b>Total Otros Gastos</b> ${escapeHtmlValue(formatCurrencyEsValue(totalOtros))} €</div>

  <div style="border:1px solid #333; padding:6px; margin-top:8px;">
    <div style="font-weight:700; margin-bottom:4px;">5. LIQUIDACIÓN</div>
    <div>Declaro bajo mi responsabilidad que he realizado los servicios indicados y la cantidad a percibir es:</div>
    <div style="margin-top:6px; text-align:right; font-size:12px;"><b>TOTAL A PAGAR DIETAS Y DESPLAZAMIENTOS</b> ${escapeHtmlValue(formatCurrencyEsValue(totalPagar))} €</div>
    <div style="margin-top:8px;">En Majadahonda a ${safeDate}.</div>
  </div>
</body>
</html>`;
}

function unwrapApiList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function unwrapApiObject_(res) {
  if (res?.data != null && typeof res.data === "object" && !Array.isArray(res.data)) return res.data;
  if (res != null && typeof res === "object" && !Array.isArray(res)) return res;
  return {};
}

/** Error del router antiguo (09_api_router) que aún exige GESTOR/ADMIN en hojas_gasto_list. */
export function isHojasGastoApiPermissionError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("solo gestor") ||
    msg.includes("consultar hojas de gasto") ||
    msg.includes("listar hojas de gasto") ||
    msg.includes("ver hojas de gasto")
  );
}

/** Nombre visible del titular de hoja (Excel importado > nº hoja > usuario). */
export function resolveExpenseSheetPersonName(row, numHoja = "") {
  const excelName = String(row?.excel_trabajador_nombre || "").trim();
  if (excelName && !excelName.includes("@")) return excelName;
  const num = String(numHoja || row?.num_hoja_gasto || row?.Num_Hoja_Gasto || "").trim();
  const marker = " R.G.T. ";
  const p = num.indexOf(marker);
  if (p >= 0) {
    const nameFromNum = num.slice(p + marker.length).split(" - ")[0].trim();
    if (nameFromNum) return nameFromNum;
  }
  const stored = String(row?.usuario_nombre || row?.nombre || "").trim();
  if (stored && !stored.includes("@")) return stored;
  return stored;
}

/** Agrupa gastos con hoja_gasto_id (fallback si el servidor no expone hojas_gasto_list). */
export function buildHojasGastoListFromExpenses(expenses) {
  const byKey = new Map();
  const lineCounts = new Map();
  const list = Array.isArray(expenses) ? expenses : [];
  for (const g of list) {
    const num = String(g?.num_hoja_gasto || g?.Num_Hoja_Gasto || "").trim();
    const id = String(g?.hoja_gasto_id || "").trim();
    const key = id || num;
    if (!key) continue;
    lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
    if (!byKey.has(key)) {
      byKey.set(key, {
        hoja_gasto_id: id,
        num_hoja_gasto: num,
        hoja_gasto_estado: String(g?.hoja_gasto_estado || "ENVIADA").trim().toUpperCase(),
        hoja_gasto_estado_pago: String(g?.hoja_gasto_estado_pago || "PAGO_PENDIENTE").trim().toUpperCase(),
        hoja_gasto_fecha_envio: String(g?.hoja_gasto_fecha_envio || "").trim(),
        hoja_gasto_total: 0,
        hoja_gasto_observaciones: String(g?.hoja_gasto_observaciones || "").trim(),
        usuario_email: String(g?.usuario_email || g?.responsable_email || "").trim().toLowerCase(),
        usuario_nombre: resolveExpenseSheetPersonName(g),
        lineas_count: 0,
      });
    }
    const row = byKey.get(key);
    row.hoja_gasto_total += Number(amountFromExpense(g) || 0);
    if (!row.hoja_gasto_estado) row.hoja_gasto_estado = String(g?.hoja_gasto_estado || "ENVIADA").trim().toUpperCase();
    if (!row.hoja_gasto_estado_pago) {
      row.hoja_gasto_estado_pago = String(g?.hoja_gasto_estado_pago || "PAGO_PENDIENTE").trim().toUpperCase();
    }
  }
  return [...byKey.values()].map((row) => {
    const key = String(row.hoja_gasto_id || row.num_hoja_gasto || "").trim();
    return { ...row, lineas_count: lineCounts.get(key) || 0 };
  });
}

export function buildHojaGastoDetalleFromExpenses(expenses, hojaId) {
  const hid = String(hojaId || "").trim();
  if (!hid) return null;
  const rows = (Array.isArray(expenses) ? expenses : []).filter((g) => String(g?.hoja_gasto_id || "").trim() === hid);
  if (!rows.length) return null;
  const first = rows[0];
  const lineas = rows.map((g) => ({
    id_gasto: String(g?.id_gasto || g?.id || "").trim(),
    fecha: String(g?.fecha || g?.fecha_repostaje || g?.fecha_otros_gastos || "").trim(),
    matricula: String(g?.matricula || "").trim().toUpperCase(),
    tipo_gasto: String(g?.tipo_gasto || "").trim(),
    concepto: String(g?.tipo_gasto || "GASTO").trim(),
    entidad: String(g?.proveedor || g?.entidad_combustible || g?.proveedor_otros_gastos || "").trim(),
    numero_factura: sanitizeInvoiceNumberText(
      g?.numero_ticket ||
        g?.numero_factura_otros ||
        g?.numero_factura_peaje ||
        g?.numero_factura_mantenimiento ||
        g?.numero_factura_repuestos ||
        g?.numero_factura_itv ||
        ""
    ),
    proyecto: String(g?.proyecto || g?.departamento_proyecto || "").trim(),
    importe: Number(amountFromExpense(g) || 0),
  }));
  const total = lineas.reduce((acc, ln) => acc + Number(ln.importe || 0), 0);
  return {
    hoja_gasto_id: hid,
    num_hoja_gasto: String(first?.num_hoja_gasto || first?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(first?.responsable_email || first?.usuario_email || "").trim().toLowerCase(),
    usuario_nombre: resolveExpenseSheetPersonName(first, first?.num_hoja_gasto || first?.Num_Hoja_Gasto),
    hoja_gasto_fecha_envio: String(first?.hoja_gasto_fecha_envio || "").trim(),
    hoja_gasto_observaciones: String(first?.hoja_gasto_observaciones || "").trim(),
    hoja_gasto_estado: String(first?.hoja_gasto_estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado_pago: String(first?.hoja_gasto_estado_pago || "").trim().toUpperCase(),
    hoja_gasto_modelo: String(first?.hoja_gasto_modelo || "").trim(),
    hoja_gasto_tipo: String(first?.hoja_gasto_tipo || "").trim(),
    total_importe: Number(total.toFixed(2)),
    lineas,
  };
}

export async function fetchHojasGastoListResilient(apiGet, email, options = {}) {
  const user_email = String(email || "").trim().toLowerCase();
  if (!user_email) return [];
  try {
    const res = await apiGet("hojas_gasto_list", { user_email }, options);
    return unwrapApiList_(res);
  } catch (err) {
    if (!isHojasGastoApiPermissionError(err)) throw err;
    const gastoRes = await apiGet("gasto_list", { user_email }, options);
    return buildHojasGastoListFromExpenses(unwrapApiList_(gastoRes));
  }
}

export async function fetchHojaGastoDetalleResilient(apiGet, email, hojaId, options = {}) {
  const user_email = String(email || "").trim().toLowerCase();
  const hid = String(hojaId || "").trim();
  if (!user_email || !hid) throw new Error("Falta user_email o hoja_gasto_id");
  try {
    const res = await apiGet("hoja_gasto_detalle", { hoja_gasto_id: hid, user_email }, options);
    return unwrapApiObject_(res);
  } catch (err) {
    if (!isHojasGastoApiPermissionError(err)) throw err;
    const gastoRes = await apiGet("gasto_list", { user_email }, options);
    const detail = buildHojaGastoDetalleFromExpenses(unwrapApiList_(gastoRes), hid);
    if (!detail) throw new Error("No se encontraron líneas de la hoja en tus gastos visibles.");
    return detail;
  }
}

/** Identificador estable para listados/selección (local o remoto). */
/** Id remoto en Sheet (GAS…), no id local de la app (timestamp). */
export function isRemoteExpenseId(id) {
  const t = String(id || "").trim();
  if (!t) return false;
  if (/^GAS/i.test(t)) return true;
  if (/^\d{13,16}$/.test(t)) return false;
  return false;
}

/** id_gasto del Sheet a partir de fila de picker o registro crudo. */
export function remoteExpenseIdFromRow(row, rawExpense) {
  const raw = rawExpense || row?.raw || row || {};
  for (const candidate of [row?.id_gasto, raw?.id_gasto]) {
    if (isRemoteExpenseId(candidate)) return String(candidate).trim();
  }
  return "";
}

export function expenseAppRowId(expense) {
  return String(expense?.id || expense?.local_id || expense?.id_gasto || expense?.gasto_id || "").trim();
}

/** Tras pull del Sheet, las filas suelen traer solo id_gasto: unifica id/local_id para la UI. */
export function normalizeExpenseRowForApp(row) {
  if (!row || typeof row !== "object") return row;
  const gid = String(row.id_gasto || row.gasto_id || "").trim();
  const lid = String(row.id || row.local_id || "").trim();
  const id = lid || gid;
  if (!id) return row;
  return {
    ...row,
    id: lid || id,
    local_id: String(row.local_id || lid || id).trim() || id,
    id_gasto: gid || id,
  };
}

/** Fecha mostrada / filtros en hojas de gasto. */
export function expenseDisplayDate(expense) {
  return expenseDate(expense);
}

/** Línea base para enviar/actualizar hoja de gasto desde un gasto pendiente. */
export function expenseSheetLineFromPendingRow(row, rawExpense) {
  const r = row || {};
  const raw = rawExpense || r.raw || r;
  const isKm = String(r.tipo_gasto || "").trim().toUpperCase() === "KILOMETRAJE_COLABORADOR";
  const remoteId = remoteExpenseIdFromRow(r, raw);
  return {
    id_gasto: remoteId,
    expense_id: String(r.id || r.sourceExpenseId || raw?.local_id || "").trim(),
    fecha: normalizeDateToDmy(r.fecha || expenseDisplayDate(raw) || "") || "",
    matricula: r.matricula || "",
    tipo_gasto: r.tipo_gasto || "",
    concepto: resolveSheetLineConcepto(r, raw),
    entidad: r.entidad || "",
    numero_factura: r.numero_factura || "",
    proyecto: r.proyecto || "",
    importe: Number((Number(r.importe) || 0).toFixed(2)),
    importe_pagar: Number((Number(r.importe_pagar ?? r.importe ?? raw?.importe_pagar ?? raw?.importe) || 0).toFixed(2)),
    base_imponible:
      r.base_imponible != null && String(r.base_imponible).trim() !== ""
        ? Number(parseNumeric(r.base_imponible).toFixed(2))
        : raw?.base_imponible != null && String(raw.base_imponible).trim() !== ""
          ? Number(parseNumeric(raw.base_imponible).toFixed(2))
          : undefined,
    iva_pct:
      r.iva_pct != null && String(r.iva_pct).trim() !== ""
        ? r.iva_pct
        : raw?.iva_pct != null && String(raw.iva_pct).trim() !== ""
          ? raw.iva_pct
          : raw?.iva_porcentaje != null && String(raw.iva_porcentaje).trim() !== ""
            ? raw.iva_porcentaje
            : "",
    iva_eur:
      r.iva_eur != null && String(r.iva_eur).trim() !== ""
        ? Number(parseNumeric(r.iva_eur).toFixed(2))
        : raw?.iva_eur != null && String(raw.iva_eur).trim() !== ""
          ? Number(parseNumeric(raw.iva_eur).toFixed(2))
          : raw?.cuota_iva != null && String(raw.cuota_iva).trim() !== ""
            ? Number(parseNumeric(raw.cuota_iva).toFixed(2))
            : undefined,
    id_viaje_propio: String(raw?.id_viaje_propio || r.id_viaje_propio || "").trim(),
    num_personas: (() => {
      const tipo = String(r.tipo_gasto || raw?.tipo_gasto || "").trim().toUpperCase();
      if (tipo === "HOSPEDAJE" || tipo === "OTROS") {
        return String(raw?.numero_personas_hospedaje || r.numero_personas_hospedaje || raw?.num_personas || "").trim();
      }
      if (tipo === "GASTOS_BILLETES") {
        return String(
          raw?.numero_personas_billete ||
            r.numero_personas_billete ||
            raw?.numero_personas_hospedaje ||
            r.numero_personas_hospedaje ||
            raw?.num_personas ||
            r.num_personas ||
            ""
        ).trim();
      }
      if (tipo === "MANUTENCION") return String(raw?.numero_comensales_manutencion || r.numero_comensales_manutencion || "").trim();
      return "";
    })(),
    distancia_km: isKm ? Number(raw?.km_recorridos_colaborador || 0) || 0 : 0,
    eur_km: isKm ? Number(raw?.tarifa_eur_km_aplicada || 0) || 0 : 0,
    medio_transporte: isKm ? String(raw?.accion_colaborador || "coche propio").trim() : "",
    motivo_salida: isKm ? String(raw?.motivo_colaborador || "").trim() : "",
    fecha_inicio: isKm ? String(raw?.fecha_viaje_colaborador || raw?.fecha || r.fecha || "").trim() : "",
    fecha_fin: isKm ? String(raw?.fecha_fin_viaje_colaborador || raw?.fecha_fin_viaje || raw?.fecha_viaje_colaborador || "").trim() : "",
    itinerario: isKm
      ? `${String(raw?.origen_colaborador || "").trim()} - ${String(raw?.destino_colaborador || "").trim()}`
      : "",
    numero_personas_hospedaje: String(raw?.numero_personas_hospedaje ?? r.numero_personas_hospedaje ?? "").trim(),
    numero_comensales_manutencion: String(raw?.numero_comensales_manutencion ?? r.numero_comensales_manutencion ?? "").trim(),
  };
}

/** Normaliza forma de pago del gasto: usuario | tarjeta_empresa | transferencia | otro */
export function normalizeExpenseFormaPagoKey_(formaPago) {
  const f = String(formaPago || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (!f) return "usuario";
  if (f === "usuario" || f === "u" || f === "user") return "usuario";
  if (f === "transferencia") return "transferencia";
  if (
    f === "tarjeta grefa" ||
    f === "tarjeta_grefa" ||
    f === "tarjeta_empresa" ||
    f === "tarjeta empresa" ||
    (f.includes("tarjeta") && (f.includes("grefa") || f.includes("empresa") || f.includes("corporativa")))
  ) {
    return "tarjeta_empresa";
  }
  return f.replace(/\s+/g, "_");
}

export function isTarjetaEmpresaFormaPago(formaPago) {
  return normalizeExpenseFormaPagoKey_(formaPago) === "tarjeta_empresa";
}

/** Gastos que pueden incluirse en una hoja (Usuario o tarjeta corporativa GREFA). */
export function isEligibleFormaPagoForExpenseSheet(formaPago) {
  const k = normalizeExpenseFormaPagoKey_(formaPago);
  return k === "usuario" || k === "tarjeta_empresa";
}

/** Vacío en pestaña por tipo (sin columna forma_pago) se trata como pago Usuario. */
export function isUserPaidFormaPago(formaPago) {
  return isEligibleFormaPagoForExpenseSheet(formaPago);
}

/** Normaliza hoja_gasto_id: vacío, guiones o marcadores no cuentan como hoja asignada. */
export function normalizeExpenseHojaLink_(expense) {
  if (!expense || typeof expense !== "object") return expense;
  const raw = String(expense.hoja_gasto_id || "").trim();
  const invalid = !raw || /^[-–—_\.]+$/.test(raw) || /^(n\/a|na|sin|ninguna|null)$/i.test(raw);
  const hoja = invalid ? "" : raw;
  return {
    ...expense,
    hoja_gasto_id: hoja,
    ...(hoja
      ? {}
      : {
          hoja_gasto_estado: "",
          hoja_gasto_estado_pago: "",
          num_hoja_gasto: "",
          Num_Hoja_Gasto: "",
        }),
  };
}

export function isPendingUserPaidExpense(expense, options) {
  const e = normalizeExpenseHojaLink_(expense);
  if (!isEligibleFormaPagoForExpenseSheet(e?.forma_pago)) return false;
  const hoja = String(e?.hoja_gasto_id || "").trim();
  if (!hoja) return true;
  const failed = options && options.failedSheetIds;
  if (failed && typeof failed.has === "function" && failed.has(hoja)) return true;
  return false;
}

/** Hojas editables por el usuario (añadir/quitar gastos) tras su creación. */
export function canEditExpenseSheetByEstado(estado) {
  const e = String(estado || "ENVIADA").trim().toUpperCase();
  return e !== "APROBADA" && e !== "PAGADA" && e !== "RECHAZADA_PAGO";
}

/** Si el gasto puede eliminarse (autor, gestor o administración). */
export function canDeleteExpense(expense, options = {}) {
  const actor = String(options.actorEmail || options.userEmail || "").trim().toLowerCase();
  const role = String(options.role || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const idGasto = String(expense?.id_gasto || "").trim();
  const localOnly = !idGasto || !/^GAS[-_]/i.test(idGasto);

  const hoja = String(expense?.hoja_gasto_id || "").trim();
  const estado = String(expense?.hoja_gasto_estado || "").trim().toUpperCase();
  const estadoPago = String(expense?.hoja_gasto_estado_pago || "").trim().toUpperCase();

  if (estado === "APROBADA" || estado === "PAGADA" || estado === "RECHAZADA_PAGO") {
    return { ok: false, reason: "No se puede eliminar: pertenece a una hoja aprobada, pagada o rechazada." };
  }
  if (estadoPago === "PAGADA" || estadoPago === "PAGADO") {
    return { ok: false, reason: "No se puede eliminar: el gasto consta como pagado." };
  }
  if (hoja) {
    return {
      ok: false,
      reason: "Quita primero el gasto de la hoja de gasto (edita la hoja y desmárcalo).",
    };
  }

  const privileged = role === "GESTOR" || role === "ADMINISTRACION";
  const owner = String(expense?.responsable_email || expense?.usuario_email || expense?.user_email || "")
    .trim()
    .toLowerCase();
  if (privileged || (actor && owner && actor === owner)) {
    return { ok: true, localOnly };
  }
  return { ok: false, reason: "Solo el autor del gasto, Gestor o Administración pueden eliminarlo." };
}

/** Gasto pagado por usuario: sin hoja o ya incluido en la hoja que se está editando. */
export function isUserPaidExpenseForSheetEdit(expense, sheetId) {
  const sid = String(sheetId || "").trim();
  const hoja = String(expense?.hoja_gasto_id || "").trim();
  if (sid && hoja && hoja === sid) return true;
  if (!isEligibleFormaPagoForExpenseSheet(expense?.forma_pago)) return false;
  return !hoja;
}

/** Enriquece fila API con datos locales (forma_pago, tickets, fechas) tras pull o dedupe. */
export function enrichExpenseFromLocalRow(sheetRow, localRow) {
  if (!sheetRow || !localRow) return normalizeExpenseRowForApp(normalizeExpenseHojaLink_(sheetRow));
  const out = { ...sheetRow };
  if (!String(out.forma_pago || "").trim() && localRow.forma_pago) out.forma_pago = localRow.forma_pago;
  if (!String(out.id_gasto || "").trim() && localRow.id_gasto) out.id_gasto = localRow.id_gasto;
  // No copiar hoja_gasto_id local → evita bloquear selección con vínculos obsoletos del móvil.
  if (!String(out.responsable_email || "").trim() && localRow.responsable_email) {
    out.responsable_email = localRow.responsable_email;
  }
  if (!String(out.usuario_email || "").trim() && localRow.usuario_email) {
    out.usuario_email = localRow.usuario_email;
  }
  if (!String(out.user_email || "").trim() && localRow.user_email) {
    out.user_email = localRow.user_email;
  }
  if (!String(out.id_viaje_propio || "").trim() && localRow.id_viaje_propio) {
    out.id_viaje_propio = localRow.id_viaje_propio;
  }

  // Si la fecha local (tras editar) difiere del Sheet, conservar fechas locales.
  const localFecha = expenseDate(localRow);
  const remoteFecha = expenseDate(sheetRow);
  if (localFecha && remoteFecha && localFecha !== remoteFecha) {
    const dateKeys = [
      "fecha",
      "fecha_repostaje",
      "fecha_peaje",
      "fecha_aparcamiento",
      "fecha_otros_gastos",
      "fecha_inspeccion",
      "fecha_compra_repuestos",
      "fecha_compra_mantenimiento",
      "fecha_multa",
      "fecha_viaje_colaborador",
      "fecha_inicio_seguro",
      "fecha_fin_seguro",
      "fecha_pago",
      "periodo_ivm",
    ];
    for (const k of dateKeys) {
      if (String(localRow?.[k] ?? "").trim()) out[k] = localRow[k];
    }
    out.fecha = localRow.fecha || localFecha;
  }

  return normalizeExpenseRowForApp(normalizeExpenseHojaLink_(out));
}

/** IDs de hoja equivalentes (id listado vs hoja_gasto_id en GASTOS). */
export function expenseSheetIdsMatch_(sheetIdA, sheetIdB) {
  const a = String(sheetIdA || "").trim();
  const b = String(sheetIdB || "").trim();
  return !!a && !!b && a === b;
}

export function selectExpenseRowsOnSheet(mappedRows, sheetId, lineas) {
  const sid = String(sheetId || "").trim();
  const idOnSheet = new Set();
  const keyOnSheet = new Set();
  (Array.isArray(lineas) ? lineas : []).forEach((ln) => {
    const gid = String(ln?.id_gasto || ln?.expense_id || "").trim();
    if (gid) idOnSheet.add(gid);
    const mat = String(ln?.matricula || "").trim().toUpperCase();
    const fecha = String(ln?.fecha || "").trim();
    const tipo = String(ln?.tipo_gasto || "").trim().toUpperCase();
    const imp = Number(ln?.importe_pagar ?? ln?.importe ?? 0) || 0;
    if (mat || fecha || tipo) {
      keyOnSheet.add(`${tipo}|${mat}|${fecha}|${imp.toFixed(2)}`);
    }
  });
  const sel = {};
  for (const r of mappedRows) {
    const raw = r.raw || r;
    const gid = String(r.id_gasto || r.sourceExpenseId || raw?.id_gasto || "").trim();
    const rid = String(r.id || "").trim();
    const mat = String(raw?.matricula || raw?.vehiclePlate || "").trim().toUpperCase();
    const fecha = String(expenseDisplayDate(raw) || "").trim();
    const tipo = String(raw?.tipo_gasto || "").trim().toUpperCase();
    const imp = Number(primaryExpenseAmount(raw, tipo) || 0) || 0;
    const rowKey = `${tipo}|${mat}|${fecha}|${imp.toFixed(2)}`;
    const onSheet =
      (gid && idOnSheet.has(gid)) ||
      (rid && idOnSheet.has(rid)) ||
      (rowKey && keyOnSheet.has(rowKey)) ||
      expenseSheetIdsMatch_(raw?.hoja_gasto_id, sid);
    if (onSheet) sel[r.id] = true;
  }
  return sel;
}

/** Nombres de proyecto para filtro de informes (activos e inactivos; valor = nombre en gastos). */
export function mapAllProjectsForReportsFilter(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const values = Object.values(r).map((v) => String(v || "").trim());
    const colB = values.length >= 2 ? values[1] : "";
    const name = String(r.nombre_proyecto || r.nombre || r.proyecto || colB).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ value: name, label: name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export { mapProjectSelectOptions as mapProjectOptionsForWeb } from "./proyectoResolve";
