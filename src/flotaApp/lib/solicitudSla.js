/** SLA de solicitudes de uso de vehículo (horas en PENDIENTE). */
export const SLA_WARN_HOURS = 24;
export const SLA_CRIT_HOURS = 48;

const MS_HOUR = 60 * 60 * 1000;

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

/** Varios correos en FLOTA: separados por ; o , */
export function splitNotificationEmails_(raw) {
  return String(raw || "")
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter(isValidEmail_);
}

export function notificationEmailsInclude_(raw, email) {
  const me = String(email || "").trim().toLowerCase();
  if (!me) return false;
  const rawStr = String(raw || "").trim().toLowerCase();
  if (rawStr === me) return true;
  return splitNotificationEmails_(raw).includes(me);
}

function parseDateToMs_(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(`${raw.slice(0, 10)}T12:00:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T12:00:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

/** Antigüedad de la solicitud para SLA (fecha_solicitud preferente). */
export function solicitudCreatedAtMs_(item) {
  const fromSolicitud = parseDateToMs_(item?.fecha_solicitud);
  if (fromSolicitud) return fromSolicitud;
  const fromInicio = parseDateToMs_(item?.fecha_inicio);
  if (fromInicio) return fromInicio;
  return 0;
}

export function computeSolicitudSla_(item) {
  const createdMs = solicitudCreatedAtMs_(item);
  if (!createdMs) {
    return { level: "ok", ageHours: 0, label: "", createdMs: 0 };
  }
  const ageMs = Math.max(0, Date.now() - createdMs);
  const ageHours = ageMs / MS_HOUR;
  if (ageHours >= SLA_CRIT_HOURS) {
    return {
      level: "critical",
      ageHours,
      label: `+${Math.floor(ageHours)}h · Escalar`,
      createdMs,
    };
  }
  if (ageHours >= SLA_WARN_HOURS) {
    return {
      level: "warn",
      ageHours,
      label: `+${Math.floor(ageHours)}h · Retrasada`,
      createdMs,
    };
  }
  const h = Math.floor(ageHours);
  return {
    level: "ok",
    ageHours,
    label: h < 1 ? "<1h" : `${h}h`,
    createdMs,
  };
}

/** Usuarios que pueden aprobar solicitudes (activos). */
export function buildActiveUseApprovers_(usuariosList) {
  const set = new Set();
  for (const u of usuariosList || []) {
    const email = String(u?.email || "").trim().toLowerCase();
    if (!email) continue;
    const rol = String(u?.rol || u?.role || "")
      .trim()
      .toUpperCase();
    const activo = String(u?.activo || "SI").trim().toUpperCase();
    if (activo === "NO") continue;
    if (rol === "RESPONSABLE" || rol === "GESTOR" || rol === "ADMINISTRACION") {
      set.add(email);
    }
  }
  return set;
}

export function vehicleApproverEmails_(flotaRow) {
  const emails = [];
  const resp = String(flotaRow?.responsable || "").trim().toLowerCase();
  if (isValidEmail_(resp)) emails.push(resp);
  const notifyRaw = flotaRow?.["e-mail_de_notificaciones"] || flotaRow?.email_de_notificaciones || "";
  for (const e of splitNotificationEmails_(notifyRaw)) {
    if (!emails.includes(e)) emails.push(e);
  }
  return emails;
}

export function vehicleHasActiveApprover_(flotaRow, activeApprovers) {
  const candidates = vehicleApproverEmails_(flotaRow);
  if (!candidates.length) return false;
  return candidates.some((e) => activeApprovers.has(e));
}

export function findFlotaRowByMatricula_(flota, matricula) {
  const mat = String(matricula || "").trim().toUpperCase();
  if (!mat) return null;
  const list = Array.isArray(flota) ? flota : [];
  return list.find((v) => String(v?.matricula || "").trim().toUpperCase() === mat) || null;
}

/**
 * Enriquece solicitudes PENDIENTE con SLA y cobertura de responsable.
 * needsGestorEscalation: sin responsable activo en USUARIOS o SLA > 48h.
 */
export function enrichUseRequestsGovernance_(requests, { flota = [], usuarios = [], viewerEmail = "", viewerRole = "" } = {}) {
  const activeApprovers = buildActiveUseApprovers_(usuarios);
  const me = String(viewerEmail || "").trim().toLowerCase();
  const role = String(viewerRole || "").trim().toUpperCase();

  return (requests || []).map((item) => {
    const sla = computeSolicitudSla_(item);
    const flotaRow = findFlotaRowByMatricula_(flota, item?.matricula);
    const hasActiveApprover = vehicleHasActiveApprover_(flotaRow, activeApprovers);
    const needsGestorEscalation =
      item?.estado === "PENDIENTE" && (!hasActiveApprover || sla.level === "critical");
    const actionableForViewer =
      item?.estado === "PENDIENTE" &&
      String(item?.trabajador_email || "").trim().toLowerCase() !== me &&
      (role === "GESTOR" || role === "ADMINISTRACION"
        ? true
        : role === "RESPONSABLE");

    return {
      ...item,
      sla,
      vehicleHasActiveApprover: hasActiveApprover,
      vehicleApproverEmails: vehicleApproverEmails_(flotaRow),
      needsGestorEscalation,
      actionableForViewer,
    };
  });
}

export function countGestorEscalations_(enriched) {
  return (enriched || []).filter(
    (x) => x.actionableForViewer && x.estado === "PENDIENTE" && x.needsGestorEscalation
  ).length;
}

export function countResponsablePending_(enriched) {
  return (enriched || []).filter((x) => x.actionableForViewer && x.estado === "PENDIENTE").length;
}

export function slaStyle_(level) {
  if (level === "critical") {
    return { badge: stylesCritical_, text: stylesCriticalText_ };
  }
  if (level === "warn") {
    return { badge: stylesWarn_, text: stylesWarnText_ };
  }
  return { badge: stylesOk_, text: stylesOkText_ };
}

// Referencias de color para consumo en pantallas (evita duplicar hex).
const stylesCritical_ = { backgroundColor: "#8b2e2e", borderColor: "#d06b6b" };
const stylesWarn_ = { backgroundColor: "#8a5a1e", borderColor: "#e0a050" };
const stylesOk_ = { backgroundColor: "#1e3a52", borderColor: "#4f88bf" };
const stylesCriticalText_ = { color: "#ffc8c8" };
const stylesWarnText_ = { color: "#ffe0a8" };
const stylesOkText_ = { color: "#b7ddff" };

export function slaBadgeColors_(level) {
  return slaStyle_(level);
}
