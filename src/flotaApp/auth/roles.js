export const ROLES = {
  GESTOR: "GESTOR",
  ADMINISTRACION: "ADMINISTRACION",
  RESPONSABLE: "RESPONSABLE",
  OPERARIO: "OPERARIO",
};

export function normalizeRole(role) {
  const v = String(role || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (v === ROLES.GESTOR) return ROLES.GESTOR;
  if (v === ROLES.ADMINISTRACION || v === "ADMINISTRACION") return ROLES.ADMINISTRACION;
  if (v === "ADMIN") return ROLES.ADMINISTRACION;
  if (v === ROLES.RESPONSABLE) return ROLES.RESPONSABLE;
  if (v === ROLES.OPERARIO) return ROLES.OPERARIO;
  return ROLES.OPERARIO;
}

export function isGestor(role) {
  return normalizeRole(role) === ROLES.GESTOR;
}

export function isResponsable(role) {
  return normalizeRole(role) === ROLES.RESPONSABLE;
}

export function isAdministracion(role) {
  return normalizeRole(role) === ROLES.ADMINISTRACION;
}

export function canApproveRequests(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.RESPONSABLE;
}

export function canApproveExpenseSheets(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

export function canReviewExpenseSheets(role) {
  return normalizeRole(role) === ROLES.GESTOR;
}

export function canPayExpenseSheets(role) {
  return normalizeRole(role) === ROLES.ADMINISTRACION;
}

export function roleLabel(role) {
  return normalizeRole(role);
}
