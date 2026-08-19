import {
  buildTicketAttachmentsForLines_,
  lineMetaKey_,
  mergeLineMetaIntoLineas_,
  resolveViajeForExpenseSheetPrint_,
} from "./expenseSheetMeta";
import {
  buildExpenseSheetPrintHtml,
  buildTicketAttachmentsHtmlAsync,
  resolveExpenseSheetTemplate,
} from "./expenseSheetTemplates";
import { loadExpenseSheetLogosForTemplate, uriToDataUriIfLocal_ } from "./expenseSheetLogos";
import { hydrateTicketAttachmentsViaApi_, mapServerTicketAttachments_ } from "./expenseTicketResolve";
import { enrichSheetLineaFromExpense } from "./ownVehicleColaborador";

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
  const enriched = enrichLinesWithExpensesForPrint_(lines, expenseList.length ? expenseList : lines);
  const viaje = await resolveViajeForExpenseSheetPrint_(
    enriched,
    expenseList.length ? expenseList : enriched,
    resolveTripDetail,
    { viajeHint: meta?.viaje }
  );
  const proyectoHint =
    enriched.map((ln) => String(ln?.proyecto || ln?.departamento_o_proyecto || "").trim()).find(Boolean) || "";
  const templateId = resolveExpenseSheetTemplate(proyectoHint, enriched);
  const logos = await loadLogos(templateId);
  const serverTickets = mapServerTicketAttachments_(ticketAttachmentsOverride);
  let ticketAttachments = serverTickets.length
    ? serverTickets
    : await buildTicketAttachmentsForLines_(enriched, expenseList.length ? expenseList : enriched, uriToDataUri);
  ticketAttachments = await hydrateTicketAttachmentsViaApi_(ticketAttachments, { apiGet, userEmail });
  ticketAttachments = ticketAttachments.filter((t) => String(t?.dataUri || "").startsWith("data:"));
  let ticketAnnexHtml = "";
  if (embedTicketAnnexInHtml && ticketAttachments.length) {
    ticketAnnexHtml = await buildTicketAttachmentsHtmlAsync(ticketAttachments);
  }
  const htmlBody = buildExpenseSheetPrintHtml({
    templateId,
    sheetOrderText,
    person,
    createdDate,
    lines: enriched,
    totalFallback,
    logos,
    meta: {
      ...(meta || {}),
      viaje,
    },
    ticketAttachments: [],
  });
  const html = ticketAnnexHtml
    ? htmlBody.replace("</body></html>", `${ticketAnnexHtml}</body></html>`)
    : htmlBody;
  return {
    html,
    ticketAttachments: embedTicketAnnexInHtml ? [] : ticketAttachments,
  };
}

export function mergeStoredMetaIntoLines_(lines, storedMeta, expenseByKey) {
  return mergeLineMetaIntoLineas_(lines, storedMeta, expenseByKey);
}
