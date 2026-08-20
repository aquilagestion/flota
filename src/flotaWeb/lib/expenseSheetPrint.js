import {
  buildTicketAttachmentsForLines_,
  lineMetaKey_,
  mergeLineMetaIntoLineas_,
  resolveViajeForExpenseSheetPrint_,
  sortExpenseSheetLinesByDateInvoice_,
} from "./expenseSheetMeta";
import {
  buildExpenseSheetPrintHtml,
  buildTicketAttachmentsHtmlAsync,
  isLifeExpenseSheetTemplate,
  resolveExpenseSheetTemplate,
} from "./expenseSheetTemplates";
import { loadExpenseSheetLogosForTemplate, uriToDataUriIfLocal_ } from "./expenseSheetLogos";
import { hydrateTicketAttachmentsViaApi_, mapServerTicketAttachments_ } from "./expenseTicketResolve";
import {
  enrichSheetLineaFromExpense,
  HOJA_GASTO_MODELO_PROPIO,
  resolveExpenseSheetModel,
} from "./ownVehicleColaborador";
import { buildOwnVehicleModelHtml } from "./expenses";
import { normalizeDateToDmy } from "./format";
import { resolveLifeSheetFamilyFromRows_ } from "./lifeOtrosSheet";

function expenseRecordByKey_(expenseList) {
  const byKey = new Map();
  for (const item of expenseList || []) {
    const raw = item?.raw && typeof item.raw === "object" ? item.raw : item;
    if (!raw || typeof raw !== "object") continue;
    for (const k of [raw.id_gasto, item?.id_gasto, item?.sourceExpenseId, item?.id, raw.id, raw.local_id]) {
      const key = String(k || "").trim();
      if (key) byKey.set(key, raw);
    }
  }
  return byKey;
}

export function enrichLinesWithExpensesForPrint_(lines, expenseList) {
  const byKey = expenseRecordByKey_(expenseList);
  return (Array.isArray(lines) ? lines : []).map((ln) => {
    const key = lineMetaKey_(ln);
    const raw =
      byKey.get(key) ||
      byKey.get(String(ln?.expense_id || "").trim()) ||
      byKey.get(String(ln?.id_gasto || "").trim()) ||
      ln;
    return enrichSheetLineaFromExpense(ln, raw);
  });
}

function ticketAttKey_(t) {
  const fileId = String(t?.file_id || "").trim();
  if (fileId) return `id:${fileId}`;
  const dataUri = String(t?.dataUri || "").trim();
  if (dataUri.startsWith("data:")) return `data:${dataUri.slice(0, 80)}:${dataUri.length}`;
  return `url:${String(t?.url || "").trim()}`;
}

/**
 * Une adjuntos: orden = primary (líneas); extras rellenan dataUri/url sin duplicar.
 */
function mergeTicketAttachmentLists_(primary, ...extras) {
  const byKey = new Map();
  const ordered = [];
  const pushUnique = (t) => {
    if (!t || typeof t !== "object") return;
    if (!String(t.dataUri || "").trim() && !String(t.url || "").trim() && !String(t.file_id || "").trim()) {
      return;
    }
    const key = ticketAttKey_(t);
    if (!key || key === "url:" || key === "id:" || key === "data::0") return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, t);
      ordered.push(t);
      return;
    }
    const prevHasData = String(prev.dataUri || "").startsWith("data:");
    const nextHasData = String(t.dataUri || "").startsWith("data:");
    const merged =
      !prevHasData && nextHasData
        ? { ...prev, ...t }
        : { ...t, ...prev, dataUri: prev.dataUri || t.dataUri, url: prev.url || t.url };
    byKey.set(key, merged);
    const idx = ordered.indexOf(prev);
    if (idx >= 0) ordered[idx] = merged;
  };
  for (const t of Array.isArray(primary) ? primary : []) pushUnique(t);
  for (const list of extras) {
    for (const t of Array.isArray(list) ? list : []) pushUnique(t);
  }
  return ordered;
}

