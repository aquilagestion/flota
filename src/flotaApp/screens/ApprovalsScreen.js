import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import {
  canAccessExpenseSheetApprovals,
  canPayExpenseSheets,
  canReviewAnyExpenseSheet,
  canReviewExpenseSheetRow,
  isResponsable,
} from "../auth/roles";
import { printAndShareExpenseSheetPdf } from "../lib/expenseSheetPdfNative";
import { loadExpenseSheetLogosForTemplate, uriToDataUriIfLocal_ } from "../lib/expenseSheetLogos";
import { buildExpenseSheetPrintHtmlAsync } from "../../flotaWeb/lib/expenseSheetPrint";
import { formatDateEsValue } from "../../flotaWeb/lib/format";
import { enrichSheetLineaFromExpense } from "../../flotaWeb/lib/ownVehicleColaborador";
import {
  buildProyectoNombreByIdMap,
  fetchProyectoRowsColumnaB,
  resolveProyectoNombreParaGasto,
} from "../../flotaWeb/lib/proyectoResolve";
import {
  createTicketUriResolverForNative_,
  createTicketUriResolverForWeb_,
} from "../../flotaWeb/lib/expenseSheetLogos";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField, TextField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

function notifyUser_(title, message) {
  const t = String(title || "").trim();
  const m = String(message || "").trim();
  const text = m ? `${t}\n\n${m}` : t;
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(text);
    return;
  }
  Alert.alert(t || "Aviso", m || "");
}

function revisionDoneMessage_(estado) {
  const s = String(estado || "").trim().toUpperCase();
  if (s === "APROBADA") return "Solicitud Aprobada";
  if (s === "RECHAZADA") return "Solicitud rechazada";
  if (s === "EN_REVISION") return "Revisión terminada";
  return "Gestión terminada";
}

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Aprobaciones</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function parseRow_(x) {
  return {
    hoja_gasto_id: String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim(),
    num_hoja_gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(x?.usuario_email || x?.responsable_email || "").trim().toLowerCase(),
    usuario_nombre: String(x?.usuario_nombre || x?.nombre || "").trim(),
    hoja_gasto_estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado_pago: String(x?.hoja_gasto_estado_pago || x?.estado_pago || "PAGO_PENDIENTE").trim().toUpperCase(),
    hoja_gasto_fecha_envio: String(x?.hoja_gasto_fecha_envio || x?.createdAtLocal || "").trim(),
    hoja_gasto_total: Number(x?.hoja_gasto_total || x?.total_importe || 0) || 0,
    hoja_gasto_observaciones: String(x?.hoja_gasto_observaciones || x?.observaciones || "").trim(),
    hoja_gasto_motivo_rechazo: String(x?.hoja_gasto_motivo_rechazo || "").trim(),
    hoja_gasto_metodo_pago: String(x?.hoja_gasto_metodo_pago || "").trim(),
    hoja_gasto_referencia_pago: String(x?.hoja_gasto_referencia_pago || "").trim(),
    lineas_count: Number(x?.lineas_count || 0) || 0,
    puede_revisar: x?.puede_revisar,
  };
}

function formatDateEs_(iso) {
  return formatDateEsValue(iso);
}

