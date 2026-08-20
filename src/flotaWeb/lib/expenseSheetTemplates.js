import { escapeHtmlValue, formatCurrencyEsValue, formatDateEsValue, normalizeDateToDmy, parseDateFlexible, sanitizeInvoiceNumberText } from "./format";
import {
  TICKET_ANNEX_PAGE_H_MM,
  TICKET_ANNEX_PAGE_W_MM,
  TICKET_PDF_MARGIN_MM,
  computeTicketAnnexImgBoxMm,
} from "./ticketImageLayout";
import { isPdfTicketDataUri_, rasterizePdfDataUriToJpegPages_ } from "./pdfTicketRasterize";
import { codPersonalFromName, resolveCodPersonalForSheet, paymentMethodCheckboxesHtml_, SHEET_FORMA_PAGO, normalizeFormaPago_, sortExpenseSheetLinesByDateInvoice_ } from "./expenseSheetMeta";
import { expenseSheetConceptLabel } from "./expenses";
import {
  baseFromTotalAndPct,
  computeIvaEur,
  defaultIvaPctForExpenseTipo,
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

/** Metadatos EU del proyecto Life (textos oficiales de plantilla Excel HHGG). */
export const LIFE_PROJECT_META = {
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS]: {
    projectLine: "Project 101148303 - LIFE23-NAT-PT-LIFE SOS PYGARGUS",
  },
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS]: {
    projectLine: "PROJECT: 101147372 – LIFE23-NAT-IT-Life Abilas",
  },
  [EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES]: {
    projectLine: "Project 101148254 LIFE23-NAT-BG-LIFE Rhodope Vulture",
  },
};

