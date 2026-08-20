import {
  canDeleteExpense,
  enrichExpenseFromLocalRow,
  isUserPaidFormaPago,
  normalizeExpenseHojaLink_,
  normalizeExpenseRowForApp,
} from "../../flotaWeb/lib/expenses";
import { hydrateExpenseFormFromRecord } from "../../flotaWeb/lib/expenseFormHydrate";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function sheetKeys_(s) {
  const set = new Set();
  for (const k of [s?.hoja_gasto_id, s?.hoja_id_local, s?.id]) {
    const v = String(k || "").trim();
    if (v) set.add(v);
  }
  return set;
}

function ensureFormaPagoUsuario_(row) {
  if (!row || typeof row !== "object") return row;
  const next = normalizeExpenseHojaLink_(row);
  if (isUserPaidFormaPago(next.forma_pago) && !String(next.forma_pago || "").trim()) {
    return { ...next, forma_pago: "Usuario" };
  }
  if (!String(next.forma_pago || "").trim()) {
    return { ...next, forma_pago: "Usuario" };
  }
  return next;
}

function mapRemoteExpenseToLocal_(row) {
  const n = normalizeExpenseRowForApp(row || {});
  const gid = String(n?.id_gasto || "").trim();
  const id = gid || String(n?.id || n?.local_id || "").trim();
  if (!id) return null;
  const hydrated = hydrateExpenseFormFromRecord({
    ...n,
    id,
    local_id: id,
    id_gasto: gid || id,
    _fromRemoteList: true,
  });
  return ensureFormaPagoUsuario_({
    ...hydrated,
    id,
    local_id: id,
    id_gasto: gid || id,
    _fromRemoteList: true,
  });
}

/** Descarga gastos del servidor y los fusiona con localDb (Sheet = fuente de verdad en vínculos de hoja). */
export async function pullRemoteExpensesForUser_(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return { ok: false, expenses: [], reason: "sin email" };

  let remoteGastos = [];
  try {
    const gRes = await sheetsApi.get("gasto_list", { user_email: email }, { timeoutMs: 60000 });
    remoteGastos = asList_(gRes);
  } catch (e) {
    return { ok: false, expenses: [], reason: String(e?.message || e || "error red") };
  }

  const outbox = await localDb.getOutbox();
  const pendingExpenseLocalIds = new Set();
  const pendingExpenseGasIds = new Set();
  for (const j of outbox || []) {
    if (j?.kind !== "expense" && j?.kind !== "expense_update") continue;
    const lid = String(j?.payload?.local_id || "").trim();
    const gid = String(j?.payload?.id_gasto || "").trim().toUpperCase();
    if (lid) pendingExpenseLocalIds.add(lid);
    if (gid) pendingExpenseGasIds.add(gid);
  }

  const remoteByGasId = new Map();
  for (const r of remoteGastos) {
    const mapped = mapRemoteExpenseToLocal_(r);
    if (!mapped) continue;
    const gid = String(mapped.id_gasto || mapped.id || "").trim().toUpperCase();
    if (gid) remoteByGasId.set(gid, mapped);
  }

  const localExpenses = await localDb.getExpenses();
  const nextByKey = new Map();

  for (const e of Array.isArray(localExpenses) ? localExpenses : []) {
    const lid = String(e?.id || e?.local_id || "").trim();
    const gid = String(e?.id_gasto || "").trim().toUpperCase();
    // No pisar altas ni ediciones pendientes de sync (p. ej. cambio de fecha).
    if ((lid && pendingExpenseLocalIds.has(lid)) || (gid && pendingExpenseGasIds.has(gid))) {
      nextByKey.set(lid ? `local:${lid}` : gid, ensureFormaPagoUsuario_(e));
      if (gid) remoteByGasId.delete(gid);
      continue;
    }
    if (gid && remoteByGasId.has(gid)) {
      const remote = remoteByGasId.get(gid);
      const merged = ensureFormaPagoUsuario_(enrichExpenseFromLocalRow(remote, e) || remote);
      nextByKey.set(gid, {
        ...merged,
        id: String(merged.id || gid).trim() || gid,
        local_id: String(merged.local_id || merged.id || gid).trim() || gid,
        id_gasto: gid,
        _fromRemoteList: true,
      });
      remoteByGasId.delete(gid);
    }
  }

  for (const [gid, mapped] of remoteByGasId) {
    nextByKey.set(gid, mapped);
  }

  const nextExpenses = [...nextByKey.values()];
  await localDb.setExpenses(nextExpenses);
  return { ok: true, expenses: nextExpenses, remoteCount: remoteGastos.length };
}

function mapRemoteSheetToLocal_(x) {
  const hid = String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim();
  if (!hid) return null;
  return {
    id: hid,
    hoja_gasto_id: hid,
    hoja_id_local: hid,
    num_hoja_gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    Num_Hoja_Gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(x?.usuario_email || x?.responsable_email || "").trim().toLowerCase(),
    usuario_nombre: String(x?.usuario_nombre || x?.nombre || "").trim(),
    estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado_pago: String(x?.hoja_gasto_estado_pago || x?.estado_pago || "").trim().toUpperCase(),
    hoja_gasto_fecha_envio: String(x?.hoja_gasto_fecha_envio || x?.createdAtLocal || "").trim(),
    createdAtLocal: String(x?.createdAtLocal || x?.hoja_gasto_fecha_envio || "").trim(),
    total_importe: Number(x?.hoja_gasto_total || x?.total_importe || 0) || 0,
    observaciones: String(x?.hoja_gasto_observaciones || x?.observaciones || "").trim(),
    lineas: Array.isArray(x?.lineas) ? x.lineas : [],
    lineas_count: Number(x?.lineas_count || 0) || 0,
    puede_revisar: x?.puede_revisar === true,
    _fromRemoteList: true,
  };
}

