import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { collection, getDocs, query } from "firebase/firestore";
import { firestore } from "../firebase/firebase";
import { localDb } from "../storage/localDb";
import { AuthContext } from "../auth/AuthContext";
import { isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField } from "../ui/form/Fields";
import { theme } from "../ui/theme";
import { useSyncActions } from "../context/SyncContext";
import { showSyncResultAlert } from "../lib/syncFeedback";
import {
  buildOutboxExpenseLocalIds_,
  collectAssignedPlatesFromFlota_,
  expenseHasTicket_,
  expenseIsSynced_,
  expenseNeedsSheet_,
  expenseSupervisionWarnings_,
  isInCurrentMonth_,
} from "../lib/expenseSupervision";
import { pullRemoteExpensesForUser_ } from "../lib/localExpenseReconcile";
import { amountFromExpense, expenseSheetConceptLabel } from "../../flotaWeb/lib/expenses";
import { entityFromExpenseRecord } from "../../flotaWeb/lib/expenseIva";
import { expenseDate, formatDateEsValue, toDateMs } from "../../flotaWeb/lib/format";
import { ticketUrlsFromExpenseRecord } from "../../flotaWeb/lib/expenseTicketResolve";
import { publicTicketOpenUrl_ } from "../../flotaWeb/lib/expenseSheetMeta";

function Header({ title, onBack, onSync }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
        <Pressable style={styles.syncBtn} onPress={onSync}>
          <Text style={styles.syncText}>Sincronizar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function parseSortDate_(value) {
  return toDateMs(value);
}

function userLabel_(email, userOptions) {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return "—";
  const opt = (Array.isArray(userOptions) ? userOptions : []).find((u) => u.value === em);
  if (opt?.label) {
    return String(opt.label || "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim() || em;
  }
  return em.split("@")[0] || em;
}

function invoiceFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") return String(e?.numero_ticket || "").trim();
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.numero_factura_mantenimiento || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.numero_factura_repuestos || "").trim();
  if (t === "ITV") return String(e?.numero_factura_itv || "").trim();
  if (t === "OTROS" || t === "HOSPEDAJE" || t === "MANUTENCION") {
    return String(e?.numero_factura_otros || e?.numero_factura_hospedaje || e?.numero_factura_manutencion || "").trim();
  }
  if (t === "PEAJES") return String(e?.numero_factura_peaje || "").trim();
  if (t === "PARKING") return "TIQUET";
  if (t === "KILOMETRAJE_COLABORADOR") return "VIAJE";
  return String(e?.numero_ticket || e?.numero_factura || "").trim();
}

/** Nº de hoja si el gasto ya está vinculado; vacío si sigue pendiente. */
function sheetNumberFromExpense_(e) {
  const num = String(e?.num_hoja_gasto || e?.Num_Hoja_Gasto || "").trim();
  if (num) return num;
  const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
  if (hid && !/^HG-/i.test(hid)) return hid;
  return "";
}

function expenseOnSheet_(raw) {
  return !!sheetNumberFromExpense_(raw) || !!String(raw?.hoja_gasto_id || raw?.hoja_id_local || "").trim();
}

function fmtMoney_(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0,00 €";
  return `${x.toFixed(2).replace(".", ",")} €`;
}

function sheetEstadoLabel_(estado) {
  const s = String(estado || "").trim().toUpperCase();
  if (!s) return "—";
  if (s === "ENVIADA") return "Enviada";
  if (s === "EN_REVISION") return "En revisión";
  if (s === "APROBADA") return "Aprobada";
  if (s === "RECHAZADA") return "Rechazada";
  if (s === "PAGADA" || s === "PAGO_REALIZADO") return "Pagada";
  return s.replace(/_/g, " ");
}

function firstTicketUrl_(raw) {
  const urls = ticketUrlsFromExpenseRecord(raw || {});
  return String(urls[0] || "").trim();
}

function openableTicketTarget_(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("file:") || raw.startsWith("content:") || raw.startsWith("blob:")) {
    return raw;
  }
  return publicTicketOpenUrl_(raw) || raw;
}

async function openTicketAttachment_(url) {
  const target = openableTicketTarget_(url);
  if (!target) {
    Alert.alert("Sin adjunto", "No hay tiquet/factura subido para esta línea.");
    return;
  }
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    await Linking.openURL(target);
  } catch (e) {
    Alert.alert("Error", e?.message || "No se pudo abrir el adjunto.");
  }
}

