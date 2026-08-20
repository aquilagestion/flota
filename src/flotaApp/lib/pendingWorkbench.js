import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import {
  canApproveRequests,
  canAccessExpenseSheetApprovals,
  canReviewExpenseSheetRow,
  isGestor,
} from "../auth/roles";
import { summarizeOutboxJobs } from "./outboxSummary";
import {
  enrichUseRequestsGovernance_,
  countGestorEscalations_,
} from "./solicitudSla";

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function parseSolicitud_(x) {
  return {
    id_solicitud: String(x?.id_solicitud || x?.id || "").trim(),
    estado: String(x?.estado || "PENDIENTE").trim().toUpperCase(),
    matricula: String(x?.matricula || "").trim().toUpperCase(),
    trabajador_email: String(x?.trabajador_email || x?.usuario_email || "")
      .trim()
      .toLowerCase(),
    trabajador_nombre: String(x?.trabajador_nombre || x?.usuario_nombre || "").trim(),
    fecha_solicitud: String(x?.fecha_solicitud || "").trim(),
    fecha_inicio: String(x?.fecha_inicio || "").trim(),
    fecha_fin: String(x?.fecha_fin || "").trim(),
    motivo: String(x?.motivo || "").trim(),
  };
}

function parseHoja_(x) {
  return {
    hoja_gasto_id: String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim(),
    num_hoja_gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(x?.usuario_email || x?.responsable_email || "")
      .trim()
      .toLowerCase(),
    usuario_nombre: String(x?.usuario_nombre || x?.nombre || "").trim(),
    hoja_gasto_estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_total: Number(x?.hoja_gasto_total || x?.total_importe || 0) || 0,
    puede_revisar: x?.puede_revisar,
  };
}

function needsSheetReview_(row, userEmail, role) {
  const st = row.hoja_gasto_estado;
  if (st !== "ENVIADA" && st !== "EN_REVISION") return false;
  return canReviewExpenseSheetRow(row, userEmail, role);
}

/**
 * Carga contadores y listas resumidas para bandeja de pendientes y badges del menú.
 */
export async function loadPendingWorkbench({ userEmail, role }) {
  const me = String(userEmail || "").trim().toLowerCase();
  const outbox = await localDb.getOutbox();
  const sync = { count: outbox.length, items: summarizeOutboxJobs(outbox) };

  let useRequests = { count: 0, escalationCount: 0, items: [] };
  if (canApproveRequests(role)) {
    try {
      let flota = [];
      let usuarios = [];
      try {
        flota = asList_(await sheetsApi.get("flota_list", { user_email: me }));
      } catch {
        flota = [];
      }
      try {
        usuarios = asList_(await sheetsApi.usuariosAprobadoresUsoList(me));
      } catch {
        // Fallback: evita falso escalado "sin responsable" para el propio viewer.
        usuarios =
          me && (isGestor(role) || String(role || "").trim().toUpperCase() === "RESPONSABLE")
            ? [{ email: me, rol: String(role || "").trim().toUpperCase(), activo: "SI" }]
            : [];
      }

      const res = await sheetsApi.get("solicitud_list", {
        estado: "",
        trabajador_email: "",
        user_email: me,
      });
      const parsed = asList_(res).map(parseSolicitud_);
      const enriched = enrichUseRequestsGovernance_(parsed, {
        flota,
        usuarios,
        viewerEmail: me,
        viewerRole: role,
      });
      const actionable = enriched.filter((x) => x.actionableForViewer && x.estado === "PENDIENTE");
      const escalationCount = isGestor(role) ? countGestorEscalations_(enriched) : 0;
      useRequests = {
        count: actionable.length,
        escalationCount,
        items: actionable.slice(0, 20),
      };
    } catch {
      useRequests = { count: 0, escalationCount: 0, items: [], error: true };
    }
  }

  let sheets = { count: 0, items: [] };
  if (canAccessExpenseSheetApprovals(role)) {
    try {
      const res = await sheetsApi.get("hojas_gasto_list", { user_email: me });
      const pending = asList_(res)
        .map(parseHoja_)
        .filter((x) => needsSheetReview_(x, me, role));
      sheets = { count: pending.length, items: pending.slice(0, 20) };
    } catch {
      sheets = { count: 0, items: [], error: true };
    }
  }

  const totalActionable = sync.count + useRequests.count + sheets.count;
  return { sync, useRequests, sheets, totalActionable };
}