/**
 * Modo B: Sheet = única fuente.
 * Vacía gastos/hojas/borrador locales (y cola de gastos/hojas) y descarga del servidor.
 * Si no hay red, no toca lo local y devuelve offline=true.
 */
export async function resetLocalFromSheet_(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return { ok: false, offline: false, reason: "sin email" };

  let remoteGastos = [];
  let remoteSheets = [];
  let gotGastos = false;
  let gotSheets = false;

  try {
    const gRes = await sheetsApi.get("gasto_list", { user_email: email }, { timeoutMs: 60000 });
    remoteGastos = asList_(gRes);
    gotGastos = true;
  } catch {
    // sin red / error
  }
  try {
    const hRes = await sheetsApi.get("hojas_gasto_list", { user_email: email }, { timeoutMs: 60000 });
    remoteSheets = asList_(hRes);
    gotSheets = true;
  } catch {
    // sin red / error
  }

  if (!gotGastos && !gotSheets) {
    return { ok: false, offline: true, reason: "sin red" };
  }

  await localDb.setExpensesDraft(null);

  if (gotGastos) {
    const mapped = remoteGastos.map(mapRemoteExpenseToLocal_).filter(Boolean);
    await localDb.setExpenses(mapped);
  }
  if (gotSheets) {
    const mapped = remoteSheets.map(mapRemoteSheetToLocal_).filter(Boolean);
    await localDb.setExpenseSheets(mapped);
  }

  const out = await localDb.getOutbox();
  await localDb.setOutbox(
    (Array.isArray(out) ? out : []).filter((j) => {
      const kind = String(j?.kind || "");
      return kind !== "expense" && kind !== "expense_sheet";
    })
  );

  return {
    ok: true,
    offline: false,
    expenses: gotGastos ? remoteGastos.length : null,
    sheets: gotSheets ? remoteSheets.length : null,
  };
}

/**
 * Alinea gastos/hojas locales con el servidor.
 * - Incorpora gastos remotos faltantes (p. ej. tras sync / otro dispositivo).
 * - Elimina fantasmas locales ya borrados en Sheet (salvo cola outbox).
 */
export async function reconcileLocalExpensesAndSheets_(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return { expensesChanged: false, sheetsChanged: false };

  const outbox = await localDb.getOutbox();
  const pendingSheetIds = new Set(
    (outbox || [])
      .filter((j) => j?.kind === "expense_sheet")
      .map((j) => String(j?.payload?.hoja_id_local || j?.payload?.hoja_gasto_id || "").trim())
      .filter(Boolean)
  );

  let expensesChanged = false;
  let sheetsChanged = false;

  try {
    const pulled = await pullRemoteExpensesForUser_(email);
    if (pulled.ok) {
      expensesChanged = true;
    }
  } catch {
    // Sin red: no tocar local
  }

  try {
    const hRes = await sheetsApi.get("hojas_gasto_list", { user_email: email }, { timeoutMs: 45000 });
    const remoteSheets = asList_(hRes)
      .map((x) => String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim())
      .filter(Boolean);
    const remoteSheetIds = new Set(remoteSheets);

    const localSheets = await localDb.getExpenseSheets();
    const nextSheets = (Array.isArray(localSheets) ? localSheets : []).filter((s) => {
      const keys = [...sheetKeys_(s)];
      if (!keys.length) return false;
      if (keys.some((k) => pendingSheetIds.has(k))) return true;
      if (keys.some((k) => remoteSheetIds.has(k))) return true;
      return false;
    });

    if (nextSheets.length !== (localSheets || []).length) {
      await localDb.setExpenseSheets(nextSheets);
      sheetsChanged = true;
    }
  } catch {
    // Sin red: no tocar local
  }

  return { expensesChanged, sheetsChanged };
}

/** Elimina un gasto local y, si tiene GAS…, también en el servidor. */
export async function deleteExpenseCompletely_(expense, { userEmail, role } = {}) {
  const check = canDeleteExpense(expense, { actorEmail: userEmail, role });
  if (!check.ok) {
    throw new Error(check.reason || "No se puede eliminar este gasto.");
  }

  const eid = String(expense?.id || expense?.local_id || "").trim();
  const gid = String(expense?.id_gasto || "").trim();
  const email = String(userEmail || "").trim().toLowerCase();

  if (/^GAS/i.test(gid) && !check.localOnly) {
    try {
      await sheetsApi.postWebSafe(
        "gasto_eliminar",
        { id_gasto: gid, user_email: email },
        { user_email: email },
        { timeoutMs: 30000 }
      );
    } catch (e) {
      // Si el servidor ya no lo tiene (borrado en Sheet), seguimos con local.
      const msg = String(e?.message || "");
      if (!/no encontrado|not found/i.test(msg)) throw e;
    }
  }

  if (eid) {
    const list = await localDb.getExpenses();
    await localDb.setExpenses(
      (Array.isArray(list) ? list : []).filter((e) => String(e?.id || e?.local_id || "").trim() !== eid)
    );
    const out = await localDb.getOutbox();
    await localDb.setOutbox(
      (Array.isArray(out) ? out : []).filter((j) => {
        if (j?.kind !== "expense") return true;
        return String(j?.payload?.local_id || "").trim() !== eid;
      })
    );
  }

  const draft = await localDb.getExpensesDraft();
  const draftEdit = String(draft?._editExpenseId || "").trim();
  if (draftEdit && draftEdit === eid) {
    await localDb.setExpensesDraft(null);
  }

  return { ok: true, id: eid, id_gasto: gid };
}
