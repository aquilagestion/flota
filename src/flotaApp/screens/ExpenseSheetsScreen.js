import React, { useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, ActivityIndicator, Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { canModifyExpenseSheetRow, canRecordExpenseOnBehalf, canImportExpenseSheetExcel, expenseSheetIsPaid, isAdministracion, isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { useSyncActions } from "../context/SyncContext";
import { showSyncResultAlert } from "../lib/syncFeedback";
import {
  collectSheetCreationBlocks_,
  collectSheetCreationWarnings_,
  confirmSheetCreationWithWarnings_,
  formatSheetCreationBlocksMessage_,
} from "../lib/expenseSheetValidation";
import { buildOutboxExpenseLocalIds_, expenseHasTicket_, expenseSupervisionWarnings_ } from "../lib/expenseSupervision";
import { previewExpenseSheetPdf, printAndShareExpenseSheetPdf } from "../lib/expenseSheetPdfNative";
import { loadExpenseSheetLogosForTemplate, uriToDataUriIfLocal_ } from "../lib/expenseSheetLogos";
import { buildExpenseSheetPrintHtmlAsync } from "../../flotaWeb/lib/expenseSheetPrint";
import {
  createTicketUriResolverForNative_,
  createTicketUriResolverForWeb_,
} from "../../flotaWeb/lib/expenseSheetLogos";
import { expenseDate, formatDateEsValue, normalizeDateToDmy, parseDateFlexible } from "../../flotaWeb/lib/format";
import {
  isLifeExpenseSheetTemplate,
  resolveExpenseSheetTemplate,
} from "../../flotaWeb/lib/expenseSheetTemplates";
import {
  enrichSheetLineaFromExpense,
  resolveExpenseSheetModel,
  sheetMetaForModel,
} from "../../flotaWeb/lib/ownVehicleColaborador";
import {
  buildProyectoNombreByIdMap,
  fetchProyectoRowsColumnaBCached,
  linesNeedProyectoMapResolve_,
  mapProjectSelectOptions,
  resolveProyectoNombreParaGasto,
} from "../../flotaWeb/lib/proyectoResolve";
import {
  allocateExpenseSheetNumbersByOldest,
  buildSheetLineMetaRows_,
  collectExpenseSheetNumbers,
  collectSiblingSheetEntriesForPrefix,
  ensureExpenseSheetNumberForFecha,
  expenseSheetNumberBase,
  expenseSheetNumberPrefix,
  inferSheetNumberFromRecord,
  lineMetaMapFromRows_,
  lineMetaKey_,
  loadSheetMetaFromWebStorage_,
  mergeLineMetaIntoLineas_,
  oldestExpenseMsFromLines,
  persistSheetMeta_,
  persistSheetMetaToWebStorage_,
  inferSheetFormaPagoFromExpenseRows,
  resolveCodPersonalForSheet,
  resolveSheetNumberForCreate,
  resolveStoredLifePrintMeta_,
  sortExpenseSheetLinesByDateInvoice_,
  viajeFromTripRecord_,
  viajeFromImportedExcelFields_,
} from "../../flotaWeb/lib/expenseSheetMeta";
import { enrichExpensePayloadWithIva } from "../../flotaWeb/lib/expenseIva";
import { isPendingUserPaidExpense, expenseAppRowId, canDeleteExpense, resolveExpenseSheetPersonName, conceptoFromExpenseRecord, resolveSheetLineConcepto } from "../../flotaWeb/lib/expenses";
import {
  resolveLifeOtrosNumberPrefix_,
  resolveLifeSheetFamilyFromRows_,
} from "../../flotaWeb/lib/lifeOtrosSheet";
import { DateField, SelectField, TextField } from "../ui/form/Fields";
import { ExpenseSelectMark, ExpenseSelectionBar, expenseSelectionBarPadding } from "../ui/ExpenseSelectMark";
import { MESES_ES_KM } from "../lib/informeKmFlota";
import { theme } from "../ui/theme";
import {
  deleteExpenseCompletely_,
  reconcileLocalExpensesAndSheets_,
  pullRemoteExpensesForUser_,
} from "../lib/localExpenseReconcile";

function userDisplayName_(user) {
  const byName =
    String(user?.displayName || "").trim() ||
    String(user?.nombre || "").trim() ||
    String(user?.name || "").trim() ||
    String(user?.fullName || "").trim();
  if (byName && !byName.includes("@")) return byName;
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return "Usuario";
  const local = String(email.split("@")[0] || "").trim();
  if (!local) return "Usuario";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function resolvedUserName_(user, preferredName) {
  const p = String(preferredName || "").trim();
  if (p && !p.includes("@")) return p;
  return userDisplayName_(user);
}

/** Nº orden hoja: T-MES-AÑO-COD_PERSONAL (USUARIOS col. L / iniciales). */
function parseDateFromDmyOrNow_(dateLike) {
  const dmy = normalizeDateToDmy(dateLike);
  if (dmy && /^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) {
    const [dd, mm, yyyy] = dmy.split("/");
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (Number.isFinite(d.getTime())) return d;
  }
  if (dateLike instanceof Date && Number.isFinite(dateLike.getTime())) return dateLike;
  return new Date();
}

function inferredSheetNumber_(sheet, user, preferredName, usuarioRecord) {
  const person = personFromSheet_(sheet, user, preferredName);
  const titularEmail = String(sheet?.usuario_email || user?.email || "").trim().toLowerCase();
  const selfEmail = String(user?.email || "").trim().toLowerCase();
  const titularRecord =
    titularEmail && titularEmail === selfEmail
      ? usuarioRecord
      : {
          email: titularEmail,
          nombre: person,
          cod_personal: sheet?.cod_personal,
        };
  return inferSheetNumberFromRecord(sheet, {
    usuarioRecord: titularRecord,
    nombre: person,
    email: titularEmail,
    codPersonal: sheet?.cod_personal,
  });
}

function selectedLinesLookLife_(selectedRows) {
  const rows = Array.isArray(selectedRows) ? selectedRows : [];
  if (
    rows.some((r) => String(r?.raw?.hoja_gasto_modelo || "").trim().toUpperCase() === "LIFE")
  ) {
    return true;
  }
  const lineas = rows.map((r) => ({
    proyecto: String(
      r?.raw?.departamento_o_proyecto === "__OTRO__"
        ? r?.raw?.departamento_o_proyecto_custom || ""
        : r?.raw?.departamento_o_proyecto || r?.raw?.departamento_o_proyecto_custom || r?.raw?.proyecto || ""
    ).trim(),
    tipo_gasto: r?.type || r?.raw?.tipo_gasto || "",
  }));
  const hint = lineas.map((l) => l.proyecto).find(Boolean) || "";
  if (hint && isLifeExpenseSheetTemplate(resolveExpenseSheetTemplate(hint, lineas))) return true;
  if (
    rows.some(
      (r) =>
        String(r?.raw?.excel_import || "").trim().toUpperCase() === "SI" &&
        (String(r?.raw?.work_package || "").trim() || String(r?.raw?.accion_proyecto || "").trim())
    )
  ) {
    return true;
  }
  return false;
}

function expenseSheetDisplayName_(sheet) {
  return String(
    sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || sheet?.hoja_gasto_id || sheet?.id || ""
  ).trim();
}

/** Relación de hojas: más reciente / mayor Nº hoja arriba. */
function compareExpenseSheetsByNameDesc_(a, b) {
  const na = expenseSheetDisplayName_(a);
  const nb = expenseSheetDisplayName_(b);
  const byName = nb.localeCompare(na, "es", { sensitivity: "base", numeric: true });
  if (byName !== 0) return byName;
  return String(b?.hoja_gasto_fecha_envio || b?.createdAtLocal || "").localeCompare(
    String(a?.hoja_gasto_fecha_envio || a?.createdAtLocal || "")
  );
}

function sheetIsLife_(sheet, lines) {
  const modelo = String(sheet?.hoja_gasto_modelo || sheet?.modelo || "").trim().toUpperCase();
  if (modelo === "LIFE") return true;
  if (modelo === "GENERICA" || modelo === "GENERICO") return false;
  const rows = (Array.isArray(lines) ? lines : []).map((l) => ({
    type: l?.tipo_gasto,
    raw: l,
  }));
  return selectedLinesLookLife_(rows);
}

function todayDmy_() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}


function Header({ onBack, onImportExcel }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Hojas de gasto</Text>
      <View style={styles.headerActions}>
        {onImportExcel ? (
          <Pressable style={styles.importBtn} onPress={onImportExcel}>
            <Text style={styles.importBtnText}>Importar Excel</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
      </View>
    </View>
  );
}

function amountFromExpense_(e) {
  const parse = (v) => {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  switch (t) {
    case "COMBUSTIBLES":
      return parse(e?.total_a_pagar);
    case "SEGURO":
      return parse(e?.prima);
    case "IMPUESTOS":
      return parse(e?.importe_ivm);
    case "OTROS_IMPUESTOS":
      return parse(e?.importe_otros_impuestos);
    case "REPUESTOS_RECAMBIO":
      return parse(e?.importe_repuestos);
    case "MANTENIMIENTO_REPARACIONES":
      return parse(e?.importe_mantenimiento);
    case "PARKING":
      return parse(e?.importe_aparcamiento);
    case "PEAJES":
      return parse(e?.importe_peaje);
    case "GASTOS_BILLETES":
      return (
        parse(e?.coste_total) ||
        parse(e?.importe_pagar) ||
        parse(e?.precio_total_billete) + parse(e?.tasas_billete)
      );
    case "ITV":
      return parse(e?.importe_itv);
    case "MULTAS_SANCIONES":
      return parse(e?.importe_multa);
    case "OTROS":
      return parse(e?.importe_otros_gastos);
    case "HOSPEDAJE":
      return parse(e?.importe_hospedaje || e?.importe_otros_gastos);
    case "MANUTENCION":
      return parse(e?.importe_manutencion || e?.importe_otros_gastos);
    case "KILOMETRAJE_COLABORADOR":
      return parse(e?.importe_km_colaborador || e?.coste_total);
    default:
      return 0;
  }
}


function expenseDate_(e) {
  return expenseDate(e);
}

function isUserPaidPending_(e) {
  return isPendingUserPaidExpense(e);
}

function expenseActorEmail_(e) {
  return String(e?.usuario_email || e?.responsable_email || e?.user_email || "")
    .trim()
    .toLowerCase();
}

/** Titular del gasto (quien lo imputa): prioriza responsable_email (on-behalf). */
function expenseOwnerEmail_(e) {
  return String(e?.responsable_email || e?.usuario_email || e?.user_email || "")
    .trim()
    .toLowerCase();
}

function expensePlate_(e) {
  return String(e?.matricula || e?.vehiclePlate || "").trim().toUpperCase();
}

/** Gastos que pueden incluirse en una hoja según rol (además de isUserPaidPending_). */
function expenseSelectableForSheet_(e, { gestor, administracion, responsable, me, assignedSet }) {
  if (gestor || administracion) return true;
  // gasto_list ya aplicó visibilidad por rol/email en el servidor.
  if (e?._fromRemoteList) return true;
  const owner = expenseActorEmail_(e);
  const plate = expensePlate_(e);
  if (responsable) {
    if (me && owner === me) return true;
    if (plate && assignedSet && assignedSet.has(plate)) return true;
    return false;
  }
  if (owner && me && owner === me) return true;
  // Sin email en fila (pestaña por tipo): si está en local del usuario, permitir.
  if (!owner && me) return true;
  return false;
}

function displayNameFromUserOptions_(email, userOptions, fallbackRecord) {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return "";
  const fromOpt = (Array.isArray(userOptions) ? userOptions : []).find((u) => u.value === em);
  if (fromOpt?.label) {
    return String(fromOpt.label || "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
  }
  const n = String(fallbackRecord?.nombre || "").trim();
  if (n && !n.includes("@")) return n;
  return em.split("@")[0] || em;
}

function sheetTouchesAssignedPlates_(sheet, assignedSet) {
  if (!assignedSet || !assignedSet.size) return false;
  const lines = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
  return lines.some((l) => {
    const p = String(l?.matricula || "").trim().toUpperCase();
    return p && assignedSet.has(p);
  });
}

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

/** Claves posibles para deduplicar hoja local vs fila del listado remoto. */
function sheetKeysSet_(s) {
  const set = new Set();
  const a = String(s?.hoja_gasto_id || "").trim();
  const b = String(s?.hoja_id_local || "").trim();
  const c = String(s?.id || "").trim();
  if (a) set.add(a);
  if (b) set.add(b);
  if (c) set.add(c);
  return set;
}

/** Reconstruye líneas de hoja desde gastos locales vinculados (si el resumen remoto viene vacío). */
function linesFromLocalExpensesForSheet_(sheet, expenseList) {
  const keys = sheetKeysSet_(sheet);
  if (!keys.size) return [];
  const list = Array.isArray(expenseList) ? expenseList : [];
  const rows = list.filter((e) => {
    const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
    return hid && keys.has(hid);
  });
  if (!rows.length) return [];
  return sortExpenseSheetLinesByDateInvoice_(
    rows.map((e) => {
      const tipo = String(e?.tipo_gasto || "").trim();
      const fin = enrichExpensePayloadWithIva
        ? enrichExpensePayloadWithIva({
            ...e,
            tipo_gasto: tipo,
            importe_pagar: amountFromExpense_(e),
            coste_total: amountFromExpense_(e),
          })
        : e;
      const gid = String(e?.id_gasto || "").trim();
      const localId = String(e?.id || e?.local_id || "").trim();
      return {
        id_gasto: /^GAS/i.test(gid) ? gid : "",
        expense_id: localId,
        fecha: normalizeDateToDmy(expenseDate(e)) || "",
        matricula: String(e?.matricula || e?.vehiclePlate || "").trim(),
        tipo_gasto: tipo,
        concepto: conceptoFromExpenseRecord(e) || humanConcept_(tipo),
        entidad: entityFromExpense_(e),
        numero_factura: invoiceFromExpense_(e),
        proyecto: String(
          e?.departamento_o_proyecto === "__OTRO__"
            ? e?.departamento_o_proyecto_custom || ""
            : e?.departamento_o_proyecto || e?.departamento_o_proyecto_custom || e?.proyecto_nombre || ""
        ).trim(),
        importe: Number(Number(fin?.importe_pagar ?? amountFromExpense_(e) ?? 0).toFixed(2)),
        importe_pagar: Number(Number(fin?.importe_pagar ?? amountFromExpense_(e) ?? 0).toFixed(2)),
        base_imponible: fin?.base_imponible,
        iva_pct: fin?.iva_pct,
        iva_eur: fin?.iva_eur,
        work_package: String(e?.work_package || "").trim(),
        accion_proyecto: String(e?.accion_proyecto || "").trim(),
        ticket_drive_url: e?.ticket_drive_url,
        ticket_drive_urls: e?.ticket_drive_urls,
        ticket_drive_urls_json: e?.ticket_drive_urls_json,
        ticketLocalUris: e?.ticketLocalUris,
        ticket_urls: e?.ticket_urls,
      };
    })
  );
}

function sheetLinesHavePrintableData_(lines) {
  return (Array.isArray(lines) ? lines : []).some((ln) => {
    const importe = Number(ln?.importe_pagar ?? ln?.importe ?? ln?.coste_total ?? 0);
    return !!(
      String(ln?.concepto || ln?.tipo_gasto || "").trim() ||
      String(ln?.entidad || "").trim() ||
      String(ln?.numero_factura || "").trim() ||
      String(ln?.fecha || "").trim() ||
      (Number.isFinite(importe) && Math.abs(importe) > 0.0001)
    );
  });
}

/** Id interno de hoja para API (HG-…), nunca el nº visible T-MES-AÑO-COD. */
function resolveSheetServerId_(sheet) {
  const hid = String(sheet?.hoja_gasto_id || sheet?.hoja_id_local || "").trim();
  if (hid && !/^T-\d{2}-\d{4}-/i.test(hid) && !/^remote-/i.test(hid)) return hid;
  const alt = String(sheet?.id || "").trim();
  if (alt && /^HG-/i.test(alt)) return alt;
  return hid || alt;
}

function postSheetApi_(action, payload, meta, options) {
  if (Platform.OS === "web") {
    return sheetsApi.postWebSafe(action, payload, meta, options);
  }
  return sheetsApi.post(action, payload, meta, options);
}

/** Quita hojas locales obsoletas (p. ej. pruebas) cuando el servidor ya no las tiene. */
async function pruneStaleLocalSheetsForGestor_(remoteRows, role, outboxJobs) {
  if (!isGestor(role) && !isAdministracion(role)) return null;

  const remoteIds = new Set();
  for (const r of remoteRows || []) {
    sheetKeysSet_(r).forEach((k) => remoteIds.add(k));
  }

  const pendingLocalIds = new Set(
    (outboxJobs || [])
      .filter((j) => j?.kind === "expense_sheet")
      .map((j) => String(j?.payload?.hoja_id_local || j?.payload?.hoja_gasto_id || "").trim())
      .filter(Boolean)
  );

  const localSheets = await localDb.getExpenseSheets();
  const removedIds = new Set();
  const kept = (Array.isArray(localSheets) ? localSheets : []).filter((s) => {
    const keys = [...sheetKeysSet_(s)];
    if (!keys.length) return false;
    if (keys.some((k) => remoteIds.has(k))) return true;
    if (keys.some((k) => pendingLocalIds.has(k))) return true;
    const sync = sheetSyncStatus_(s, outboxJobs);
    if (sync.tone === "warn" || sync.tone === "error") return true;
    keys.forEach((k) => removedIds.add(k));
    return false;
  });

  if (kept.length === (localSheets || []).length) return null;

  await localDb.setExpenseSheets(kept);

  if (removedIds.size) {
    const exps = await localDb.getExpenses();
    const nextExps = (Array.isArray(exps) ? exps : []).map((e) => {
      const hid = String(e?.hoja_gasto_id || "").trim();
      if (!hid || !removedIds.has(hid)) return e;
      return {
        ...e,
        hoja_gasto_id: "",
        hoja_gasto_estado: "",
        num_hoja_gasto: "",
        Num_Hoja_Gasto: "",
      };
    });
    await localDb.setExpenses(nextExps);
    return { sheets: kept, expenses: nextExps };
  }

  return { sheets: kept, expenses: null };
}

function parseRemoteListRow_(x) {
  const hid = String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim();
  return {
    id: hid || `remote-${String(x?.num_hoja_gasto || "").slice(0, 12)}`,
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

/** Hojas visibles en la lista local según rol. */
function sheetVisibleForRole_(sheet, { gestor, responsable, me, assignedSet }) {
  if (gestor) return true;
  const creator = String(sheet?.usuario_email || "").trim().toLowerCase();
  if (responsable) {
    if (me && creator === me) return true;
    if (sheetTouchesAssignedPlates_(sheet, assignedSet)) return true;
    return false;
  }
  if (!creator) return true;
  return !!(me && creator === me);
}

function parseDateMs_(value) {
  const d = parseDateFlexible(value);
  return d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

const SHEET_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "T", label: "T — Viaje" },
  { value: "OG", label: "OG — Otros Pygargus" },
  { value: "O", label: "O — Otros Rhodopes" },
  { value: "AL", label: "AL — Alimentación" },
  { value: "ED", label: "ED — Educación" },
  { value: "VET", label: "VET — Veterinarios" },
  { value: "C", label: "C — Colaborador" },
];

function sheetTypePrefixFromNum_(num) {
  const s = String(num || "").trim();
  const m = s.match(/^(T|OG|O|AL|ED|VET|C)-/i);
  return m ? String(m[1]).toUpperCase() : "";
}

function sheetMonthFromNum_(num) {
  const s = String(num || "").trim();
  const m = s.match(/^(?:T|OG|O|AL|ED|VET|C)-(\d{2})-\d{4}-/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : 0;
}

function sheetProyectoFromMetaAndLineas_(sheet) {
  const meta = sheet?.sheet_meta && typeof sheet.sheet_meta === "object" ? sheet.sheet_meta : {};
  const fromMeta = String(meta?.proyecto || meta?.departamento_o_proyecto || "").trim();
  if (fromMeta) return fromMeta;
  const lineas = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
  for (const ln of lineas) {
    const p = String(ln?.proyecto || ln?.departamento_o_proyecto || ln?.proyecto_nombre || "").trim();
    if (p) return p;
  }
  return "";
}

function sheetAllLinkKeys_(sheet) {
  const keys = sheetKeysSet_(sheet);
  const num = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (num) keys.add(num);
  const base = expenseSheetNumberBase(num);
  if (base) keys.add(base);
  return keys;
}

function buildSheetProyectoIndex_(sheets, expenses, proyectoById) {
  const index = new Map();
  const addLabel = (keys, label) => {
    const name = String(label || "").trim();
    if (!name) return;
    for (const k of keys) {
      if (!k) continue;
      if (!index.has(k)) index.set(k, new Set());
      index.get(k).add(name);
    }
  };

  for (const s of Array.isArray(sheets) ? sheets : []) {
    const keys = sheetAllLinkKeys_(s);
    addLabel(keys, sheetProyectoFromMetaAndLineas_(s));
  }

  for (const e of Array.isArray(expenses) ? expenses : []) {
    const label = resolveProyectoNombreParaGasto(e, proyectoById);
    if (!label) continue;
    const keys = new Set();
    const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
    if (hid) keys.add(hid);
    const num = String(e?.num_hoja_gasto || e?.Num_Hoja_Gasto || "").trim();
    if (num) {
      keys.add(num);
      const base = expenseSheetNumberBase(num);
      if (base) keys.add(base);
    }
    addLabel(keys, label);
  }
  return index;
}

function sheetProyectoLabelsForSheet_(sheet, proyectoIndex, proyectoById) {
  const labels = new Set();
  for (const k of sheetAllLinkKeys_(sheet)) {
    const set = proyectoIndex?.get(k);
    if (set) set.forEach((l) => labels.add(l));
  }
  const direct = sheetProyectoFromMetaAndLineas_(sheet);
  if (direct) {
    const resolved = proyectoById?.get(direct) || direct;
    labels.add(resolved);
  }
  return [...labels];
}

function sheetProyectoLabel_(sheet, proyectoIndex, proyectoById) {
  const labels = sheetProyectoLabelsForSheet_(sheet, proyectoIndex, proyectoById);
  return labels[0] || "";
}

function sheetUsuarioKey_(sheet) {
  const email = String(sheet?.usuario_email || "").trim().toLowerCase();
  if (email) return email;
  return String(sheet?.usuario_nombre || "").trim().toLowerCase();
}

function sheetReferenceDateMs_(sheet) {
  const candidates = [
    sheet?.fecha_hoja,
    sheet?.fecha_firma,
    sheet?.sheet_meta?.fecha_hoja,
    sheet?.hoja_gasto_fecha_envio,
    sheet?.createdAtLocal,
  ];
  for (const c of candidates) {
    const ms = parseDateMs_(c);
    if (ms) return ms;
  }
  const lineas = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
  let best = 0;
  for (const ln of lineas) {
    const ms = parseDateMs_(ln?.fecha || ln?.fecha_gasto);
    if (ms && (!best || ms < best)) best = ms;
  }
  return best;
}

function sheetMatchesListFilters_(sheet, filters, ctx) {
  const num = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (filters.proyecto) {
    const wanted = String(filters.proyecto || "").trim();
    const wantedName = ctx?.proyectoById?.get(wanted) || wanted;
    const labels = sheetProyectoLabelsForSheet_(sheet, ctx?.proyectoIndex, ctx?.proyectoById);
    if (!labels.some((l) => l === wantedName || l === wanted)) return false;
  }
  if (filters.usuario) {
    if (sheetUsuarioKey_(sheet) !== filters.usuario) return false;
  }
  if (filters.tipo) {
    if (sheetTypePrefixFromNum_(num) !== filters.tipo) return false;
  }
  if (filters.mes) {
    if (sheetMonthFromNum_(num) !== filters.mes) return false;
  }
  if (filters.fromMs || filters.toEndMs) {
    const d = sheetReferenceDateMs_(sheet);
    if (!d) return false;
    if (filters.fromMs && d < filters.fromMs) return false;
    if (filters.toEndMs && d > filters.toEndMs) return false;
  }
  return true;
}

function sheetSyncStatus_(sheet, outbox) {
  if (sheet?._fromRemoteList) {
    return { text: "SERVIDOR", tone: "ok" };
  }
  const sid = String(sheet?.id || "").trim();
  const pending = (outbox || []).find((j) => {
    if (j?.kind !== "expense_sheet") return false;
    const jid = String(j?.payload?.hoja_id_local || "").trim();
    return jid && jid === sid;
  });
  if (!pending) return { text: "SINCRONIZADA", tone: "ok" };
  if (String(pending?._syncError || "").trim()) return { text: "ERROR_SYNC", tone: "error" };
  return { text: "PENDIENTE_SYNC", tone: "warn" };
}

function entityFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") {
    return String(e?.entidad_combustible || e?.marca_combustible || e?.lugar_repostaje || e?.proveedor || "").trim();
  }
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.proveedor_mantenimiento || e?.proveedor || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.proveedor_repuestos || e?.proveedor || "").trim();
  if (t === "GASTOS_BILLETES") return String(e?.compania_billete || e?.proveedor || "").trim();
  if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
    return String(
      e?.proveedor_otros_gastos || e?.entidad_hospedaje || e?.establecimiento_manutencion || e?.proveedor || ""
    ).trim();
  }
  if (t === "MULTAS_SANCIONES" || t === "MULTAS") {
    return String(e?.organismo_denunciante || e?.proveedor || "").trim();
  }
  if (t === "SEGURO" || t === "SEGUROS") return String(e?.compania || e?.proveedor || "").trim();
  if (t === "ITV") return String(e?.estacion_itv || e?.proveedor || e?.concepto || "").trim();
  if (t === "PEAJES") return String(e?.entidad_peaje || e?.proveedor || e?.salida_peaje || e?.entrada_peaje || "").trim();
  if (t === "PARKING") return String(e?.entidad_parking || e?.proveedor || e?.tipo_zona || "").trim();
  if (t === "KILOMETRAJE_COLABORADOR") return String(e?.accion_colaborador || e?.origen_colaborador || "").trim();
  return String(e?.proveedor || "").trim();
}

function findLocalExpenseForLine_(ln, expenseList) {
  const list = Array.isArray(expenseList) ? expenseList : [];
  const key = String(ln?.id_gasto || ln?.expense_id || "").trim();
  return (
    list.find((e) => String(e?.id_gasto || "").trim() === key) ||
    list.find((e) => String(e?.id || e?.local_id || "").trim() === String(ln?.expense_id || "").trim()) ||
    list.find((e) => String(e?.id || e?.local_id || "").trim() === String(ln?.id_gasto || "").trim()) ||
    null
  );
}

function invoiceFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") return String(e?.numero_ticket || "").trim();
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.numero_factura_mantenimiento || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.numero_factura_repuestos || "").trim();
  if (t === "ITV") return String(e?.numero_factura_itv || "").trim();
  if (t === "GASTOS_BILLETES") return String(e?.numero_reserva_billete || e?.numero_factura_otros || "").trim();
  if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
    return String(e?.numero_factura_otros || e?.numero_factura_hospedaje || e?.numero_factura_manutencion || "").trim();
  }
  if (t === "PEAJES") return String(e?.numero_factura_peaje || "").trim();
  if (t === "PARKING") return "TIQUET";
  if (t === "KILOMETRAJE_COLABORADOR") return "VIAJE";
  return String(e?.numero_ticket || "").trim();
}

