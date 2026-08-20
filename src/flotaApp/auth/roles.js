export const ROLES = {
  USUARIO: "USUARIO",
  GESTOR: "GESTOR",
  ADMINISTRACION: "ADMINISTRACION",
  RESPONSABLE: "RESPONSABLE",
  COLABORADOR: "COLABORADOR",
  /** @deprecated Usar USUARIO; alias legacy para filas antiguas del Sheet y código existente. */
  OPERARIO: "OPERARIO",
};

/** @deprecated Usar ROLES.USUARIO */
export const LEGACY_ROLE_OPERARIO = ROLES.OPERARIO;

export function normalizeRole(role) {
  const v = String(role || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (v === ROLES.GESTOR) return ROLES.GESTOR;
  if (v === ROLES.ADMINISTRACION || v === "ADMINISTRACION") return ROLES.ADMINISTRACION;
  if (v === "ADMIN") return ROLES.ADMINISTRACION;
  if (v === ROLES.USUARIO || v === LEGACY_ROLE_OPERARIO) return ROLES.USUARIO;
  if (v === ROLES.RESPONSABLE) return ROLES.RESPONSABLE;
  if (v === ROLES.COLABORADOR) return ROLES.COLABORADOR;
  return ROLES.USUARIO;
}

/** Privilegio relativo: mayor = más acceso. */
export function roleRank(role) {
  const r = normalizeRole(role);
  if (r === ROLES.ADMINISTRACION) return 5;
  if (r === ROLES.GESTOR) return 4;
  if (r === ROLES.RESPONSABLE) return 3;
  if (r === ROLES.COLABORADOR) return 2;
  if (r === ROLES.USUARIO) return 1;
  return 0;
}

/** Conserva el rol de mayor privilegio entre candidatos. */
export function preferHigherRole(...roles) {
  let best = ROLES.USUARIO;
  for (const raw of roles) {
    if (raw == null || String(raw).trim() === "") continue;
    const r = normalizeRole(raw);
    if (roleRank(r) > roleRank(best)) best = r;
  }
  return best;
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

export function isColaborador(role) {
  return normalizeRole(role) === ROLES.COLABORADOR;
}

export function isUsuario(role) {
  return normalizeRole(role) === ROLES.USUARIO;
}

export function isFieldRole(role) {
  const r = normalizeRole(role);
  return r === ROLES.USUARIO || r === ROLES.RESPONSABLE || r === ROLES.COLABORADOR;
}

/** Informes: gestión ve todo; campo ve lo grabado en su cuenta (filtrado en API/caché). */
export function canAccessReports(role) {
  const r = normalizeRole(role);
  return (
    r === ROLES.GESTOR ||
    r === ROLES.ADMINISTRACION ||
    r === ROLES.USUARIO ||
    r === ROLES.RESPONSABLE ||
    r === ROLES.COLABORADOR
  );
}

/** Informes globales (filtro por usuario, listas completas). */
export function canAccessManagementReports(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

/** Informe km flota GREFA (Grabar viajes ORGANIZACION). */
export function canAccessKmFleetReport(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION || r === ROLES.RESPONSABLE;
}

/** Pantalla Destinos (config Drive/Sheet local). */
export function canAccessDestinos(role) {
  return isGestor(role);
}

/** GESTOR / ADMINISTRACIÓN pueden grabar gastos a nombre de otro usuario. */
export function canRecordExpenseOnBehalf(role) {
  return isGestor(role) || isAdministracion(role);
}

export function canEditCorporateDestinos(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

export function canEditPersonalDestinos(role) {
  return true;
}

/** Alta de usuarios y asignación de roles. */
export function canManageUsers(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

/** Alta/edición de vehículos en FLOTA. */
export function canManageVehicles(role) {
  return canManageUsers(role);
}

/** Ver módulo listado de vehículos (sin implicar editar). */
export function canAccessVehicleModule(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.USUARIO || r === ROLES.RESPONSABLE;
}

/** Uso de vehículos: solicitudes y calendario. */
export function canAccessUseVehicles(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.USUARIO || r === ROLES.RESPONSABLE;
}

export function canAccessMaintenance(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.USUARIO || r === ROLES.RESPONSABLE;
}

/** Gastos, hojas de gasto, historial propio. */
export function canAccessFieldExpenseOps(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.USUARIO || r === ROLES.RESPONSABLE || r === ROLES.COLABORADOR;
}

/** Viajes con vehículo de flota (no solo matrícula libre). */
export function canUseFleetVehicleOnTrips(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.USUARIO || r === ROLES.RESPONSABLE;
}

/** Módulo grabar viajes (propio; flota si canUseFleetVehicleOnTrips). */
export function canAccessTripsModule(role) {
  const r = normalizeRole(role);
  return (
    r === ROLES.COLABORADOR ||
    r === ROLES.USUARIO ||
    r === ROLES.RESPONSABLE ||
    r === ROLES.GESTOR ||
    r === ROLES.ADMINISTRACION
  );
}

export function canApproveRequests(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.RESPONSABLE || r === ROLES.ADMINISTRACION;
}

/** Liberar reservas APROBADA (total o parcial): GESTOR, RESPONSABLE o titular USUARIO. */
export function canLiberateVehicleReservations(role) {
  const r = normalizeRole(role);
  return (
    r === ROLES.GESTOR ||
    r === ROLES.RESPONSABLE ||
    r === ROLES.ADMINISTRACION ||
    r === ROLES.USUARIO ||
    r === ROLES.COLABORADOR
  );
}

/**
 * ¿Puede este usuario liberar esta solicitud APROBADA?
 * - GESTOR / ADMINISTRACION: cualquiera
 * - RESPONSABLE: matrículas a su cargo (assignedSet)
 * - USUARIO / COLABORADOR: solo las suyas
 */
export function canLiberateRequestRow(item, userEmail, role, assignedSet) {
  if (!item || String(item.estado || "").trim().toUpperCase() !== "APROBADA") return false;
  if (!canLiberateVehicleReservations(role)) return false;
  const me = String(userEmail || "").trim().toLowerCase();
  if (!me) return false;
  const r = normalizeRole(role);
  if (r === ROLES.GESTOR || r === ROLES.ADMINISTRACION) return true;
  if (r === ROLES.RESPONSABLE) {
    const mat = String(item.matricula || "").trim().toUpperCase();
    if (assignedSet instanceof Set && assignedSet.has(mat)) return true;
    // Si es su propia reserva aprobada, también puede liberarla.
    return String(item.trabajador_email || "").trim().toLowerCase() === me;
  }
  return String(item.trabajador_email || "").trim().toLowerCase() === me;
}

/** Cancelar (retirar) solicitud PENDIENTE propia. */
export function canCancelOwnPendingRequest(item, userEmail) {
  if (!item || String(item.estado || "").trim().toUpperCase() !== "PENDIENTE") return false;
  const me = String(userEmail || "").trim().toLowerCase();
  if (!me) return false;
  return String(item.trabajador_email || "").trim().toLowerCase() === me;
}

/** Panel web de solicitudes de uso: aprobar/rechazar y/o liberar. */
export function canManageUseRequestsPanel(role) {
  return canApproveRequests(role) || canLiberateVehicleReservations(role);
}

export function canApproveExpenseSheets(role) {
  return canAccessExpenseSheetApprovals(role);
}

/** Acceso al módulo Aprobaciones (hojas de gasto). */
export function canAccessExpenseSheetApprovals(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION || r === ROLES.RESPONSABLE;
}

/** Importar hoja de gasto desde Excel (.xlsm): gestión y responsables; no operario/usuario/colaborador. */
export function canImportExpenseSheetExcel(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION || r === ROLES.RESPONSABLE;
}

/** Puede revisar cualquier hoja (no solo las de su ámbito). */
export function canReviewAnyExpenseSheet(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

/** Puede aprobar/rechazar una hoja concreta (según API o titular). */
export function canReviewExpenseSheetRow(row, userEmail, role) {
  if (!row || !canAccessExpenseSheetApprovals(role)) return false;
  if (canReviewAnyExpenseSheet(role)) return true;
  if (!isResponsable(role)) return false;
  if (row.puede_revisar === true) return true;
  if (row.puede_revisar === false) return false;
  const me = String(userEmail || "")
    .trim()
    .toLowerCase();
  const owner = String(row?.usuario_email || "")
    .trim()
    .toLowerCase();
  return !!me && owner === me;
}

export function canReviewExpenseSheets(role) {
  return canAccessExpenseSheetApprovals(role);
}

export function canPayExpenseSheets(role) {
  return isAdministracion(role) || isGestor(role);
}

/** Acceso total de gestión (menú completo, todas las funciones). */
export function hasFullManagementAccess(role) {
  return isGestor(role) || isAdministracion(role);
}

/** ¿La hoja está pagada? (no se puede modificar). */
export function expenseSheetIsPaid(sheetOrRow) {
  return String(sheetOrRow?.hoja_gasto_estado_pago || sheetOrRow?.estado_pago || "")
    .trim()
    .toUpperCase() === "PAGADA";
}

/**
 * Puede modificar/desvincular una hoja no pagada:
 * GESTOR/ADMIN todas; RESPONSABLE propias o ámbito; USUARIO/operario solo propias.
 */
export function canModifyExpenseSheetRow(row, userEmail, role, assignedSet) {
  if (!row || expenseSheetIsPaid(row)) return false;
  const r = normalizeRole(role);
  if (r === ROLES.GESTOR || r === ROLES.ADMINISTRACION) return true;
  const me = String(userEmail || "")
    .trim()
    .toLowerCase();
  if (!me) return false;
  const owner = String(row?.usuario_email || "")
    .trim()
    .toLowerCase();
  if (owner && owner === me) return true;
  if (!owner && !row?._fromRemoteList) return true; // hoja solo local
  if (r === ROLES.RESPONSABLE && assignedSet instanceof Set) {
    const lines = Array.isArray(row?.lineas) ? row.lineas : [];
    for (const ln of lines) {
      const mat = String(ln?.matricula || "").trim().toUpperCase();
      if (mat && assignedSet.has(mat)) return true;
    }
  }
  if (r === ROLES.RESPONSABLE && row?.puede_revisar === true) return true;
  return false;
}

export function canAccessCosts(role) {
  return canAccessReports(role);
}

export function canManageResponsableSolicitudes(role) {
  const r = normalizeRole(role);
  return r === ROLES.GESTOR || r === ROLES.ADMINISTRACION;
}

/** Bandeja unificada de pendientes (sync, uso vehículos, hojas). */
export function canAccessWorkbench(role) {
  const r = normalizeRole(role);
  if (r === ROLES.ADMINISTRACION) return true;
  if (canApproveRequests(role) || canAccessExpenseSheetApprovals(role)) return true;
  return canAccessFieldExpenseOps(role);
}

/** Roles ofrecidos al registrar (sin OPERARIO). */
export function registrationRoleOptions() {
  return [
    { value: ROLES.COLABORADOR, label: "COLABORADOR" },
    { value: ROLES.USUARIO, label: "USUARIO" },
    {
      value: ROLES.RESPONSABLE,
      label: "RESPONSABLE (requiere aprobación de GESTOR/ADMINISTRACION)",
    },
    { value: ROLES.GESTOR, label: "GESTOR (requiere aprobación de ADMINISTRACION)" },
    { value: ROLES.ADMINISTRACION, label: "ADMINISTRACION (requiere aprobación de ADMINISTRACION)" },
  ];
}

/** Roles asignables desde administración de usuarios. */
export function assignableRoleOptions() {
  return [
    { value: ROLES.COLABORADOR, label: ROLES.COLABORADOR },
    { value: ROLES.USUARIO, label: ROLES.USUARIO },
    { value: ROLES.RESPONSABLE, label: ROLES.RESPONSABLE },
    { value: ROLES.GESTOR, label: ROLES.GESTOR },
    { value: ROLES.ADMINISTRACION, label: ROLES.ADMINISTRACION },
  ];
}

export function roleLabel(role) {
  return normalizeRole(role);
}