function stripOptionNumberPrefix_(value) {
  return String(value || "")
    .trim()
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function normProyecto_(value) {
  return stripOptionNumberPrefix_(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function templateFromProyectoText_(raw) {
  const p = normProyecto_(raw);
  if (!p) return "";
  if (p.includes("PYGARGUS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS;
  if (p.includes("ABILAS")) return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS;
  if (p.includes("RHODOPE") || (p.includes("LIFE") && p.includes("VULTURE"))) {
    return EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES;
  }
  return "";
}

export function resolveExpenseSheetTemplate(proyectoNombre, lineas) {
  const hit = templateFromProyectoText_(proyectoNombre);
  if (hit) return hit;

  const list = Array.isArray(lineas) ? lineas : [];
  for (const ln of list) {
    const fromLine = templateFromProyectoText_(
      ln?.proyecto || ln?.departamento_o_proyecto || ln?.proyecto_nombre || ""
    );
    if (fromLine) return fromLine;
  }
  return EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
}

export function isLifeExpenseSheetTemplate(templateId) {
  return (
    templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS ||
    templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS ||
    templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES
  );
}

function primaryProyectoLabel_(lineas) {
  const list = Array.isArray(lineas) ? lineas : [];
  for (const ln of list) {
    const p = stripOptionNumberPrefix_(ln?.proyecto || ln?.departamento_o_proyecto || ln?.proyecto_nombre || "");
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
    fecha_inicio: normalizeDateToDmy(ln.fecha_inicio || financial.fecha_inicio || "") || "",
    fecha_fin: normalizeDateToDmy(ln.fecha_fin || financial.fecha_fin || "") || "",
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

/**
 * MES/AÑO de cabecera LIFE: deben coincidir con la fecha del pie (fecha_hoja/fecha_firma).
 * Fallback: nº T-MM-AAAA-…; luego createdDate.
 */
function monthYearForLifeSheet_(sheetOrderText, createdDate, meta) {
  const fromFooter = monthYearFromDate_(meta?.fecha_firma || meta?.fecha_hoja || "");
  if (fromFooter.mes !== "__" && fromFooter.anio !== "____") return fromFooter;
  const m = String(sheetOrderText || "").trim().match(/^T-(\d{2})-(\d{4})-/i);
  if (m) return { mes: m[1], anio: m[2] };
  return monthYearFromDate_(createdDate);
}

function conceptoGrefaRow_(ln) {
  const concept = expenseSheetConceptLabel(ln);
  const plate = String(ln?.matricula || "").trim().toUpperCase();
  if (plate) return `${plate}: ${concept}`;
  return concept;
}

function lifeConceptLabel_(ln) {
  const tipo = String(ln?.tipo_gasto || "").trim().toUpperCase();
  // LIFE: concepto siempre en inglés (por tipo), sin caer al texto ES del detalle.
  const map = {
    COMBUSTIBLES: "Fuel",
    PEAJES: "Toll",
    PARKING: "Parking",
    DIETAS: "Subsistence",
    MANUTENCION: "Subsistence",
    HOSPEDAJE: "Hotel",
    CONSUMIBLES: "Consumables",
    ITV: "ITV",
    REPUESTOS_RECAMBIO: "Spare parts",
    MANTENIMIENTO_REPARACIONES: "Maintenance",
    MULTAS_SANCIONES: "Fine",
    SEGURO: "Insurance",
    IMPUESTOS: "Tax",
    OTROS_IMPUESTOS: "Other tax",
    KILOMETRAJE_COLABORADOR: "Mileage",
    OTROS: "Other",
  };
  if (map[tipo]) return map[tipo];
  const raw = String(ln?.concepto || "").trim();
  if (raw) return raw;
  return expenseSheetConceptLabel(ln).toUpperCase();
}

function formatLongDateEs_(dateStr) {
  const d = parseDateFlexible(dateStr);
  if (!d || !Number.isFinite(d.getTime())) return "";
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function signatureFooterLongDate_(fecha) {
  return formatLongDateEs_(fecha) || "________ de ________ de ________";
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
  const src = sortExpenseSheetLinesByDateInvoice_((Array.isArray(lines) ? lines : []).filter(sheetLineHasData_));
  const count = Math.max(minRows, src.length);
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(src[i] || {});
  return out;
}

function sheetLineFinancial_(ln) {
  if (!sheetLineHasData_(ln)) {
    return { base: 0, ivaPct: 0, ivaEur: 0, pagar: 0, empty: true, hasIva: false };
  }
  const pagar = parseExpenseNum(ln?.importe_pagar ?? ln?.importe ?? ln?.coste_total);
  let ivaPctRaw = ln?.iva_pct;
  if (!hasIvaPctValue(ivaPctRaw) && hasIvaPctValue(ln?.iva_porcentaje)) ivaPctRaw = ln.iva_porcentaje;
  if (!hasIvaPctValue(ivaPctRaw)) {
    const def = defaultIvaPctForExpenseTipo(ln?.tipo_gasto);
    if (def !== "") ivaPctRaw = def;
  }
  const ivaEurStored = parseExpenseNum(ln?.iva_eur) || parseExpenseNum(ln?.cuota_iva);
  const baseStored = parseExpenseNum(ln?.base_imponible) || parseExpenseNum(ln?.importe_sin_iva);
  if (hasIvaPctValue(ivaPctRaw) && pagar) {
    const pct = parseExpenseNum(ivaPctRaw);
    const base = baseStored || baseFromTotalAndPct(pagar, pct);
    const ivaEur = ivaEurStored || computeIvaEur(base, pct);
    const total = Number((base + ivaEur).toFixed(2));
    return { base, ivaPct: pct, ivaEur, pagar: pagar || total, empty: false, hasIva: true };
  }
  const base = baseStored || pagar;
  return { base, ivaPct: 0, ivaEur: 0, pagar: pagar || base, empty: false, hasIva: false };
}

function blankGrefaRowHtml_() {
  const cell = '<td style="border:1px solid #333; padding:5px 4px;">&nbsp;</td>';
  return `<tr>${cell.repeat(5)}</tr>`;
}

function blankLifeRowHtml_() {
  const cell = '<td style="border:1px solid #333; padding:3px; font-size:9px;">&nbsp;</td>';
  return `<tr>${cell.repeat(11)}</tr>`;
}

function sheetUsesTarjetaEmpresa_(meta) {
  return normalizeFormaPago_(meta?.forma_pago || meta?.sheet_meta?.forma_pago) === SHEET_FORMA_PAGO.TARJETA_EMPRESA;
}

/** Párrafo legal introductorio (genérico y LIFE): reembolso usuario vs tarjeta corporativa. */
function sheetDeclarationIntroInnerHtml_({ person, dni, total, proyecto, meta }) {
  const dniText = dni ? escapeHtmlValue(dni) : "________";
  const safePerson = escapeHtmlValue(person);
  const safeTotal = escapeHtmlValue(formatCurrencyEsValue(total));
  const safeProyecto = escapeHtmlValue(String(proyecto || "proyecto").trim());
  if (sheetUsesTarjetaEmpresa_(meta)) {
    return `D. <b>${safePerson}</b>, trabajador de GREFA con DNI ${dniText}, ha realizado los gastos que se detallan en la presente hoja,
      por un importe total de <b>${safeTotal} €</b>, correspondientes al proyecto ${safeProyecto}.
      Los gastos han sido abonados mediante tarjeta corporativa de GREFA, por lo que esta hoja se emite exclusivamente a efectos de
      justificación e imputación contable al proyecto.`;
  }
  return "";
}

function sheetDeclarationIntroHtml_({ person, dni, total, proyecto, meta, style = "font-size:9px; margin-bottom:8px; line-height:1.35;" }) {
  const inner = sheetDeclarationIntroInnerHtml_({ person, dni, total, proyecto, meta });
  if (!inner) return "";
  return `<div style="${style}">${inner}</div>`;
}

function sheetReceiptSignatureFooterHtml_({ totalFormatted, person, meta, fontSizeReceipt = "9px", fontSizeSign = "10px", grefaStamp = false }) {
  const fechaRaw = meta?.fecha_firma || meta?.fecha_hoja || "";
  const firmaDate = escapeHtmlValue(signatureFooterLongDate_(fechaRaw));
  const safePerson = escapeHtmlValue(person);
  const safeTotal = escapeHtmlValue(totalFormatted);
  const payHtml = paymentMethodCheckboxesHtml_(meta?.forma_pago, fontSizeReceipt, { stacked: true });
  const receivedHtml = sheetUsesTarjetaEmpresa_(meta)
    ? ""
    : `<div style="margin-top:10px; font-size:${fontSizeReceipt};">He recibido la cantidad de ${safeTotal} € por los gastos incurridos en el viaje descrito*.</div>`;
  return `
  <div class="sheet-footer" style="margin-top:12px; page-break-inside:avoid;">
  ${receivedHtml}
  ${payHtml}
  <div style="margin-top:12px; font-size:${fontSizeSign};">Y para que así conste firmo el presente en Majadahonda a ${firmaDate}.</div>
  <div style="margin-top:16px; font-size:${fontSizeSign};"><b>Fdo:</b> ${safePerson}</div>
  ${grefaStamp ? `<div style="margin-top:20px; font-size:12px;">Sello de GREFA</div>` : ""}
  </div>`;
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
  const rawSrc = String(att?.dataUri || att?.url || "");
  const isPdf = isPdfTicketDataUri_(rawSrc, att?.mime);

  // PDF sin rasterizar: enlace de respaldo (web debería rasterizar antes).
  if (isPdf && !rawSrc.startsWith("data:image/")) {
    const openHref = attrSrcValue_(String(att?.url || (rawSrc.startsWith("data:") ? "" : rawSrc) || ""));
    return `<div class="ticket-annex-page" style="page-break-before:always;page-break-after:always;page-break-inside:avoid;width:210mm;height:297mm;margin:0;padding:12mm;box-sizing:border-box;font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;text-align:center;">${title}</div>
      <div style="font-size:12px;text-align:center;line-height:1.4;max-width:160mm;">
        No se pudo embeber este PDF del tiquet. Ábrelo desde el enlace si está disponible.
      </div>
      ${openHref && !String(openHref).startsWith("data:") ? `<p style="font-size:12px;margin-top:12px;"><a href="${openHref}" target="_blank" rel="noopener">Abrir PDF del tiquet</a></p>` : ""}
    </div>`;
  }

  // Solo max-width/max-height (width/height auto): evita distorsión y dobles renders al imprimir.
  const maxW = TICKET_ANNEX_PAGE_W_MM;
  const maxH = TICKET_ANNEX_PAGE_H_MM;
  let maxStyle = `max-width:${maxW}mm;max-height:${maxH}mm;`;
  if (naturalSize?.width && naturalSize?.height) {
    const fit = computeTicketAnnexImgBoxMm(naturalSize.width, naturalSize.height, { hasTitle: false });
    const wMm = Math.max(1, Number(fit.width) || 1);
    const hMm = Math.max(1, Number(fit.height) || 1);
    maxStyle = `max-width:${Math.min(maxW, wMm)}mm;max-height:${Math.min(maxH, hMm)}mm;`;
  }

  return `<div class="ticket-annex-page" style="page-break-before:always;page-break-after:always;page-break-inside:avoid;width:210mm;height:297mm;margin:0;padding:${TICKET_PDF_MARGIN_MM}mm;box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;">
    <img src="${src}" alt="${title}" style="display:block;width:auto;height:auto;${maxStyle}object-fit:contain;object-position:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />
  </div>`;
}

/** Anexo solo con enlaces a tiquets/facturas (sin embeber imagen ni PDF). */
export function buildTicketLinksAnnexHtml(linkRows) {
  const list = Array.isArray(linkRows) ? linkRows.filter((r) => String(r?.url || "").trim()) : [];
  if (!list.length) return "";
  const items = list
    .map((r, idx) => {
      const label = escapeHtmlValue(String(r?.label || `Tiquet ${idx + 1}`).trim());
      const href = attrSrcValue_(String(r.url || "").trim());
      const kind = String(r?.kind || "").trim().toLowerCase() === "pdf" ? "PDF" : "imagen";
      const metaBits = [r?.fecha ? `fecha ${escapeHtmlValue(formatDateEsValue(r.fecha))}` : "", r?.numero_factura ? `nº ${escapeHtmlValue(String(r.numero_factura).trim())}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<li style="margin:0 0 8px 0; font-size:11px; line-height:1.35;">
        <b>${idx + 1}. ${label}</b>${metaBits ? ` <span style="color:#444;">(${metaBits})</span>` : ""}
        — ${kind}: <a href="${href}" target="_blank" rel="noopener">${escapeHtmlValue(String(r.url || "").trim())}</a>
      </li>`;
    })
    .join("");
  return `<div class="ticket-links-annex" style="page-break-before:always;padding:16px 18px;font-family:Arial,sans-serif;color:#111;">
    <h3 style="margin:0 0 10px 0;font-size:14px;">Tiquets y facturas (enlaces)</h3>
    <p style="margin:0 0 12px 0;font-size:11px;line-height:1.35;">
      Los comprobantes no se embeben en este PDF. Abre cada enlace para ver la imagen o el PDF original.
    </p>
    <ol style="margin:0;padding-left:18px;">${items}</ol>
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
    const isPdf = isPdfTicketDataUri_(src, att?.mime);
    if (isPdf && src.startsWith("data:application/pdf")) {
      const jpegPages = await rasterizePdfDataUriToJpegPages_(src, { scale: 2 });
      if (jpegPages.length) {
        for (let p = 0; p < jpegPages.length; p += 1) {
          const imgUri = jpegPages[p];
          let naturalSize = null;
          try {
            naturalSize = await loadTicketImageNaturalSize_(imgUri);
          } catch {
            naturalSize = null;
          }
          const label =
            jpegPages.length > 1
              ? `${String(att?.label || `Ticket ${idx + 1}`).trim()} (pág. ${p + 1})`
              : att?.label || `Ticket ${idx + 1}`;
          pages.push(
            buildTicketAttachmentPageHtml_(
              { ...att, label, dataUri: imgUri, mime: "image/jpeg", url: att?.url || "" },
              idx,
              naturalSize
            )
          );
        }
        continue;
      }
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
  const logoSello = String(logos?.grefaSello || "").trim();
  const dni = String(meta?.dni || "").trim();
  const dniCell = dni ? escapeHtmlValue(dni) : "___________";
  const proyectoHdr = escapeHtmlValue(primaryProyectoLabel_(lines) || "proyecto");
  const dataLines = normalizeSheetLinesForPrint_(lines).filter(sheetLineHasData_);
  const tableLines = padSheetTableLines_(normalizeSheetLinesForPrint_(lines), 12);
  const total =
    dataLines.reduce((acc, ln) => acc + sheetLineFinancial_(ln).pagar, 0) || Number(totalFallback || 0) || 0;
  const metaWithDate = {
    ...(meta && typeof meta === "object" ? meta : {}),
    fecha_firma: meta?.fecha_firma || meta?.fecha_hoja || createdDate,
  };

  const rowsHtml = tableLines
    .map((ln) => {
      if (!sheetLineHasData_(ln)) return blankGrefaRowHtml_();
      return `<tr>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(conceptoGrefaRow_(ln))}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(String(ln?.entidad || "").trim())}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(sanitizeInvoiceNumberText(ln?.numero_factura))}</td>
        <td style="border:1px solid #333; padding:5px 4px; vertical-align:middle;">${escapeHtmlValue(formatDateEsValue(ln?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:5px 4px; text-align:right; vertical-align:middle;">${escapeHtmlValue(formatCurrencyEsValue(sheetLineFinancial_(ln).pagar))} €</td>
      </tr>`;
    })
    .join("");

  return `<html><body style="font-family:Arial,sans-serif; color:#111; padding:22px; font-size:12px;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">
    <div style="width:140px;">${logoGrefa ? `<img src="${attrSrcValue_(logoGrefa)}" style="width:120px; height:auto;" />` : ""}</div>
    <div style="text-align:right; font-size:12px; line-height:1.5;">
      <div><b>Nº ORDEN</b> ${escapeHtmlValue(sheetOrderText || "")}</div>
      <div style="margin-top:6px;">${proyectoHdr}</div>
    </div>
  </div>
  <h2 style="margin:10px 0 2px 0; font-size:19px; text-align:center;">RELACIÓN DE GASTOS</h2>
  <div style="font-size:13px; font-weight:700; margin-bottom:14px; text-align:center;">COMBUSTIBLE, DIETAS, CONSUMIBLES y OTROS COSTES</div>
  ${
    sheetUsesTarjetaEmpresa_(meta)
      ? sheetDeclarationIntroHtml_({ person, dni, total, proyecto: proyectoHdr, meta, style: "font-size:13px; margin-bottom:14px; line-height:1.45;" })
      : `<div style="font-size:13px; margin-bottom:14px; line-height:1.45;">
    Se abona a D. <b>${escapeHtmlValue(person)}</b> con D.N.I. ${dniCell} la cantidad
    de <b>${escapeHtmlValue(formatCurrencyEsValue(total))} euros</b> con transferencia a su cuenta, por haber incurrido en los gastos
    siguientes:
  </div>`
  }
  <table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;">
    <thead><tr>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px; width:28%;">Concepto</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px; width:28%;">Entidad</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px; width:16%;">Nº Factura</th>
      <th style="border:1px solid #333; text-align:left; padding:6px 4px; width:14%;">Fecha</th>
      <th style="border:1px solid #333; text-align:right; padding:6px 4px; width:14%;">Importe</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${sheetReceiptSignatureFooterHtml_({
    totalFormatted: formatCurrencyEsValue(total),
    person,
    meta: metaWithDate,
    fontSizeReceipt: "12px",
    fontSizeSign: "12px",
    grefaStamp: true,
  })}
  ${logoSello ? `<div style="margin-top:8px;"><img src="${attrSrcValue_(logoSello)}" style="width:110px; height:auto;" /></div>` : ""}
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
  const codPersonal = resolveCodPersonalForSheet({
    usuarioRecord: meta?.usuarioRecord,
    nombre: person || meta?.usuario_nombre || "",
    codPersonal: meta?.cod_personal,
  }) || String(meta?.cod_personal || "").trim() || codPersonalFromName(person);
  const dni = String(meta?.dni || "").trim();
  const { mes, anio } = monthYearForLifeSheet_(sheetOrderText, createdDate, meta);
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
      const concepto = lifeConceptLabel_(ln);
      const numPers = String(lifeSheetNumPersonasFromExpense(ln, ln) || ln?.num_personas || "").trim();
      return `<tr>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(concepto)}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.work_package || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.accion_proyecto || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${numPers ? escapeHtmlValue(numPers) : ""}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(String(ln?.entidad || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(sanitizeInvoiceNumberText(ln?.numero_factura))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(formatDateEsValue(ln?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.base))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${fin.hasIva ? `${fin.ivaPct}%` : ""}</td>
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
    <div style="flex:1; text-align:left;">${logoLife ? `<img src="${attrSrcValue_(logoLife)}" style="max-height:52px; max-width:160px;" />` : ""}</div>
    <div style="flex:1; text-align:center;">${logoGrefa ? `<img src="${attrSrcValue_(logoGrefa)}" style="max-height:48px; max-width:130px;" />` : ""}</div>
    <div style="flex:1; text-align:right;">${logoEu ? `<img src="${attrSrcValue_(logoEu)}" style="max-height:48px; max-width:150px;" />` : ""}</div>
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
    ${
      sheetUsesTarjetaEmpresa_(meta)
        ? sheetDeclarationIntroInnerHtml_({
            person,
            dni,
            total: totalPagar,
            proyecto: lifeMeta.projectLine,
            meta,
          })
        : `D./Dña <b>${escapeHtmlValue(person)}</b> trabajador de GREFA, con DNI ${dniText} ha recibido de GREFA, la cantidad de
    <b>${escapeHtmlValue(formatCurrencyEsValue(totalPagar))} €</b> por haber incurrido en los gastos siguientes, dentro del proyecto
    ${escapeHtmlValue(lifeMeta.projectLine)}.`
    }
  </div>
  <table style="width:100%; border-collapse:collapse; font-size:9px; margin-bottom:6px; table-layout:fixed;">
    <tr>
      <td colspan="2" style="border:1px solid #333; padding:3px;"><b>FECHA INICIO</b> ${escapeHtmlValue(formatDateEsValue(trip.fecha_inicio || ""))}</td>
      <td colspan="3" style="border:1px solid #333; padding:3px;"><b>FECHA FIN</b> ${escapeHtmlValue(formatDateEsValue(trip.fecha_fin || ""))}</td>
    </tr>
    <tr>
      <td style="border:1px solid #333; padding:3px; width:20%;"><b>ORIGEN</b> ${escapeHtmlValue(String(trip.origen || ""))}</td>
      <td style="border:1px solid #333; padding:3px; width:20%;"><b>DESTINO 1</b> ${escapeHtmlValue(String(trip.destino1 || ""))}</td>
      <td style="border:1px solid #333; padding:3px; width:20%;"><b>DESTINO 2</b> ${escapeHtmlValue(String(trip.destino2 || ""))}</td>
      <td style="border:1px solid #333; padding:3px; width:20%;"><b>DESTINO 3</b> ${escapeHtmlValue(String(trip.destino3 || ""))}</td>
      <td style="border:1px solid #333; padding:3px; width:20%;"><b>DESTINO 4</b> ${escapeHtmlValue(String(trip.destino4 || ""))}</td>
    </tr>
    <tr>
      <td colspan="5" style="border:1px solid #333; padding:3px;"><b>MOTIVO</b> ${escapeHtmlValue(String(trip.motivo || ""))}</td>
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

function blankLifeOtrosRowHtml_() {
  const cell = '<td style="border:1px solid #333; padding:3px; font-size:9px;">&nbsp;</td>';
  return `<tr>${cell.repeat(10)}</tr>`;
}

/** Plantilla LIFE «Otros / consumibles» (ref. consumibles.xlsx): sin bloque viaje; WP→Acción→Concepto… */
export function buildLifeOtrosConsumiblesSheetHtml({
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
  const codPersonal =
    resolveCodPersonalForSheet({
      usuarioRecord: meta?.usuarioRecord,
      nombre: person || meta?.usuario_nombre || "",
      codPersonal: meta?.cod_personal,
    }) ||
    String(meta?.cod_personal || "").trim() ||
    codPersonalFromName(person);
  const dni = String(meta?.dni || "").trim();
  const { mes, anio } = monthYearForLifeSheet_(sheetOrderText, createdDate, meta);
  const tableLines = padSheetTableLines_(normalizeSheetLinesForPrint_(lines));
  let totalBase = 0;
  let totalIva = 0;
  let totalPagar = 0;

  const rowsHtml = tableLines
    .map((ln) => {
      if (!sheetLineHasData_(ln)) return blankLifeOtrosRowHtml_();
      const fin = sheetLineFinancial_(ln);
      totalBase += fin.base;
      totalIva += fin.ivaEur;
      totalPagar += fin.pagar;
      const concepto = String(ln?.concepto_otros_gastos || ln?.concepto || ln?.tipo_gasto || "").trim() || expenseSheetConceptLabel(ln);
      return `<tr>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.work_package || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${escapeHtmlValue(String(ln?.accion_proyecto || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(concepto)}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(String(ln?.entidad || "").trim())}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(sanitizeInvoiceNumberText(ln?.numero_factura))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px;">${escapeHtmlValue(formatDateEsValue(ln?.fecha || ""))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.base))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:center;">${fin.hasIva ? `${fin.ivaPct}%` : ""}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.ivaEur))}</td>
        <td style="border:1px solid #333; padding:3px; font-size:9px; text-align:right;">${escapeHtmlValue(formatCurrencyEsValue(fin.pagar))}</td>
      </tr>`;
    })
    .join("");

  if (!totalPagar) totalPagar = Number(totalFallback || 0) || 0;
  const dniText = dni ? escapeHtmlValue(dni) : "________";

  return `<html><body style="font-family:Arial,sans-serif; color:#111; padding:14px; font-size:10px;">
  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
    <div style="flex:1; text-align:left;">${logoLife ? `<img src="${attrSrcValue_(logoLife)}" style="max-height:52px; max-width:160px;" />` : ""}</div>
    <div style="flex:1; text-align:center;">${logoGrefa ? `<img src="${attrSrcValue_(logoGrefa)}" style="max-height:48px; max-width:130px;" />` : ""}</div>
    <div style="flex:1; text-align:right;">${logoEu ? `<img src="${attrSrcValue_(logoEu)}" style="max-height:48px; max-width:150px;" />` : ""}</div>
  </div>
  <div style="text-align:center; font-weight:700; font-size:11px; margin:6px 0;">HOJA DE GASTOS DE CONSUMIBLES</div>
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
    ${
      sheetUsesTarjetaEmpresa_(meta)
        ? sheetDeclarationIntroInnerHtml_({
            person,
            dni,
            total: totalPagar,
            proyecto: lifeMeta.projectLine,
            meta,
          })
        : `D./Dña <b>${escapeHtmlValue(person)}</b> trabajador de GREFA, con DNI ${dniText} ha recibido de GREFA, la cantidad de
    <b>${escapeHtmlValue(formatCurrencyEsValue(totalPagar))} €</b> por haber incurrido en los gastos siguientes, dentro del proyecto
    ${escapeHtmlValue(lifeMeta.projectLine)}.`
    }
  </div>
  <table style="width:100%; border-collapse:collapse; font-size:8px;">
    <thead><tr>
      <th style="border:1px solid #333; padding:2px;">WORK PACKAGE</th>
      <th style="border:1px solid #333; padding:2px;">ACCIÓN DEL PROYECTO</th>
      <th style="border:1px solid #333; padding:2px;">CONCEPTO</th>
      <th style="border:1px solid #333; padding:2px;">ENTIDAD</th>
      <th style="border:1px solid #333; padding:2px;">Nº FACTURA</th>
      <th style="border:1px solid #333; padding:2px;">FECHA</th>
      <th style="border:1px solid #333; padding:2px;">Base</th>
      <th style="border:1px solid #333; padding:2px;">IVA %</th>
      <th style="border:1px solid #333; padding:2px;">IVA €</th>
      <th style="border:1px solid #333; padding:2px;">CANT. PAGAR</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tr>
      <td colspan="6" style="border:1px solid #333; padding:3px; text-align:right;"><b>TOTALES</b></td>
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
  const sheetFamily = String(options?.sheetFamily || options?.meta?.hoja_gasto_familia || "").trim().toUpperCase();
  let body;
  if (templateId === EXPENSE_SHEET_TEMPLATE.GREFA_RELACION) {
    body = buildGrefaRelacionGastosHtml(options);
  } else if (sheetFamily === "OTROS" || sheetFamily === "LIFE_OTROS") {
    body = buildLifeOtrosConsumiblesSheetHtml({ ...options, templateId });
  } else {
    body = buildLifeEmgExpenseSheetHtml({ ...options, templateId });
  }
  const tickets = buildTicketAttachmentsHtml(options?.ticketAttachments);
  if (!tickets) return body;
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${tickets}</body>`);
  return `${body}${tickets}`;
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