export async function buildExpenseSheetPrintHtmlAsync({
  sheetOrderText,
  person,
  createdDate,
  lines,
  totalFallback,
  meta,
  expenses,
  uriToDataUri = uriToDataUriIfLocal_,
  loadLogos = loadExpenseSheetLogosForTemplate,
  resolveTripDetail,
  ticketAttachments: ticketAttachmentsOverride,
  apiGet,
  userEmail,
  embedTicketAnnexInHtml = false,
}) {
  const expenseList = Array.isArray(expenses) ? expenses : [];
  const sortedLines = sortExpenseSheetLinesByDateInvoice_(lines);
  const enriched = enrichLinesWithExpensesForPrint_(sortedLines, expenseList.length ? expenseList : sortedLines);
  const viaje = await resolveViajeForExpenseSheetPrint_(
    enriched,
    expenseList.length ? expenseList : enriched,
    resolveTripDetail,
    { viajeHint: meta?.viaje }
  );
  // Prioridad: viaje resuelto (API / líneas) sobre snapshot local meta.viaje (puede estar desfasado).
  const fechaInicioViaje = String(
    viaje?.fecha_viaje || viaje?.fecha_inicio || meta?.viaje?.fecha_viaje || meta?.viaje?.fecha_inicio || ""
  ).trim();
  const fechaCierreViaje = String(
    viaje?.fecha_cierre || viaje?.fecha_fin || meta?.viaje?.fecha_cierre || meta?.viaje?.fecha_fin || ""
  ).trim();
  const viajeForPrint = {
    ...viaje,
    fecha_inicio:
      normalizeDateToDmy(fechaInicioViaje) ||
      normalizeDateToDmy(viaje?.fecha_inicio || "") ||
      "",
    fecha_fin:
      normalizeDateToDmy(fechaCierreViaje) ||
      normalizeDateToDmy(viaje?.fecha_fin || viaje?.fecha_cierre || "") ||
      "",
    fecha_viaje:
      normalizeDateToDmy(fechaInicioViaje) ||
      normalizeDateToDmy(viaje?.fecha_viaje || viaje?.fecha_inicio || "") ||
      "",
    fecha_cierre:
      normalizeDateToDmy(fechaCierreViaje) ||
      normalizeDateToDmy(viaje?.fecha_cierre || viaje?.fecha_fin || "") ||
      "",
  };
  const proyectoHint =
    enriched.map((ln) => String(ln?.proyecto || ln?.departamento_o_proyecto || ln?.proyecto_nombre || "").trim()).find(Boolean) || "";
  const templateId = resolveExpenseSheetTemplate(proyectoHint, enriched);
  const isLife = isLifeExpenseSheetTemplate(templateId);
  const sheetFamily = isLife ? resolveLifeSheetFamilyFromRows_(enriched) : "NONE";
  const sheetModel = resolveExpenseSheetModel(enriched, meta || {});
  // LIFE siempre usa plantilla LIFE (Excel HHGG). Liquidación km colaborador solo fuera de LIFE.
  const isOwnVehicle = !isLife && sheetModel === HOJA_GASTO_MODELO_PROPIO;
  const logos = isOwnVehicle
    ? { grefa: "", grefaSello: "", lifeProject: "", lifeNatura: "" }
    : await loadLogos(templateId);

  const serverTickets = mapServerTicketAttachments_(ticketAttachmentsOverride);
  const lineTickets = await buildTicketAttachmentsForLines_(
    enriched,
    expenseList.length ? expenseList : enriched,
    uriToDataUri
  );
  let ticketAttachments = mergeTicketAttachmentLists_(lineTickets, serverTickets);
  ticketAttachments = await hydrateTicketAttachmentsViaApi_(ticketAttachments, { apiGet, userEmail });
  ticketAttachments = ticketAttachments.filter((t) => String(t?.dataUri || "").startsWith("data:"));

  let ticketAnnexHtml = "";
  if (embedTicketAnnexInHtml && ticketAttachments.length) {
    ticketAnnexHtml = await buildTicketAttachmentsHtmlAsync(ticketAttachments);
  }
  const printOpts = {
    sheetOrderText,
    person,
    createdDate,
    lines: enriched,
    totalFallback,
    logos,
    sheetFamily: sheetFamily === "OTROS" ? "OTROS" : sheetFamily === "TRAVEL" ? "TRAVEL" : "",
    meta: {
      ...(meta || {}),
      viaje: sheetFamily === "OTROS" ? {} : viajeForPrint,
      hoja_gasto_familia: sheetFamily === "OTROS" ? "OTROS" : sheetFamily === "TRAVEL" ? "TRAVEL" : "",
    },
    ticketAttachments: [],
  };
  const htmlBody = isOwnVehicle
    ? buildOwnVehicleModelHtml(printOpts)
    : buildExpenseSheetPrintHtml({ ...printOpts, templateId });
  let html = htmlBody;
  let annexActuallyEmbedded = false;
  if (ticketAnnexHtml) {
    if (/<\/body>/i.test(htmlBody)) {
      html = htmlBody.replace(/<\/body>/i, `${ticketAnnexHtml}</body>`);
      annexActuallyEmbedded = true;
    } else {
      html = `${htmlBody}${ticketAnnexHtml}`;
      annexActuallyEmbedded = true;
    }
  }
  return {
    html,
    ticketAttachments,
    ticketAnnexEmbedded: annexActuallyEmbedded,
    sheetModel,
    templateId,
    sheetFamily,
  };
}

export function mergeStoredMetaIntoLines_(lines, storedMeta, expenseByKey) {
  return mergeLineMetaIntoLineas_(lines, storedMeta, expenseByKey);
}
