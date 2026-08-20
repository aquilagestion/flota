import { Alert } from "react-native";
import {
  expenseHasTicket_,
  expenseIsSynced_,
  expensePlate_,
  expenseProject_,
  buildOutboxExpenseLocalIds_,
} from "./expenseSupervision";
import { collectLifeSheetMixBlocks_ } from "../../flotaWeb/lib/lifeOtrosSheet";
import { formatDateEsValue } from "../../flotaWeb/lib/format";

function formatAmountLabel_(raw, row) {
  const n = Number(
    row?.amount ?? raw?.importe_pagar ?? raw?.coste_total ?? raw?.importe ?? NaN
  );
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)} €`;
}

function rowLabel_(row) {
  const raw = row?.raw || row;
  const tipo = String(row?.type || raw?.tipo_gasto || "Gasto").trim();
  const fechaRaw = String(row?.date || raw?.fecha || "").trim();
  const fecha = fechaRaw ? formatDateEsValue(fechaRaw) : "";
  const amount = formatAmountLabel_(raw, row);
  const plate = String(row?.plate || expensePlate_(raw) || "").trim();
  const id = String(raw?.id_gasto || row?.id || raw?.id || raw?.local_id || "").trim();
  const parts = [tipo];
  if (fecha && fecha !== "-") parts.push(fecha);
  if (amount) parts.push(amount);
  if (plate) parts.push(plate);
  if (id) parts.push(`id ${id}`);
  return parts.filter(Boolean).join(" · ") || "Gasto";
}

/** Campo de factura/ticket por tipo de gasto (mismo criterio que invoiceFromExpense_ en ExpenseSheetsScreen). */
const INVOICE_FIELD_BY_TIPO_ = {
  COMBUSTIBLES: "numero_ticket",
  MANTENIMIENTO_REPARACIONES: "numero_factura_mantenimiento",
  REPUESTOS_RECAMBIO: "numero_factura_repuestos",
  ITV: "numero_factura_itv",
  GASTOS_BILLETES: "numero_reserva_billete",
  OTROS: "numero_factura_otros",
  HOSPEDAJE: "numero_factura_otros",
  MANUTENCION: "numero_factura_otros",
  PEAJES: "numero_factura_peaje",
};

/**
 * @returns {string|null} Nº de factura/ticket, o null si el tipo no exige ese campo
 * (p. ej. PARKING/SEGURO se resuelven con placeholder fijo en invoiceFromExpense_).
 */
function invoiceNumberForExpense_(raw) {
  const tipo = String(raw?.tipo_gasto || "").trim().toUpperCase();
  const field = INVOICE_FIELD_BY_TIPO_[tipo];
  if (!field) return null;
  return String(raw?.[field] || "").trim();
}

/**
 * Gastos seleccionados que BLOQUEAN la creación de la hoja:
 * - sin número de factura/ticket (tipos que lo exigen)
 * - sin ticket/factura adjunto (excepto KILOMETRAJE_COLABORADOR)
 */
export function collectSheetCreationBlocks_(selectedRows) {
  const blocks = [];
  for (const row of selectedRows || []) {
    const raw = row?.raw || row;
    const tipo = String(raw?.tipo_gasto || row?.type || "")
      .trim()
      .toUpperCase();
    if (tipo === "KILOMETRAJE_COLABORADOR") continue;

    const reasons = [];
    const invoice = invoiceNumberForExpense_(raw);
    if (invoice !== null && !invoice) {
      reasons.push("falta nº de factura/tiquet");
    }
    if (!expenseHasTicket_(raw)) {
      reasons.push("falta tiquet o factura adjunto");
    }
    if (!reasons.length) continue;
    blocks.push({
      id: String(row?.id || "").trim(),
      label: rowLabel_(row),
      reasons,
    });
  }
  for (const mix of collectLifeSheetMixBlocks_(selectedRows)) {
    blocks.push(mix);
  }
  return blocks;
}

export function formatSheetCreationBlocksMessage_(blocks, max = 8) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) return "";
  const lines = list.slice(0, max).map((b, i) => {
    const why =
      Array.isArray(b.reasons) && b.reasons.length ? `\n   → ${b.reasons.join("; ")}` : "";
    return `${i + 1}. ${b.label}${why}`;
  });
  const extra = list.length > max ? `\n\n… y ${list.length - max} más.` : "";
  return `${lines.join("\n")}${extra}`;
}

/**
 * Avisos previos a crear hoja (no bloquea; el llamador muestra confirmación).
 */
export function collectSheetCreationWarnings_(selectedRows, { assignedSet, responsable, outbox = [] }) {
  const outboxIds = buildOutboxExpenseLocalIds_(outbox);
  const warnings = [];

  for (const row of selectedRows || []) {
    const raw = row?.raw || row;
    const issues = [];

    // Ticket/factura adjunto: bloqueo duro en collectSheetCreationBlocks_ (no avisar aquí).
    if (!expenseIsSynced_(raw, outboxIds)) {
      issues.push("no sincronizado con el servidor");
    }
    const plate = expensePlate_(raw);
    if (responsable && plate && assignedSet && assignedSet.size && !assignedSet.has(plate)) {
      issues.push("matrícula fuera de tus vehículos a cargo");
    }
    if (!expenseProject_(raw)) {
      issues.push("sin proyecto/departamento");
    }

    if (issues.length) {
      warnings.push({
        id: String(row?.id || "").trim(),
        label: rowLabel_(row),
        issues,
      });
    }
  }
  return warnings;
}

export function formatSheetCreationWarningsMessage_(warnings, max = 6) {
  const list = Array.isArray(warnings) ? warnings : [];
  if (!list.length) return "";
  const lines = list.slice(0, max).map((w, i) => {
    return `${i + 1}. ${w.label}\n   ${w.issues.join("; ")}`;
  });
  const extra = list.length > max ? `\n\n… y ${list.length - max} más.` : "";
  return `${lines.join("\n\n")}${extra}`;
}

export function confirmSheetCreationWithWarnings_(warnings) {
  const msg = formatSheetCreationWarningsMessage_(warnings);
  if (!msg) return Promise.resolve(true);

  return new Promise((resolve) => {
    Alert.alert(
      "Revisar antes de enviar",
      `Algunos gastos seleccionados tienen incidencias:\n\n${msg}\n\nPuedes sincronizar o corregirlos antes, o continuar igualmente.`,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Continuar igualmente", onPress: () => resolve(true) },
      ]
    );
  });
}
