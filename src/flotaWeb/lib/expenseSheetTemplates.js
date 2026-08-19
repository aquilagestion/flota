import { escapeHtmlValue, formatCurrencyEsValue, formatDateEsValue, normalizeDateToDmy, parseDateFlexible } from "./format";
import {
  TICKET_ANNEX_IMG_STYLE,
  TICKET_ANNEX_PAGE_H_MM,
  TICKET_ANNEX_PAGE_W_MM,
  TICKET_ANNEX_TITLE_MM,
  TICKET_ANNEX_RENDER_DPI,
  computeTicketAnnexImgBoxMm,
} from "./ticketImageLayout";
import { codPersonalFromName, paymentMethodCheckboxesHtml_, signatureDateFooterText_ } from "./expenseSheetMeta";
import { expenseSheetConceptLabel } from "./expenses";
import {
  baseFromTotalAndPct,
  computeIvaEur,
  enrichSheetLineaFinancialFromExpense,
  hasIvaPctValue,
  lifeSheetNumPersonasFromExpense,
  parseExpenseNum,
} from "./expenseIva";

export const MIN_SHEET_TABLE_ROWS = 10;

export const EXPENSE_SHEET_TEMPLATE = {
  GREFA_RELACION: "GREFA_RELACION",
  LIFE_EMG_PYGARGUS: "LIFE_EMG_PYGARGUS",
  LIFE_EMG_ABILAS: "LIFE_EMG_ABILAS",
  LIFE_EMG_RHODOPES: "LIFE_EMG_RHODOPES",
};

/** Metadatos EU del proyecto Life (textos oficiales de plantilla). */
export const LIFE_PROJECT_META = {
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS]: {
    projectLine: "PROJECT: 101148303-LIFE23-NAT-PT-LIFE SOS PYGARGUS",
  },
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS]: {
    projectLine: "PROJECT: 101147372-LIFE23-NAT-IT-LIFE ABILAS",
  },
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES]: {
    projectLine: "PROJECT: 101148254 LIFE23-NAT-BG-LIFE RHODOPES VULTURE",
  },
};