function humanConcept_(tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  const map = {
    COMBUSTIBLES: "combustible",
    DIETAS: "dieta",
    CONSUMIBLES: "consumible",
    MANTENIMIENTO_REPARACIONES: "mantenimiento",
    REPUESTOS_RECAMBIO: "repuestos",
    PARKING: "aparcamiento",
    PEAJES: "peaje",
    GASTOS_BILLETES: "billete",
    ITV: "itv",
    MULTAS_SANCIONES: "multa/sanción",
    OTROS: "otros gastos",
    HOSPEDAJE: "hospedaje",
    MANUTENCION: "manutención",
    KILOMETRAJE_COLABORADOR: "kilometraje colaborador",
    SEGURO: "seguro",
    IMPUESTOS: "impuestos",
    OTROS_IMPUESTOS: "otros impuestos",
  };
  return map[t] || String(tipo || "gasto").toLowerCase();
}

function personFromSheet_(sheet, user, preferredName) {
  const fromSheet = String(sheet?.usuario_nombre || "").trim();
  if (fromSheet && !fromSheet.includes("@")) return fromSheet;
  const num = String(sheet?.num_hoja_gasto || "").trim();
  const marker = " R.G.T. ";
  const p = num.indexOf(marker);
  if (p >= 0) {
    const nameFromNum = num.slice(p + marker.length).split(" - ")[0].trim();
    if (nameFromNum) return nameFromNum;
  }
  const fromUser = resolvedUserName_(user, preferredName);
  if (fromUser && !fromUser.includes("@")) return fromUser;
  return String(fromSheet || fromUser || "Usuario").replace(/@.*/, "");
}

const EMPTY_SHEET_FILTERS = {
  proyecto: "",
  usuario: "",
  tipo: "",
  mes: "",
  fechaDesde: "",
  fechaHasta: "",
};

