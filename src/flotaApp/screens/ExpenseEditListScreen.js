import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import { isGestor, isResponsable } from "../auth/roles";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField } from "../ui/form/Fields";
import { ExpenseSelectMark, ExpenseSelectionBar, expenseSelectionBarPadding } from "../ui/ExpenseSelectMark";
import { theme } from "../ui/theme";
import { useSyncActions } from "../context/SyncContext";
import { showSyncResultAlert } from "../lib/syncFeedback";
import { amountFromExpense, canDeleteExpense } from "../../flotaWeb/lib/expenses";
import { hydrateExpenseFormFromRecord } from "../../flotaWeb/lib/expenseFormHydrate";
import { expenseHasTicket_ } from "../lib/expenseSupervision";
import {
  deleteExpenseCompletely_,
  reconcileLocalExpensesAndSheets_,
  pullRemoteExpensesForUser_,
} from "../lib/localExpenseReconcile";
import { expenseDate, formatDateEsValue, toDateMs } from "../../flotaWeb/lib/format";

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

function expenseDate_(raw) {
  return expenseDate(raw);
}

function expenseLabel_(raw) {
  const tipo = String(raw?.tipo_gasto || "").trim() || "Gasto";
  const mat = String(raw?.matricula || raw?.vehiclePlate || "").trim().toUpperCase();
  const prov =
    String(raw?.proveedor_otros_gastos || raw?.lugar_repostaje || raw?.compania || raw?.proveedor || "").trim();
  return { tipo, mat, prov };
}

function providerFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") {
    return String(e?.entidad_combustible || e?.marca_combustible || e?.lugar_repostaje || e?.proveedor || "").trim();
  }
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.proveedor_mantenimiento || e?.proveedor || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.proveedor_repuestos || e?.proveedor || "").trim();
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

/** Rellena campos tipados si el Sheet solo trae `fecha`/`importe`/`proveedor` genéricos. */
function hydrateExpenseForEdit_(raw) {
  return hydrateExpenseFormFromRecord(raw);
}