function mapInvoiceLineFromRaw_(raw, fallbackId) {
  return {
    id: String(raw?.id || raw?.local_id || raw?.id_gasto || raw?.expense_id || fallbackId || Math.random().toString(16).slice(2)).trim(),
    date: expenseDate(raw) || String(raw?.fecha || "").trim(),
    provider: entityFromExpenseRecord(raw) || String(raw?.entidad || raw?.proveedor || "").trim(),
    concept: expenseSheetConceptLabel(raw) || String(raw?.concepto || raw?.tipo_gasto || "Gasto").trim(),
    amount: Number(amountFromExpense(raw) || raw?.importe || raw?.importe_pagar || raw?.coste_total || 0) || 0,
    invoice: invoiceFromExpense_(raw) || String(raw?.numero_factura || raw?.numero_ticket || "").trim(),
    ticketUrl: firstTicketUrl_(raw),
  };
}

/** Agrupa gastos en hojas (cabecera + facturas) para la consulta de historial. */
function buildSheetConsultRows_(expenses, remoteSheets, userOptions) {
  const byKey = new Map();

  const ensure = (key, seed = {}) => {
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        hojaId: String(seed.hojaId || "").trim(),
        number: String(seed.number || "").trim(),
        date: String(seed.date || "").trim(),
        estado: String(seed.estado || "").trim().toUpperCase(),
        total: Number(seed.total || 0) || 0,
        userEmail: String(seed.userEmail || "").trim().toLowerCase(),
        userLabel: "",
        lines: [],
        _totalFromLines: 0,
        _lineIds: new Set(),
      });
    }
    return byKey.get(key);
  };

  const pushLine = (row, line) => {
    const lid = String(line?.id || "").trim();
    if (lid && row._lineIds.has(lid)) {
      // Enriquecer adjunto si la línea previa no lo tenía.
      const prev = row.lines.find((x) => x.id === lid);
      if (prev && !prev.ticketUrl && line.ticketUrl) prev.ticketUrl = line.ticketUrl;
      return;
    }
    if (lid) row._lineIds.add(lid);
    row.lines.push(line);
    row._totalFromLines += Number(line.amount) || 0;
  };

  // Primero gastos locales (más completos, con adjuntos).
  for (const raw of Array.isArray(expenses) ? expenses : []) {
    const hid = String(raw?.hoja_gasto_id || raw?.hoja_id_local || "").trim();
    const num = String(raw?.num_hoja_gasto || raw?.Num_Hoja_Gasto || "").trim();
    if (!hid && !num) continue;
    const key = hid || `num:${num}`;
    const email = String(raw?.responsable_email || raw?.usuario_email || raw?.user_email || "")
      .trim()
      .toLowerCase();
    const row = ensure(key, {
      hojaId: hid,
      number: num,
      date: raw?.hoja_gasto_fecha_envio || raw?.fecha_hoja || "",
      estado: raw?.hoja_gasto_estado || "ENVIADA",
      total: raw?.hoja_gasto_total || 0,
      userEmail: email,
    });
    if (!row.number && num) row.number = num;
    if (!row.hojaId && hid) row.hojaId = hid;
    if (!row.userEmail && email) row.userEmail = email;
    if (!row.estado && raw?.hoja_gasto_estado) {
      row.estado = String(raw.hoja_gasto_estado).trim().toUpperCase();
    }
    pushLine(row, mapInvoiceLineFromRaw_(raw));
  }

  for (const r of Array.isArray(remoteSheets) ? remoteSheets : []) {
    const hid = String(r?.hoja_gasto_id || r?.hoja_id_local || r?.id || "").trim();
    const num = String(r?.num_hoja_gasto || r?.Num_Hoja_Gasto || "").trim();
    if (!hid && !num) continue;
    const key = hid || `num:${num}`;
    const email = String(r?.usuario_email || r?.responsable_email || "").trim().toLowerCase();
    const row = ensure(key, {
      hojaId: hid,
      number: num,
      date: r?.fecha_hoja || r?.fecha_firma || r?.hoja_gasto_fecha_envio || r?.createdAtLocal || "",
      estado: r?.hoja_gasto_estado || r?.estado || "ENVIADA",
      total: r?.total_importe || r?.hoja_gasto_total || 0,
      userEmail: email,
    });
    if (!row.number && num) row.number = num;
    if (!row.hojaId && hid) row.hojaId = hid;
    if (!row.date) {
      row.date = String(r?.fecha_hoja || r?.fecha_firma || r?.hoja_gasto_fecha_envio || "").trim();
    }
    if (!row.estado) row.estado = String(r?.hoja_gasto_estado || r?.estado || "ENVIADA").trim().toUpperCase();
    if (!row.total) row.total = Number(r?.total_importe || r?.hoja_gasto_total || 0) || 0;
    if (!row.userEmail && email) row.userEmail = email;
    const remoteLines = Array.isArray(r?.lineas) ? r.lineas : [];
    if (remoteLines.length) {
      for (let i = 0; i < remoteLines.length; i += 1) {
        const ln = remoteLines[i] || {};
        pushLine(row, mapInvoiceLineFromRaw_(ln, `${key}-r${i}`));
      }
    }
  }

  const out = [];
  for (const row of byKey.values()) {
    row.userLabel = userLabel_(row.userEmail, userOptions);
    if (row._totalFromLines > 0) row.total = Number(row._totalFromLines.toFixed(2));
    row.lines.sort((a, b) => parseSortDate_(a.date) - parseSortDate_(b.date));
    if (!row.date && row.lines.length) row.date = row.lines[0].date;
    delete row._lineIds;
    out.push(row);
  }
  out.sort((a, b) => parseSortDate_(b.date) - parseSortDate_(a.date));
  return out;
}