export default function ExpenseSheetsScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const { syncNow: runSync } = useSyncActions();
  const gestor = isGestor(role);
  const administracion = isAdministracion(role);
  const responsable = isResponsable(role);
  const canImportExcel = canImportExpenseSheetExcel(role);
  const canOnBehalf = canRecordExpenseOnBehalf(role);
  const selfEmail = String(user?.email || "").trim().toLowerCase();
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [expenses, setExpenses] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selected, setSelected] = useState({});
  const [sending, setSending] = useState(false);
  const [printingSheetId, setPrintingSheetId] = useState("");
  const [printingProgress, setPrintingProgress] = useState("");
  const [sheetFilterProyecto, setSheetFilterProyecto] = useState("");
  const [sheetFilterUsuario, setSheetFilterUsuario] = useState("");
  const [sheetFilterTipo, setSheetFilterTipo] = useState("");
  const [sheetFilterMes, setSheetFilterMes] = useState("");
  const [sheetFilterFechaDesde, setSheetFilterFechaDesde] = useState("");
  const [sheetFilterFechaHasta, setSheetFilterFechaHasta] = useState("");
  const [appliedSheetFilters, setAppliedSheetFilters] = useState(EMPTY_SHEET_FILTERS);
  const [proyectoSelectOptions, setProyectoSelectOptions] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [usuarioRecord, setUsuarioRecord] = useState(null);
  const [onBehalfEmail, setOnBehalfEmail] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [titularUsuarioRecord, setTitularUsuarioRecord] = useState(null);
  const [remoteSheets, setRemoteSheets] = useState([]);
  const [remoteListLoading, setRemoteListLoading] = useState(false);
  const [createMetaModal, setCreateMetaModal] = useState({
    visible: false,
    mode: "generic", // generic | life
    fechaHoja: "",
    dni: "",
    lineMetaRows: [],
    viajeSnapshot: null,
  });
  const [printMetaModal, setPrintMetaModal] = useState({
    visible: false,
    sheet: null,
    sheetForPrint: null,
    lines: [],
    fechaHoja: "",
    dni: "",
    lineMetaRows: [],
    mode: "share",
  });
  const [previewModal, setPreviewModal] = useState({
    visible: false,
    html: "",
    title: "",
  });
  const [editSheetModal, setEditSheetModal] = useState({
    visible: false,
    sheet: null,
    lines: [],
    selected: {},
    loading: false,
    busy: false,
    progressText: "",
    result: null, // { ok: true|false, message: string }
    confirm: null, // { reopenAll, title, message, idGastos, localKeys }
  });

  const reloadAll = React.useCallback(async () => {
    const [allExpenses, allSheets, allOutbox] = await Promise.all([
      localDb.getExpenses(),
      localDb.getExpenseSheets(),
      localDb.getOutbox(),
    ]);
    setExpenses(Array.isArray(allExpenses) ? allExpenses : []);
    setSheets(Array.isArray(allSheets) ? allSheets : []);
    setOutbox(Array.isArray(allOutbox) ? allOutbox : []);
  }, []);

  const loadRemoteSheets = React.useCallback(async () => {
    const email = String(user?.email || "").trim();
    if (!email) {
      setRemoteSheets([]);
      return;
    }
    setRemoteListLoading(true);
    try {
      const emailLower = String(email || "").trim().toLowerCase();
      try {
        const pulled = await pullRemoteExpensesForUser_(emailLower);
        if (pulled.ok && Array.isArray(pulled.expenses)) {
          setExpenses(pulled.expenses);
        } else {
          await reconcileLocalExpensesAndSheets_(emailLower);
          await reloadAll();
        }
      } catch {
        await reconcileLocalExpensesAndSheets_(emailLower);
        await reloadAll();
      }
      const res = await sheetsApi.get("hojas_gasto_list", { user_email: email });
      let rows = asList_(res)
        .map(parseRemoteListRow_)
        .filter((x) => String(x?.hoja_gasto_id || "").trim());

      // Reparar I/II/III: si hay 2+ hojas con el mismo prefijo, renumerar en servidor
      // por fecha de emisión de la hoja (no por orden de creación).
      try {
        const byPrefix = new Map();
        for (const r of rows) {
          const base = expenseSheetNumberBase(r?.num_hoja_gasto || r?.Num_Hoja_Gasto);
          if (!base) continue;
          if (!byPrefix.has(base)) byPrefix.set(base, []);
          byPrefix.get(base).push(r);
        }
        for (const [prefix, group] of byPrefix.entries()) {
          if (!Array.isArray(group) || group.length < 2) continue;
          try {
            const renumRes = await sheetsApi.postWebSafe(
              "hoja_gasto_renumerar_prefijo",
              { prefix, user_email: email },
              { user_email: email },
              { timeoutMs: 45000 }
            );
            const map = renumRes?.data?.renumbered || renumRes?.renumbered || null;
            if (!map || typeof map !== "object") continue;
            rows = rows.map((r) => {
              const hid = String(r?.hoja_gasto_id || "").trim();
              const nextNum = hid && map[hid] ? String(map[hid]).trim() : "";
              if (!nextNum) return r;
              return { ...r, num_hoja_gasto: nextNum, Num_Hoja_Gasto: nextNum };
            });
            const localSheets = await localDb.getExpenseSheets();
            const nextLocal = (Array.isArray(localSheets) ? localSheets : []).map((s) => {
              const hid = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
              const nextNum = hid && map[hid] ? String(map[hid]).trim() : "";
              if (!nextNum) return s;
              return { ...s, num_hoja_gasto: nextNum, Num_Hoja_Gasto: nextNum };
            });
            await localDb.setExpenseSheets(nextLocal);
            setSheets(nextLocal);
            const localExps = await localDb.getExpenses();
            const nextExps = (Array.isArray(localExps) ? localExps : []).map((e) => {
              const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
              const nextNum = hid && map[hid] ? String(map[hid]).trim() : "";
              if (!nextNum) return e;
              return { ...e, num_hoja_gasto: nextNum, Num_Hoja_Gasto: nextNum };
            });
            await localDb.setExpenses(nextExps);
            setExpenses(nextExps);
          } catch {
            // No bloquear la lista si falla una renumeración puntual.
          }
        }
      } catch {
        // silent
      }

      setRemoteSheets(rows);

      const outboxJobs = await localDb.getOutbox();
      const pruned = await pruneStaleLocalSheetsForGestor_(rows, role, outboxJobs);
      if (pruned) {
        setSheets(pruned.sheets);
        if (pruned.expenses) setExpenses(pruned.expenses);
      }
    } catch {
      setRemoteSheets([]);
    } finally {
      setRemoteListLoading(false);
    }
  }, [reloadAll, role, user?.email]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [allExpenses, allSheets, allOutbox] = await Promise.all([
        localDb.getExpenses(),
        localDb.getExpenseSheets(),
        localDb.getOutbox(),
      ]);
      if (!alive) return;
      setExpenses(Array.isArray(allExpenses) ? allExpenses : []);
      setSheets(Array.isArray(allSheets) ? allSheets : []);
      setOutbox(Array.isArray(allOutbox) ? allOutbox : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadRemoteSheets();
    }, [loadRemoteSheets])
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!responsable || gestor) {
        setAssignedSet(new Set());
        return;
      }
      try {
        const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const flota = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
        const me = String(user?.email || "").trim().toLowerCase();
        const mine = flota.filter((v) => {
          const resp = String(v?.responsable || "").trim().toLowerCase();
          const notify = String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "")
            .trim()
            .toLowerCase();
          return !!me && (resp === me || notify === me);
        });
        const next = new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
        if (alive) setAssignedSet(next);
      } catch {
        if (alive) setAssignedSet(new Set());
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, responsable, gestor]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) return;
        const res = await sheetsApi.get("usuario_get", { email, user_email: email });
        const data = res?.data || res || {};
        if (!alive) return;
        if (data && typeof data === "object") setUsuarioRecord(data);
        const name = String(data?.nombre || "").trim();
        if (name) setProfileName(name);
      } catch {
        // fallback local
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const email = String(user?.email || "").trim().toLowerCase();
      if (!email) {
        if (alive) setProyectoSelectOptions([]);
        return;
      }
      try {
        const rows = await fetchProyectoRowsColumnaBCached(
          (action, params) => sheetsApi.get(action, params),
          email
        );
        if (!alive) return;
        setProyectoSelectOptions(mapProjectSelectOptions(rows));
      } catch {
        if (alive) setProyectoSelectOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  React.useEffect(() => {
    if (!canOnBehalf) {
      setUserOptions([]);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" });
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (!alive) return;
        const users = rows
          .map((u) => {
            const email = String(u?.email || "").trim().toLowerCase();
            const nombre = String(u?.nombre || "").trim();
            const activo = String(u?.activo || u?.estado || "SI").trim().toUpperCase();
            if (!email) return null;
            if (activo === "NO" || activo === "FALSE" || activo === "0" || activo === "INACTIVO") return null;
            return { value: email, label: nombre ? `${nombre} (${email})` : email };
          })
          .filter(Boolean)
          .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
        setUserOptions(users);
      } catch {
        if (alive) setUserOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canOnBehalf, user?.email]);

  React.useEffect(() => {
    if (!canOnBehalf || !onBehalfEmail) {
      setTitularUsuarioRecord(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const res = await sheetsApi.get("usuario_get", {
          email: onBehalfEmail,
          user_email: String(user?.email || "").trim().toLowerCase(),
        });
        const data = res?.data || res || {};
        if (alive && data && typeof data === "object") setTitularUsuarioRecord(data);
      } catch {
        if (alive) setTitularUsuarioRecord(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canOnBehalf, onBehalfEmail, user?.email]);

  const sheetCtx = useMemo(
    () => ({
      gestor,
      administracion,
      responsable,
      me: selfEmail,
      assignedSet,
    }),
    [administracion, gestor, responsable, selfEmail, assignedSet]
  );

  /** Filtro opcional: vacío = todos los usuarios (GESTOR/ADMIN). */
  const filterOwnerEmail = String(onBehalfEmail || "").trim().toLowerCase();

  const pending = useMemo(() => {
    const rows = expenses
      .filter((e) => isUserPaidPending_(e) && expenseSelectableForSheet_(e, sheetCtx))
      .filter((e) => {
        if (!canOnBehalf || !filterOwnerEmail) return true;
        const owner = expenseOwnerEmail_(e);
        if (!owner) return filterOwnerEmail === selfEmail;
        return owner === filterOwnerEmail;
      })
      .map((e) => {
        const id = expenseAppRowId(e);
        const owner = expenseOwnerEmail_(e);
        return {
          id,
          amount: amountFromExpense_(e),
          date: expenseDate_(e),
          plate: String(e?.matricula || e?.vehiclePlate || "").trim().toUpperCase(),
          type: String(e?.tipo_gasto || "").trim(),
          ownerEmail: owner,
          ownerLabel: displayNameFromUserOptions_(owner, userOptions, null) || owner || "—",
          raw: e,
          numero_factura: invoiceFromExpense_(e),
        };
      })
      .filter((x) => x.id);
    // Misma regla que la hoja PDF: fecha asc + nº factura.
    return sortExpenseSheetLinesByDateInvoice_(
      rows.map((r) => ({ ...r, fecha: r.date, numero_factura: r.numero_factura }))
    ).map(({ fecha, ...rest }) => rest);
  }, [
    expenses,
    sheetCtx,
    canOnBehalf,
    filterOwnerEmail,
    selfEmail,
    userOptions,
  ]);

  const mergedDisplayedSheets = useMemo(() => {
    const sortSheets_ = compareExpenseSheetsByNameDesc_;
    if (gestor || administracion) {
      const localByKey = new Map();
      for (const s of sheets) {
        if (!sheetVisibleForRole_(s, sheetCtx)) continue;
        sheetKeysSet_(s).forEach((k) => localByKey.set(k, s));
      }
      const remoteKeys = new Set();
      const mergedRemote = remoteSheets
        .filter((r) => sheetVisibleForRole_(r, sheetCtx))
        .map((r) => {
          sheetKeysSet_(r).forEach((k) => remoteKeys.add(k));
          const local = [...sheetKeysSet_(r)].map((k) => localByKey.get(k)).find(Boolean);
          if (!local) return r;
          const remoteLines = Array.isArray(r?.lineas) ? r.lineas : [];
          const localLines = Array.isArray(local?.lineas) ? local.lineas : [];
          return {
            ...r,
            lineas: remoteLines.length ? remoteLines : localLines,
            viaje: r?.viaje || local?.viaje,
            dni: String(r?.dni || local?.dni || "").trim(),
            fecha_hoja: String(r?.fecha_hoja || local?.fecha_hoja || "").trim(),
            fecha_firma: String(r?.fecha_firma || local?.fecha_firma || "").trim(),
            sheet_meta: {
              ...(local?.sheet_meta && typeof local.sheet_meta === "object" ? local.sheet_meta : {}),
              ...(r?.sheet_meta && typeof r.sheet_meta === "object" ? r.sheet_meta : {}),
            },
            usuario_nombre: String(r?.usuario_nombre || local?.usuario_nombre || "").trim(),
            cod_personal: String(r?.cod_personal || local?.cod_personal || "").trim(),
          };
        });
      const localOnly = sheets.filter((s) => {
        if (!sheetVisibleForRole_(s, sheetCtx)) return false;
        const ks = [...sheetKeysSet_(s)];
        if (!ks.length) return true;
        return !ks.some((k) => remoteKeys.has(k));
      });
      return [...mergedRemote, ...localOnly].sort(sortSheets_);
    }

    const localVisible = sheets.filter((s) => sheetVisibleForRole_(s, sheetCtx));
    const keySeen = new Set();
    localVisible.forEach((s) => {
      sheetKeysSet_(s).forEach((k) => keySeen.add(k));
    });
    const out = [...localVisible];
    for (const r of remoteSheets) {
      if (!sheetVisibleForRole_(r, sheetCtx)) continue;
      const ks = sheetKeysSet_(r);
      if (!ks.size) continue;
      const dup = [...ks].some((k) => keySeen.has(k));
      if (dup) continue;
      out.push(r);
      ks.forEach((k) => keySeen.add(k));
    }
    out.sort(sortSheets_);
    return out;
  }, [administracion, gestor, remoteSheets, sheetCtx, sheets]);

  const sheetsForNumbering = useMemo(() => {
    // Prefijo de numeración: hojas del titular filtrado, o todas si se ven todos.
    if (!filterOwnerEmail) return mergedDisplayedSheets;
    return mergedDisplayedSheets.filter(
      (s) => String(s?.usuario_email || "").trim().toLowerCase() === filterOwnerEmail
    );
  }, [mergedDisplayedSheets, filterOwnerEmail]);

  const proyectoById = useMemo(
    () => buildProyectoNombreByIdMap(proyectoSelectOptions.map((o) => ({ id_proyecto: o.value, nombre_proyecto: o.label }))),
    [proyectoSelectOptions]
  );

  const sheetProyectoIndex = useMemo(
    () => buildSheetProyectoIndex_(mergedDisplayedSheets, expenses, proyectoById),
    [mergedDisplayedSheets, expenses, proyectoById]
  );

  const sheetFilterOptions = useMemo(() => {
    const proyectos = new Set(proyectoSelectOptions.map((o) => String(o.label || "").trim()).filter(Boolean));
    for (const s of mergedDisplayedSheets) {
      sheetProyectoLabelsForSheet_(s, sheetProyectoIndex, proyectoById).forEach((p) => proyectos.add(p));
    }
    const usuarios = new Map();
    for (const s of mergedDisplayedSheets) {
      const uk = sheetUsuarioKey_(s);
      if (uk) {
        const name = String(s?.usuario_nombre || "").trim();
        const label =
          name && !name.includes("@")
            ? name
            : displayNameFromUserOptions_(uk, userOptions, null) || uk;
        usuarios.set(uk, label);
      }
    }
    const proyectoOpts = [
      { value: "", label: "Todos los proyectos" },
      ...[...proyectos].sort((a, b) => a.localeCompare(b, "es")).map((p) => ({ value: p, label: p })),
    ];
    const usuarioOpts = [
      { value: "", label: "Todos los usuarios" },
      ...[...usuarios.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"))
        .map(([value, label]) => ({ value, label: `${label}${value.includes("@") ? "" : ""}` })),
    ];
    const mesOpts = [
      { value: "", label: "Todos los meses" },
      ...MESES_ES_KM.map((m) => ({
        value: String(m.value),
        label: `${String(m.value).padStart(2, "0")} — ${m.label}`,
      })),
    ];
    return { proyectoOpts, usuarioOpts, mesOpts };
  }, [mergedDisplayedSheets, userOptions, proyectoSelectOptions, sheetProyectoIndex, proyectoById]);

  const filteredDisplayedSheets = useMemo(() => {
    const fromMs = parseDateMs_(appliedSheetFilters.fechaDesde);
    const toMs = parseDateMs_(appliedSheetFilters.fechaHasta);
    const toEndMs = toMs ? toMs + 24 * 60 * 60 * 1000 - 1 : 0;
    const filters = {
      proyecto: String(appliedSheetFilters.proyecto || "").trim(),
      usuario: String(appliedSheetFilters.usuario || "").trim().toLowerCase(),
      tipo: String(appliedSheetFilters.tipo || "").trim().toUpperCase(),
      mes: Number(appliedSheetFilters.mes || 0) || 0,
      fromMs,
      toEndMs,
    };
    const any =
      filters.proyecto ||
      filters.usuario ||
      filters.tipo ||
      filters.mes ||
      filters.fromMs ||
      filters.toEndMs;
    if (!any) return mergedDisplayedSheets;
    const ctx = { proyectoIndex: sheetProyectoIndex, proyectoById };
    return mergedDisplayedSheets.filter((s) => sheetMatchesListFilters_(s, filters, ctx));
  }, [mergedDisplayedSheets, appliedSheetFilters, sheetProyectoIndex, proyectoById]);

  const sheetFiltersDraftActive = useMemo(
    () =>
      Boolean(
        String(sheetFilterProyecto || "").trim() ||
          String(sheetFilterUsuario || "").trim() ||
          String(sheetFilterTipo || "").trim() ||
          String(sheetFilterMes || "").trim() ||
          String(sheetFilterFechaDesde || "").trim() ||
          String(sheetFilterFechaHasta || "").trim()
      ),
    [
      sheetFilterProyecto,
      sheetFilterUsuario,
      sheetFilterTipo,
      sheetFilterMes,
      sheetFilterFechaDesde,
      sheetFilterFechaHasta,
    ]
  );

  const sheetFiltersAppliedActive = useMemo(
    () =>
      Boolean(
        String(appliedSheetFilters.proyecto || "").trim() ||
          String(appliedSheetFilters.usuario || "").trim() ||
          String(appliedSheetFilters.tipo || "").trim() ||
          String(appliedSheetFilters.mes || "").trim() ||
          String(appliedSheetFilters.fechaDesde || "").trim() ||
          String(appliedSheetFilters.fechaHasta || "").trim()
      ),
    [appliedSheetFilters]
  );

  const applySheetFilters_ = () => {
    setAppliedSheetFilters({
      proyecto: String(sheetFilterProyecto || "").trim(),
      usuario: String(sheetFilterUsuario || "").trim().toLowerCase(),
      tipo: String(sheetFilterTipo || "").trim().toUpperCase(),
      mes: String(sheetFilterMes || "").trim(),
      fechaDesde: String(sheetFilterFechaDesde || "").trim(),
      fechaHasta: String(sheetFilterFechaHasta || "").trim(),
    });
  };

  const clearSheetFilters_ = () => {
    setSheetFilterProyecto("");
    setSheetFilterUsuario("");
    setSheetFilterTipo("");
    setSheetFilterMes("");
    setSheetFilterFechaDesde("");
    setSheetFilterFechaHasta("");
    setAppliedSheetFilters(EMPTY_SHEET_FILTERS);
  };

  const selectedRows = useMemo(() => pending.filter((r) => !!selected[r.id]), [pending, selected]);
  const selectedTotal = useMemo(() => selectedRows.reduce((acc, r) => acc + (r.amount || 0), 0), [selectedRows]);
  const outboxExpenseIds = useMemo(() => buildOutboxExpenseLocalIds_(outbox), [outbox]);

  /** Titular previsto para numeración (COD / Nº hoja) según filtro o selección. */
  const numberingTitularPreview = useMemo(() => {
    if (!canOnBehalf) {
      return {
        email: selfEmail,
        nombre: resolvedUserName_(user, profileName),
        ambiguous: false,
        source: "self",
      };
    }
    if (filterOwnerEmail) {
      return {
        email: filterOwnerEmail,
        nombre: displayNameFromUserOptions_(
          filterOwnerEmail,
          userOptions,
          filterOwnerEmail === selfEmail ? usuarioRecord : titularUsuarioRecord
        ),
        ambiguous: false,
        source: "filter",
      };
    }
    const owners = [
      ...new Set(selectedRows.map((r) => expenseOwnerEmail_(r.raw)).filter(Boolean)),
    ];
    if (owners.length > 1) {
      return { email: "", nombre: "", ambiguous: true, source: "selection" };
    }
    if (owners.length === 1) {
      return {
        email: owners[0],
        nombre: displayNameFromUserOptions_(owners[0], userOptions, null),
        ambiguous: false,
        source: "selection",
      };
    }
    return {
      email: selfEmail,
      nombre: resolvedUserName_(user, profileName),
      ambiguous: false,
      source: "self",
    };
  }, [
    canOnBehalf,
    filterOwnerEmail,
    selectedRows,
    selfEmail,
    user,
    profileName,
    userOptions,
    usuarioRecord,
    titularUsuarioRecord,
  ]);

  const numberingCodPreview = useMemo(() => {
    if (numberingTitularPreview.ambiguous || !numberingTitularPreview.email) return "";
    const record =
      numberingTitularPreview.email === selfEmail
        ? usuarioRecord
        : numberingTitularPreview.email === filterOwnerEmail
          ? titularUsuarioRecord
          : { email: numberingTitularPreview.email, nombre: numberingTitularPreview.nombre };
    return resolveCodPersonalForSheet({
      usuarioRecord: record,
      nombre: numberingTitularPreview.nombre,
      codPersonal: record?.cod_personal,
    });
  }, [
    numberingTitularPreview,
    selfEmail,
    usuarioRecord,
    filterOwnerEmail,
    titularUsuarioRecord,
  ]);

  const selectedWarnings = useMemo(
    () =>
      collectSheetCreationWarnings_(selectedRows, {
        assignedSet,
        responsable,
        outbox,
      }),
    [assignedSet, outbox, responsable, selectedRows]
  );

  const selectedBlocks = useMemo(() => collectSheetCreationBlocks_(selectedRows), [selectedRows]);

  const toggle = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  };

  const deleteSelectedPending_ = () => {
    if (!selectedRows.length) {
      Alert.alert("Sin selección", "Marca gastos con la casilla al inicio de cada fila.");
      return;
    }
    Alert.alert(
      "Eliminar gastos seleccionados",
      `Se borrarán ${selectedRows.length} gasto(s) pendientes. ¿Continuar?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              let deleted = 0;
              let blocked = 0;
              for (const row of selectedRows) {
                const check = canDeleteExpense(row?.raw || row, { actorEmail: user?.email, role });
                if (!check.ok) {
                  blocked += 1;
                  continue;
                }
                await deleteExpenseCompletely_(row?.raw || row, { userEmail: user?.email, role });
                deleted += 1;
              }
              setSelected({});
              await reloadAll();
              Alert.alert(
                deleted > 0 ? "Eliminación completada" : "Sin cambios",
                `Eliminados: ${deleted}${blocked > 0 ? `. Omitidos: ${blocked}.` : "."}`
              );
            } catch (e) {
              Alert.alert("Error", e?.message || "No se pudieron eliminar los gastos.");
            }
          },
        },
      ]
    );
  };

  const createSheet = async (metaOverride = null) => {
    if (sending) return;
    if (!selectedRows.length) {
      Alert.alert("Sin selección", "Selecciona al menos un gasto (Usuario o tarjeta GREFA).");
      return;
    }

    const owners = [
      ...new Set(selectedRows.map((r) => expenseOwnerEmail_(r.raw)).filter(Boolean)),
    ];
    let sheetEmail = filterOwnerEmail;
    if (!sheetEmail) {
      if (owners.length > 1) {
        Alert.alert(
          "Varios usuarios",
          "Los gastos seleccionados pertenecen a distintos usuarios. Elige «Crear hoja a nombre de» un usuario concreto, o selecciona gastos de un solo titular."
        );
        return;
      }
      sheetEmail = owners[0] || selfEmail;
    } else if (owners.length && owners.some((o) => o !== sheetEmail)) {
      Alert.alert(
        "Titular no coincide",
        "Hay gastos seleccionados que no son del usuario elegido en «Crear hoja a nombre de». Filtra por ese usuario o quita los gastos ajenos."
      );
      return;
    }

    const blocks = collectSheetCreationBlocks_(selectedRows);
    if (blocks.length) {
      const msg =
        `No se puede crear la hoja:\n\n` +
        `${formatSheetCreationBlocksMessage_(blocks)}\n\n` +
        `Corrige los gastos afectados (tiquet/factura, tipología LIFE, subtipo Abilas…) y vuelve a intentarlo.`;
      if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`No se puede crear la hoja\n\n${msg}`);
      } else {
        Alert.alert("No se puede crear la hoja", msg);
      }
      return;
    }
    const unsynced = selectedRows.filter((r) => {
      const remote = String(r?.raw?.id_gasto || "").trim();
      return !/^GAS/i.test(remote);
    });
    if (unsynced.length) {
      Alert.alert(
        "Gastos sin sincronizar",
        `Hay ${unsynced.length} gasto(s) sin id remoto en el servidor. Pulsa Sincronizar, espera a que terminen y luego crea la hoja.`
      );
      return;
    }
    const preWarnings = collectSheetCreationWarnings_(selectedRows, {
      assignedSet,
      responsable,
      outbox,
    });
    if (!metaOverride) {
      const proceed = await confirmSheetCreationWithWarnings_(preWarnings);
      if (!proceed) return;
    }

    const isLife = selectedLinesLookLife_(selectedRows);
    if (!metaOverride) {
      let tripPrefill = { work_package: "", accion_proyecto: "", dni: "", fecha_cierre: "" };
      let viajeSnapshotPrefill = null;
      const idViajePrefill =
        selectedRows
          .map((r) => String(r?.raw?.id_viaje_propio || r?.id_viaje_propio || "").trim())
          .find(Boolean) || "";
      if (idViajePrefill) {
        try {
          const det = await sheetsApi.get("viaje_vehiculo_propio_detalle", {
            id_viaje: idViajePrefill,
            user_email: String(user?.email || "").trim(),
          });
          const fromTrip = viajeFromTripRecord_(det);
          const nested = det?.data?.viaje || det?.viaje || {};
          viajeSnapshotPrefill = { ...fromTrip, id_viaje: idViajePrefill };
          if (!String(viajeSnapshotPrefill?.origen || "").trim() && nested) {
            viajeSnapshotPrefill = { ...viajeFromTripRecord_(nested), id_viaje: idViajePrefill };
          }
          tripPrefill = {
            work_package: String(fromTrip.work_package || nested.work_package || "").trim(),
            accion_proyecto: String(fromTrip.accion_proyecto || nested.accion || "").trim(),
            dni: String(fromTrip.dni || nested.dni || "").trim(),
            fecha_cierre: String(fromTrip.fecha_fin || nested.fecha_cierre || "").trim(),
          };
        } catch {
          /* prefills opcionales */
        }
      }
      if (!viajeSnapshotPrefill) {
        viajeSnapshotPrefill = viajeFromImportedExcelFields_(selectedRows);
        if (viajeSnapshotPrefill) {
          tripPrefill = {
            ...tripPrefill,
            dni: tripPrefill.dni || String(viajeSnapshotPrefill.dni || "").trim(),
            fecha_cierre:
              tripPrefill.fecha_cierre ||
              viajeSnapshotPrefill.fecha_fin ||
              viajeSnapshotPrefill.fecha_cierre ||
              "",
          };
        }
      }
      const lineMetaRows = buildSheetLineMetaRows_(
        selectedRows.map((r) => ({
          id_gasto: r?.raw?.id_gasto,
          expense_id: r?.id,
          tipo_gasto: r?.type,
          concepto: conceptoFromExpenseRecord(r?.raw) || humanConcept_(r?.type),
          work_package: r?.raw?.work_package || tripPrefill.work_package,
          accion_proyecto: r?.raw?.accion_proyecto || tripPrefill.accion_proyecto,
        })),
        {},
        (ln) => `${String(ln?.concepto || ln?.tipo_gasto || "Gasto").trim()}`
      );
      // Prefill fecha hoja = fecha de cierre del viaje (editable en el modal).
      const fechaDefault =
        normalizeDateToDmy(tripPrefill.fecha_cierre) || todayDmy_();
      if (isLife) {
        // LIFE: fecha + DNI + WP/Acción por línea al crear la hoja (no al grabar el viaje).
        setCreateMetaModal({
          visible: true,
          mode: "life",
          fechaHoja: fechaDefault,
          dni: tripPrefill.dni,
          lineMetaRows,
          viajeSnapshot: viajeSnapshotPrefill,
          sheetTitularEmail: sheetEmail,
        });
        return;
      }
      setCreateMetaModal({
        visible: true,
        mode: "generic",
        fechaHoja: fechaDefault,
        dni: tripPrefill.dni,
        lineMetaRows: [],
        viajeSnapshot: viajeSnapshotPrefill,
        sheetTitularEmail: sheetEmail,
      });
      return;
    }

    const fechaHoja = normalizeDateToDmy(metaOverride?.fechaHoja || todayDmy_()) || todayDmy_();
    const dni = String(metaOverride?.dni || "").trim();
    const lineMetaMap = metaOverride?.lineMetaMap || {};
    const isLifeSheet = selectedLinesLookLife_(selectedRows);
    const lifeFamily = isLifeSheet ? resolveLifeSheetFamilyFromRows_(selectedRows) : "NONE";
    const letterPrefix =
      lifeFamily === "OTROS" ? resolveLifeOtrosNumberPrefix_(selectedRows) : "T";
    if (lifeFamily === "OTROS" && !letterPrefix) {
      Alert.alert(
        "No se puede crear la hoja",
        "No se pudo determinar el prefijo de numeración LIFE Otros (OG / O / AL / ED / VET). Revisa proyecto y, en Abilas, el subtipo de cada gasto."
      );
      return;
    }

    try {
      setSending(true);
      sheetEmail = String(metaOverride?.sheetTitularEmail || sheetEmail || selfEmail)
        .trim()
        .toLowerCase();
      const excelTitularName = resolveExpenseSheetPersonName(selectedRows[0]?.raw);
      const sheetUserName =
        excelTitularName ||
        displayNameFromUserOptions_(
          sheetEmail,
          userOptions,
          sheetEmail === selfEmail ? usuarioRecord : titularUsuarioRecord
        ) ||
        (sheetEmail === selfEmail ? resolvedUserName_(user, profileName) : sheetEmail.split("@")[0] || sheetEmail);
      const actorEmail = selfEmail;
      let sheetRecord =
        sheetEmail === selfEmail
          ? usuarioRecord
          : sheetEmail === filterOwnerEmail && titularUsuarioRecord
            ? titularUsuarioRecord
            : null;
      if (!sheetRecord || String(sheetRecord?.email || "").trim().toLowerCase() !== sheetEmail) {
        try {
          const res = await sheetsApi.get("usuario_get", {
            email: sheetEmail,
            user_email: String(user?.email || "").trim().toLowerCase(),
          });
          const data = res?.data || res || {};
          if (data && typeof data === "object") {
            sheetRecord = data;
          }
        } catch {
          /* fallback abajo */
        }
      }
      if (!sheetRecord) {
        sheetRecord = { email: sheetEmail, nombre: sheetUserName };
      }
      const codPersonal = resolveCodPersonalForSheet({
        usuarioRecord: sheetRecord,
        nombre: sheetUserName,
        codPersonal: sheetRecord?.cod_personal,
      });

      if (canOnBehalf && !metaOverride?._numberingConfirmed) {
        const confirmMsg =
          `La hoja se numerará con el COD PERSONAL de este usuario:\n\n` +
          `Titular: ${sheetUserName}\n` +
          `Email: ${sheetEmail}\n` +
          `COD: ${codPersonal || "(sin COD)"}\n` +
          `Formato nº: ${letterPrefix || "T"}-mm-aaaa-${codPersonal || "COD"}\n\n` +
          `¿Continuar?`;
        let ok = true;
        if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
          ok = window.confirm(confirmMsg);
        } else {
          ok = await new Promise((resolve) => {
            Alert.alert("Numeración de la hoja", confirmMsg, [
              { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
              { text: "Continuar", onPress: () => resolve(true) },
            ]);
          });
        }
        if (!ok) {
          setSending(false);
          return;
        }
      }

      const now = new Date();
      const fechaHojaDate = parseDateFromDmyOrNow_(fechaHoja);
      const oldestNewMs = oldestExpenseMsFromLines(
        selectedRows.map((r) => ({ ...(r.raw || {}), fecha: r.date, date: r.date, tipo_gasto: r.type }))
      );
      const emissionNewMs =
        (fechaHojaDate && Number.isFinite(fechaHojaDate.getTime()) ? fechaHojaDate.getTime() : 0) ||
        (Number.isFinite(oldestNewMs) && oldestNewMs < Number.POSITIVE_INFINITY ? oldestNewMs : Number.POSITIVE_INFINITY);
      // Prefijo por fecha de emisión (pie). I/II/III se ordenan por esa misma fecha entre hermanas.
      const numberPrefix = expenseSheetNumberPrefix(codPersonal, fechaHojaDate, letterPrefix || "T");
      const sheetsPool = [
        ...mergedDisplayedSheets,
        ...remoteSheets,
        ...(Array.isArray(sheets) ? sheets : []),
        ...sheetsForNumbering,
      ];
      const sheetLocalId = `HG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(
        2,
        "0"
      )}-${now.getTime()}`;
      const siblingEntries = collectSiblingSheetEntriesForPrefix({
        prefix: numberPrefix,
        sheets: sheetsPool.filter(
          (s) => String(s?.usuario_email || "").trim().toLowerCase() === sheetEmail || !String(s?.usuario_email || "").trim()
        ),
        expenses,
        titularEmail: sheetEmail,
        extraEntries: [{ id: sheetLocalId, oldestMs: emissionNewMs }],
      });
      const numberAssignments = allocateExpenseSheetNumbersByOldest(numberPrefix, siblingEntries);
      const sheetNumber =
        numberAssignments.find((a) => a.id === sheetLocalId)?.num ||
        resolveSheetNumberForCreate({
          usuarioRecord: sheetRecord,
          nombre: sheetUserName,
          email: sheetEmail,
          date: fechaHojaDate,
          existingNumbers: collectExpenseSheetNumbers(sheetsPool),
          letterPrefix: letterPrefix || "T",
          codPersonal,
        });
      const renumberMap = new Map(
        numberAssignments
          .filter((a) => a.id !== sheetLocalId)
          .map((a) => [a.id, a.num])
      );
      const prevNumBySheetId = new Map();
      for (const s of sheetsPool) {
        const sid = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
        if (!sid || !renumberMap.has(sid) || prevNumBySheetId.has(sid)) continue;
        prevNumBySheetId.set(sid, String(s?.num_hoja_gasto || s?.Num_Hoja_Gasto || "").trim());
      }
      // También capturar nº previo desde gastos vinculados.
      for (const e of Array.isArray(expenses) ? expenses : []) {
        const sid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
        if (!sid || !renumberMap.has(sid) || prevNumBySheetId.has(sid)) continue;
        const n = String(e?.num_hoja_gasto || e?.Num_Hoja_Gasto || "").trim();
        if (n) prevNumBySheetId.set(sid, n);
      }

      let viajeSnapshot = metaOverride?.viajeSnapshot || null;
      const idViaje =
        selectedRows
          .map((r) => String(r?.raw?.id_viaje_propio || r?.id_viaje_propio || "").trim())
          .find(Boolean) || "";
      if (!viajeSnapshot && idViaje) {
        try {
          const det = await sheetsApi.get("viaje_vehiculo_propio_detalle", {
            id_viaje: idViaje,
            user_email: String(user?.email || "").trim(),
          });
          viajeSnapshot = viajeFromTripRecord_(det);
          if (!String(viajeSnapshot?.origen || "").trim() && !String(viajeSnapshot?.destino1 || "").trim()) {
            const nested = det?.data?.viaje || det?.viaje;
            if (nested) viajeSnapshot = viajeFromTripRecord_(nested);
          }
        } catch {
          viajeSnapshot = null;
        }
      }
      if (!viajeSnapshot) {
        viajeSnapshot = viajeFromImportedExcelFields_(selectedRows);
      }

      const sheetFormaPago = inferSheetFormaPagoFromExpenseRows(selectedRows);

      const payload = {
        hoja_id_local: sheetLocalId,
        hoja_gasto_id: sheetLocalId,
        num_hoja_gasto: sheetNumber,
        Num_Hoja_Gasto: sheetNumber,
        forma_pago: sheetFormaPago,
        usuario_email: sheetEmail,
        usuario_nombre: sheetUserName,
        cod_personal: codPersonal,
        creada_por_email: actorEmail,
        creada_por_nombre: resolvedUserName_(user, profileName),
        createdAtLocal: now.toISOString(),
        hoja_gasto_fecha_envio: fechaHoja,
        estado: "ENVIADA",
        total_importe: Number(selectedTotal.toFixed(2)),
        moneda: "EUR",
        observaciones: "",
        dni: dni || undefined,
        fecha_hoja: fechaHoja,
        fecha_firma: fechaHoja,
        hoja_gasto_modelo: isLifeSheet ? "LIFE" : "GENERICA",
        hoja_gasto_familia: lifeFamily === "OTROS" || lifeFamily === "TRAVEL" ? lifeFamily : undefined,
        hoja_gasto_prefijo: letterPrefix || undefined,
        viaje: lifeFamily === "OTROS" ? undefined : viajeSnapshot || undefined,
        lineas: sortExpenseSheetLinesByDateInvoice_(
          selectedRows.flatMap((r) => {
          const isKmColab = String(r.type || "").trim().toUpperCase() === "KILOMETRAJE_COLABORADOR";
          const remoteGasId = String(r?.raw?.id_gasto || "").trim();
          const safeIdGasto = /^GAS/i.test(remoteGasId) ? remoteGasId : "";
          const tipo = String(r.type || "").trim().toUpperCase();
          const numPersonas =
            tipo === "HOSPEDAJE" || tipo === "OTROS"
              ? String(r?.raw?.numero_personas_hospedaje || r?.raw?.num_personas || "").trim()
              : tipo === "GASTOS_BILLETES"
                ? String(r?.raw?.numero_personas_billete || r?.raw?.num_personas || "").trim()
              : tipo === "MANUTENCION"
                ? String(r?.raw?.numero_comensales_manutencion || "").trim()
                : "";
          const fin = enrichExpensePayloadWithIva({
            ...(r.raw || {}),
            tipo_gasto: tipo,
            importe_pagar: r.amount,
            coste_total: r.amount,
          });
          const metaKey = String(safeIdGasto || r.id || "").trim();
          const fromMeta = lineMetaMap[metaKey] || lineMetaMap[String(r.id || "").trim()] || {};
          const baseLine = {
            id_gasto: safeIdGasto,
            expense_id: r.id,
            fecha: normalizeDateToDmy(r.date) || "",
            matricula: r.plate || "",
            tipo_gasto: r.type || "",
            concepto: conceptoFromExpenseRecord(r.raw) || humanConcept_(r.type),
            entidad: entityFromExpense_(r.raw),
            numero_factura: invoiceFromExpense_(r.raw),
            proyecto: String(
              r?.raw?.departamento_o_proyecto === "__OTRO__"
                ? r?.raw?.departamento_o_proyecto_custom || ""
                : r?.raw?.departamento_o_proyecto || r?.raw?.departamento_o_proyecto_custom || ""
            ).trim(),
            importe: Number((fin.importe_pagar || r.amount || 0).toFixed(2)),
            importe_pagar: Number((fin.importe_pagar || r.amount || 0).toFixed(2)),
            base_imponible: fin.base_imponible,
            iva_pct: fin.iva_pct,
            iva_eur: fin.iva_eur,
            id_viaje_propio: String(r?.raw?.id_viaje_propio || idViaje || "").trim(),
            num_personas: numPersonas,
            numero_personas_billete: String(r?.raw?.numero_personas_billete || numPersonas || "").trim(),
            numero_personas_hospedaje: String(
              r?.raw?.numero_personas_hospedaje || (tipo === "GASTOS_BILLETES" ? numPersonas : "") || ""
            ).trim(),
            numero_comensales_manutencion: String(r?.raw?.numero_comensales_manutencion || "").trim(),
            work_package: String(fromMeta.work_package || r?.raw?.work_package || "").trim(),
            accion_proyecto: String(fromMeta.accion_proyecto || r?.raw?.accion_proyecto || "").trim(),
            subtipo_otros: String(r?.raw?.subtipo_otros || r?.subtipo_otros || "").trim(),
            distancia_km: isKmColab ? Number(String(r?.raw?.km_recorridos_colaborador || "0").replace(",", ".")) || 0 : 0,
            eur_km: isKmColab ? Number(String(r?.raw?.tarifa_eur_km_aplicada || "0").replace(",", ".")) || 0 : 0,
            medio_transporte: isKmColab ? String(r?.raw?.accion_colaborador || "coche propio").trim() : "",
            motivo_salida: isKmColab ? String(r?.raw?.motivo_colaborador || "").trim() : "",
            itinerario: isKmColab
              ? `${String(r?.raw?.origen_colaborador || "").trim()} - ${String(r?.raw?.destino_colaborador || "").trim()}`
              : "",
          };
          if (tipo !== "GASTOS_BILLETES") return [baseLine];

          const origen = String(r?.raw?.origen_billete || "").trim();
          const destino = String(r?.raw?.destino_billete || "").trim();
          const routeConcept =
            String(r?.raw?.concepto_billete || "").trim() ||
            [origen, destino].filter(Boolean).join(" -> ") ||
            baseLine.concepto;
          const provider = String(r?.raw?.compania_billete || "").trim() || baseLine.entidad;
          const reserva = String(r?.raw?.numero_reserva_billete || "").trim() || baseLine.numero_factura;
          const tasas = Number(String(r?.raw?.tasas_billete || "0").replace(",", ".")) || 0;
          const principal = Number(String(r?.raw?.precio_total_billete || baseLine.importe || "0").replace(",", ".")) || 0;
          const ivaPct = Number(baseLine.iva_pct || 0) || 0;
          const ivaBreak =
            ivaPct === 0
              ? { base: principal, cuota: 0 }
              : { base: Number((principal / (1 + ivaPct / 100)).toFixed(2)), cuota: Number((principal - principal / (1 + ivaPct / 100)).toFixed(2)) };
          const lines = [
            {
              ...baseLine,
              tipo_gasto: "GASTOS_BILLETES",
              concepto: routeConcept,
              entidad: provider,
              numero_factura: reserva,
              importe: Number(principal.toFixed(2)),
              importe_pagar: Number(principal.toFixed(2)),
              base_imponible: Number(ivaBreak.base.toFixed(2)),
              iva_pct: ivaPct,
              iva_eur: Number(ivaBreak.cuota.toFixed(2)),
              num_personas: numPersonas,
            },
          ];
          if (tasas > 0) {
            lines.push({
              ...baseLine,
              tipo_gasto: "GASTOS_BILLETES",
              concepto: `Tasas billete${routeConcept ? ` · ${routeConcept}` : ""}`,
              entidad: provider,
              numero_factura: reserva,
              importe: Number(tasas.toFixed(2)),
              importe_pagar: Number(tasas.toFixed(2)),
              base_imponible: Number(tasas.toFixed(2)),
              iva_pct: 0,
              iva_eur: 0,
              num_personas: numPersonas,
            });
          }
          return lines;
        })
        ),
      };
      Object.assign(payload, sheetMetaForModel(resolveExpenseSheetModel(payload.lineas, {})));
      if (isLifeSheet) {
        payload.hoja_gasto_modelo = "LIFE";
        if (lifeFamily === "OTROS" || lifeFamily === "TRAVEL") payload.hoja_gasto_familia = lifeFamily;
        if (letterPrefix) payload.hoja_gasto_prefijo = letterPrefix;
      } else if (!String(payload.hoja_gasto_modelo || "").trim()) {
        payload.hoja_gasto_modelo = "GENERICA";
      }

      const nextSheet = {
        id: sheetLocalId,
        ...payload,
        sheet_meta: {
          dni: dni || "",
          fecha_firma: fechaHoja,
          fecha_hoja: fechaHoja,
          forma_pago: sheetFormaPago,
          hoja_gasto_familia: lifeFamily === "OTROS" || lifeFamily === "TRAVEL" ? lifeFamily : "",
          hoja_gasto_prefijo: letterPrefix || "",
          lineas: lineMetaMap,
          viaje: lifeFamily === "OTROS" ? null : viajeSnapshot || null,
          updatedAt: now.toISOString(),
        },
        estado_sync: "PENDIENTE_SYNC",
      };

      const selectedIds = new Set(Object.keys(selected || {}).filter((k) => selected[k]));
      let nextExpenses = (Array.isArray(expenses) ? expenses : []).map((e) => {
        const eid = String(e?.id || e?.local_id || "").trim();
        const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
        if (selectedIds.has(eid) || selected[eid]) {
          return {
            ...e,
            hoja_gasto_id: sheetLocalId,
            hoja_id_local: sheetLocalId,
            hoja_gasto_estado: "ENVIADA",
            num_hoja_gasto: sheetNumber,
            Num_Hoja_Gasto: sheetNumber,
          };
        }
        if (hid && renumberMap.has(hid)) {
          const nextNum = renumberMap.get(hid);
          return {
            ...e,
            num_hoja_gasto: nextNum,
            Num_Hoja_Gasto: nextNum,
          };
        }
        return e;
      });

      let nextSheetsList = (Array.isArray(sheets) ? sheets : []).slice();
      // Incorporar hermanas que solo estaban en remoto / merge para poder renumerarlas y sincronizarlas.
      for (const [sid] of renumberMap.entries()) {
        const exists = nextSheetsList.some(
          (s) => String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim() === sid
        );
        if (exists) continue;
        const fromPool = sheetsPool.find(
          (s) => String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim() === sid
        );
        if (fromPool) nextSheetsList.push({ ...fromPool });
      }
      nextSheetsList = nextSheetsList.map((s) => {
        const sid = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
        if (!sid || !renumberMap.has(sid)) return s;
        const nextNum = renumberMap.get(sid);
        const prevNum = String(s?.num_hoja_gasto || s?.Num_Hoja_Gasto || "").trim();
        if (prevNum === nextNum) return s;
        return {
          ...s,
          num_hoja_gasto: nextNum,
          Num_Hoja_Gasto: nextNum,
        };
      });

      await localDb.setExpenseSheets([nextSheet, ...nextSheetsList]);
      await localDb.setExpenses(nextExpenses);
      await syncService.queue({ kind: "expense_sheet", payload });
      // Re-sync hojas hermanas renumeradas para persistir Num_Hoja_Gasto en Sheets.
      for (const [sid, nextNum] of renumberMap.entries()) {
        const sibling = nextSheetsList.find(
          (s) => String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim() === sid
        );
        const prevNum = prevNumBySheetId.get(sid) || "";
        if (prevNum && prevNum === nextNum) continue;
        let lineas = Array.isArray(sibling?.lineas) ? sibling.lineas : [];
        if (!lineas.length) {
          lineas = nextExpenses
            .filter((e) => String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim() === sid)
            .map((e) => {
              const gid = String(e?.id_gasto || "").trim();
              if (!/^GAS/i.test(gid)) return null;
              return { id_gasto: gid, expense_id: String(e?.id || e?.local_id || "").trim() };
            })
            .filter(Boolean);
        }
        if (!lineas.length) continue;
        const renumPayload = {
          ...(sibling || {}),
          hoja_gasto_id: sid,
          hoja_id_local: sid,
          num_hoja_gasto: nextNum,
          Num_Hoja_Gasto: nextNum,
          usuario_email: sheetEmail,
          cod_personal: codPersonal,
          lineas,
          _renumber_only: true,
          _prev_num_hoja_gasto: prevNum,
        };
        await syncService.queue({ kind: "expense_sheet", payload: renumPayload });
      }
      syncService.flushIfOnline().catch(() => {});

      setSheets((p) => {
        const base = Array.isArray(nextSheetsList) ? nextSheetsList : Array.isArray(p) ? p : [];
        return [nextSheet, ...base.filter((s) => {
          const sid = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
          return sid !== sheetLocalId;
        })];
      });
      setExpenses(nextExpenses);
      setOutbox((p) => [
        { id: `${Date.now()}-sheet`, kind: "expense_sheet", payload, createdAt: Date.now() },
        ...p,
      ]);
      setSelected({});
      setCreateMetaModal({ visible: false, mode: "generic", fechaHoja: "", dni: "", lineMetaRows: [], viajeSnapshot: null });
      const renumNote =
        renumberMap.size > 0
          ? `\nSe han reordenado ${renumberMap.size} hoja(s) previa(s) del mismo mes según la fecha de emisión (la más antigua queda como ${numberPrefix}; las posteriores pasan a … - II, etc.).`
          : "";
      Alert.alert("Hoja enviada", `Hoja ${sheetNumber} creada con ${selectedRows.length} gastos.${renumNote}`);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear la hoja de gasto.");
    } finally {
      setSending(false);
    }
  };

  const confirmGenericSheetMeta_ = async () => {
    const fechaHoja = normalizeDateToDmy(createMetaModal.fechaHoja) || "";
    const dni = String(createMetaModal.dni || "").trim();
    if (!fechaHoja) {
      Alert.alert("Fecha obligatoria", "Indica la fecha del pie de la hoja («Majadahonda a …»).");
      return;
    }
    if (!dni) {
      Alert.alert("DNI obligatorio", "Indica el DNI del usuario para la hoja genérica.");
      return;
    }
    const viajeSnapshot = createMetaModal.viajeSnapshot || null;
    setCreateMetaModal((p) => ({ ...p, visible: false }));
    await createSheet({
      fechaHoja,
      dni,
      lineMetaMap: {},
      viajeSnapshot,
      sheetTitularEmail: createMetaModal.sheetTitularEmail,
    });
  };

  const confirmLifeSheetMeta_ = async () => {
    const fechaHoja = normalizeDateToDmy(createMetaModal.fechaHoja) || "";
    if (!fechaHoja) {
      Alert.alert("Fecha obligatoria", "Indica la fecha del pie de la hoja («Majadahonda a …»).");
      return;
    }
    const dni = String(createMetaModal.dni || "").trim();
    if (!dni) {
      Alert.alert("DNI obligatorio", "Indica el DNI del titular de la hoja.");
      return;
    }
    const rows = Array.isArray(createMetaModal.lineMetaRows) ? createMetaModal.lineMetaRows : [];
    for (const row of rows) {
      if (!String(row?.work_package || "").trim() || !String(row?.accion_proyecto || "").trim()) {
        Alert.alert("WP / Acción", "Completa Work Package y Acción del proyecto en todos los gastos.");
        return;
      }
    }
    let viajeSnapshot = createMetaModal.viajeSnapshot || null;
    // Refrescar fechas INICIO/FIN desde el viaje (fuente de verdad) justo antes de crear.
    const idViajeRefresh =
      String(viajeSnapshot?.id_viaje || "").trim() ||
      selectedRows
        .map((r) => String(r?.raw?.id_viaje_propio || r?.id_viaje_propio || "").trim())
        .find(Boolean) ||
      "";
    if (idViajeRefresh) {
      try {
        const det = await sheetsApi.get("viaje_vehiculo_propio_detalle", {
          id_viaje: idViajeRefresh,
          user_email: String(user?.email || "").trim(),
        });
        const fresh = viajeFromTripRecord_(det);
        if (fresh && (fresh.fecha_inicio || fresh.origen || fresh.destino1)) {
          viajeSnapshot = { ...fresh, id_viaje: idViajeRefresh };
        }
      } catch {
        // conservar snapshot previo
      }
    }
    const lineMetaMap = lineMetaMapFromRows_(rows);
    await createSheet({
      fechaHoja,
      dni,
      lineMetaMap,
      viajeSnapshot,
      _numberingConfirmed: true,
    });
  };

  const closeEditSheetModal_ = () => {
    setEditSheetModal((p) => {
      if (p.busy) return p;
      return {
        visible: false,
        sheet: null,
        lines: [],
        selected: {},
        loading: false,
        busy: false,
        progressText: "",
        result: null,
        confirm: null,
      };
    });
  };

  const resolveSelectedUnlinkKeys_ = (selectedMap, lines, expenseList) => {
    const keys = Object.keys(selectedMap || {}).filter((k) => selectedMap[k]);
    const gasIds = [];
    const localKeys = [];
    const pushGas = (id) => {
      const s = String(id || "").trim();
      if (/^GAS/i.test(s) && !gasIds.includes(s)) gasIds.push(s);
    };
    const pushLocal = (id) => {
      const s = String(id || "").trim();
      if (s && !localKeys.includes(s)) localKeys.push(s);
    };
    for (const k of keys) {
      pushLocal(k);
      pushGas(k);
      const ln = (lines || []).find(
        (l) => String(l?.id_gasto || "").trim() === k || String(l?.expense_id || "").trim() === k
      );
      if (ln) {
        pushLocal(ln.expense_id);
        pushLocal(ln.id_gasto);
        pushGas(ln.id_gasto);
      }
      const exp = (expenseList || []).find((e) => {
        const lid = String(e?.id || e?.local_id || "").trim();
        const gid = String(e?.id_gasto || "").trim();
        return lid === k || gid === k;
      });
      if (exp) {
        pushLocal(exp.id);
        pushLocal(exp.local_id);
        pushGas(exp.id_gasto);
      }
    }
    return { gasIds, localKeys };
  };

  const collectAllUnlinkGasIds_ = (lines, expenseList) => {
    const gasIds = [];
    const pushGas = (id) => {
      const s = String(id || "").trim();
      if (/^GAS/i.test(s) && !gasIds.includes(s)) gasIds.push(s);
    };
    for (const ln of lines || []) {
      pushGas(ln?.id_gasto);
      const lid = String(ln?.expense_id || "").trim();
      const exp = (expenseList || []).find((e) => String(e?.id || e?.local_id || "").trim() === lid);
      pushGas(exp?.id_gasto);
    }
    return gasIds;
  };

  const beginUnlinkSheet_ = ({ reopenAll }) => {
    setEditSheetModal((p) => {
      if (p.busy || p.loading) return p;
      const sheet = p.sheet;
      if (!sheet) return p;
      const sid = resolveSheetServerId_(sheet);
      if (!sid) {
        return {
          ...p,
          confirm: null,
          result: { ok: false, message: "Hoja sin identificador." },
        };
      }

      if (!reopenAll) {
        const { gasIds, localKeys } = resolveSelectedUnlinkKeys_(p.selected, p.lines, expenses);
        if (!localKeys.length) {
          return {
            ...p,
            confirm: null,
            result: {
              ok: false,
              message:
                "Marca al menos un gasto de la lista (pulsa sobre la fila). Si no ves id GAS…, sincroniza y vuelve a abrir Modificar hoja.",
            },
          };
        }
        return {
          ...p,
          result: null,
          confirm: {
            reopenAll: false,
            title: "Desvincular seleccionados",
            message: `Se desvincularán ${localKeys.length} gasto(s). Podrás incluirlos en otra hoja.`,
            idGastos: gasIds,
            localKeys,
          },
        };
      }

      const idGastos = collectAllUnlinkGasIds_(p.lines, expenses);
      return {
        ...p,
        result: null,
        confirm: {
          reopenAll: true,
          title: "Reabrir toda la hoja",
          message:
            "Se quitarán todos los gastos de esta hoja y volverán a pendientes para crear hojas nuevas.",
          idGastos,
          localKeys: [],
        },
      };
    });
  };

  const cancelUnlinkConfirm_ = () => {
    setEditSheetModal((p) => ({ ...p, confirm: null }));
  };

  const executeUnlinkSheet_ = async (confirmPayload, sheetArg, linesArg) => {
    if (!confirmPayload || !sheetArg) return;

    const sheet = sheetArg;
    const linesSnapshot = Array.isArray(linesArg) ? linesArg : [];
    const sid = resolveSheetServerId_(sheet);
    const reopenAll = !!confirmPayload.reopenAll;
    let idGastos = Array.isArray(confirmPayload.idGastos) ? confirmPayload.idGastos.slice() : [];
    const localKeys = Array.isArray(confirmPayload.localKeys) ? confirmPayload.localKeys.slice() : [];

    let started = false;
    setEditSheetModal((p) => {
      if (p.busy) return p;
      started = true;
      return {
        ...p,
        confirm: null,
        busy: true,
        result: null,
        progressText: reopenAll
          ? "Paso 1/3 · Reabriendo hoja en el servidor…"
          : `Paso 1/3 · Desvinculando ${Math.max(idGastos.length, localKeys.length)} gasto(s) en el servidor…`,
      };
    });
    if (!started) return;

    try {
      const email = String(user?.email || "").trim().toLowerCase();
      let unlinkedIds = reopenAll ? idGastos.slice() : idGastos.slice();

      const onlyLocal =
        !sheet?._fromRemoteList &&
        String(sheet?.estado_sync || "").toUpperCase() === "PENDIENTE_SYNC" &&
        !unlinkedIds.length;

      if (!onlyLocal && (reopenAll || unlinkedIds.length)) {
        let serverOk = false;
        try {
          const res = await postSheetApi_(
            "hoja_gasto_desvincular_gastos",
            {
              hoja_gasto_id: sid,
              user_email: email,
              reopen_all: reopenAll,
              id_gastos: reopenAll ? [] : unlinkedIds,
            },
            { user_email: email },
            { timeoutMs: 45000 }
          );
          const data = res?.data || res || {};
          if (Array.isArray(data?.unlinked_ids) && data.unlinked_ids.length) {
            unlinkedIds = data.unlinked_ids;
          }
          const n = Number(data?.unlinked ?? unlinkedIds.length) || 0;
          if (reopenAll || n > 0) serverOk = true;
          if (!reopenAll && n <= 0) {
            throw new Error("El servidor no desvinculó ningún gasto.");
          }
        } catch (apiErr) {
          const idsToClear = reopenAll
            ? collectAllUnlinkGasIds_(linesSnapshot, expenses)
            : unlinkedIds.slice();
          if (!idsToClear.length && !reopenAll) throw apiErr;

          const cleared = [];
          for (let i = 0; i < idsToClear.length; i += 1) {
            const gid = idsToClear[i];
            setEditSheetModal((p) => ({
              ...p,
              progressText: `Paso 1/3 · Desvinculando en servidor ${i + 1}/${idsToClear.length}…`,
            }));
            await postSheetApi_(
              "gasto_actualizar",
              {
                id_gasto: gid,
                user_email: email,
                responsable_email: email,
                hoja_gasto_id: "",
                Num_Hoja_Gasto: "",
                num_hoja_gasto: "",
                hoja_gasto_estado: "",
                hoja_gasto_fecha_envio: "",
                hoja_gasto_total: "",
                hoja_gasto_observaciones: "",
                hoja_gasto_revisado_por: "",
                hoja_gasto_fecha_revision: "",
                hoja_gasto_motivo_rechazo: "",
                hoja_gasto_estado_pago: "",
                hoja_gasto_pagado_por: "",
                hoja_gasto_fecha_pago: "",
                hoja_gasto_metodo_pago: "",
                hoja_gasto_referencia_pago: "",
              },
              { user_email: email },
              { timeoutMs: 30000 }
            );
            cleared.push(gid);
          }
          unlinkedIds = cleared;
          serverOk = reopenAll ? true : cleared.length > 0;
          if (!serverOk) throw apiErr;
        }
      }

      setEditSheetModal((p) => ({
        ...p,
        progressText: "Paso 2/3 · Actualizando gastos en el dispositivo…",
      }));

      if (!reopenAll) {
        unlinkedIds = [...new Set([...unlinkedIds, ...localKeys])];
      }

      await applyUnlinkLocally_(sheet, unlinkedIds, reopenAll);

      setEditSheetModal((p) => ({ ...p, progressText: "Paso 3/3 · Refrescando listado de hojas…" }));
      await loadRemoteSheets();
      await reloadAll();

      const nDone = reopenAll
        ? unlinkedIds.filter((x) => /^GAS/i.test(String(x))).length || linesSnapshot.length
        : localKeys.length || unlinkedIds.length;
      const doneMsg = reopenAll
        ? "Hoja reabierta. Los gastos vuelven a pendientes para crear hojas nuevas."
        : `Desvinculados ${nDone} gasto(s). Ya puedes seleccionarlos y crear otra hoja.`;

      setEditSheetModal((p) => ({
        ...p,
        busy: false,
        progressText: "",
        lines: reopenAll
          ? []
          : p.lines.filter((ln) => {
              const gid = String(ln?.id_gasto || "").trim().toUpperCase();
              const lid = String(ln?.expense_id || "").trim().toUpperCase();
              const unlinkSet = new Set(
                [...unlinkedIds, ...localKeys].map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)
              );
              if (gid && unlinkSet.has(gid)) return false;
              if (lid && unlinkSet.has(lid)) return false;
              return true;
            }),
        selected: {},
        result: { ok: true, message: doneMsg },
      }));
    } catch (e) {
      setEditSheetModal((p) => ({
        ...p,
        busy: false,
        progressText: "",
        result: { ok: false, message: e?.message || "No se pudo modificar la hoja." },
      }));
    }
  };

  const beginDeleteSheetExpenses_ = () => {
    setEditSheetModal((p) => {
      if (p.busy || p.loading) return p;
      const { gasIds, localKeys } = resolveSelectedUnlinkKeys_(p.selected, p.lines, expenses);
      if (!localKeys.length && !gasIds.length) {
        return {
          ...p,
          confirm: null,
          result: {
            ok: false,
            message:
              "Marca al menos un gasto de la lista (pulsa sobre la fila). Luego podrás eliminarlo.",
          },
        };
      }
      return {
        ...p,
        result: null,
        confirm: {
          mode: "delete",
          title: "Eliminar gastos seleccionados",
          message: `Se desvincularán (si hace falta) y eliminarán ${Math.max(localKeys.length, gasIds.length)} gasto(s). No se puede deshacer.`,
          idGastos: gasIds,
          localKeys,
        },
      };
    });
  };

  const executeDeleteSheetExpenses_ = async (confirmPayload, sheetArg, linesArg) => {
    if (!confirmPayload || !sheetArg) return;
    const sheet = sheetArg;
    const linesSnapshot = Array.isArray(linesArg) ? linesArg : [];
    const sid = resolveSheetServerId_(sheet);
    const idGastos = Array.isArray(confirmPayload.idGastos) ? confirmPayload.idGastos.slice() : [];
    const localKeys = Array.isArray(confirmPayload.localKeys) ? confirmPayload.localKeys.slice() : [];

    let started = false;
    setEditSheetModal((p) => {
      if (p.busy) return p;
      started = true;
      return {
        ...p,
        confirm: null,
        busy: true,
        result: null,
        progressText: "Paso 1/3 · Desvinculando gastos de la hoja…",
      };
    });
    if (!started) return;

    try {
      const email = String(user?.email || "").trim().toLowerCase();
      if (sid && idGastos.length) {
        try {
          await postSheetApi_(
            "hoja_gasto_desvincular_gastos",
            {
              hoja_gasto_id: sid,
              user_email: email,
              reopen_all: false,
              id_gastos: idGastos,
            },
            { user_email: email },
            { timeoutMs: 45000 }
          );
        } catch {
          /* continuar con borrado local/remoto */
        }
      }

      const targets = [];
      const seen = new Set();
      const pushTarget = (raw) => {
        if (!raw) return;
        const key = String(raw?.id || raw?.local_id || raw?.id_gasto || "").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        targets.push(raw);
      };
      for (const k of localKeys) {
        const exp = (expenses || []).find((e) => {
          const lid = String(e?.id || e?.local_id || "").trim();
          const gid = String(e?.id_gasto || "").trim();
          return lid === k || gid === k;
        });
        if (exp) pushTarget(exp);
      }
      for (const ln of linesSnapshot) {
        const gid = String(ln?.id_gasto || "").trim();
        const lid = String(ln?.expense_id || "").trim();
        if (gid && idGastos.includes(gid)) {
          const exp = (expenses || []).find(
            (e) => String(e?.id_gasto || "").trim() === gid || String(e?.id || e?.local_id || "").trim() === lid
          );
          pushTarget(exp || { id_gasto: gid, id: lid || gid });
        }
      }

      let deleted = 0;
      let blocked = 0;
      for (let i = 0; i < targets.length; i += 1) {
        const raw = targets[i];
        setEditSheetModal((p) => ({
          ...p,
          progressText: `Paso 2/3 · Eliminando gasto ${i + 1}/${targets.length}…`,
        }));
        const check = canDeleteExpense(raw, { actorEmail: user?.email, role });
        if (!check.ok) {
          blocked += 1;
          continue;
        }
        await deleteExpenseCompletely_(raw, { userEmail: user?.email, role });
        deleted += 1;
      }

      setEditSheetModal((p) => ({ ...p, progressText: "Paso 3/3 · Refrescando listado…" }));
      await loadRemoteSheets();
      await reloadAll();

      let msg = `Eliminados ${deleted} gasto(s).`;
      if (blocked > 0) msg += ` Omitidos ${blocked} (sin permiso o hoja bloqueada).`;
      setEditSheetModal((p) => ({
        ...p,
        busy: false,
        progressText: "",
        lines: p.lines.filter((ln) => {
          const gid = String(ln?.id_gasto || "").trim().toUpperCase();
          const lid = String(ln?.expense_id || "").trim().toUpperCase();
          const gone = new Set(
            targets.map((t) => String(t?.id_gasto || t?.id || t?.local_id || "").trim().toUpperCase()).filter(Boolean)
          );
          if (gid && gone.has(gid)) return false;
          if (lid && gone.has(lid)) return false;
          return true;
        }),
        selected: {},
        result: { ok: deleted > 0 || blocked === 0, message: msg },
      }));
    } catch (e) {
      setEditSheetModal((p) => ({
        ...p,
        busy: false,
        progressText: "",
        result: { ok: false, message: e?.message || "No se pudieron eliminar los gastos." },
      }));
    }
  };

  const openEditSheet_ = async (sheet) => {
    if (!canModifyExpenseSheetRow(sheet, user?.email, role, assignedSet)) {
      Alert.alert(
        expenseSheetIsPaid(sheet) ? 'Hoja pagada' : 'Sin permiso',
        expenseSheetIsPaid(sheet)
          ? 'No se puede modificar una hoja ya pagada.'
          : 'No puedes modificar esta hoja de gasto.'
      );
      return;
    }
    const sid = resolveSheetServerId_(sheet);
    setEditSheetModal({
      visible: true,
      sheet,
      lines: Array.isArray(sheet?.lineas) ? sheet.lineas : [],
      selected: {},
      loading: true,
      busy: false,
      progressText: "Cargando líneas de la hoja…",
      result: null,
      confirm: null,
    });
    let lines = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
    if (sid) {
      try {
        const detailRes = await sheetsApi.get('hoja_gasto_detalle', {
          hoja_gasto_id: sid,
          user_email: String(user?.email || '').trim(),
        });
        const detail = detailRes?.data || detailRes || {};
        const dl = Array.isArray(detail?.lineas) ? detail.lineas : [];
        if (dl.length) {
          lines = dl;
          sheet = {
            ...sheet,
            ...detail,
            lineas: dl,
            _fromRemoteList: sheet?._fromRemoteList || !!detail?.hoja_gasto_id,
          };
        }
      } catch {
        // se muestra con lo local
      }
    }
    lines = lines.map((ln) => {
      const gid = String(ln?.id_gasto || '').trim();
      if (/^GAS/i.test(gid)) return ln;
      const lid = String(ln?.expense_id || '').trim();
      const exp =
        (expenses || []).find((e) => String(e?.id || e?.local_id || '').trim() === lid) || null;
      const remote = String(exp?.id_gasto || '').trim();
      return /^GAS/i.test(remote) ? { ...ln, id_gasto: remote } : ln;
    });
    const selectedInit = {};
    for (const ln of lines) {
      const k = String(ln?.id_gasto || ln?.expense_id || '').trim();
      if (k) selectedInit[k] = false;
    }
    setEditSheetModal({
      visible: true,
      sheet,
      lines,
      selected: selectedInit,
      loading: false,
      busy: false,
      progressText: "",
      result: null,
      confirm: null,
    });
  };

  const applyUnlinkLocally_ = async (sheet, unlinkedIds, reopenAll) => {
    const sid = resolveSheetServerId_(sheet);
    const unlinkSet = new Set(
      (unlinkedIds || []).map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
    );
    const nextExpenses = (expenses || []).map((e) => {
      const hid = String(e?.hoja_gasto_id || '').trim();
      const gid = String(e?.id_gasto || '').trim();
      const lid = String(e?.id || e?.local_id || '').trim();
      const gidU = gid.toUpperCase();
      const hit = reopenAll
        ? hid === sid || (gid && unlinkSet.has(gidU))
        : (gid && unlinkSet.has(gidU)) ||
          (lid && unlinkSet.has(lid.toUpperCase())) ||
          (hid === sid && gid && unlinkSet.has(gidU));
      if (!hit) return e;
      return {
        ...e,
        hoja_gasto_id: '',
        hoja_gasto_estado: '',
        num_hoja_gasto: '',
        Num_Hoja_Gasto: '',
      };
    });
    await localDb.setExpenses(nextExpenses);
    setExpenses(nextExpenses);

    const allSheets = await localDb.getExpenseSheets();
    const nextSheets = (Array.isArray(allSheets) ? allSheets : [])
      .map((s) => {
        const id = String(s?.id || s?.hoja_id_local || s?.hoja_gasto_id || '').trim();
        if (id !== sid) return s;
        if (reopenAll) return null;
        const kept = (Array.isArray(s?.lineas) ? s.lineas : []).filter((ln) => {
          const gid = String(ln?.id_gasto || '').trim().toUpperCase();
          const lid = String(ln?.expense_id || '').trim().toUpperCase();
          if (gid && unlinkSet.has(gid)) return false;
          if (lid && unlinkSet.has(lid)) return false;
          return true;
        });
        if (!kept.length) return null;
        const total = kept.reduce((acc, ln) => acc + (Number(ln?.importe || ln?.importe_pagar || 0) || 0), 0);
        return {
          ...s,
          lineas: kept,
          total_importe: Number(total.toFixed(2)),
          hoja_gasto_total: Number(total.toFixed(2)),
        };
      })
      .filter(Boolean);
    await localDb.setExpenseSheets(nextSheets);
    setSheets(nextSheets);

    setRemoteSheets((prev) =>
      (Array.isArray(prev) ? prev : [])
        .map((s) => {
          const id = String(s?.hoja_gasto_id || s?.id || '').trim();
          if (id !== sid) return s;
          if (reopenAll) return null;
          const count = Math.max(0, Number(s?.lineas_count || 0) - unlinkSet.size);
          if (count <= 0) return null;
          return { ...s, lineas_count: count, lineas: [] };
        })
        .filter(Boolean)
    );
  };

  const printSheetPdf = async (sheet, metaOverride = null, opts = {}) => {
    const mode = opts?.mode === "preview" ? "preview" : "share";
    if (printingSheetId) {
      Alert.alert(
        mode === "preview" ? "Vista previa en curso" : "Impresión en curso",
        "Ya hay una operación en curso. Espera a que termine."
      );
      return;
    }
    const printKey = String(sheet?.hoja_gasto_id || sheet?.hoja_id_local || sheet?.id || "").trim();
    try {
      setPrintingSheetId(printKey || "__printing__");
      setPrintingProgress(mode === "preview" ? "Preparando vista previa…" : "Cargando datos…");
      let sheetForPrint = opts?.sheetPrefetch && typeof opts.sheetPrefetch === "object" ? opts.sheetPrefetch : sheet;
      let lines = Array.isArray(opts?.linesPrefetch)
        ? opts.linesPrefetch
        : Array.isArray(sheetForPrint?.lineas)
          ? sheetForPrint.lineas
          : Array.isArray(sheet?.lineas)
            ? sheet.lineas
            : [];
      const sid = String(sheetForPrint?.hoja_gasto_id || sheetForPrint?.hoja_id_local || sheetForPrint?.id || sheet?.hoja_gasto_id || sheet?.hoja_id_local || sheet?.id || "").trim();
      const emailEarly = String(user?.email || "").trim().toLowerCase();

      // Meta local: web → localStorage; APK → AsyncStorage (no comparte con el PC).
      let localExtraMeta = null;
      if (sid) {
        if (Platform.OS === "web") {
          localExtraMeta = loadSheetMetaFromWebStorage_(sid);
        } else {
          try {
            localExtraMeta = await localDb.getExpenseSheetMeta(sid);
          } catch {
            localExtraMeta = null;
          }
        }
      }

      let storedLifeMeta = resolveStoredLifePrintMeta_(sheetForPrint, lines, localExtraMeta);
      // Detalle remoto si faltan líneas o meta LIFE incompleta (salvo prefetch del modal).
      const needRemoteDetail =
        !opts?.skipRemoteDetail &&
        sid &&
        ((!lines || !lines.length) || (sheetIsLife_(sheetForPrint, lines) && !metaOverride && !storedLifeMeta));
      if (needRemoteDetail) {
        try {
          setPrintingProgress("Cargando hoja del servidor…");
          const detailRes = await sheetsApi.get(
            "hoja_gasto_detalle",
            {
              hoja_gasto_id: sid,
              user_email: emailEarly,
            },
            { timeoutMs: 45000 }
          );
          const detail = detailRes?.data || detailRes || {};
          const dl = Array.isArray(detail?.lineas) ? detail.lineas : [];
          if (dl.length || detail?.dni || detail?.fecha_firma || detail?.sheet_meta) {
            lines = dl.length ? dl : lines;
            const rawMeta = detail?.sheet_meta || sheetForPrint?.sheet_meta || sheet?.sheet_meta || sheet?.meta || {};
            const mergedLineasMeta = {
              ...(rawMeta && typeof rawMeta === "object" && rawMeta.lineas && typeof rawMeta.lineas === "object"
                ? rawMeta.lineas
                : {}),
            };
            for (const ln of lines) {
              const k = lineMetaKey_(ln);
              if (!k) continue;
              const wp = String(ln?.work_package || mergedLineasMeta[k]?.work_package || "").trim();
              const acc = String(ln?.accion_proyecto || mergedLineasMeta[k]?.accion_proyecto || "").trim();
              if (wp || acc) mergedLineasMeta[k] = { work_package: wp, accion_proyecto: acc };
            }
            const dniDetail = String(detail?.dni || rawMeta?.dni || sheetForPrint?.dni || sheet?.dni || "").trim();
            const fechaDetail = String(
              detail?.fecha_firma || detail?.fecha_hoja || rawMeta?.fecha_firma || rawMeta?.fecha_hoja || sheetForPrint?.fecha_firma || sheet?.fecha_firma || ""
            ).trim();
            sheetForPrint = {
              ...sheet,
              ...sheetForPrint,
              ...detail,
              lineas: lines,
              dni: dniDetail,
              fecha_hoja: String(detail?.fecha_hoja || detail?.fecha_firma || fechaDetail || sheetForPrint?.fecha_hoja || sheet?.fecha_hoja || "").trim(),
              fecha_firma: fechaDetail,
              sheet_meta: {
                ...(rawMeta && typeof rawMeta === "object" ? rawMeta : {}),
                dni: dniDetail || String(rawMeta?.dni || "").trim(),
                fecha_firma: fechaDetail || String(rawMeta?.fecha_firma || "").trim(),
                fecha_hoja: fechaDetail || String(rawMeta?.fecha_hoja || "").trim(),
                lineas: mergedLineasMeta,
              },
              total_importe: Number(detail?.total_importe ?? sheetForPrint?.total_importe ?? sheet?.total_importe ?? sheet?.hoja_gasto_total ?? 0) || 0,
              usuario_nombre: String(detail?.usuario_nombre || sheetForPrint?.usuario_nombre || sheet?.usuario_nombre || "").trim(),
              createdAtLocal: String(detail?.createdAtLocal || detail?.hoja_gasto_fecha_envio || sheetForPrint?.createdAtLocal || sheet?.createdAtLocal || "").trim(),
            };
            storedLifeMeta = resolveStoredLifePrintMeta_(sheetForPrint, lines, localExtraMeta);
          }
        } catch {
          // se intenta PDF con lo local
        }
      }

      // Si el resumen remoto no trae líneas, reconstruir desde gastos locales vinculados.
      if (!sheetLinesHavePrintableData_(lines)) {
        const fromLocal = linesFromLocalExpensesForSheet_(sheetForPrint || sheet, expenses);
        if (fromLocal.length) {
          lines = fromLocal;
          sheetForPrint = { ...(sheetForPrint || sheet), lineas: fromLocal };
          storedLifeMeta = resolveStoredLifePrintMeta_(sheetForPrint, lines, localExtraMeta);
        }
      }

      let enrichedLines = sortExpenseSheetLinesByDateInvoice_(
        lines.map((l) => enrichSheetLineaFromExpense(l, findLocalExpenseForLine_(l, expenses) || l))
      );

      // LIFE: Consultar (preview) usa meta guardada sin modal.
      // Compartir PDF: siempre permite cambiar la fecha de hoja (modal con datos prefill).
      let effectiveMeta = metaOverride;
      if (sheetIsLife_(sheetForPrint, enrichedLines) && !effectiveMeta) {
        storedLifeMeta = resolveStoredLifePrintMeta_(sheetForPrint, enrichedLines, localExtraMeta);
        // Si aún no hay meta y no se pidió detalle (p.ej. LIFE solo tras enriquecer), forzar Sheet.
        if (!storedLifeMeta && sid && !needRemoteDetail) {
          try {
            setPrintingProgress("Sincronizando metadatos…");
            const detailRes = await sheetsApi.get(
              "hoja_gasto_detalle",
              { hoja_gasto_id: sid, user_email: emailEarly },
              { timeoutMs: 45000 }
            );
            const detail = detailRes?.data || detailRes || {};
            const dl = Array.isArray(detail?.lineas) ? detail.lineas : [];
            if (dl.length || detail?.dni || detail?.fecha_firma || detail?.sheet_meta) {
              const useLines = dl.length ? dl : enrichedLines;
              const rawMeta = detail?.sheet_meta || sheetForPrint?.sheet_meta || {};
              const mergedLineasMeta = {
                ...(rawMeta && typeof rawMeta === "object" && rawMeta.lineas && typeof rawMeta.lineas === "object"
                  ? rawMeta.lineas
                  : {}),
              };
              for (const ln of useLines) {
                const k = lineMetaKey_(ln);
                if (!k) continue;
                const wp = String(ln?.work_package || mergedLineasMeta[k]?.work_package || "").trim();
                const acc = String(ln?.accion_proyecto || mergedLineasMeta[k]?.accion_proyecto || "").trim();
                if (wp || acc) mergedLineasMeta[k] = { work_package: wp, accion_proyecto: acc };
              }
              const dniDetail = String(detail?.dni || rawMeta?.dni || sheetForPrint?.dni || "").trim();
              const fechaDetail = String(
                detail?.fecha_firma ||
                  detail?.fecha_hoja ||
                  rawMeta?.fecha_firma ||
                  sheetForPrint?.fecha_firma ||
                  ""
              ).trim();
              sheetForPrint = {
                ...sheetForPrint,
                ...detail,
                lineas: useLines,
                dni: dniDetail,
                fecha_hoja: String(detail?.fecha_hoja || fechaDetail || sheetForPrint?.fecha_hoja || "").trim(),
                fecha_firma: fechaDetail,
                sheet_meta: {
                  ...(rawMeta && typeof rawMeta === "object" ? rawMeta : {}),
                  dni: dniDetail,
                  fecha_firma: fechaDetail,
                  fecha_hoja: fechaDetail,
                  lineas: mergedLineasMeta,
                },
              };
              enrichedLines = useLines.map((l) =>
                enrichSheetLineaFromExpense(l, findLocalExpenseForLine_(l, expenses) || l)
              );
              lines = useLines;
              storedLifeMeta = resolveStoredLifePrintMeta_(sheetForPrint, enrichedLines, localExtraMeta);
            }
          } catch {
            // modal si sigue incompleto
          }
        }
        if (storedLifeMeta && mode === "preview") {
          effectiveMeta = storedLifeMeta;
        } else {
          // Compartir (o falta meta): modal con fecha editable (por defecto cierre viaje / guardada).
          const lineMetaRows = buildSheetLineMetaRows_(
            enrichedLines.map((ln) => {
              const localExp = findLocalExpenseForLine_(ln, expenses);
              return {
                id_gasto: ln?.id_gasto,
                expense_id: ln?.expense_id || ln?.id,
                tipo_gasto: ln?.tipo_gasto,
                concepto: resolveSheetLineConcepto(ln, localExp || ln),
                work_package: ln?.work_package,
                accion_proyecto: ln?.accion_proyecto,
              };
            }),
            storedLifeMeta || sheetForPrint?.sheet_meta || sheetForPrint?.meta || localExtraMeta || {},
            (ln) => `${String(ln?.concepto || ln?.tipo_gasto || "Gasto").trim()}`
          );
          const fechaPrefill =
            normalizeDateToDmy(
              storedLifeMeta?.fechaHoja ||
                sheetForPrint?.fecha_hoja ||
                sheetForPrint?.fecha_firma ||
                sheetForPrint?.sheet_meta?.fecha_firma ||
                sheetForPrint?.sheet_meta?.fecha_hoja ||
                ""
            ) ||
            normalizeDateToDmy(sheetForPrint?.viaje?.fecha_fin || sheetForPrint?.viaje?.fecha_cierre || "") ||
            todayDmy_();
          setPrintMetaModal({
            visible: true,
            sheet,
            sheetForPrint,
            lines: enrichedLines,
            fechaHoja: fechaPrefill,
            dni: String(
              storedLifeMeta?.dni ||
                sheetForPrint?.dni ||
                sheetForPrint?.sheet_meta?.dni ||
                localExtraMeta?.dni ||
                ""
            ).trim(),
            lineMetaRows,
            mode,
          });
          setPrintingSheetId("");
          setPrintingProgress("");
          return;
        }
      }

      // Hoja genérica: al Compartir permitir cambiar la fecha de hoja.
      if (!sheetIsLife_(sheetForPrint, enrichedLines) && !effectiveMeta && mode === "share") {
        const fechaPrefill =
          normalizeDateToDmy(
            sheetForPrint?.fecha_hoja ||
              sheetForPrint?.fecha_firma ||
              sheetForPrint?.sheet_meta?.fecha_firma ||
              ""
          ) ||
          normalizeDateToDmy(sheetForPrint?.viaje?.fecha_fin || sheetForPrint?.viaje?.fecha_cierre || "") ||
          todayDmy_();
        setPrintMetaModal({
          visible: true,
          sheet,
          sheetForPrint,
          lines: enrichedLines,
          fechaHoja: fechaPrefill,
          dni: String(sheetForPrint?.dni || sheetForPrint?.sheet_meta?.dni || "").trim(),
          lineMetaRows: [],
          mode: "share",
        });
        setPrintingSheetId("");
        setPrintingProgress("");
        return;
      }

      setPrintingProgress("Preparando hoja…");
      let proyectoById = new Map();
      if (linesNeedProyectoMapResolve_(enrichedLines)) {
        try {
          setPrintingProgress("Resolviendo proyectos…");
          const proyectoRows = await Promise.race([
            fetchProyectoRowsColumnaBCached(
              (action, params) => sheetsApi.get(action, params),
              emailEarly
            ),
            new Promise((resolve) => setTimeout(() => resolve([]), 8000)),
          ]);
          proyectoById = buildProyectoNombreByIdMap(proyectoRows);
        } catch {
          proyectoById = new Map();
        }
      }
      const dniPrint = String(effectiveMeta?.dni || sheetForPrint?.dni || "").trim();
      const fechaHojaPrint =
        normalizeDateToDmy(
          effectiveMeta?.fechaHoja ||
            sheetForPrint?.fecha_hoja ||
            sheetForPrint?.fecha_firma ||
            sheetForPrint?.sheet_meta?.fecha_firma ||
            ""
        ) || "";
      const lineMetaMap = effectiveMeta?.lineMetaMap || {};
      const linesWithMeta = mergeLineMetaIntoLineas_(
        enrichedLines,
        { dni: dniPrint, lineas: lineMetaMap },
        null
      );

      const resolvedLines = linesWithMeta.map((ln) => {
        const nombre = resolveProyectoNombreParaGasto(ln, proyectoById);
        return nombre ? { ...ln, proyecto: nombre, departamento_o_proyecto: nombre } : ln;
      });

      const sheetFormaPago =
        sheetForPrint?.forma_pago ||
        sheetForPrint?.sheet_meta?.forma_pago ||
        inferSheetFormaPagoFromExpenseRows(
          resolvedLines
            .map((ln) => {
              const gid = String(ln?.id_gasto || "").trim();
              const eid = String(ln?.expense_id || "").trim();
              const match = (Array.isArray(expenses) ? expenses : []).find((e) => {
                const eg = String(e?.id_gasto || "").trim();
                const el = String(e?.id || e?.local_id || "").trim();
                return (gid && eg === gid) || (eid && el === eid);
              });
              return match ? { raw: match } : null;
            })
            .filter(Boolean)
        );

      // Num_Hoja_Gasto = T-mm-yyyy-COD según fecha_hoja (pie). Persistir meta LIFE si aplica.
      if (sid && fechaHojaPrint) {
        const personForNum = personFromSheet_(sheetForPrint, user, profileName);
        const titularEmailForNum = String(sheetForPrint?.usuario_email || "").trim().toLowerCase();
        const titularRecordForNum =
          titularEmailForNum && titularEmailForNum === emailEarly
            ? usuarioRecord
            : {
                email: titularEmailForNum || emailEarly,
                nombre: personForNum,
                cod_personal: sheetForPrint?.cod_personal,
              };
        const codForNum = resolveCodPersonalForSheet({
          usuarioRecord: titularRecordForNum,
          nombre: personForNum,
          codPersonal: sheetForPrint?.cod_personal,
        });
        const currentNum = String(sheetForPrint?.num_hoja_gasto || sheetForPrint?.Num_Hoja_Gasto || "").trim();
        const nextSheetNumber = ensureExpenseSheetNumberForFecha({
          currentNumber: currentNum,
          fechaHoja: fechaHojaPrint,
          usuarioRecord: titularRecordForNum,
          nombre: personForNum,
          email: titularEmailForNum || emailEarly,
          existingNumbers: collectExpenseSheetNumbers([...sheets, ...remoteSheets]),
          codPersonal: codForNum,
        });
        const numberChanged = nextSheetNumber !== currentNum;
        const shouldPersistMeta = Boolean(effectiveMeta && dniPrint);
        if (shouldPersistMeta || numberChanged || metaOverride) {
          const nextMeta = {
            dni: dniPrint || String(sheetForPrint?.dni || sheetForPrint?.sheet_meta?.dni || "").trim(),
            fecha_firma: fechaHojaPrint,
            fecha_hoja: fechaHojaPrint,
            forma_pago: sheetFormaPago,
            lineas: lineMetaMap,
            updatedAt: new Date().toISOString(),
          };
          try {
            const localSheets = await localDb.getExpenseSheets();
            const nextSheets = (Array.isArray(localSheets) ? localSheets : []).map((s) => {
              const id = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
              if (id !== sid) return s;
              return {
                ...s,
                dni: nextMeta.dni,
                fecha_hoja: fechaHojaPrint,
                fecha_firma: fechaHojaPrint,
                num_hoja_gasto: nextSheetNumber,
                Num_Hoja_Gasto: nextSheetNumber,
                sheet_meta: { ...(s?.sheet_meta || {}), ...nextMeta },
                lineas: resolvedLines,
              };
            });
            await localDb.setExpenseSheets(nextSheets);
            setSheets((prev) =>
              (Array.isArray(prev) ? prev : []).map((s) => {
                const id = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
                if (id !== sid) return s;
                return {
                  ...s,
                  dni: nextMeta.dni,
                  fecha_hoja: fechaHojaPrint,
                  fecha_firma: fechaHojaPrint,
                  num_hoja_gasto: nextSheetNumber,
                  Num_Hoja_Gasto: nextSheetNumber,
                  sheet_meta: { ...(s?.sheet_meta || {}), ...nextMeta },
                  lineas: resolvedLines,
                };
              })
            );
            sheetForPrint = {
              ...sheetForPrint,
              dni: nextMeta.dni,
              fecha_hoja: fechaHojaPrint,
              fecha_firma: fechaHojaPrint,
              num_hoja_gasto: nextSheetNumber,
              Num_Hoja_Gasto: nextSheetNumber,
              sheet_meta: { ...(sheetForPrint?.sheet_meta || {}), ...nextMeta },
              lineas: resolvedLines,
            };
            if (Platform.OS === "web" && shouldPersistMeta) {
              persistSheetMetaToWebStorage_(
                sid,
                nextMeta.dni,
                lineMetaMap,
                fechaHojaPrint,
                sheetFormaPago,
                sheetForPrint?.viaje || sheetForPrint?.sheet_meta?.viaje
              );
            }
            if (shouldPersistMeta) {
              try {
                await persistSheetMeta_(
                  localDb,
                  sid,
                  nextMeta.dni,
                  lineMetaMap,
                  fechaHojaPrint,
                  sheetFormaPago,
                  sheetForPrint?.viaje || sheetForPrint?.sheet_meta?.viaje
                );
              } catch {
                /* no bloquear PDF */
              }
            }
            if (metaOverride || numberChanged) {
              const metaLineas = Object.entries(lineMetaMap || {}).map(([id, m]) => ({
                id_gasto: id,
                work_package: String(m?.work_package || "").trim(),
                accion_proyecto: String(m?.accion_proyecto || "").trim(),
              }));
              // No bloquear el PDF esperando la meta en servidor.
              sheetsApi
                .postWebSafe(
                  "hoja_gasto_actualizar_meta",
                  {
                    hoja_gasto_id: sid,
                    user_email: emailEarly,
                    dni: nextMeta.dni,
                    fecha_firma: fechaHojaPrint,
                    fecha_hoja: fechaHojaPrint,
                    num_hoja_gasto: nextSheetNumber,
                    Num_Hoja_Gasto: nextSheetNumber,
                    lineas: metaLineas,
                    sheet_meta: {
                      ...nextMeta,
                      viaje: sheetForPrint?.viaje || sheetForPrint?.sheet_meta?.viaje || nextMeta?.viaje || null,
                    },
                  },
                  { timeoutMs: 45000 }
                )
                .catch(() => {});
            }
          } catch {
            /* no bloquear PDF */
          }
        }
      }

      const total = Number(sheetForPrint?.total_importe || sheetForPrint?.hoja_gasto_total || 0);
      const created = String(sheetForPrint?.createdAtLocal || sheetForPrint?.hoja_gasto_fecha_envio || "");
      const createdDate = formatDateEsValue(created);
      const person = personFromSheet_(sheetForPrint, user, profileName);
      const titularEmailPrint = String(sheetForPrint?.usuario_email || "").trim().toLowerCase();
      const titularRecordPrint =
        titularEmailPrint && titularEmailPrint === emailEarly
          ? usuarioRecord
          : {
              email: titularEmailPrint || emailEarly,
              nombre: person,
              cod_personal: sheetForPrint?.cod_personal,
            };
      const codPersonalPrint = resolveCodPersonalForSheet({
        usuarioRecord: titularRecordPrint,
        nombre: person,
        codPersonal: sheetForPrint?.cod_personal,
      });
      const sheetNumber = inferredSheetNumber_(sheetForPrint, user, profileName, usuarioRecord);
      const sheetOrderText = sheetNumber || String(sheetForPrint?.id || sheetForPrint?.hoja_id_local || "").trim();
      if (!sheetLinesHavePrintableData_(resolvedLines)) {
        throw new Error(
          "Esta hoja no tiene líneas con datos para imprimir. Sincroniza, espera a que termine el envío o vuelve a abrir la hoja."
        );
      }
      const email = emailEarly;
      const apiGet = (action, params, options) => sheetsApi.get(action, params, options);
      const uriToDataUri =
        Platform.OS === "web"
          ? createTicketUriResolverForWeb_(apiGet, email)
          : createTicketUriResolverForNative_(apiGet, email, uriToDataUriIfLocal_);

      setPrintingProgress("Preparando tickets y plantilla…");
      const printPayload = {
        sheetOrderText,
        person,
        createdDate,
        lines: resolvedLines,
        totalFallback: total,
        meta: {
          ...sheetForPrint,
          viaje: sheetForPrint?.viaje || sheetForPrint?.sheet_meta?.viaje,
          dni: dniPrint,
          forma_pago: sheetFormaPago,
          fecha_firma: fechaHojaPrint || String(sheetForPrint?.fecha_firma || sheetForPrint?.fecha_hoja || "").trim(),
          fecha_hoja: fechaHojaPrint || String(sheetForPrint?.fecha_hoja || sheetForPrint?.fecha_firma || "").trim(),
          usuarioRecord: titularRecordPrint,
          cod_personal: codPersonalPrint,
          usuario_nombre: person,
          sheet_meta: sheetForPrint?.sheet_meta,
        },
        expenses,
        uriToDataUri,
        loadLogos: loadExpenseSheetLogosForTemplate,
        ticketAttachments: sheetForPrint?.ticket_attachments,
        apiGet,
        userEmail: email,
        // Web: embebe anexos en HTML; nativo los añade con pdf-lib.
        embedTicketAnnexInHtml: Platform.OS === "web",
        resolveTripDetail: async (idViaje) => {
          const res = await sheetsApi.get("viaje_vehiculo_propio_detalle", {
            id_viaje: idViaje,
            user_email: email,
          });
          return res;
        },
      };
      const built =
        Platform.OS === "web"
          ? await Promise.race([
              buildExpenseSheetPrintHtmlAsync(printPayload),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Tiempo agotado al preparar la hoja. Reintenta.")), 60000)
              ),
            ])
          : await Promise.race([
              buildExpenseSheetPrintHtmlAsync(printPayload),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Tiempo agotado al preparar la hoja. Reintenta.")), 90000)
              ),
            ]);
      const html = built?.html;

      if (!String(html || "").trim()) {
        throw new Error("La plantilla de la hoja quedó vacía.");
      }

      const deliverOpts = {
        html,
        lines: resolvedLines,
        localExpenses: expenses,
        ticketAttachments: built?.ticketAttachments || [],
        // Evitar doble anexo: si el HTML ya trae páginas de tiquet, no volver a añadirlas.
        skipTicketAnnex:
          (Platform.OS === "web" && !!built?.ticketAnnexEmbedded) ||
          /ticket-annex-page|ticket-attachment-page/i.test(String(html || "")),
        dialogTitle: mode === "preview" ? `Vista previa ${sheetOrderText}` : `Hoja ${sheetOrderText}`,
        apiGet,
        userEmail: email,
      };

      if (mode === "preview") {
        setPrintingProgress("Abriendo vista previa…");
        if (Platform.OS === "web") {
          const result = await previewExpenseSheetPdf(deliverOpts);
          const previewHtml = String(result?.html || html || "");
          setPreviewModal({
            visible: true,
            html: previewHtml,
            title: `Vista previa ${sheetOrderText}`,
          });
        } else {
          await previewExpenseSheetPdf(deliverOpts);
        }
      } else {
        setPrintingProgress("Generando PDF…");
        await printAndShareExpenseSheetPdf(deliverOpts);
        if (Platform.OS === "web") {
          Alert.alert(
            "Hoja lista",
            "Se ha abierto una ventana con la hoja de gasto y se ha descargado un HTML de respaldo. En esa ventana nueva usa Imprimir → Guardar como PDF. No imprimas la pantalla de GESTIFLOTA."
          );
        }
      }
    } catch (e) {
      Alert.alert(
        mode === "preview" ? "Error en vista previa" : "Error al generar PDF",
        e?.message ||
          (mode === "preview"
            ? "No se pudo abrir la vista previa de la hoja."
            : "No se pudo generar el PDF de la hoja. No uses Imprimir del navegador sobre esta pantalla: pulsa «Compartir PDF» y espera al diálogo de impresión de la hoja.")
      );
    } finally {
      setPrintingSheetId("");
      setPrintingProgress("");
    }
  };

  const confirmPrintLifeMeta_ = async () => {
    const fechaHoja = normalizeDateToDmy(printMetaModal.fechaHoja) || "";
    if (!fechaHoja) {
      Alert.alert("Fecha obligatoria", "Indica la fecha de la hoja de gasto (pie «Majadahonda a …»).");
      return;
    }
    const rows = printMetaModal.lineMetaRows || [];
    const isLifePrint = rows.length > 0 || sheetIsLife_(printMetaModal.sheetForPrint || printMetaModal.sheet, printMetaModal.lines);
    const dni = String(printMetaModal.dni || "").trim();
    if (isLifePrint && !dni) {
      Alert.alert("DNI obligatorio", "Indica el DNI del usuario para el PDF de la hoja LIFE.");
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!String(r?.work_package || "").trim()) {
        Alert.alert("Work Package obligatorio", `Falta Work Package en: ${r?.label || `línea ${i + 1}`}.`);
        return;
      }
      if (!String(r?.accion_proyecto || "").trim()) {
        Alert.alert("Acción obligatoria", `Falta Acción del proyecto en: ${r?.label || `línea ${i + 1}`}.`);
        return;
      }
    }
    const sheet = printMetaModal.sheetForPrint || printMetaModal.sheet;
    const mode = printMetaModal.mode === "preview" ? "preview" : "share";
    const lineMetaMap = lineMetaMapFromRows_(rows);
    const linesPrefetch = Array.isArray(printMetaModal.lines) ? printMetaModal.lines : [];
    const sheetPrefetch = printMetaModal.sheetForPrint || printMetaModal.sheet;
    setPrintMetaModal({
      visible: false,
      sheet: null,
      sheetForPrint: null,
      lines: [],
      fechaHoja: "",
      dni: "",
      lineMetaRows: [],
      mode: "share",
    });
    await printSheetPdf(
      sheet,
      { dni, fechaHoja, lineMetaMap },
      {
        mode,
        linesPrefetch,
        sheetPrefetch,
        skipRemoteDetail: sheetLinesHavePrintableData_(linesPrefetch),
      }
    );
  };

  const syncNow = async () => {
    try {
      const res = await runSync({
        onComplete: async () => {
          await reloadAll();
          await loadRemoteSheets();
        },
      });
      await showSyncResultAlert(res);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo sincronizar.");
    }
  };

  const editExpense = async (row) => {
    try {
      const eid = String(row?.id || "").trim();
      if (!eid) return;
      await localDb.setExpensesDraft({
        ...row.raw,
        _editExpenseId: eid,
      });
      navigation.navigate("Gasto");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo abrir el gasto para editar.");
    }
  };

  const deleteExpense = async (row) => {
    const eid = String(row?.id || "").trim();
    if (!eid) return;
    Alert.alert("Eliminar gasto", "¿Seguro que quieres eliminar este gasto pendiente?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExpenseCompletely_(row?.raw || row, { userEmail: user?.email, role });
            await reloadAll();
            setSelected((p) => {
              const n = { ...p };
              delete n[eid];
              return n;
            });
          } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo eliminar el gasto.");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          selectedRows.length > 0 && { paddingBottom: expenseSelectionBarPadding },
        ]}
      >
      <Header
        onBack={() => navigation.navigate("Menu")}
        onImportExcel={canImportExcel ? () => navigation.navigate("ImportarHojaExcel") : null}
      />

      <View style={styles.card}>
        {canOnBehalf ? (
          <SelectField
            label="VER / CREAR HOJA A NOMBRE DE"
            required={false}
            value={onBehalfEmail}
            onChange={(v) => {
              setOnBehalfEmail(String(v || "").trim().toLowerCase());
              setSelected({});
            }}
            options={[
              { value: "", label: "Todos los usuarios" },
              ...(selfEmail
                ? [{ value: selfEmail, label: `Yo (${selfEmail})` }]
                : [{ value: "", label: "Yo (usuario actual)" }]),
              ...userOptions.filter((u) => u.value !== selfEmail),
            ]}
          />
        ) : null}
        {canOnBehalf ? (
          numberingTitularPreview.ambiguous ? (
            <Text style={styles.errorMeta}>
              Selección de varios usuarios: elige un titular en «a nombre de» o selecciona gastos de un solo usuario. El nº de hoja usa el COD del titular.
            </Text>
          ) : (
            <Text style={styles.numberingMeta}>
              Numeración de hoja: {numberingTitularPreview.nombre || "—"}
              {numberingTitularPreview.email ? ` (${numberingTitularPreview.email})` : ""}
              {numberingCodPreview ? ` · COD ${numberingCodPreview}` : ""}
              {!selectedRows.length && !filterOwnerEmail
                ? " · Selecciona gastos o filtra por usuario"
                : ""}
            </Text>
          )
        ) : null}
        <Text style={styles.meta}>Pendientes (Usuario o tarjeta GREFA): {pending.length}</Text>
        <Text style={styles.meta}>Seleccionados: {selectedRows.length}</Text>
        {pending.length ? (
          <Text style={styles.selectHint}>Toca la casilla al inicio de la fila (columna Sel.) para marcar gastos.</Text>
        ) : null}
        {selectedWarnings.length ? (
          <Text style={styles.warnMeta}>
            Avisos en selección: {selectedWarnings.length} gasto(s) con incidencias
          </Text>
        ) : null}
        {selectedBlocks.length ? (
          <Text style={styles.errorMeta}>
            Bloqueo: {selectedBlocks.length} gasto(s) sin tiquet/comprobante adjunto o sin nº de
            factura/tiquet. No se podrá crear la hoja.
          </Text>
        ) : null}
        <Text style={styles.total}>Total hoja: {selectedTotal.toFixed(2)} EUR</Text>
        <View style={styles.cardActionsRow}>
          <Pressable
            style={[styles.sendBtn, styles.cardActionBtn, (sending || !!selectedBlocks.length) && { opacity: 0.75 }]}
            onPress={createSheet}
            disabled={sending}
          >
            <Text style={[styles.cardActionText, styles.sendActionText]} numberOfLines={2}>
              {sending ? "Enviando..." : "Crear y enviar hoja"}
            </Text>
          </Pressable>
          {canImportExcel ? (
            <Pressable
              style={[styles.importBtnCard, styles.cardActionBtn]}
              onPress={() => navigation.navigate("ImportarHojaExcel")}
            >
              <Text style={[styles.cardActionText, styles.importBtnCardText]} numberOfLines={2}>
                Importar Excel
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.syncBtn, styles.cardActionBtn]} onPress={syncNow}>
            <Text style={[styles.cardActionText, styles.syncActionText]} numberOfLines={2}>
              Sincronizar
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.section}>Gastos seleccionables</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={styles.tableScroll} contentContainerStyle={{ alignItems: "flex-start" }}>
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, styles.colSel]}>Sel.</Text>
            {canOnBehalf ? <Text style={[styles.th, styles.colUsuario]}>Usuario</Text> : null}
            <Text style={[styles.th, styles.colTipo]}>Tipo de gasto</Text>
            <Text style={[styles.th, styles.colMat]}>Matrícula</Text>
            <Text style={[styles.th, styles.colFecha]}>Fecha</Text>
            <Text style={[styles.th, styles.colProv]}>Proveedor</Text>
            <Text style={[styles.th, styles.colFact]}>Nº factura</Text>
            <Text style={[styles.th, styles.colImp]}>Importe</Text>
            <Text style={[styles.th, styles.colTicket]}>Tiquet</Text>
            <Text style={[styles.th, styles.colAct]}>Modificar</Text>
            <Text style={[styles.th, styles.colAct]}>Eliminar</Text>
          </View>
          {pending.map((r) => {
            const warnings = expenseSupervisionWarnings_(r.raw, outboxExpenseIds);
            const hasTicket = expenseHasTicket_(r.raw);
            const prov = entityFromExpense_(r.raw);
            const factura = invoiceFromExpense_(r.raw);
            const selectedRow = !!selected[r.id];
            return (
              <Pressable
                key={r.id}
                style={[styles.tr, selectedRow && styles.trSelected]}
                onPress={() => toggle(r.id)}
              >
                <View style={[styles.td, styles.colSel]}>
                  <ExpenseSelectMark selected={selectedRow} />
                </View>
                {canOnBehalf ? (
                  <Text style={[styles.td, styles.colUsuario]} numberOfLines={2}>
                    {r.ownerLabel || r.ownerEmail || "—"}
                  </Text>
                ) : null}
                <View style={styles.colTipo}>
                  <Text style={styles.td} numberOfLines={2}>
                    {r.type || "Gasto"}
                  </Text>
                  {warnings.length ? (
                    <Text style={styles.rowWarn} numberOfLines={2}>
                      ⚠ {warnings.join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.td, styles.colMat]} numberOfLines={1}>
                  {r.plate || "—"}
                </Text>
                <Text style={[styles.td, styles.colFecha]} numberOfLines={1}>
                  {formatDateEsValue(r.date)}
                </Text>
                <Text style={[styles.td, styles.colProv]} numberOfLines={2}>
                  {prov || "—"}
                </Text>
                <Text style={[styles.td, styles.colFact]} numberOfLines={1}>
                  {factura || "—"}
                </Text>
                <Text style={[styles.td, styles.colImp]} numberOfLines={1}>
                  {(r.amount || 0).toFixed(2)} €
                </Text>
                <Text
                  style={[styles.td, styles.colTicket, hasTicket ? styles.ticketYes : styles.ticketNo]}
                  numberOfLines={1}
                >
                  {hasTicket ? "Sí" : "No"}
                </Text>
                <View style={[styles.td, styles.colAct]}>
                  <Pressable
                    style={styles.tableActionBtn}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      editExpense(r);
                    }}
                  >
                    <Text style={styles.tableActionText}>Editar</Text>
                  </Pressable>
                </View>
                <View style={[styles.td, styles.colAct]}>
                  <Pressable
                    style={[styles.tableActionBtn, styles.tableActionDanger]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      deleteExpense(r);
                    }}
                  >
                    <Text style={styles.tableActionText}>Eliminar</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {!pending.length ? <Text style={styles.empty}>No hay gastos de usuario pendientes para reembolso.</Text> : null}
      {Platform.OS !== "web" && pending.length > 0 ? (
        <Text style={styles.tableHint}>Desliza horizontalmente para ver todas las columnas. Toca la fila para seleccionar.</Text>
      ) : null}

      <Text style={styles.section}>Hojas de gasto (dispositivo y servidor)</Text>
      <View style={styles.sheetFiltersCard}>
        <Text style={styles.sheetFiltersTitle}>Filtrar hojas</Text>
        <View style={styles.sheetFiltersGrid}>
          <View style={styles.sheetFilterCell}>
            <SelectField
              label="Proyecto"
              required={false}
              value={sheetFilterProyecto}
              onChange={setSheetFilterProyecto}
              options={sheetFilterOptions.proyectoOpts}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <SelectField
              label="Usuario / servidor"
              required={false}
              value={sheetFilterUsuario}
              onChange={(v) => setSheetFilterUsuario(String(v || "").trim().toLowerCase())}
              options={sheetFilterOptions.usuarioOpts}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <SelectField
              label="Tipo de hoja"
              required={false}
              value={sheetFilterTipo}
              onChange={setSheetFilterTipo}
              options={SHEET_TYPE_FILTER_OPTIONS}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <SelectField
              label="Mes (nº hoja)"
              required={false}
              value={sheetFilterMes}
              onChange={setSheetFilterMes}
              options={sheetFilterOptions.mesOpts}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <DateField
              label="Fecha inicio"
              required={false}
              value={sheetFilterFechaDesde}
              onChange={setSheetFilterFechaDesde}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <DateField
              label="Fecha fin"
              required={false}
              value={sheetFilterFechaHasta}
              onChange={setSheetFilterFechaHasta}
            />
          </View>
          <View style={styles.sheetFilterCell}>
            <Pressable style={styles.sheetFilterApplyBtn} onPress={applySheetFilters_}>
              <Text style={styles.sheetFilterApplyText}>Buscar</Text>
            </Pressable>
          </View>
          <View style={styles.sheetFilterCell}>
            <Pressable
              style={[
                styles.sheetFilterClearBtn,
                !(sheetFiltersDraftActive || sheetFiltersAppliedActive) && styles.sheetFilterClearBtnDisabled,
              ]}
              onPress={clearSheetFilters_}
              disabled={!(sheetFiltersDraftActive || sheetFiltersAppliedActive)}
            >
              <Text style={styles.sheetFilterClearText}>Limpiar</Text>
            </Pressable>
          </View>
          <View style={[styles.sheetFilterCell, styles.sheetFilterCellFull]}>
            <Text style={styles.sheetFilterHint}>
              Pulsa Buscar para filtrar. Proyecto: catálogo PROYECTOS y gastos vinculados a cada hoja. Mes del
              nº (T-12-2026-…). Fechas: fecha de hoja o envío.
            </Text>
            <Text style={styles.sheetFilterCountInline}>
              Resultados: {filteredDisplayedSheets.length} / {mergedDisplayedSheets.length}
            </Text>
          </View>
        </View>
      </View>
      {remoteListLoading ? <Text style={styles.meta}>Cargando listado del servidor…</Text> : null}
      {filteredDisplayedSheets.map((s) => {
        const sync = sheetSyncStatus_(s, outbox);
        const visibleNum = String(s?.num_hoja_gasto || s?.Num_Hoja_Gasto || "").trim();
        const internalId = String(s?.id || s?.hoja_id_local || s?.hoja_gasto_id || "").trim();
        const rowKey = [...sheetKeysSet_(s)].join("|") || internalId;
        const printKey = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
        const lineCount = Array.isArray(s.lineas) ? s.lineas.length : Number(s?.lineas_count || 0) || 0;
        const origin = s?._fromRemoteList ? "Servidor" : "Dispositivo";
        return (
        <View key={rowKey} style={styles.row}>
          <Text style={styles.rowTitle}>{visibleNum || internalId}</Text>
          <Text style={styles.rowSub}>
            {origin}
            {String(s?.usuario_nombre || s?.usuario_email || "").trim()
              ? ` · ${String(s?.usuario_nombre || "").trim() || s.usuario_email}`
              : ""}
          </Text>
          {visibleNum && internalId && visibleNum !== internalId ? (
            <Text style={styles.rowSub}>ID: {internalId}</Text>
          ) : null}
          <Text style={styles.rowSub}>
            Estado: {s.estado || s.hoja_gasto_estado || "ENVIADA"}
            {s.hoja_gasto_estado_pago ? ` · Pago: ${s.hoja_gasto_estado_pago}` : ""}
            {" · "}
            <Text style={[styles.syncBadge, sync.tone === "ok" ? styles.syncOk : sync.tone === "warn" ? styles.syncWarn : styles.syncErr]}>{sync.text}</Text>
            {" · "}
            Líneas: {lineCount}
          </Text>
          <Text style={styles.rowAmount}>{Number(s.total_importe || s.hoja_gasto_total || 0).toFixed(2)} EUR</Text>
          <View style={styles.rowActions}>
            <Pressable
              style={[styles.actionBtn, printingSheetId && { opacity: 0.65 }]}
              onPress={() => printSheetPdf(s, null, { mode: "preview" })}
              disabled={!!printingSheetId}
            >
              <Text style={styles.actionText}>
                {printingSheetId === printKey && String(printingProgress || "").includes("vista")
                  ? printingProgress || "Vista previa…"
                  : "Consultar"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, printingSheetId && { opacity: 0.65 }]}
              onPress={() => printSheetPdf(s)}
              disabled={!!printingSheetId}
            >
              <Text style={styles.actionText}>
                {printingSheetId === printKey && !String(printingProgress || "").includes("vista")
                  ? printingProgress || "Preparando PDF..."
                  : "Compartir PDF"}
              </Text>
            </Pressable>
            {canModifyExpenseSheetRow(s, user?.email, role, assignedSet) ? (
              <Pressable style={styles.actionBtn} onPress={() => openEditSheet_(s)}>
                <Text style={styles.actionText}>Modificar hoja</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )})}
      {!mergedDisplayedSheets.length ? (
        <Text style={styles.empty}>Aún no hay hojas de gasto visibles para tu rol.</Text>
      ) : !filteredDisplayedSheets.length ? (
        <Text style={styles.empty}>Ninguna hoja coincide con los filtros aplicados.</Text>
      ) : null}

      </ScrollView>
      <ExpenseSelectionBar
        count={selectedRows.length}
        onClear={() => setSelected({})}
        onDelete={deleteSelectedPending_}
        deleteLabel="Eliminar todos"
      />

      <Modal
        visible={!!editSheetModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (editSheetModal.busy) return;
          closeEditSheetModal_();
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.modalCardWide, styles.modalSheetShell]}>
              <Text style={styles.modalTitle}>Modificar hoja</Text>
              {editSheetModal.busy ? (
                <View style={styles.workingBox}>
                  <ActivityIndicator size="large" color={theme.colors.text} />
                  <Text style={styles.progressOverlayTitle}>Procesando…</Text>
                  <Text style={styles.progressOverlayText}>
                    {editSheetModal.progressText || "Espera a que termine. No cierres la ventana."}
                  </Text>
                  <Text style={styles.progressOverlayHint}>Al terminar pulsa Entendido para cerrar.</Text>
                </View>
              ) : editSheetModal.result ? (
                <View
                  style={[
                    styles.resultBox,
                    editSheetModal.result.ok ? styles.resultBoxOk : styles.resultBoxErr,
                  ]}
                >
                  <Text style={styles.resultTitle}>
                    {editSheetModal.result.ok ? "Proceso completado" : "No se pudo completar"}
                  </Text>
                  <Text style={styles.resultMessage}>{editSheetModal.result.message}</Text>
                  {editSheetModal.result.ok ? (
                    <Pressable style={styles.modalOk} onPress={closeEditSheetModal_}>
                      <Text style={styles.modalOkText}>Entendido</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.modalOk}
                      onPress={() => setEditSheetModal((p) => ({ ...p, result: null }))}
                    >
                      <Text style={styles.modalOkText}>Volver</Text>
                    </Pressable>
                  )}
                </View>
              ) : editSheetModal.confirm ? (
                <View style={[styles.resultBox, styles.confirmBox]}>
                  <Text style={styles.resultTitle}>{editSheetModal.confirm.title}</Text>
                  <Text style={styles.resultMessage}>{editSheetModal.confirm.message}</Text>
                  <Text style={styles.modalHint}>¿Quieres continuar?</Text>
                  <View style={styles.modalActions}>
                    <Pressable style={styles.modalCancel} onPress={cancelUnlinkConfirm_}>
                      <Text style={styles.modalCancelText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalOk, Platform.OS === "web" && styles.webClickable]}
                      onPress={() =>
                        editSheetModal.confirm?.mode === "delete"
                          ? executeDeleteSheetExpenses_(
                              editSheetModal.confirm,
                              editSheetModal.sheet,
                              editSheetModal.lines
                            )
                          : executeUnlinkSheet_(
                              editSheetModal.confirm,
                              editSheetModal.sheet,
                              editSheetModal.lines
                            )
                      }
                    >
                      <Text style={styles.modalOkText}>Sí, continuar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.modalHint}>
                    Desvincula gastos para crear otra hoja, elimina los seleccionados o reabre toda la hoja. Solo
                    disponible si no está pagada.
                  </Text>
                  <Text style={styles.rowSub}>
                    {String(editSheetModal.sheet?.num_hoja_gasto || editSheetModal.sheet?.id || "").trim()}
                  </Text>
                  {editSheetModal.loading ? (
                    <Text style={styles.meta}>Cargando líneas…</Text>
                  ) : (
                    <ScrollView
                      style={styles.modalScrollArea}
                      contentContainerStyle={styles.modalScrollContent}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {(editSheetModal.lines || []).length ? (
                        (editSheetModal.lines || []).map((ln, idx) => {
                          const key = String(ln?.id_gasto || ln?.expense_id || `ln-${idx}`).trim();
                          const on = !!editSheetModal.selected[key];
                          const gasId = String(ln?.id_gasto || "").trim();
                          return (
                            <Pressable
                              key={key}
                              style={[styles.lifeLineCard, on && styles.rowSelected]}
                              onPress={() =>
                                setEditSheetModal((p) => ({
                                  ...p,
                                  selected: { ...p.selected, [key]: !p.selected[key] },
                                }))
                              }
                              disabled={editSheetModal.busy}
                            >
                              <View style={styles.lifeLineTitleRow}>
                                <ExpenseSelectMark selected={on} size={20} />
                                <Text style={styles.lifeLineTitle}>
                                  {String(ln?.concepto || ln?.tipo_gasto || "Gasto").trim()}
                                </Text>
                              </View>
                              <Text style={styles.rowSub}>
                                {gasId || String(ln?.expense_id || "sin id remoto").trim()}
                                {" · "}
                                {Number(ln?.importe || ln?.importe_pagar || 0).toFixed(2)} €
                              </Text>
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={styles.empty}>No hay líneas en esta hoja.</Text>
                      )}
                    </ScrollView>
                  )}
                  <View style={styles.modalFooter}>
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.modalCancel}
                        onPress={closeEditSheetModal_}
                        disabled={editSheetModal.busy}
                      >
                        <Text style={styles.modalCancelText}>Cerrar</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modalOk, editSheetModal.busy && { opacity: 0.7 }]}
                        onPress={() => beginUnlinkSheet_({ reopenAll: false })}
                        disabled={editSheetModal.busy || editSheetModal.loading}
                      >
                        <Text style={styles.modalOkText}>
                          {editSheetModal.busy ? "Desvinculando…" : "Desvincular selección"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.actionBtn,
                          styles.actionDanger,
                          editSheetModal.busy && { opacity: 0.7 },
                        ]}
                        onPress={beginDeleteSheetExpenses_}
                        disabled={editSheetModal.busy || editSheetModal.loading}
                      >
                        <Text style={styles.actionText}>
                          {editSheetModal.busy ? "Procesando…" : "Eliminar selección"}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        styles.actionDanger,
                        { marginTop: 8 },
                        editSheetModal.busy && { opacity: 0.7 },
                      ]}
                      onPress={() => beginUnlinkSheet_({ reopenAll: true })}
                      disabled={editSheetModal.busy || editSheetModal.loading}
                    >
                      <Text style={styles.actionText}>
                        {editSheetModal.busy ? "Procesando…" : "Reabrir toda la hoja"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!createMetaModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setCreateMetaModal({ visible: false, mode: "generic", fechaHoja: "", dni: "", lineMetaRows: [], viajeSnapshot: null })
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, createMetaModal.mode === "life" && styles.modalCardWide, styles.modalSheetShell]}>
            <Text style={styles.modalTitle}>
              {createMetaModal.mode === "life" ? "Datos PDF hoja LIFE" : "Hoja genérica"}
            </Text>
            <Text style={styles.modalHint}>
              {createMetaModal.mode === "life"
                ? "Puedes cambiar la fecha de la hoja (por defecto la del cierre del viaje). Indica DNI y Work Package / Acción por gasto si aún no están."
                : "Fecha de la hoja: por defecto la del cierre del viaje. Puedes cambiarla; irá en el pie («Majadahonda a …»). Indica también el DNI. El Nº de orden será: T-Mes-Año-CodPersonal."}
            </Text>
            {createMetaModal.mode === "life" && createMetaModal.viajeSnapshot ? (
              <Text style={styles.numberingMeta}>
                Viaje · FECHA INICIO:{" "}
                {normalizeDateToDmy(createMetaModal.viajeSnapshot.fecha_inicio) ||
                  createMetaModal.viajeSnapshot.fecha_inicio ||
                  "—"}
                {"  ·  FECHA FIN: "}
                {normalizeDateToDmy(createMetaModal.viajeSnapshot.fecha_fin) ||
                  createMetaModal.viajeSnapshot.fecha_fin ||
                  "—"}
              </Text>
            ) : null}
            {canOnBehalf && createMetaModal.sheetTitularEmail ? (
              <Text style={styles.numberingMeta}>
                Nº de hoja a nombre de:{" "}
                {displayNameFromUserOptions_(
                  createMetaModal.sheetTitularEmail,
                  userOptions,
                  createMetaModal.sheetTitularEmail === selfEmail ? usuarioRecord : titularUsuarioRecord
                ) || createMetaModal.sheetTitularEmail}
                {` (${createMetaModal.sheetTitularEmail})`}
                {numberingCodPreview &&
                String(numberingTitularPreview.email || "").toLowerCase() ===
                  String(createMetaModal.sheetTitularEmail || "").toLowerCase()
                  ? ` · COD ${numberingCodPreview}`
                  : ""}
              </Text>
            ) : null}
            <DateField
              label={createMetaModal.mode === "life" ? "Fecha hoja de gasto (editable)" : "Fecha hoja de gasto (pie / numeración)"}
              required
              value={createMetaModal.fechaHoja}
              onChange={(v) => setCreateMetaModal((p) => ({ ...p, fechaHoja: v }))}
            />
            <TextField
              label="DNI del usuario"
              required={createMetaModal.mode === "life"}
              value={createMetaModal.dni}
              onChangeText={(v) => setCreateMetaModal((p) => ({ ...p, dni: v }))}
              placeholder="Ej: 12345678A"
              autoCapitalize="characters"
            />
            {createMetaModal.mode === "life" ? (
              <ScrollView
                style={styles.modalScrollArea}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {(createMetaModal.lineMetaRows || []).map((row, idx) => (
                  <View key={String(row?.key || idx)} style={styles.lifeLineCard}>
                    <Text style={styles.lifeLineTitle}>{row?.label || `Gasto ${idx + 1}`}</Text>
                    <TextField
                      label="Work Package"
                      required
                      value={row.work_package}
                      onChangeText={(v) =>
                        setCreateMetaModal((p) => ({
                          ...p,
                          lineMetaRows: (p.lineMetaRows || []).map((r, i) =>
                            i === idx ? { ...r, work_package: v } : r
                          ),
                        }))
                      }
                      placeholder="Ej: WP3"
                    />
                    <TextField
                      label="Acción del proyecto"
                      required
                      value={row.accion_proyecto}
                      onChangeText={(v) =>
                        setCreateMetaModal((p) => ({
                          ...p,
                          lineMetaRows: (p.lineMetaRows || []).map((r, i) =>
                            i === idx ? { ...r, accion_proyecto: v } : r
                          ),
                        }))
                      }
                      placeholder="Ej: A1"
                    />
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.modalFooter}>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() =>
                    setCreateMetaModal({ visible: false, mode: "generic", fechaHoja: "", dni: "", lineMetaRows: [], viajeSnapshot: null })
                  }
                  disabled={sending}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalOk, sending && { opacity: 0.7 }]}
                  onPress={createMetaModal.mode === "life" ? confirmLifeSheetMeta_ : confirmGenericSheetMeta_}
                  disabled={sending}
                >
                  <Text style={styles.modalOkText}>{sending ? "Enviando..." : "Crear hoja"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!printMetaModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (printingSheetId) return;
          setPrintMetaModal({
            visible: false,
            sheet: null,
            sheetForPrint: null,
            lines: [],
            fechaHoja: "",
            dni: "",
            lineMetaRows: [],
          });
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.modalCardWide, styles.modalSheetShell]}>
            <Text style={styles.modalTitle}>
              {(printMetaModal.lineMetaRows || []).length
                ? "Datos PDF hoja LIFE"
                : "Fecha de la hoja de gasto"}
            </Text>
            <Text style={styles.modalHint}>
              {(printMetaModal.lineMetaRows || []).length
                ? "Puedes cambiar la fecha de la hoja (por defecto la del cierre del viaje). Indica DNI y Work Package / Acción por gasto si aún no están."
                : "Puedes cambiar la fecha de la hoja de gasto antes de generar el PDF. Por defecto se usa la del cierre del viaje."}
            </Text>
            <DateField
              label="Fecha hoja de gasto (editable)"
              required
              value={printMetaModal.fechaHoja}
              onChange={(v) => setPrintMetaModal((p) => ({ ...p, fechaHoja: v }))}
            />
            {(printMetaModal.lineMetaRows || []).length || String(printMetaModal.dni || "").trim() || sheetIsLife_(printMetaModal.sheetForPrint || printMetaModal.sheet, printMetaModal.lines) ? (
              <TextField
                label="DNI del usuario"
                required={(printMetaModal.lineMetaRows || []).length > 0 || sheetIsLife_(printMetaModal.sheetForPrint || printMetaModal.sheet, printMetaModal.lines)}
                value={printMetaModal.dni}
                onChangeText={(v) => setPrintMetaModal((p) => ({ ...p, dni: v }))}
                placeholder="Ej: 12345678A"
                autoCapitalize="characters"
              />
            ) : null}
            <ScrollView
              style={styles.modalScrollArea}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {(printMetaModal.lineMetaRows || []).map((row, idx) => (
                <View key={row.key || String(idx)} style={styles.lifeLineCard}>
                  <Text style={styles.lifeLineTitle}>{row.label || `Gasto ${idx + 1}`}</Text>
                  <TextField
                    label="Work Package"
                    required
                    value={row.work_package}
                    onChangeText={(v) =>
                      setPrintMetaModal((p) => ({
                        ...p,
                        lineMetaRows: (p.lineMetaRows || []).map((r, i) =>
                          i === idx ? { ...r, work_package: v } : r
                        ),
                      }))
                    }
                    placeholder="Ej: WP3"
                  />
                  <TextField
                    label="Acción del proyecto"
                    required
                    value={row.accion_proyecto}
                    onChangeText={(v) =>
                      setPrintMetaModal((p) => ({
                        ...p,
                        lineMetaRows: (p.lineMetaRows || []).map((r, i) =>
                          i === idx ? { ...r, accion_proyecto: v } : r
                        ),
                      }))
                    }
                    placeholder="Ej: A1"
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalFooter}>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() =>
                    setPrintMetaModal({
                      visible: false,
                      sheet: null,
                      sheetForPrint: null,
                      lines: [],
                      fechaHoja: "",
                      dni: "",
                      lineMetaRows: [],
                      mode: "share",
                    })
                  }
                  disabled={!!printingSheetId}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalOk, printingSheetId && { opacity: 0.7 }]}
                  onPress={confirmPrintLifeMeta_}
                  disabled={!!printingSheetId}
                >
                  <Text style={styles.modalOkText}>
                    {printingSheetId
                      ? "Preparando…"
                      : printMetaModal.mode === "preview"
                        ? "Continuar y ver vista previa"
                        : "Continuar y compartir PDF"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!previewModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModal({ visible: false, html: "", title: "" })}
      >
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewModal.title || "Vista previa"}
              </Text>
              <Pressable
                style={styles.previewCloseBtn}
                onPress={() => setPreviewModal({ visible: false, html: "", title: "" })}
              >
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </Pressable>
            </View>
            {Platform.OS === "web" && previewModal.html ? (
              <View style={styles.previewFrameWrap}>
                {/* iframe printable en web */}
                {React.createElement("iframe", {
                  title: previewModal.title || "Vista previa hoja",
                  srcDoc: previewModal.html,
                  style: {
                    width: "100%",
                    height: "100%",
                    border: "0",
                    background: "#fff",
                  },
                })}
              </View>
            ) : (
              <Text style={styles.modalHint}>
                La vista previa se abrió en el visor del sistema. Si no la ves, pulsa de nuevo «Consultar».
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const MODAL_LINES_SCROLL_MAX = Math.round(Dimensions.get("window").height * 0.38);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    ...(Platform.OS === "web" ? { minHeight: "100vh", position: "relative" } : null),
  },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 4 },
  importBtn: {
    borderColor: "#1b7f4e",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  importBtnText: { color: "#9dffc8", fontWeight: "700", fontSize: 12 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  meta: { color: theme.colors.subtext, fontSize: 12, marginBottom: 4 },
  numberingMeta: {
    color: theme.colors.text,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: "700",
    lineHeight: 18,
  },
  warnMeta: { color: "#f0c080", fontSize: 12, marginBottom: 4, fontWeight: "700" },
  errorMeta: { color: "#ff9f9f", fontSize: 12, marginBottom: 4, fontWeight: "800" },
  total: { color: theme.colors.text, fontWeight: "900", marginBottom: 8 },
  cardActionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  cardActionBtn: { flex: 1, minWidth: 0, marginTop: 0, paddingVertical: 10, paddingHorizontal: 6 },
  cardActionText: { fontWeight: "800", fontSize: 11, textAlign: "center", lineHeight: 14 },
  sendActionText: { color: theme.colors.text },
  syncActionText: { color: theme.colors.text },
  sendBtn: { backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sendText: { color: theme.colors.text, fontWeight: "900" },
  importBtnCard: {
    backgroundColor: "#1a4d32",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2d8f5a",
  },
  importBtnCardText: { color: "#c8ffe4", fontWeight: "800", fontSize: 11 },
  syncBtn: {
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  syncText: { color: theme.colors.text, fontWeight: "900" },
  section: { color: theme.colors.text, fontWeight: "900", marginBottom: 8, marginTop: 4 },
  sheetFiltersCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  sheetFiltersTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 13,
    marginBottom: 8,
  },
  sheetFiltersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  sheetFilterCell: {
    width: "25%",
    paddingHorizontal: 4,
    marginBottom: 8,
    ...(Platform.OS !== "web" ? { minWidth: 140 } : null),
  },
  sheetFilterCellFull: {
    width: "100%",
  },
  sheetFilterClearBtn: {
    marginTop: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  sheetFilterApplyBtn: {
    marginTop: 22,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  sheetFilterApplyText: { color: theme.colors.text, fontWeight: "900", fontSize: 13 },
  sheetFilterClearBtnDisabled: { opacity: 0.45 },
  sheetFilterClearText: { color: theme.colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" },
  sheetFilterCountInline: { color: theme.colors.text, fontSize: 12, fontWeight: "800", marginTop: 6 },
  sheetFilterHint: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  row: {
    backgroundColor: theme.colors.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowSelected: { borderColor: "#5fb7ff" },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  rowWarn: { color: "#f0c080", marginTop: 4, fontSize: 11, fontWeight: "800" },
  rowAmount: { color: theme.colors.text, marginTop: 6, fontWeight: "900" },
  rowActions: { marginTop: 8, flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    paddingVertical: 8,
  },
  actionDanger: { borderColor: "#c96e6e" },
  actionText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  syncBadge: { fontWeight: "900" },
  syncOk: { color: "#8cf0b0" },
  syncWarn: { color: "#ffd479" },
  syncErr: { color: "#ff9a9a" },
  empty: { color: theme.colors.subtext, marginBottom: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  modalSheetShell: {
    width: "100%",
    maxHeight: "90%",
    alignSelf: "center",
  },
  modalScrollArea: {
    maxHeight: MODAL_LINES_SCROLL_MAX,
    marginTop: 4,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalFooter: {
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    overflow: "hidden",
  },
  modalCardWide: {},
  webClickable: Platform.OS === "web" ? { cursor: "pointer" } : null,
  workingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    minHeight: 180,
  },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 18, marginBottom: 6 },
  modalHint: { color: theme.colors.subtext, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  progressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  progressText: { color: theme.colors.text, fontSize: 13, fontWeight: "700", flex: 1 },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 20,
  },
  progressOverlayCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  progressOverlayTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 16,
    marginTop: 12,
  },
  progressOverlayText: {
    color: theme.colors.text,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  progressOverlayHint: {
    color: theme.colors.subtext,
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 15,
  },
  resultBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  resultBoxOk: {
    borderColor: "#5a9e6a",
    backgroundColor: "rgba(90,158,106,0.12)",
  },
  resultBoxErr: {
    borderColor: "#c96e6e",
    backgroundColor: "rgba(201,110,110,0.12)",
  },
  confirmBox: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  resultTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  resultMessage: { color: theme.colors.text, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  lifeLineCard: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  lifeLineTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  lifeLineTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 12, flex: 1 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  modalCancel: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: theme.colors.card2,
  },
  modalCancelText: { color: theme.colors.text, fontWeight: "800" },
  modalOk: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
  },
  modalOkText: { color: theme.colors.text, fontWeight: "900" },
  tableScroll: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    width: "75%",
    maxWidth: "75%",
    alignSelf: "flex-start",
  },
  table: { minWidth: 1485, width: "100%", paddingVertical: 4 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  trHead: {
    backgroundColor: theme.colors.card,
    borderBottomWidth: 2,
    paddingVertical: 12,
  },
  trSelected: { backgroundColor: "rgba(95,183,255,0.12)" },
  th: { color: theme.colors.subtext, fontWeight: "900", fontSize: 13 },
  td: { color: theme.colors.text, fontSize: 13 },
  colSel: { width: 60, alignItems: "center", justifyContent: "center" },
  selectHint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17, marginTop: 4 },
  deleteSelectedBtn: {
    marginTop: 8,
    backgroundColor: "rgba(120,40,40,0.85)",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  deleteSelectedBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  colUsuario: { width: 189 },
  colTipo: { width: 176 },
  colMat: { width: 119 },
  colFecha: { width: 119 },
  colProv: { width: 162 },
  colFact: { width: 122 },
  colImp: { width: 105 },
  colTicket: { width: 76, fontWeight: "800" },
  colAct: { width: 116, alignItems: "stretch" },
  ticketYes: { color: "#8cf0b0" },
  ticketNo: { color: "#ff9a9a" },
  tableActionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  tableActionDanger: { borderColor: "#c96e6e" },
  tableActionText: { color: theme.colors.text, fontWeight: "800", fontSize: 11 },
  tableHint: { color: theme.colors.subtext, fontSize: 11, marginBottom: 10 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: Platform.OS === "web" ? 24 : 12,
  },
  previewCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    height: Platform.OS === "web" ? "90%" : undefined,
    maxHeight: "92%",
    minHeight: Platform.OS === "web" ? 480 : undefined,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  previewTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 15, flex: 1 },
  previewCloseBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.colors.card2,
  },
  previewCloseText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  previewFrameWrap: { flex: 1, minHeight: 420, backgroundColor: "#fff" },
});