function normProyecto_(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolveExpenseSheetTemplate(proyectoNombre, lineas) {
  const fromName = normProyecto_(proyectoNombre);
  if (fromName.includes("PYGARGUS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS;
  if (fromName.includes("ABILAS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS;
  if (fromName.includes("RHODOPE")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES;

  const list = Array.isArray(lineas) ? lineas : [];
  for (const ln of list) {
    const p = normProyecto_(ln?.proyecto || ln?.departamento_o_proyecto || "");
    if (p.includes("PYGARGUS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS;
    if (p.includes("ABILAS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS;
    if (p.includes("RHODOPE")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES;
  }
  return EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
}

function primaryProyectoLabel_(lineas) {
  const list = Array.isArray(lineas) ? lineas : [];
  for (const ln of list) {
    const p = String(ln?.proyecto || ln?.departamento_o_proyecto || "").trim();
    if (p) return p;
  }
  return "";
}

function normalizeSheetLineForPrint_(ln) {
  if (!ln || typeof ln !== "object") return ln;
  const financial = enrichSheetLineaFinancialFromExpense(ln, ln);
  return {
    ...financial,
    fecha: normalizeDateToDmy(financial.fecha || ln.fecha || "") || "",
    concepto: expenseSheetConceptLabel(financial),
  };
}

function normalizeSheetLinesForPrint_(lines) {
  return (Array.isArray(lines) ? lines : []).map(normalizeSheetLineForPrint_);
}

function monthYearFromDate_(dateStr) {
  const d = parseDateFlexible(dateStr);
  if (!d) return { mes: "__", anio: "____" };
  return {
    mes: String(d.getMonth() + 1).padStart(2, "0"),
    anio: String(d.getFullYear()),
  };
}

function conceptoGrefaRow_(ln) {
  return expenseSheetConceptLabel(ln);
}

function lineImporte_(ln) {
  return sheetLineFinancial_(ln).base;
}

function sheetLineHasData_(ln) {
  if (!ln || typeof ln !== "object") return false;
  return Boolean(
    String(ln?.tipo_gasto || ln?.concepto || "").trim() ||
      String(ln?.entidad || "").trim() ||
      String(ln?.numero_factura || "").trim() ||
      String(ln?.fecha || "").trim() ||
      parseExpenseNum(ln?.importe_pagar ?? ln?.importe ?? ln?.coste_total)
  );
}

function padSheetTableLines_(lines, minRows = MIN_SHEET_TABLE_ROWS) {
  const src = (Array.isArray(lines) ? lines : []).filter(sheetLineHasData_);
  const count = Math.max(minRows, src.length);
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(src[i] || {});
  return out;
}

function sheetLineFinancial_(ln) {
  if (!sheetLineHasData_(ln)) {
    return { base: 0, ivaPct: 0, ivaEur: 0, pagar: 0, empty: true };
  }
  const pagar = parseExpenseNum(ln?.importe_pagar ?? ln?.importe ?? ln?.coste_total);
  if (hasIvaPctValue(ln?.iva_pct) && pagar) {
    const pct = parseExpenseNum(ln.iva_pct);
    const base = parseExpenseNum(ln.base_imponible) || baseFromTotalAndPct(pagar, pct);
    const ivaEur = parseExpenseNum(ln.iva_eur) || computeIvaEur(base, pct);
    const total = Number((base + ivaEur).toFixed(2));
    return { base, ivaPct: pct, ivaEur, pagar: pagar || total, empty: false };
  }
  const base = parseExpenseNum(ln?.base_imponible) || pagar;
  return { base, ivaPct: 0, ivaEur: 0, pagar: pagar || base, empty: false };
}

function blankGrefaRowHtml_() {
  const cell = '<td style="border:1px solid #333; padding:5px 4px;">&nbsp;</td>';
  return `<tr>${cell.repeat(5)}</tr>`;
}

function blankLifeRowHtml_() {
  const cell = '<td style="border:1px solid #333; padding:3px; font-size:9px;">&nbsp;</td>';
  return `<tr>${cell.repeat(11)}</tr>`;
}

function sheetReceiptSignatureFooterHtml_({ totalFormatted, person, meta, fontSizeReceipt = "9px", fontSizeSign = "10px", grefaStamp = false }) {
  const firmaDate = escapeHtmlValue(signatureDateFooterText_(meta?.fecha_firma));
  const safePerson = escapeHtmlValue(person);
  const safeTotal = escapeHtmlValue(totalFormatted);
  const payHtml = paymentMethodCheckboxesHtml_(meta?.forma_pago, fontSizeReceipt);
  return `
  <div style="margin-top:10px; font-size:${fontSizeReceipt};">He recibido la cantidad de ${safeTotal} € por los gastos incurridos en el viaje descrito.</div>
  ${payHtml}
  <div style="margin-top:12px; font-size:${fontSizeSign};">Y para que así conste firmo el presente en Majadahonda a ${firmaDate}.</div>
  <div style="margin-top:16px; font-size:${fontSizeSign};"><b>Fdo:</b> ${safePerson}</div>
  ${grefaStamp ? `<div style="margin-top:20px; font-size:12px;">Sello de GREFA</div>` : ""}`;
}

/** Valor seguro para atributo src (no rompe data: URI ni URLs con &). */
function attrSrcValue_(value) {
  return String(value ?? "")
    .replace(/"/g, "&quot;")
    .replace(/</g, "")
    .replace(/[\n\r]/g, "");
}

async function loadTicketImageNaturalSize_(src) {
  const uri = String(src || "").trim();
  if (!uri) throw new Error("Sin imagen");

  if (typeof document !== "undefined") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          width: Math.max(1, img.naturalWidth || 1),
          height: Math.max(1, img.naturalHeight || 1),
        });
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = uri;
    });
  }

  try {
    const { Image } = require("react-native");
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) =>
          resolve({
            width: Math.max(1, width || 1),
            height: Math.max(1, height || 1),
          }),
        reject
      );
    });
  } catch (err) {
    throw err;
  }
}

function buildTicketAttachmentPageHtml_(att, idx, naturalSize) {
  const title = escapeHtmlValue(String(att?.label || `Ticket ${idx + 1}`));
  const src = attrSrcValue_(String(att?.dataUri || att?.url || ""));
  const isPdf = /\.pdf(\?|$)/i.test(String(att?.url || att?.dataUri || "")) || att?.mime === "application/pdf";
  if (isPdf && !String(att?.dataUri || "").startsWith("data:")) {
    return `<div class="ticket-attachment-page" style="page-break-before:always; padding:16px; font-family:Arial,sans-serif;">
          <h3 style="margin:0 0 8px 0;">${title}</h3>
          <p style="font-size:12px;">Documento PDF: <a href="${src}">${src}</a></p>
        </div>`;
  }

  const imgAreaH = Math.max(10, TICKET_ANNEX_PAGE_H_MM - TICKET_ANNEX_TITLE_MM);
  let imgTag;
  if (naturalSize?.width && naturalSize?.height) {
    const fit = computeTicketAnnexImgBoxMm(naturalSize.width, naturalSize.height, { hasTitle: true });
    const pxPerMm = TICKET_ANNEX_RENDER_DPI / 25.4;
    const wPx = Math.max(1, Math.round(fit.width * pxPerMm));
    const hPx = Math.max(1, Math.round(fit.height * pxPerMm));
    imgTag = `<img src="${src}" width="${wPx}" height="${hPx}" style="display:block;margin:0 auto;width:${wPx}px;height:${hPx}px;object-fit:contain;" alt="${title}" />`;
  } else {
    imgTag = `<img src="${src}" style="${TICKET_ANNEX_IMG_STYLE}" alt="${title}" />`;
  }

  return `<div class="ticket-attachment-page" style="page-break-before:always;width:210mm;min-height:297mm;margin:0;padding:8mm;box-sizing:border-box;overflow:hidden;font-family:Arial,sans-serif;">
    <div style="font-size:11px;font-weight:bold;text-align:center;margin:0 0 2mm 0;height:${TICKET_ANNEX_TITLE_MM}mm;line-height:${TICKET_ANNEX_TITLE_MM}mm;">${title}</div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 auto;">
      <tr>
        <td style="text-align:center;vertical-align:middle;width:${TICKET_ANNEX_PAGE_W_MM}mm;height:${imgAreaH}mm;padding:0;">
          ${imgTag}
        </td>
      </tr>
    </table>
  </div>`;
}

/** Anexo de tickets/facturas (siempre al final del PDF). */
export function buildTicketAttachmentsHtml(attachments) {
  const list = Array.isArray(attachments) ? attachments.filter((a) => a?.dataUri || a?.url) : [];
  if (!list.length) return "";
  return list.map((att, idx) => buildTicketAttachmentPageHtml_(att, idx, null)).join("");
}

/** Anexo con dimensiones explícitas en mm (recomendado para expo-print / PDF). */
export async function buildTicketAttachmentsHtmlAsync(attachments) {
  const list = Array.isArray(attachments) ? attachments.filter((a) => a?.dataUri || a?.url) : [];
  if (!list.length) return "";
  const pages = [];
  for (let idx = 0; idx < list.length; idx += 1) {
    const att = list[idx];
    const src = String(att?.dataUri || att?.url || "").trim();
    const isPdf = /\.pdf(\?|$)/i.test(String(att?.url || att?.dataUri || "")) || att?.mime === "application/pdf";
    if (isPdf && !String(att?.dataUri || "").startsWith("data:")) {
      pages.push(buildTicketAttachmentPageHtml_(att, idx, null));
      continue;
    }
    let naturalSize = null;
    if (src.startsWith("data:image")) {
      try {
        naturalSize = await loadTicketImageNaturalSize_(src);
      } catch {
        naturalSize = null;
      }
    }
    pages.push(buildTicketAttachmentPageHtml_(att, idx, naturalSize));
  }
  return pages.join("");
}

export function buildGrefaRelacionGastosHtml({
  sheetOrderText,
  person,
  createdDate,
  lines,
  totalFallback,
  logos,
  meta,
}) {
  const logoGrefa = String(logos?.grefa || "").trim();
  const dni = String(meta?.dni || "").trim();
  const dniCell = dni ? escapeHtmlValue(dni) : "___________";
  const proyectoHdr = escapeHtmlValue(primaryProyectoLabel_(lines) || "proyecto");
  const { mes, anio } = monthYearFromDate_(createdDate);
  const dataLines = normalizeSheetLinesForPrint_(lines).filter(sheetLineHasData_);
  const tableLines = padSheetTableLines_(normalizeSheetLinesForPrint_(lines));
  const total =
    dataLines.reduce((acc, ln) => acc + sheetLineFinancial_(ln).pagar, 0) || Number(totalFallback || 0) || 0;

  const rowsHtml = tableLines
    .map((ln) => {
      if (!sheetLineHasData_(ln)) return blankGrefaRowHtml_();
      return `<tr>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(conceptoGrefaRow_(ln))}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(String(ln?.entidad || "").trim())}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(String(ln?.numero_factura || "").trim())}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(formatDateEsValue(ln?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:5px 4px; text-align:right; vertical-align:middle;">${escapeHtmlValue(formatCurrencyEsValue(sheetLineFinancial_(ln).pagar))} €</td>
      </tr>`;
    })
    .join("");

  return `<html><body style="font-family:Arial,sans-serif; color:#111; padding:22px; font-size:12px;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">
    <div style="width:130px;">${logoGrefa ? `<img src="${logoGrefa}" style="width:110px; height:auto;" />` : ""}</div>
    <div style="text-align:right; font-size:12px; line-height:1.5;">
      <div><b>Nº ORDEN</b> ${escapeHtmlValue(sheetOrderText || "")}</div>
      <div style="margin-top:4px;"><b>${proyectoHdr}</b></div>
      <div style="margin-top:2px;">${escapeHtmlValue(mes)}/${escapeHtmlValue(anio)}</div>
    </div>
  </div>
  <h2 style="margin:8px 0 2px 0; font-size:19px; text-align:center;">RELACIÓN DE GASTOS</h2>
  <div style="font-size:13px; font-weight:700; margin-bottom:14px; text-align:center;">COMBUSTIBLE, DIETAS, CONSUMIBLES y OTROS COSTES</div>
  <div style="font-size:13px; margin-bottom:14px; line-height:1.45;">
    Se abona a D. <b>${escapeHtmlValue(person)}</b> con D.N.I. ${dniCell} la cantidad de
    <b>${escapeHtmlValue(formatCurrencyEsValue(total))} euros</b> con transferencia a su cuenta, por haber incurrido en los gastos siguientes:
  </div>
  <table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;">
    <thead><tr>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Concepto</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Entidad</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Nº Factura</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Fecha</th>
      <th style="border:1px solid #333; text-align:right; padding:6px 4px;">Importe</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="margin-top:10px; text-align:right; font-size:13px;"><b>Total: ${escapeHtmlValue(formatCurrencyEsValue(total))} €</b></div>
  ${sheetReceiptSignatureFooterHtml_({
    totalFormatted: formatCurrencyEsValue(total),
    person,
    meta,
    fontSizeReceipt: "12px",
    fontSizeSign: "12px",
    grefaStamp: true,
  })}
</body></html>`;
}

export function buildLifeEmgExpenseSheetHtml({
  templateId,
  sheetOrderText,
  person,
  createdDate,
  lines,
  totalFallback,
  logos,
  meta,
}) {
  const lifeMeta = LIFE_PROJECT_META[templateId] || LIFE_PROJECT_META[EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS];
  const logoLife = String(logos?.lifeProject || "").trim();
  const logoGrefa = String(logos?.grefa || "").trim();
  const logoEu = String(logos?.lifeNatura || "").trim();
  const codPersonal = codPersonalFromName(person);
  const dni = String(meta?.dni || "").trim();
  const { mes, anio } = monthYearFromDate_(createdDate);
  const dataLines = normalizeSheetLinesForPrint_(lines).filter(sheetLineHasData_);
  const tableLines = padSheetTableLines_(normalizeSheetLinesForPrint_(lines));
  let totalBase = 0;
  let totalIva = 0;
  let totalPagar = 0;

  const rowsHtml = tableLines
    .map((ln) => {
      if (!sheetLineHasData_(ln)) return blankLifeRowHtml_();
      const fin = sheetLineFinancial_(ln);
      totalBase += fin.base;
      totalIva += fin.ivaEur;
      totalPagar += fin.pagar;
      const concepto = expenseSheetConceptLabel(ln).toUpperCase();
      const numPers = String(ln?.num_personas ?? lifeSheetNumPersonasFromExpense(ln, ln) ?? "").trim();
      return `<tr>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(concepto)}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.work_package || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.accion_proyecto || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${numPers ? escapeHtmlValue(numPers) : ""}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(String(ln?.entidad || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(String(ln?.numero_factura || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(formatDateEsValue(ln?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.base))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${hasIvaPctValue(ln?.iva_pct) ? `${fin.ivaPct}%` : ""}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.ivaEur))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.pagar))}</td>
      </tr>`;
    })
    .join("");

  if (!totalPagar) totalPagar = Number(totalFallback || 0) || 0;

  const trip = meta?.viaje || {};
  const dniText = dni ? escapeHtmlValue(dni) : "________";

  return `<html><body style="font-family:Arial,sans-serif; color:#111; padding:14px; font-size:10px;">
  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
    <div style="flex:1; text-align:left;">${logoLife ? `<img src="${logoLife}" style="max-height:52px; max-width:160px;" />` : ""}</div>
    <div style="flex:1; text-align:center;">${logoGrefa ? `<img src="${logoGrefa}" style="max-height:48px; max-width:130px;" />` : ""}</div>
    <div style="flex:1; text-align:right;">${logoEu ? `<img src="${logoEu}" style="max-height:48px; max-width:150px;" />` : ""}</div>
  </div>
  <div style="text-align:center; font-weight:700; font-size:11px; margin:6px 0;">HOJA DE GASTOS DESPLAZAMIENTOS POR OTROS MEDIOS</div>
  <div style="text-align:center; font-size:9px; margin-bottom:8px;">${escapeHtmlValue(lifeMeta.projectLine)}</div>
  <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:10px;">
    <div><b>NOMBRE</b> ${escapeHtmlValue(person)}</div>
    <div><b>HOJA DE GASTOS:</b> ${escapeHtmlValue(sheetOrderText || "")}</div>
  </div>
  <table style="width:220px; margin-left:auto; border-collapse:collapse; font-size:9px; margin-bottom:8px;">
    <tr><td style="border:1px solid #333; padding:2px 4px;"><b>COD PERSONAL</b></td><td style="border:1px solid #333; padding:2px 4px;">${escapeHtmlValue(codPersonal)}</td></tr>
    <tr><td style="border:1px solid #333; padding:2px 4px;"><b>MES</b></td><td style="border:1px solid #333; padding:2px 4px;">${escapeHtmlValue(mes)}</td></tr>
    <tr><td style="border:1px solid #333; padding:2px 4px;"><b>AÑO</b></td><td style="border:1px solid #333; padding:2px 4px;">${escapeHtmlValue(anio)}</td></tr>
  </table>
  <div style="font-size:9px; margin-bottom:8px; line-height:1.35;">
    D./Dña <b>${escapeHtmlValue(person)}</b> trabajador de GREFA, con DNI ${dniText} ha recibido de GREFA, la cantidad de
    <b>${escapeHtmlValue(formatCurrencyEsValue(totalPagar))} €</b> por haber incurrido en los gastos siguientes, dentro del proyecto
    ${escapeHtmlValue(lifeMeta.projectLine)}.
  </div>
  <table style="width:100%; border-collapse:collapse; font-size:9px; margin-bottom:6px;">
    <tr>
      <td style="border:1px solid #333; padding:3px;"><b>FECHA INICIO</b> ${escapeHtmlValue(formatDateEsValue(trip.fecha_inicio || ""))}</td>
      <td style="border:1px solid #333; padding:3px;"><b>FECHA FIN</b> ${escapeHtmlValue(formatDateEsValue(trip.fecha_fin || ""))}</td>
    </tr>
    <tr>
      <td style="border:1px solid #333; padding:3px;"><b>ORIGEN</b> ${escapeHtmlValue(String(trip.origen || ""))}</td>
      <td style="border:1px solid #333; padding:3px;"><b>DESTINO 1</b> ${escapeHtmlValue(String(trip.destino1 || ""))}</td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid #333; padding:3px;"><b>MOTIVO</b> ${escapeHtmlValue(String(trip.motivo || ""))}</td>
    </tr>
  </table>
  <table style="width:100%; border-collapse:collapse; font-size:8px;">
    <thead><tr>
      <th style="border:1px solid #333; padding:2px;">CONCEPTO</th>
      <th style="border:1px solid #333; padding:2px;">WORK PACKAGE</th>
      <th style="border:1px solid #333; padding:2px;">ACCIÓN PROYECTO</th>
      <th style="border:1px solid #333; padding:2px;">Nº PERS.</th>
      <th style="border:1px solid #333; padding:2px;">ENT.EXP.</th>
      <th style="border:1px solid #333; padding:2px;">Nº FACTURA</th>
      <th style="border:1px solid #333; padding:2px;">FECHA</th>
      <th style="border:1px solid #333; padding:2px;">Base</th>
      <th style="border:1px solid #333; padding:2px;">IVA %</th>
      <th style="border:1px solid #333; padding:2px;">IVA €</th>
      <th style="border:1px solid #333; padding:2px;">CANT. PAGAR</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tr>
      <td colspan="7" style="border:1px solid #333; padding:3px; text-align:right;"><b>TOTALES</b></td>
      <td style="border:1px solid #333; padding:3px; text-align:right;"><b>${escapeHtmlValue(formatCurrencyEsValue(totalBase))}</b></td>
      <td style="border:1px solid #333; padding:3px;"></td>
      <td style="border:1px solid #333; padding:3px; text-align:right;"><b>${escapeHtmlValue(formatCurrencyEsValue(totalIva))}</b></td>
      <td style="border:1px solid #333; padding:3px; text-align:right;"><b>${escapeHtmlValue(formatCurrencyEsValue(totalPagar))}</b></td>
    </tr>
  </table>
  ${sheetReceiptSignatureFooterHtml_({
    totalFormatted: formatCurrencyEsValue(totalPagar),
    person,
    meta,
    fontSizeReceipt: "9px",
    fontSizeSign: "10px",
    grefaStamp: false,
  })}
</body></html>`;
}

export function buildExpenseSheetPrintHtml(options) {
  const templateId = options?.templateId || EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
  const body =
    templateId === EXPENSE_SHEET_TEMPLATE.GREFA_RELACION
      ? buildGrefaRelacionGastosHtml(options)
      : buildLifeEmgExpenseSheetHtml({ ...options, templateId });
  const tickets = buildTicketAttachmentsHtml(options?.ticketAttachments);
  if (!tickets) return body;
  return body.replace("</body></html>", `${tickets}</body></html>`);
}

export function logoAssetKeyForTemplate(templateId) {
  switch (templateId) {
    case EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS:
      return "pygargus";
    case EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS:
      return "abilas";
    case EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES:
      return "rhodopes";
    default:
      return "grefa";
  }
}