export default function ExpenseEditListScreen({ navigation }) {
  const { user, role } = useContext(AuthContext);
  const { syncNow } = useSyncActions();
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const [vehicle, setVehicle] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [vehicleOptions, setVehicleOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [selected, setSelected] = useState({});
  const [deleteModal, setDeleteModal] = useState({
    visible: false,
    phase: "confirm",
    expense: null,
    expenses: [],
    message: "",
  });

  const filterByOwner = useCallback(
    (list = [], assignedOverride = null) => {
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
    },
    [assignedSet, gestor, responsable, user?.email]
  );

  const load = useCallback(async () => {
    let assignedNow = assignedSet;
    if (responsable && !gestor) {
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
        assignedNow = new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
        setAssignedSet(assignedNow);
      } catch {
        assignedNow = new Set();
        setAssignedSet(new Set());
      }
    }

    const list = filterByOwner(await localDb.getExpenses(), assignedNow);
    setExpenses(list);

    try {
      const pulled = await pullRemoteExpensesForUser_(user?.email);
      if (pulled.ok && Array.isArray(pulled.expenses)) {
        setExpenses(filterByOwner(pulled.expenses, assignedNow));
      } else {
        await reconcileLocalExpensesAndSheets_(user?.email);
        const refreshed = filterByOwner(await localDb.getExpenses(), assignedNow);
        setExpenses(refreshed);
      }
    } catch {
      // mantener lista local
    }

    const vehicles = await localDb.getVehicles();
    setVehicleOptions(vehicles.map((v) => v.matricula).filter(Boolean));

    if (gestor) {
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
            list
              .map((e) => String(e?.responsable_email || e?.usuario_email || "").trim().toLowerCase())
              .filter(Boolean)
          ),
        ];
        setUserOptions(emails.map((e) => ({ value: e, label: e })));
      }
    }

    const projects = [
      ...new Set(
        list.map((e) => String(e?.departamento_o_proyecto || e?.proyecto_nombre || "").trim()).filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
    setProjectOptions(projects.map((p) => ({ value: p, label: p })));
  }, [assignedSet, filterByOwner, gestor, responsable, user?.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    let list = expenses.slice();
    if (vehicle) {
      list = list.filter((e) => String(e?.matricula || e?.vehiclePlate || "").toUpperCase() === String(vehicle).toUpperCase());
    }
    if (gestor && userFilter) {
      const uf = String(userFilter).trim().toLowerCase();
      list = list.filter((e) => String(e?.responsable_email || e?.usuario_email || "").trim().toLowerCase() === uf);
    }
    if (gestor && projectFilter) {
      const pf = String(projectFilter).trim();
      list = list.filter(
        (e) => String(e?.departamento_o_proyecto || e?.proyecto_nombre || "").trim() === pf
      );
    }
    return list.sort((a, b) => parseSortDate_(expenseDate_(b)) - parseSortDate_(expenseDate_(a)));
  }, [expenses, gestor, projectFilter, userFilter, vehicle]);

  const openEdit = async (raw) => {
    const eid = String(raw?.id || raw?.local_id || "").trim();
    if (!eid) return;
    try {
      const localList = await localDb.getExpenses();
      const local =
        (Array.isArray(localList) ? localList : []).find(
          (x) => String(x?.id || x?.local_id || "").trim() === eid
        ) || {};
      const merged = hydrateExpenseForEdit_({ ...local, ...raw });
      await localDb.setExpensesDraft({ ...merged, _editExpenseId: eid });
      navigation.navigate("Gasto");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo abrir el gasto.");
    }
  };

  const selectedRows = useMemo(
    () => filtered.filter((raw) => !!selected[String(raw?.id || raw?.local_id || "").trim()]),
    [filtered, selected]
  );

  const toggleSelected_ = (raw) => {
    const eid = String(raw?.id || raw?.local_id || "").trim();
    if (!eid) return;
    setSelected((p) => ({ ...p, [eid]: !p[eid] }));
  };

  const selectAllFiltered_ = () => {
    const next = {};
    for (const raw of filtered) {
      const eid = String(raw?.id || raw?.local_id || "").trim();
      if (eid) next[eid] = true;
    }
    setSelected(next);
  };

  const clearSelected_ = () => setSelected({});

  const beginDelete_ = (raw) => {
    const check = canDeleteExpense(raw, { actorEmail: user?.email, role });
    if (!check.ok) {
      Alert.alert("No se puede eliminar", check.reason || "Sin permiso.");
      return;
    }
    setDeleteModal({
      visible: true,
      phase: "confirm",
      expense: raw,
      expenses: [],
      message: "",
    });
  };

  const beginBulkDelete_ = () => {
    if (!selectedRows.length) {
      Alert.alert("Selección vacía", "Marca al menos un gasto para eliminar.");
      return;
    }
    setDeleteModal({
      visible: true,
      phase: "confirm",
      expense: null,
      expenses: selectedRows.slice(),
      message: "",
    });
  };

  const closeDeleteModal_ = () => {
    if (deleteModal.phase === "busy") return;
    setDeleteModal({ visible: false, phase: "confirm", expense: null, expenses: [], message: "" });
  };

  const executeDelete_ = async () => {
    const bulk = Array.isArray(deleteModal.expenses) ? deleteModal.expenses : [];
    const raw = deleteModal.expense;
    const targets = bulk.length ? bulk : raw ? [raw] : [];
    if (!targets.length || deleteModal.phase === "busy") return;
    setDeleteModal((p) => ({
      ...p,
      phase: "busy",
      message: bulk.length ? `Eliminando ${targets.length} gasto(s)…` : "Eliminando gasto…",
    }));
    try {
      let deleted = 0;
      let blocked = 0;
      const blockedReasons = [];
      for (const item of targets) {
        const check = canDeleteExpense(item, { actorEmail: user?.email, role });
        if (!check.ok) {
          blocked += 1;
          if (blockedReasons.length < 3) blockedReasons.push(check.reason || "Sin permiso");
          continue;
        }
        await deleteExpenseCompletely_(item, { userEmail: user?.email, role });
        deleted += 1;
      }
      await load();
      setSelected({});
      let msg = `Eliminados ${deleted} gasto(s).`;
      if (blocked > 0) {
        msg += `\nOmitidos ${blocked}: ${blockedReasons.join("; ")}`;
      }
      setDeleteModal((p) => ({
        ...p,
        phase: deleted > 0 ? "done" : "error",
        message: msg,
      }));
    } catch (e) {
      setDeleteModal((p) => ({
        ...p,
        phase: "error",
        message: e?.message || "No se pudo eliminar el gasto.",
      }));
    }
  };

  const handleSync = async () => {
    const res = await syncNow({
      onComplete: async () => {
        await load();
      },
    });
    await showSyncResultAlert(res);
  };

  const delLabel = expenseLabel_(deleteModal.expense || deleteModal.expenses?.[0] || {});
  const bulkCount = Array.isArray(deleteModal.expenses) ? deleteModal.expenses.length : 0;

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          selectedRows.length > 0 && { paddingBottom: expenseSelectionBarPadding },
        ]}
      >
      <Header title="Editar gastos" onBack={() => navigation.navigate("Menu")} onSync={handleSync} />

      <View style={styles.card}>
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
            <SelectField
              label="Filtrar por proyecto"
              required={false}
              value={projectFilter}
              onChange={setProjectFilter}
              options={[{ value: "", label: "TODOS" }, ...projectOptions]}
            />
          </>
        ) : null}
        <Text style={styles.meta}>
          Gastos: {filtered.length}
          {selectedRows.length ? ` · Seleccionados: ${selectedRows.length}` : ""}
        </Text>
        {filtered.length ? (
          <View style={styles.bulkRow}>
            <Text style={styles.selectHint}>Toca la casilla verde al inicio de cada fila para seleccionar.</Text>
            <Pressable style={styles.bulkBtn} onPress={selectAllFiltered_}>
              <Text style={styles.bulkBtnText}>Seleccionar todos</Text>
            </Pressable>
            <Pressable style={styles.bulkBtn} onPress={clearSelected_}>
              <Text style={styles.bulkBtnText}>Quitar selección</Text>
            </Pressable>
            <Pressable
              style={[styles.bulkBtn, styles.bulkBtnDanger, !selectedRows.length && styles.bulkBtnDisabled]}
              onPress={beginBulkDelete_}
              disabled={!selectedRows.length}
            >
              <Text style={styles.bulkBtnText}>Eliminar seleccionados</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={styles.tableScroll}>
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, styles.colSel]}>Sel.</Text>
            <Text style={[styles.th, styles.colTipo]}>Tipo de gasto</Text>
            <Text style={[styles.th, styles.colMat]}>Matrícula</Text>
            <Text style={[styles.th, styles.colFecha]}>Fecha</Text>
            <Text style={[styles.th, styles.colProv]}>Proveedor</Text>
            <Text style={[styles.th, styles.colFact]}>Nº factura</Text>
            <Text style={[styles.th, styles.colImp]}>Importe</Text>
            <Text style={[styles.th, styles.colTicket]}>Tiquet</Text>
            <Text style={[styles.th, styles.colHoja]}>Nº hoja</Text>
            <Text style={[styles.th, styles.colAct]}>Editar</Text>
            <Text style={[styles.th, styles.colAct]}>Eliminar</Text>
          </View>
          {filtered.map((raw) => {
            const eid = String(raw?.id || raw?.local_id || "").trim();
            const { tipo, mat } = expenseLabel_(raw);
            const fecha = expenseDate_(raw);
            const prov = providerFromExpense_(raw);
            const factura = invoiceFromExpense_(raw);
            const importe = Number(amountFromExpense(raw) || 0);
            const hasTicket = expenseHasTicket_(raw);
            const hojaNum = sheetNumberFromExpense_(raw);
            const on = !!selected[eid];
            return (
              <View key={eid} style={[styles.tr, on && styles.trSelected]}>
                <View style={[styles.td, styles.colSel]}>
                  <ExpenseSelectMark selected={on} onPress={() => toggleSelected_(raw)} />
                </View>
                <Text style={[styles.td, styles.colTipo]} numberOfLines={2}>
                  {tipo}
                </Text>
                <Text style={[styles.td, styles.colMat]} numberOfLines={1}>
                  {mat || "—"}
                </Text>
                <Text style={[styles.td, styles.colFecha]} numberOfLines={1}>
                  {formatDateEsValue(fecha)}
                </Text>
                <Text style={[styles.td, styles.colProv]} numberOfLines={2}>
                  {prov || "—"}
                </Text>
                <Text style={[styles.td, styles.colFact]} numberOfLines={1}>
                  {factura || "—"}
                </Text>
                <Text style={[styles.td, styles.colImp]} numberOfLines={1}>
                  {importe.toFixed(2)} €
                </Text>
                <Text
                  style={[
                    styles.td,
                    styles.colTicket,
                    hasTicket ? styles.ticketYes : styles.ticketNo,
                  ]}
                  numberOfLines={1}
                >
                  {hasTicket ? "Sí" : "No"}
                </Text>
                <Text
                  style={[styles.td, styles.colHoja, hojaNum ? styles.hojaYes : styles.hojaEmpty]}
                  numberOfLines={2}
                >
                  {hojaNum || "—"}
                </Text>
                <View style={[styles.td, styles.colAct]}>
                  <Pressable style={styles.editBtn} onPress={() => openEdit(raw)}>
                    <Text style={styles.editBtnText}>Editar</Text>
                  </Pressable>
                </View>
                <View style={[styles.td, styles.colAct]}>
                  <Pressable style={[styles.editBtn, styles.deleteBtn]} onPress={() => beginDelete_(raw)}>
                    <Text style={styles.editBtnText}>Eliminar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {filtered.length === 0 ? <Text style={styles.empty}>Sin gastos para editar.</Text> : null}
      {Platform.OS !== "web" && filtered.length > 0 ? (
        <Text style={styles.tableHint}>Desliza horizontalmente para ver todas las columnas.</Text>
      ) : null}

      <Modal
        visible={deleteModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal_}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDeleteModal_} disabled={deleteModal.phase === "busy"} />
          <View style={styles.modalCard}>
            {deleteModal.phase === "confirm" ? (
              <>
                <Text style={styles.modalTitle}>
                  {bulkCount > 1 ? `Eliminar ${bulkCount} gastos` : "Eliminar gasto"}
                </Text>
                <Text style={styles.modalBody}>
                  {bulkCount > 1
                    ? `Se borrarán ${bulkCount} gastos seleccionados. Esta acción no se puede deshacer.`
                    : `Se borrará por completo «${delLabel.tipo}» (${delLabel.mat || "sin matrícula"}). Esta acción no se puede deshacer.`}
                </Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalBtnGhost} onPress={closeDeleteModal_}>
                    <Text style={styles.modalBtnGhostText}>Cancelar</Text>
                  </Pressable>
                  <Pressable style={styles.modalBtnDanger} onPress={executeDelete_}>
                    <Text style={styles.modalBtnDangerText}>Eliminar</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {deleteModal.phase === "busy" ? (
              <View style={styles.busyBox}>
                <ActivityIndicator size="large" color="#b7ddff" />
                <Text style={styles.modalTitle}>Eliminando…</Text>
                <Text style={styles.modalBody}>{deleteModal.message || "Procesando eliminación del gasto."}</Text>
              </View>
            ) : null}
            {deleteModal.phase === "done" || deleteModal.phase === "error" ? (
              <>
                <Text style={styles.modalTitle}>{deleteModal.phase === "done" ? "Eliminado" : "Error"}</Text>
                <Text style={styles.modalBody}>{deleteModal.message}</Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalBtnPrimary} onPress={closeDeleteModal_}>
                    <Text style={styles.modalBtnPrimaryText}>Cerrar</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      </ScrollView>
      <ExpenseSelectionBar
        count={selectedRows.length}
        onClear={clearSelected_}
        onDelete={beginBulkDelete_}
        deleteLabel="Eliminar todos"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    ...(Platform.OS === "web" ? { minHeight: "100vh", position: "relative" } : null),
  },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  headerRow: { flexDirection: "row", gap: 10 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
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
  tableScroll: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  table: { minWidth: 1120, paddingVertical: 4 },
  trSelected: { backgroundColor: "rgba(27,127,78,0.08)" },
  bulkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  bulkBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: theme.colors.card2,
  },
  bulkBtnDanger: { borderColor: "#a44", backgroundColor: "rgba(120,40,40,0.25)" },
  bulkBtnDisabled: { opacity: 0.45 },
  bulkBtnText: { color: theme.colors.text, fontWeight: "700", fontSize: 12 },
  selectHint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17, width: "100%" },
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
  colSel: { width: 44, alignItems: "center", justifyContent: "center" },
  colTipo: { width: 130 },
  colMat: { width: 88 },
  colFecha: { width: 88 },
  colProv: { width: 120 },
  colFact: { width: 90 },
  colImp: { width: 78 },
  colTicket: { width: 56, fontWeight: "800" },
  colHoja: { width: 150, fontWeight: "800" },
  colAct: { width: 86, alignItems: "stretch" },
  ticketYes: { color: "#8cf0b0" },
  ticketNo: { color: "#ff9a9a" },
  hojaYes: { color: "#b7ddff" },
  hojaEmpty: { color: theme.colors.subtext, fontWeight: "600" },
  editBtn: {
    backgroundColor: "#1a4f7c",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  deleteBtn: {
    backgroundColor: "#7a3030",
  },
  editBtnText: { color: "#e8f5ff", fontWeight: "800", fontSize: 11 },
  empty: { color: theme.colors.subtext, marginTop: 8 },
  tableHint: { color: theme.colors.subtext, fontSize: 11, marginBottom: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    zIndex: 2,
  },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 8 },
  modalBody: { color: theme.colors.subtext, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 15 },
  modalBtnDanger: { backgroundColor: "#7a3030", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  modalBtnDangerText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  modalBtnPrimary: { backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  busyBox: { alignItems: "center", gap: 10, paddingVertical: 12 },
});