function mapExpenseRow_(raw, userOptions) {
  const email = String(raw?.responsable_email || raw?.usuario_email || raw?.user_email || "")
    .trim()
    .toLowerCase();
  return {
    id: String(raw?.id || raw?.local_id || raw?.id_gasto || Math.random().toString(16).slice(2)).trim(),
    kind: "expense",
    date: expenseDate(raw),
    vehiclePlate: String(raw?.matricula || raw?.vehiclePlate || "").trim().toUpperCase(),
    userEmail: email,
    userLabel: userLabel_(email, userOptions),
    concept: expenseSheetConceptLabel(raw) || String(raw?.tipo_gasto || "Gasto").trim(),
    project: String(raw?.departamento_o_proyecto || raw?.proyecto_nombre || "").trim(),
    entity: entityFromExpenseRecord(raw) || String(raw?.proveedor || "").trim(),
    invoice: invoiceFromExpense_(raw),
    amount: Number(amountFromExpense(raw) || 0) || 0,
    sheetNumber: sheetNumberFromExpense_(raw),
    onSheet: expenseOnSheet_(raw),
    raw,
  };
}

function normalizeMaintEvent_(raw) {
  const date = formatDateEsValue(raw?.fecha || raw?.createdAtLocal || "");
  return {
    id: raw.id || raw._id || `maint-${Math.random().toString(16).slice(2, 8)}`,
    kind: "maintenance",
    vehiclePlate: raw.vehiclePlate || raw.matricula || "",
    date,
    title: "Mantenimiento",
    subtitle: String(raw?.tipo || raw?.taller || "").trim(),
    raw,
  };
}

