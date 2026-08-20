import { parseTicketUrlsFromRecord } from "./expenseSheetTickets";
import { notificationEmailsInclude_ } from "./solicitudSla";
import { isPendingUserPaidExpense } from "../../flotaWeb/lib/expenses";

export function currentMonthRangeMs_() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function isInCurrentMonth_(dateValue, parseDateMs) {
  const t = typeof parseDateMs === "function" ? parseDateMs(dateValue) : 0;
  if (!t) return false;
  const { startMs, endMs } = currentMonthRangeMs_();
  return t >= startMs && t <= endMs;
}

export function expenseHasTicket_(raw) {
  const tipo = String(raw?.tipo_gasto || "")
    .trim()
    .toUpperCase();
  if (tipo === "KILOMETRAJE_COLABORADOR") return true;
  const urls = parseTicketUrlsFromRecord(raw);
  if (urls.length > 0) return true;
  const locals = Array.isArray(raw?.ticketLocalUris) ? raw.ticketLocalUris : [];
  return locals.some((u) => String(u || "").trim());
}

export function expenseNeedsSheet_(raw) {
  return isPendingUserPaidExpense(raw);
}

export function buildOutboxExpenseLocalIds_(outbox) {
  const set = new Set();
  for (const j of outbox || []) {
    if (j?.kind !== "expense" && j?.kind !== "expense_update") continue;
    const lid = String(j?.payload?.local_id || j?.payload?.id || "").trim();
    if (lid) set.add(lid);
  }
  return set;
}

export function expenseIsSynced_(raw, outboxExpenseIds) {
  const remoteId = String(raw?.id_gasto || "").trim();
  if (remoteId) return true;
  const localId = String(raw?.id || raw?.local_id || "").trim();
  if (localId && outboxExpenseIds && outboxExpenseIds.has(localId)) return false;
  return false;
}

export function expenseSupervisionWarnings_(raw, outboxExpenseIds) {
  const warnings = [];
  if (!expenseHasTicket_(raw)) warnings.push("Sin ticket");
  if (expenseNeedsSheet_(raw)) warnings.push("Sin hoja");
  if (!expenseIsSynced_(raw, outboxExpenseIds)) warnings.push("No sincronizado");
  return warnings;
}

export function collectAssignedPlatesFromFlota_(flota, userEmail) {
  const me = String(userEmail || "").trim().toLowerCase();
  const rows = Array.isArray(flota) ? flota : [];
  const mine = rows.filter((v) => {
    const resp = String(v?.responsable || "").trim().toLowerCase();
    const notifyRaw = String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "").trim();
    if (notificationEmailsInclude_(notifyRaw, me)) return true;
  });
  return new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
}

export function expensePlate_(raw) {
  return String(raw?.matricula || raw?.vehiclePlate || "").trim().toUpperCase();
}

export function expenseProject_(raw) {
  const v = raw?.departamento_o_proyecto;
  if (v === "__OTRO__") return String(raw?.departamento_o_proyecto_custom || "").trim();
  return String(v || raw?.proyecto_nombre || "").trim();
}
