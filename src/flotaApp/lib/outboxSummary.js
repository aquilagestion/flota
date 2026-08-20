import { formatDateEsValue } from "../../flotaWeb/lib/format";

const KIND_LABELS = {
  expense: "Gasto",
  expense_update: "Gasto (edición)",
  maintenance: "Mantenimiento",
  vehicle: "Vehículo",
  expense_sheet: "Hoja de gasto",
};

function formatShortDate_(value) {
  const dmy = formatDateEsValue(value);
  return dmy === "-" ? "" : dmy;
}

/** Una línea legible por job de la cola local. */
export function outboxJobSummary(job, index = 0) {
  const p = job?.payload || {};
  const kind = String(job?.kind || "otro");
  const label = KIND_LABELS[kind] || kind;
  const tipo = String(p.tipo_gasto || p.tipo || "").trim();
  const mat = String(p.matricula || p.vehiclePlate || "").trim().toUpperCase();
  const fecha = formatShortDate_(p.fecha || p.fecha_repostaje || p.fecha_otros_gastos || p.createdAtLocal || "");
  const err = String(job?._syncError || "").trim();
  const parts = [label];
  if (tipo) parts.push(tipo);
  if (mat) parts.push(mat);
  let line = `${index + 1}. ${parts.join(" · ")}`;
  if (fecha) line += `\n   Fecha: ${fecha}`;
  if (err) line += `\n   Motivo: ${err}`;
  return line;
}

export function formatSyncResultMessage(res, outbox = []) {
  const count = Number(res?.remainingCount ?? outbox.length ?? 0);
  const lines = (outbox || []).map((j, i) => outboxJobSummary(j, i));
  const head = `Pendientes: ${count}`;
  if (!lines.length) return `${head}\nSin detalle de los registros en cola.`;
  const max = 8;
  const body = lines.slice(0, max).join("\n\n");
  const extra = lines.length > max ? `\n\n… y ${lines.length - max} más.` : "";
  return `${head}\n\n${body}${extra}`;
}

export function summarizeOutboxJobs(outbox = []) {
  return (outbox || []).map((job, i) => ({
    id: String(job?.id || `job-${i}`),
    summary: outboxJobSummary(job, i),
    kind: String(job?.kind || ""),
    error: String(job?._syncError || "").trim(),
    label: KIND_LABELS[job?.kind] || String(job?.kind || "Registro"),
    matricula: String(job?.payload?.matricula || job?.payload?.vehiclePlate || "").trim().toUpperCase(),
    tipo: String(job?.payload?.tipo_gasto || job?.payload?.tipo || "").trim(),
  }));
}