export default function HistoryScreen({ navigation }) {
  const { user, role } = useContext(AuthContext);
  const { syncNow } = useSyncActions();
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const supervisor = gestor || responsable;

  const [vehicle, setVehicle] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [viewMode, setViewMode] = useState("gastos"); // gastos | hojas
  const [remoteSheets, setRemoteSheets] = useState([]);
  const [expandedSheets, setExpandedSheets] = useState({});
  const [sheetLinesCache, setSheetLinesCache] = useState({});
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [vehicleOptions, setVehicleOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [outbox, setOutbox] = useState([]);

  const outboxExpenseIds = useMemo(() => buildOutboxExpenseLocalIds_(outbox), [outbox]);

  const filterByOwner = (list = [], assignedOverride = null) => {
    if (gestor) return list;
    const me = String(user?.email || "").trim().toLowerCase();
    if (!me) return [];
    const assigned = assignedOverride || assignedSet;
    return list.filter((r) => {
      const owner = String(r?.responsable_email || r?.usuario_email || r?.user_email || "")
        .trim()
        .toLowerCase();
      if (owner === me) return true;
      if (responsable) {
        const mat = String(r?.matricula || r?.vehiclePlate || "").trim().toUpperCase();
        return assigned.has(mat);
      }
      return false;
    });
  };

  const refreshGestorFilters_ = useCallback(
    async (expenseList) => {
      if (!gestor) return;
      const projects = [
        ...new Set(
          (Array.isArray(expenseList) ? expenseList : [])
            .map((e) => String(e?.departamento_o_proyecto || e?.proyecto_nombre || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b, "es"));
      setProjectOptions(projects.map((p) => ({ value: p, label: p })));

      try {
        const res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" });
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const users = rows
          .map((u) => {
            const email = String(u?.email || "").trim().toLowerCase();
            const nombre = String(u?.nombre || "").trim();
            return email ? { value: email, label: nombre ? `${nombre} (${email})` : email } : null;
          })
          .filter(Boolean);
        setUserOptions(users);
      } catch {
        const emails = [
          ...new Set(
            (Array.isArray(expenseList) ? expenseList : [])
              .map((e) =>
                String(e?.responsable_email || e?.usuario_email || e?.user_email || "")
                  .trim()
                  .toLowerCase()
              )
              .filter(Boolean)
          ),
        ];
        setUserOptions(emails.map((e) => ({ value: e, label: e })));
      }
    },
    [gestor, user?.email]
  );

  const load = async () => {
    let assignedNow = assignedSet;
    const outboxNow = await localDb.getOutbox();
    setOutbox(Array.isArray(outboxNow) ? outboxNow : []);

    if (responsable && !gestor) {
      try {
        const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const flota = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
        assignedNow = collectAssignedPlatesFromFlota_(flota, user?.email);
        setAssignedSet(assignedNow);
      } catch {
        assignedNow = new Set();
        setAssignedSet(new Set());
      }
    } else {
      assignedNow = new Set();
      setAssignedSet(new Set());
    }

    if (responsable && !gestor && !defaultsReady) {
      setScopeFilter("mis_vehiculos");
      setPeriodFilter("mes_actual");
      setDefaultsReady(true);
    }

    const cachedVehicles = await localDb.getVehicles();
    setVehicleOptions(cachedVehicles.map((v) => v.matricula).filter(Boolean));

    let expenseList = filterByOwner(await localDb.getExpenses(), assignedNow);
    const maintList = filterByOwner(await localDb.getMaintenances(), assignedNow);
    setExpenses(expenseList);
    setMaintenances(maintList);
    refreshGestorFilters_(expenseList);

    const email = String(user?.email || "").trim().toLowerCase();
    if (email) {
      try {
        const pulled = await pullRemoteExpensesForUser_(email);
        if (pulled.ok && Array.isArray(pulled.expenses)) {
          expenseList = filterByOwner(pulled.expenses, assignedNow);
          setExpenses(expenseList);
          refreshGestorFilters_(expenseList);
        }
      } catch {
        /* offline / error */
      }
    }

    try {
      const [maintSnap, vehiclesSnap] = await Promise.all([
        getDocs(query(collection(firestore, "maintenances"))),
        getDocs(query(collection(firestore, "vehicles"))),
      ]);
      const maint = filterByOwner(
        maintSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        assignedNow
      );
      const vehicles = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      await localDb.setVehicles(vehicles);
      await localDb.setMaintenances(maint);
      setVehicleOptions(vehicles.map((v) => v.matricula).filter(Boolean));
      setMaintenances(maint);
    } catch {
      // offline
    }

    try {
      const sheetsRes = await sheetsApi.get("hojas_gasto_list", { user_email: user?.email || "" });
      const sheetRows = Array.isArray(sheetsRes?.data)
        ? sheetsRes.data
        : Array.isArray(sheetsRes)
          ? sheetsRes
          : [];
      const visible = filterByOwner(
        sheetRows.map((x) => ({
          ...x,
          responsable_email: x?.usuario_email || x?.responsable_email,
          usuario_email: x?.usuario_email || x?.responsable_email,
        })),
        assignedNow
      );
      setRemoteSheets(visible);
    } catch {
      try {
        const localSheets = await localDb.getExpenseSheets();
        setRemoteSheets(filterByOwner(Array.isArray(localSheets) ? localSheets : [], assignedNow));
      } catch {
        setRemoteSheets([]);
      }
    }
  };

  useEffect(() => {
    load();
  }, [user?.email, gestor, responsable]);

  const expenseRows = useMemo(
    () => (Array.isArray(expenses) ? expenses : []).map((e) => mapExpenseRow_(e, userOptions)),
    [expenses, userOptions]
  );

  const filteredExpenses = useMemo(() => {
    let list = expenseRows.slice();
    if (vehicle) {
      list = list.filter((e) => String(e.vehiclePlate).toUpperCase() === String(vehicle).toUpperCase());
    }
    if (gestor && userFilter) {
      const uf = String(userFilter).trim().toLowerCase();
      list = list.filter((e) => String(e.userEmail || "").trim().toLowerCase() === uf);
    }
    if (gestor && projectFilter) {
      const pf = String(projectFilter).trim();
      list = list.filter((e) => String(e.project || "").trim() === pf);
    }
    if (responsable && !gestor && scopeFilter === "mis_vehiculos") {
      list = list.filter((e) => {
        const plate = String(e.vehiclePlate || "").trim().toUpperCase();
        return plate && assignedSet.has(plate);
      });
    }
    if (periodFilter === "mes_actual") {
      list = list.filter((e) => isInCurrentMonth_(e.date, parseSortDate_));
    }
    if (sheetFilter === "si") {
      list = list.filter((e) => e.onSheet);
    } else if (sheetFilter === "no") {
      list = list.filter((e) => !e.onSheet);
    }
    if (qualityFilter === "sin_ticket") {
      list = list.filter((e) => !expenseHasTicket_(e.raw));
    } else if (qualityFilter === "sin_hoja") {
      list = list.filter((e) => expenseNeedsSheet_(e.raw));
    } else if (qualityFilter === "no_sync") {
      list = list.filter((e) => !expenseIsSynced_(e.raw, outboxExpenseIds));
    } else if (qualityFilter === "con_incidencias") {
      list = list.filter((e) => expenseSupervisionWarnings_(e.raw, outboxExpenseIds).length > 0);
    }
    return list.sort((a, b) => parseSortDate_(b.date) - parseSortDate_(a.date));
  }, [
    assignedSet,
    expenseRows,
    gestor,
    outboxExpenseIds,
    periodFilter,
    projectFilter,
    qualityFilter,
    responsable,
    scopeFilter,
    sheetFilter,
    userFilter,
    vehicle,
  ]);

  const sheetConsultRows = useMemo(
    () => buildSheetConsultRows_(expenses, remoteSheets, userOptions),
    [expenses, remoteSheets, userOptions]
  );

  const filteredSheets = useMemo(() => {
    let list = sheetConsultRows.slice();
    if (gestor && userFilter) {
      const uf = String(userFilter).trim().toLowerCase();
      list = list.filter((s) => String(s.userEmail || "").trim().toLowerCase() === uf);
    }
    if (periodFilter === "mes_actual") {
      list = list.filter((s) => isInCurrentMonth_(s.date, parseSortDate_));
    }
    if (vehicle) {
      const plate = String(vehicle).trim().toUpperCase();
      const idsWithPlate = new Set(
        (Array.isArray(expenses) ? expenses : [])
          .filter((e) => String(e?.matricula || e?.vehiclePlate || "").trim().toUpperCase() === plate)
          .map((e) => {
            const hid = String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim();
            if (hid) return hid;
            const num = String(e?.num_hoja_gasto || e?.Num_Hoja_Gasto || "").trim();
            return num ? `num:${num}` : "";
          })
          .filter(Boolean)
      );
      list = list.filter(
        (s) => idsWithPlate.has(s.hojaId) || idsWithPlate.has(s.id) || (s.number && idsWithPlate.has(`num:${s.number}`))
      );
    }
    if (responsable && !gestor && scopeFilter === "mis_vehiculos") {
      const idsAssigned = new Set(
        (Array.isArray(expenses) ? expenses : [])
          .filter((e) => assignedSet.has(String(e?.matricula || "").trim().toUpperCase()))
          .map((e) => String(e?.hoja_gasto_id || e?.hoja_id_local || "").trim())
          .filter(Boolean)
      );
      list = list.filter((s) => !s.hojaId || idsAssigned.has(s.hojaId));
    }
    return list;
  }, [
    assignedSet,
    expenses,
    gestor,
    periodFilter,
    responsable,
    scopeFilter,
    sheetConsultRows,
    userFilter,
    vehicle,
  ]);

  const filteredMaint = useMemo(() => {
    let list = (Array.isArray(maintenances) ? maintenances : []).map(normalizeMaintEvent_);
    if (vehicle) {
      list = list.filter((e) => String(e.vehiclePlate).toUpperCase() === String(vehicle).toUpperCase());
    }
    if (responsable && !gestor && scopeFilter === "mis_vehiculos") {
      list = list.filter((e) => {
        const plate = String(e.vehiclePlate || "").trim().toUpperCase();
        return plate && assignedSet.has(plate);
      });
    }
    if (periodFilter === "mes_actual") {
      list = list.filter((e) => isInCurrentMonth_(e.date, parseSortDate_));
    }
    return list.sort((a, b) => parseSortDate_(b.date) - parseSortDate_(a.date));
  }, [assignedSet, gestor, maintenances, periodFilter, responsable, scopeFilter, vehicle]);

  const issueCount = useMemo(() => {
    return expenseRows.filter((e) => expenseSupervisionWarnings_(e.raw, outboxExpenseIds).length > 0).length;
  }, [expenseRows, outboxExpenseIds]);

  const handleSync = async () => {
    const res = await syncNow({
      onComplete: async () => {
        await load();
      },
    });
    await showSyncResultAlert(res);
  };

  const toggleSheetExpand_ = async (sheet) => {
    const id = String(sheet?.id || "").trim();
    if (!id) return;
    const willOpen = !expandedSheets[id];
    setExpandedSheets((p) => ({ ...p, [id]: willOpen }));
    if (!willOpen) return;
    if (Array.isArray(sheet?.lines) && sheet.lines.length) return;
    const hojaId = String(sheet?.hojaId || "").trim();
    if (!hojaId || /^num:/i.test(hojaId)) return;
    try {
      const det = await sheetsApi.get("hoja_gasto_detalle", {
        hoja_gasto_id: hojaId,
        user_email: String(user?.email || "").trim(),
      });
      const data = det?.data || det || {};
      const lineas = Array.isArray(data?.lineas) ? data.lineas : [];
      if (!lineas.length) return;
      // Inyectar líneas en expenses virtualmente vía remoteSheets enrichment
      setRemoteSheets((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const rid = String(r?.hoja_gasto_id || r?.hoja_id_local || r?.id || "").trim();
          if (rid !== hojaId) return r;
          return {
            ...r,
            lineas,
            num_hoja_gasto: data?.num_hoja_gasto || r?.num_hoja_gasto,
            total_importe: data?.total_importe ?? r?.total_importe,
            hoja_gasto_estado: data?.hoja_gasto_estado || r?.hoja_gasto_estado || r?.estado,
            fecha_hoja: data?.fecha_hoja || data?.hoja_gasto_fecha_envio || r?.fecha_hoja,
          };
        })
      );
      // También mapear a expenses locales si faltan líneas: actualizar build via merging lineas into a side cache
      setSheetLinesCache((p) => ({
        ...p,
        [id]: lineas.map((ln, idx) => mapInvoiceLineFromRaw_(ln, `${hojaId}-${idx}`)),
      }));
    } catch {
      /* offline */
    }
  };

  const screenTitle =
    responsable && !gestor && scopeFilter === "mis_vehiculos" ? "Historial · mis vehículos" : "Historial";

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title={screenTitle} onBack={() => navigation.navigate("Menu")} onSync={handleSync} />

      <View style={styles.card}>
        <SelectField
          label="Consulta"
          required={false}
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "gastos", label: "GASTOS" },
            { value: "hojas", label: "HOJAS DE GASTO" },
          ]}
        />
        {responsable && !gestor ? (
          <SelectField
            label="Ámbito"
            required={false}
            value={scopeFilter}
            onChange={setScopeFilter}
            options={[
              { value: "", label: "TODOS (visibles)" },
              { value: "mis_vehiculos", label: "GASTOS DE MIS VEHÍCULOS" },
            ]}
          />
        ) : null}
        <SelectField
          label="Filtrar por vehículo"
          required={false}
          value={vehicle}
          onChange={setVehicle}
          options={[{ value: "", label: "TODOS" }, ...vehicleOptions.map((m) => ({ value: m, label: m }))]}
        />
        {gestor ? (
          <>
            <SelectField
              label="Filtrar por usuario"
              required={false}
              value={userFilter}
              onChange={setUserFilter}
              options={[{ value: "", label: "TODOS" }, ...userOptions]}
            />
            {viewMode === "gastos" ? (
              <SelectField
                label="Filtrar por proyecto"
                required={false}
                value={projectFilter}
                onChange={setProjectFilter}
                options={[{ value: "", label: "TODOS" }, ...projectOptions]}
              />
            ) : null}
          </>
        ) : null}
        {supervisor ? (
          <>
            <SelectField
              label="Periodo"
              required={false}
              value={periodFilter}
              onChange={setPeriodFilter}
              options={[
                { value: "", label: "TODOS" },
                { value: "mes_actual", label: "MES EN CURSO" },
              ]}
            />
            {viewMode === "gastos" ? (
              <SelectField
                label="Estado / incidencia"
                required={false}
                value={qualityFilter}
                onChange={setQualityFilter}
                options={[
                  { value: "", label: "TODOS" },
                  { value: "con_incidencias", label: "CON INCIDENCIAS" },
                  { value: "sin_ticket", label: "SIN TICKET" },
                  { value: "sin_hoja", label: "SIN HOJA (usuario)" },
                  { value: "no_sync", label: "NO SINCRONIZADO" },
                ]}
              />
            ) : null}
          </>
        ) : null}
        {viewMode === "gastos" ? (
          <SelectField
            label="En hoja de gasto"
            required={false}
            value={sheetFilter}
            onChange={setSheetFilter}
            options={[
              { value: "", label: "TODOS" },
              { value: "si", label: "SÍ (ya en hoja)" },
              { value: "no", label: "NO (sin hoja)" },
            ]}
          />
        ) : null}
        <Text style={styles.meta}>
          {viewMode === "hojas" ? `Hojas: ${filteredSheets.length}` : `Gastos: ${filteredExpenses.length}`}
        </Text>
        {viewMode === "gastos" && supervisor && issueCount > 0 ? (
          <Text style={styles.warnMeta}>Incidencias detectadas (global): {issueCount}</Text>
        ) : null}
      </View>

      {viewMode === "hojas" ? (
        <>
          <Text style={styles.section}>Hojas de gasto</Text>
          {filteredSheets.map((sheet) => {
            const open = !!expandedSheets[sheet.id];
            const cachedLines = sheetLinesCache[sheet.id];
            const lines =
              Array.isArray(sheet.lines) && sheet.lines.length
                ? sheet.lines
                : Array.isArray(cachedLines)
                  ? cachedLines
                  : [];
            const totalShow = lines.length
              ? lines.reduce((acc, ln) => acc + (Number(ln.amount) || 0), 0)
              : sheet.total;
            return (
              <View key={sheet.id} style={styles.sheetCard}>
                <Pressable onPress={() => toggleSheetExpand_(sheet)} style={styles.sheetHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetNum}>{sheet.number || sheet.hojaId || "Sin número"}</Text>
                    <Text style={styles.rowSub}>
                      Fecha: {formatDateEsValue(sheet.date) || "—"} · Estado: {sheetEstadoLabel_(sheet.estado)}
                    </Text>
                    <Text style={styles.rowSub}>
                      {sheet.userLabel || sheet.userEmail || "—"} · Total (con IVA): {fmtMoney_(totalShow || sheet.total)}
                    </Text>
                    <Text style={styles.rowSub}>
                      Facturas: {lines.length || sheet.lines.length} · {open ? "Ocultar detalle" : "Ver facturas"}
                    </Text>
                  </View>
                </Pressable>
                {open ? (
                  <View style={styles.invoiceBox}>
                    <View style={[styles.tr, styles.trHead, styles.invoiceHead]}>
                      <Text style={[styles.th, styles.invFecha]}>Fecha</Text>
                      <Text style={[styles.th, styles.invProv]}>Proveedor</Text>
                      <Text style={[styles.th, styles.invConc]}>Concepto</Text>
                      <Text style={[styles.th, styles.invImp]}>Importe</Text>
                      <Text style={[styles.th, styles.invAdj]}>Adjunto</Text>
                    </View>
                    {lines.length ? (
                      lines.map((ln) => (
                        <View key={ln.id} style={[styles.tr, styles.invoiceRow]}>
                          <Text style={[styles.td, styles.invFecha]} numberOfLines={1}>
                            {formatDateEsValue(ln.date) || "—"}
                          </Text>
                          <Text style={[styles.td, styles.invProv]} numberOfLines={2}>
                            {ln.provider || "—"}
                          </Text>
                          <Text style={[styles.td, styles.invConc]} numberOfLines={2}>
                            {ln.concept || "—"}
                            {ln.invoice ? `\n${ln.invoice}` : ""}
                          </Text>
                          <Text style={[styles.td, styles.invImp]} numberOfLines={1}>
                            {fmtMoney_(ln.amount)}
                          </Text>
                          <View style={styles.invAdj}>
                            {ln.ticketUrl ? (
                              <Pressable
                                style={styles.adjBtn}
                                onPress={() => openTicketAttachment_(ln.ticketUrl)}
                              >
                                <Text style={styles.adjBtnText}>Ver</Text>
                              </Pressable>
                            ) : (
                              <Text style={styles.adjEmpty}>—</Text>
                            )}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.empty}>Sin facturas cargadas para esta hoja.</Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
          {filteredSheets.length === 0 ? (
            <Text style={styles.empty}>Sin hojas de gasto con estos filtros.</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.section}>Gastos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={styles.tableScroll}>
            <View style={styles.table}>
              <View style={[styles.tr, styles.trHead]}>
                <Text style={[styles.th, styles.colFecha]}>Fecha</Text>
                <Text style={[styles.th, styles.colVeh]}>Vehículo</Text>
                <Text style={[styles.th, styles.colUser]}>Usuario</Text>
                <Text style={[styles.th, styles.colConcepto]}>Concepto</Text>
                <Text style={[styles.th, styles.colProy]}>Proyecto</Text>
                <Text style={[styles.th, styles.colEnt]}>Entidad</Text>
                <Text style={[styles.th, styles.colFact]}>Nº factura/tiquet</Text>
                <Text style={[styles.th, styles.colImp]}>Importe</Text>
                <Text style={[styles.th, styles.colHoja]}>Nº hoja gasto</Text>
              </View>
              {filteredExpenses.map((r) => (
                <View key={r.id} style={styles.tr}>
                  <Text style={[styles.td, styles.colFecha]} numberOfLines={1}>
                    {formatDateEsValue(r.date)}
                  </Text>
                  <Text style={[styles.td, styles.colVeh]} numberOfLines={1}>
                    {r.vehiclePlate || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colUser]} numberOfLines={2}>
                    {r.userLabel || r.userEmail || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colConcepto]} numberOfLines={2}>
                    {r.concept || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colProy]} numberOfLines={2}>
                    {r.project || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colEnt]} numberOfLines={2}>
                    {r.entity || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colFact]} numberOfLines={1}>
                    {r.invoice || "—"}
                  </Text>
                  <Text style={[styles.td, styles.colImp]} numberOfLines={1}>
                    {(r.amount || 0).toFixed(2)} €
                  </Text>
                  <Text
                    style={[styles.td, styles.colHoja, r.sheetNumber ? styles.hojaYes : styles.hojaEmpty]}
                    numberOfLines={2}
                  >
                    {r.sheetNumber || "—"}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          {filteredExpenses.length === 0 ? <Text style={styles.empty}>Sin gastos con estos filtros.</Text> : null}
          {Platform.OS !== "web" && filteredExpenses.length > 0 ? (
            <Text style={styles.tableHint}>Desliza horizontalmente para ver todas las columnas.</Text>
          ) : null}

          {filteredMaint.length ? (
            <>
              <Text style={[styles.section, { marginTop: 16 }]}>Mantenimientos ({filteredMaint.length})</Text>
              {filteredMaint.map((e) => (
                <View key={e.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{e.title}</Text>
                  <Text style={styles.rowSub}>Vehículo: {e.vehiclePlate || "—"}</Text>
                  <Text style={styles.rowSub}>Fecha: {formatDateEsValue(e.date)}</Text>
                  {e.subtitle ? <Text style={styles.rowSub}>{e.subtitle}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  headerRow: { flexDirection: "row", gap: 10 },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  backBtn: {
    borderColor: "#4f88bf",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignSelf: "center",
  },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  syncBtn: {
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignSelf: "center",
  },
  syncText: { color: theme.colors.text, fontWeight: "900", fontSize: 12 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  meta: { color: theme.colors.subtext, fontSize: 12, marginTop: 6 },
  warnMeta: { color: "#f0c080", fontSize: 12, marginTop: 4, fontWeight: "700" },
  section: { color: theme.colors.text, fontWeight: "900", fontSize: 15, marginBottom: 8 },
  tableScroll: { marginBottom: 8 },
  table: { minWidth: 980, paddingVertical: 4 },
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
    paddingVertical: 10,
  },
  th: { color: theme.colors.subtext, fontWeight: "900", fontSize: 11 },
  td: { color: theme.colors.text, fontSize: 12 },
  colFecha: { width: 88 },
  colVeh: { width: 88 },
  colUser: { width: 120 },
  colConcepto: { width: 120 },
  colProy: { width: 130 },
  colEnt: { width: 120 },
  colFact: { width: 100 },
  colImp: { width: 78 },
  colHoja: { width: 110 },
  hojaYes: { color: "#8cf0b0", fontWeight: "800" },
  hojaEmpty: { color: theme.colors.subtext },
  tableHint: { color: theme.colors.subtext, fontSize: 11, marginBottom: 10 },
  sheetCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  sheetHead: { padding: 12 },
  sheetNum: { color: theme.colors.text, fontWeight: "900", fontSize: 15 },
  invoiceBox: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingBottom: 4 },
  invoiceHead: { paddingHorizontal: 8, gap: 4 },
  invoiceRow: { paddingHorizontal: 8, gap: 4, alignItems: "flex-start" },
  invFecha: { width: 72, flexShrink: 0 },
  invProv: { flex: 1, minWidth: 0, maxWidth: 110 },
  invConc: { flex: 1.2, minWidth: 0 },
  invImp: { width: 70, flexShrink: 0, textAlign: "right" },
  invAdj: { width: 52, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  adjBtn: {
    borderWidth: 1,
    borderColor: "#5fb7ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  adjBtnText: { color: "#b7ddff", fontWeight: "800", fontSize: 11 },
  adjEmpty: { color: theme.colors.subtext, fontSize: 12 },
  rowCard: {
    backgroundColor: theme.colors.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 15 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  empty: { color: theme.colors.subtext, marginTop: 8 },
});