export default function ApprovalsScreen({ navigation }) {
  const { role, user } = React.useContext(AuthContext);
  const allowed = canAccessExpenseSheetApprovals(role);
  const reviewAny = canReviewAnyExpenseSheet(role);
  const responsable = isResponsable(role);
  const canPay = canPayExpenseSheets(role);
  const meEmail = String(user?.email || "")
    .trim()
    .toLowerCase();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [estadoRevision, setEstadoRevision] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState("");
  const [actionModal, setActionModal] = useState({
    visible: false,
    busy: false,
    title: "",
  });

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return items.filter((x) => {
      if (estadoRevision && x.hoja_gasto_estado !== estadoRevision) return false;
      if (estadoPago && x.hoja_gasto_estado_pago !== estadoPago) return false;
      if (responsable && !reviewAny) {
        if (scopeFilter === "mis" && x.usuario_email !== meEmail) return false;
        if (scopeFilter === "equipo" && x.usuario_email === meEmail) return false;
        if (scopeFilter === "aprobar" && !canReviewExpenseSheetRow(x, meEmail, role)) return false;
      }
      if (!q) return true;
      const blob = `${x.num_hoja_gasto} ${x.hoja_gasto_id} ${x.usuario_nombre} ${x.usuario_email}`.toLowerCase();
      return blob.includes(q);
    });
  }, [estadoPago, estadoRevision, items, meEmail, query, responsable, reviewAny, role, scopeFilter]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await sheetsApi.get("hojas_gasto_list", { user_email: user?.email || "" });
      setItems(asList_(res).map(parseRow_).filter((x) => x.hoja_gasto_id));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar hojas de gasto.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  React.useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  const setRevision = async (row, estado) => {
    if (actionModal.busy) return;
    if (!canReviewExpenseSheetRow(row, user?.email, role)) {
      notifyUser_(
        "Permisos insuficientes",
        responsable
          ? "Solo puedes aprobar tus hojas o las de operarios con gastos en vehículos a tu cargo."
          : "No tienes permiso para revisar esta hoja de gasto."
      );
      return;
    }
    const rejectLabel = reviewAny ? "gestor" : "responsable";
    try {
      setActionModal({ visible: true, busy: true, title: "Gestionando tu solicitud" });
      await sheetsApi.post(
        "hoja_gasto_actualizar_revision",
        {
          hoja_gasto_id: row.hoja_gasto_id,
          hoja_gasto_estado: estado,
          hoja_gasto_motivo_rechazo: estado === "RECHAZADA" ? `Rechazada por ${rejectLabel}` : "",
        },
        { user_email: user?.email || "" },
        { timeoutMs: 45000 }
      );
      setActionModal({ visible: true, busy: false, title: revisionDoneMessage_(estado) });
      await load();
    } catch (e) {
      setActionModal({ visible: false, busy: false, title: "" });
      notifyUser_("Error", e?.message || "No se pudo actualizar revisión.");
    }
  };

  const setPago = async (row, estadoPagoNext) => {
    if (!canPay) {
      Alert.alert("Permisos insuficientes", "Solo ADMINISTRACION puede gestionar el pago.");
      return;
    }
    try {
      await sheetsApi.post(
        "hoja_gasto_actualizar_pago",
        {
          hoja_gasto_id: row.hoja_gasto_id,
          hoja_gasto_estado_pago: estadoPagoNext,
          hoja_gasto_metodo_pago: estadoPagoNext === "PAGADA" ? "Transferencia" : "",
          hoja_gasto_referencia_pago: estadoPagoNext === "PAGADA" ? "" : "",
        },
        { user_email: user?.email || "" }
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo actualizar el pago.");
    }
  };

  const viewSheetPdf = async (row) => {
    const sid = String(row?.hoja_gasto_id || "").trim();
    if (!sid) return;
    if (pdfBusyId) {
      Alert.alert("PDF en curso", "Espera a que termine la generación del PDF.");
      return;
    }
    try {
      setPdfBusyId(sid);
      const detailRes = await sheetsApi.get("hoja_gasto_detalle", {
        hoja_gasto_id: sid,
        user_email: user?.email || "",
      });
      const detail = detailRes?.data || detailRes || {};
      const lines = Array.isArray(detail?.lineas) ? detail.lineas : [];
      let expenseList = lines;
      try {
        const gRes = await sheetsApi.get("gasto_list", { user_email: user?.email || "" });
        const allG = Array.isArray(gRes?.data) ? gRes.data : Array.isArray(gRes) ? gRes : [];
        const idSet = new Set(lines.map((l) => String(l?.id_gasto || "").trim()).filter(Boolean));
        const matched = allG.filter((g) => idSet.has(String(g?.id_gasto || "").trim()));
        if (matched.length) expenseList = matched;
      } catch {
        // usa líneas del detalle
      }
      const enrichedLines = lines.map((l) => {
        const raw =
          expenseList.find((e) => String(e?.id_gasto || "").trim() === String(l?.id_gasto || "").trim()) || l;
        return enrichSheetLineaFromExpense(l, raw);
      });
      let proyectoById = new Map();
      try {
        const proyectoRows = await fetchProyectoRowsColumnaB(
          (action, params) => sheetsApi.get(action, params),
          String(user?.email || "").trim()
        );
        proyectoById = buildProyectoNombreByIdMap(proyectoRows);
      } catch {
        proyectoById = new Map();
      }
      const resolvedLines = enrichedLines.map((ln) => {
        const nombre = resolveProyectoNombreParaGasto(ln, proyectoById);
        return nombre ? { ...ln, proyecto: nombre, departamento_o_proyecto: nombre } : ln;
      });
      const person = String(detail?.usuario_nombre || row?.usuario_nombre || row?.usuario_email || "").trim();
      const sheetOrderText = String(detail?.num_hoja_gasto || row?.num_hoja_gasto || row?.hoja_gasto_id || "").trim();
      const total = Number(detail?.total_importe || row?.hoja_gasto_total || 0);
      const createdDate = formatDateEsValue(detail?.hoja_gasto_fecha_envio || row?.hoja_gasto_fecha_envio || "");
      const email = String(user?.email || "").trim().toLowerCase();
      const apiGet = (action, params, options) => sheetsApi.get(action, params, options);
      const uriToDataUri =
        Platform.OS === "web"
          ? createTicketUriResolverForWeb_(apiGet, email)
          : createTicketUriResolverForNative_(apiGet, email, uriToDataUriIfLocal_);
      const { html, ticketAttachments, ticketAnnexEmbedded } = await buildExpenseSheetPrintHtmlAsync({
        sheetOrderText,
        person,
        createdDate,
        lines: resolvedLines,
        totalFallback: total,
        meta: {
          ...detail,
          ...row,
          viaje: detail?.viaje || row?.viaje,
          cod_personal: String(detail?.cod_personal || row?.cod_personal || "").trim(),
          usuario_nombre: person,
        },
        expenses: expenseList,
        uriToDataUri,
        loadLogos: loadExpenseSheetLogosForTemplate,
        ticketAttachments: detail?.ticket_attachments,
        apiGet,
        userEmail: email,
        embedTicketAnnexInHtml: Platform.OS === "web",
        resolveTripDetail: (idViaje) =>
          sheetsApi.get("viaje_vehiculo_propio_detalle", { id_viaje: idViaje, user_email: email }),
      });
      await printAndShareExpenseSheetPdf({
        html,
        lines: resolvedLines,
        localExpenses: expenseList,
        ticketAttachments: ticketAttachments || [],
        skipTicketAnnex: Platform.OS === "web" && !!ticketAnnexEmbedded,
        dialogTitle: `Compartir hoja ${sheetOrderText}`,
        apiGet,
        userEmail: email,
      });
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo generar/abrir el PDF de la hoja.");
    } finally {
      setPdfBusyId("");
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      {!allowed ? (
        <View style={styles.card}>
          <Text style={styles.message}>
            Solo GESTOR, RESPONSABLE o ADMINISTRACIÓN pueden acceder a hojas de gasto para revisión.
          </Text>
        </View>
      ) : null}
      {allowed ? (
        <View style={styles.card}>
          <Text style={styles.message}>
            {reviewAny
              ? `Permisos: revisión global (GESTOR)${canPay ? " + pago (ADMINISTRACIÓN)" : ""}`
              : "Permisos: puedes aprobar tus hojas y las de operarios con gastos en vehículos a tu cargo."}
          </Text>
        </View>
      ) : null}

      {allowed ? (
        <View style={styles.card}>
          {responsable && !reviewAny ? (
            <SelectField
              label="Ámbito"
              value={scopeFilter}
              onChange={setScopeFilter}
              options={[
                { value: "", label: "TODAS (visibles)" },
                { value: "aprobar", label: "PARA APROBAR (mis hojas + equipo)" },
                { value: "mis", label: "MIS HOJAS" },
                { value: "equipo", label: "HOJAS DE MI EQUIPO" },
              ]}
            />
          ) : null}
          <SelectField
            label="Estado revisión"
            value={estadoRevision}
            onChange={setEstadoRevision}
            options={[
              { value: "", label: "TODOS" },
              { value: "ENVIADA", label: "ENVIADA" },
              { value: "EN_REVISION", label: "EN REVISION" },
              { value: "APROBADA", label: "APROBADA" },
              { value: "RECHAZADA", label: "RECHAZADA" },
            ]}
          />
          <SelectField
            label="Estado pago"
            value={estadoPago}
            onChange={setEstadoPago}
            options={[
              { value: "", label: "TODOS" },
              { value: "PAGO_PENDIENTE", label: "PAGO PENDIENTE" },
              { value: "PAGADA", label: "PAGADA" },
              { value: "RECHAZADA_PAGO", label: "RECHAZADA PAGO" },
            ]}
          />
          <TextField label="Buscar" value={query} onChangeText={setQuery} placeholder="Nº hoja, id o usuario" />
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonText}>{loading ? "Recargando..." : "Recargar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {filtered.map((x) => {
        const canReviewRow = canReviewExpenseSheetRow(x, user?.email, role);
        const scopeLabel =
          x.usuario_email === meEmail ? "Propia" : canReviewRow ? "Equipo (aprobar)" : "Consulta";
        return (
        <View key={x.hoja_gasto_id} style={styles.card}>
          <Pressable onPress={() => viewSheetPdf(x)}>
            <Text style={[styles.sectionTitle, styles.link]}>
              {x.num_hoja_gasto || x.hoja_gasto_id}
              {pdfBusyId === x.hoja_gasto_id ? " (abriendo PDF...)" : ""}
            </Text>
          </Pressable>
          {responsable && !reviewAny ? (
            <Text style={styles.scopeTag}>{scopeLabel}</Text>
          ) : null}
          <Text style={styles.message}>ID: {x.hoja_gasto_id}</Text>
          <Text style={styles.message}>
            Usuario: {x.usuario_nombre || x.usuario_email || "-"} · {x.usuario_email || "-"}
          </Text>
          <Text style={styles.message}>
            Revisión: {x.hoja_gasto_estado} · Pago: {x.hoja_gasto_estado_pago}
          </Text>
          <Text style={styles.message}>
            Envío: {formatDateEs_(x.hoja_gasto_fecha_envio)} · Líneas: {x.lineas_count} · Total: {x.hoja_gasto_total.toFixed(2)} EUR
          </Text>
          {!!x.hoja_gasto_observaciones ? <Text style={styles.message}>Obs: {x.hoja_gasto_observaciones}</Text> : null}
          {!!x.hoja_gasto_motivo_rechazo ? <Text style={styles.message}>Motivo rechazo: {x.hoja_gasto_motivo_rechazo}</Text> : null}
          {canReviewRow ? (
            <View style={styles.row}>
              <Pressable
                style={[styles.button, actionModal.busy && styles.buttonDisabled]}
                disabled={actionModal.busy}
                onPress={() => setRevision(x, "EN_REVISION")}
              >
                <Text style={styles.buttonText}>En revisión</Text>
              </Pressable>
              <Pressable
                style={[styles.button, actionModal.busy && styles.buttonDisabled]}
                disabled={actionModal.busy}
                onPress={() => setRevision(x, "APROBADA")}
              >
                <Text style={styles.buttonText}>Aprobar</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonDanger, actionModal.busy && styles.buttonDisabled]}
                disabled={actionModal.busy}
                onPress={() => setRevision(x, "RECHAZADA")}
              >
                <Text style={styles.buttonText}>Rechazar</Text>
              </Pressable>
            </View>
          ) : null}
          {canPay ? (
            <View style={styles.row}>
              <Pressable style={styles.button} onPress={() => setPago(x, "PAGO_PENDIENTE")}>
                <Text style={styles.buttonText}>Pago pendiente</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setPago(x, "PAGADA")}>
                <Text style={styles.buttonText}>Marcar pagada</Text>
              </Pressable>
              <Pressable style={styles.buttonDanger} onPress={() => setPago(x, "RECHAZADA_PAGO")}>
                <Text style={styles.buttonText}>Rechazar pago</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        );
      })}
      {!loading && allowed && !filtered.length ? <Text style={styles.message}>No hay hojas para mostrar.</Text> : null}

      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!actionModal.busy) setActionModal({ visible: false, busy: false, title: "" });
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {actionModal.busy ? (
              <ActivityIndicator size="large" color={theme.colors.accent || "#4f88bf"} />
            ) : null}
            <Text style={styles.modalTitle}>{actionModal.title || "Gestionando tu solicitud"}</Text>
            {!actionModal.busy ? (
              <Pressable
                style={[styles.buttonSecondary, { marginTop: 12 }]}
                onPress={() => setActionModal({ visible: false, busy: false, title: "" })}
              >
                <Text style={styles.buttonText}>Cerrar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },
  link: { textDecorationLine: "underline", color: "#b7ddff" },
  message: { color: theme.colors.subtext, marginBottom: 6 },
  scopeTag: { color: "#9fd0ff", fontSize: 11, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 12, textAlign: "center", paddingHorizontal: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    alignItems: "center",
    alignSelf: "center",
    minWidth: 260,
    maxWidth: 420,
    width: "100%",
  },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginTop: 10, textAlign: "center" },
});

