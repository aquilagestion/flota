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
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import {
  buildYearOptionsKm_,
  currentPeriodKm_,
  exportInformeKmFlotaCsv,
  exportRegistroKmLifeDocument,
  fetchInformeKmFlota,
  formatKm_,
  MESES_ES_KM,
  parseInformeKmFlota_,
  setAccionInformeKmFlota,
} from "../lib/informeKmFlota";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

const COL = {
  fecha: 92,
  matricula: 100,
  desplazamiento: 200,
  conductor: 160,
  kmIni: 78,
  kmFin: 78,
  km: 78,
  proyecto: 150,
  accion: 180,
  ops: 118,
};

function Header({
  onBack,
  onRefresh,
  onExportCsv,
  onExportPdf,
  refreshing,
  exporting,
  canExport,
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Informe km flota</Text>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
        <Pressable style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          <Text style={styles.syncText}>{refreshing ? "…" : "Refrescar"}</Text>
        </Pressable>
        <Pressable
          style={[styles.exportBtn, (!canExport || exporting) && styles.btnDisabled]}
          onPress={onExportCsv}
          disabled={!canExport || exporting}
        >
          <Text style={styles.exportText}>{exporting ? "…" : "CSV"}</Text>
        </Pressable>
        <Pressable
          style={[styles.pdfBtn, (!canExport || exporting) && styles.btnDisabled]}
          onPress={onExportPdf}
          disabled={!canExport || exporting}
        >
          <Text style={styles.exportText}>{exporting ? "…" : "PDF registro"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function notify_(title, message) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function Th({ width, children, last }) {
  return (
    <View style={[styles.th, { width }, last && styles.cellLast]}>
      <Text style={styles.thText} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

function Td({ width, children, last, mono }) {
  return (
    <View style={[styles.td, { width }, last && styles.cellLast]}>
      <Text style={[styles.tdText, mono && styles.tdMono]} numberOfLines={3}>
        {children}
      </Text>
    </View>
  );
}

export default function InformeKmFlotaScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const initial = currentPeriodKm_();
  const [anio, setAnio] = useState(String(initial.anio));
  const [mes, setMes] = useState(initial.mes);
  const [matricula, setMatricula] = useState("");
  const [conductor, setConductor] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [informe, setInforme] = useState(null);
  const [fleetByMatricula, setFleetByMatricula] = useState({});
  const [accionModal, setAccionModal] = useState(null);
  const [accionDraft, setAccionDraft] = useState("");
  const [savingAccion, setSavingAccion] = useState(false);

  const yearOptions = useMemo(() => buildYearOptionsKm_(4), []);
  const mesOptions = useMemo(
    () => MESES_ES_KM.map((m) => ({ value: m.value, label: m.label.toUpperCase() })),
    []
  );

  const onChangeAnio = (v) => {
    setAnio(v);
    setMatricula("");
    setConductor("");
    setProyecto("");
  };
  const onChangeMes = (v) => {
    setMes(v);
    setMatricula("");
    setConductor("");
    setProyecto("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const email = String(user?.email || "").trim().toLowerCase();
      const [res, flotaRes] = await Promise.all([
        fetchInformeKmFlota(email, {
          anio,
          mes,
          matricula,
          usuario_email: conductor,
          id_proyecto: proyecto,
          estado: "CERRADO",
        }),
        sheetsApi.get("flota_list", { user_email: email }).catch(() => null),
      ]);
      setInforme(parseInformeKmFlota_(res));
      const flotaRows = Array.isArray(flotaRes?.data)
        ? flotaRes.data
        : Array.isArray(flotaRes?.data?.rows)
          ? flotaRes.data.rows
          : Array.isArray(flotaRes)
            ? flotaRes
            : [];
      const map = {};
      for (const v of flotaRows) {
        const mat = String(v?.matricula || "")
          .trim()
          .toUpperCase();
        if (!mat) continue;
        map[mat] = {
          marca: String(v?.marca || "").trim(),
          modelo: String(v?.modelo || "").trim(),
        };
      }
      setFleetByMatricula(map);
    } catch (e) {
      setInforme(null);
      setError(e?.message || "No se pudo cargar el informe.");
    } finally {
      setLoading(false);
    }
  }, [anio, conductor, matricula, mes, proyecto, user?.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const matriculaOptions = useMemo(() => {
    const list = informe?.filtros_disponibles?.matriculas || [];
    return [
      { value: "", label: list.length ? "Todas" : "Sin matrículas de flota" },
      ...list.map((m) => ({ value: m, label: m })),
    ];
  }, [informe]);

  const conductorOptions = useMemo(() => {
    const list = informe?.filtros_disponibles?.conductores || [];
    return [
      { value: "", label: list.length ? "Todos" : "Sin conductores en el periodo" },
      ...list.map((c) => ({
        value: c.email,
        label: c.nombre && c.nombre !== c.email ? `${c.nombre} (${c.email})` : c.email,
      })),
    ];
  }, [informe]);

  const proyectoOptions = useMemo(() => {
    const list = informe?.filtros_disponibles?.proyectos || [];
    return [
      { value: "", label: list.length ? "Todos" : "Sin proyectos en el periodo" },
      ...list.map((p) => ({
        value: p.id_proyecto,
        label: p.nombre_proyecto || p.id_proyecto,
      })),
    ];
  }, [informe]);

  const openAccion = (viaje) => {
    setAccionModal(viaje);
    setAccionDraft(String(viaje?.accion || ""));
  };

  const saveAccion = async () => {
    if (!accionModal?.id_viaje || savingAccion) return;
    try {
      setSavingAccion(true);
      await setAccionInformeKmFlota(user?.email, accionModal.id_viaje, accionDraft);
      setAccionModal(null);
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo guardar la acción.");
    } finally {
      setSavingAccion(false);
    }
  };

  const periodLabel = useMemo(() => {
    if (informe?.rango?.fecha_desde && informe?.rango?.fecha_hasta) {
      return `${informe.rango.fecha_desde} – ${informe.rango.fecha_hasta}`;
    }
    const mesNom = MESES_ES_KM.find((m) => Number(m.value) === Number(mes))?.label || String(mes);
    return `${mesNom} ${anio}`;
  }, [anio, informe, mes]);

  const onExportCsv = async () => {
    const rows = informe?.viajes || [];
    if (!rows.length) {
      notify_("Exportar", "No hay filas para exportar con los filtros actuales.");
      return;
    }
    try {
      setExporting(true);
      const mesLabel = String(mes).padStart(2, "0");
      const filename = `informe_km_flota_${anio}-${mesLabel}.csv`;
      await exportInformeKmFlotaCsv(rows, { filename });
      if (Platform.OS === "web") {
        notify_("Exportar", `Descargado: ${filename}`);
      }
    } catch (e) {
      notify_("Error", e?.message || "No se pudo exportar el CSV.");
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    const rows = informe?.viajes || [];
    if (!rows.length) {
      notify_("PDF registro", "No hay filas para generar el registro con los filtros actuales.");
      return;
    }
    try {
      setExporting(true);
      await exportRegistroKmLifeDocument({
        viajes: rows,
        fleetByMatricula,
        periodLabel,
        documentTitle: `Registro Km ${periodLabel}`,
      });
      if (Platform.OS === "web") {
        notify_(
          "PDF descargado",
          "Se ha descargado el registro en PDF. El logo LIFE cambia según el proyecto; GREFA y Natura 2000 se mantienen."
        );
      }
    } catch (e) {
      notify_("Error", e?.message || "No se pudo generar el PDF del registro.");
    } finally {
      setExporting(false);
    }
  };

  const viajes = informe?.viajes || [];
  const tableWidth =
    COL.fecha +
    COL.matricula +
    COL.desplazamiento +
    COL.conductor +
    COL.kmIni +
    COL.kmFin +
    COL.km +
    COL.proyecto +
    COL.accion +
    COL.ops;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header
        onBack={() => navigation.navigate("Menu")}
        onRefresh={load}
        onExportCsv={onExportCsv}
        onExportPdf={onExportPdf}
        refreshing={loading}
        exporting={exporting}
        canExport={!loading && viajes.length > 0}
      />

      <View style={styles.filtersCard}>
        <SelectField label="Año" value={anio} onChange={onChangeAnio} options={yearOptions} />
        <SelectField label="Mes" value={mes} onChange={onChangeMes} options={mesOptions} />
        <SelectField
          label="Matrícula"
          value={matricula}
          onChange={setMatricula}
          options={matriculaOptions}
        />
        <SelectField
          label="Conductor"
          value={conductor}
          onChange={setConductor}
          options={conductorOptions}
        />
        <SelectField
          label="Proyecto"
          value={proyecto}
          onChange={setProyecto}
          options={proyectoOptions}
        />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Cargando informe…</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && informe ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {informe.rango?.fecha_desde && informe.rango?.fecha_hasta
                ? `${informe.rango.fecha_desde} – ${informe.rango.fecha_hasta}`
                : `${mes}/${anio}`}
            </Text>
            <Text style={styles.summaryMeta}>
              {informe.totales.viajes_count} viaje(s) · {formatKm_(informe.totales.km_recorridos)} km
              {informe.alcance === "RESPONSABLE" ? " · tus vehículos" : ""}
              {informe.alcance === "RESPONSABLE_SIN_VEHICULOS" ? " · sin vehículos asignados" : ""}
            </Text>
          </View>

          {viajes.length ? (
            <View style={styles.tableWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ width: tableWidth }}>
                  <View style={styles.trHead}>
                    <Th width={COL.fecha}>Fecha</Th>
                    <Th width={COL.matricula}>Matrícula</Th>
                    <Th width={COL.desplazamiento}>Desplazamiento</Th>
                    <Th width={COL.conductor}>Conductor</Th>
                    <Th width={COL.kmIni}>Km ini</Th>
                    <Th width={COL.kmFin}>Km fin</Th>
                    <Th width={COL.km}>Km</Th>
                    <Th width={COL.proyecto}>Proyecto</Th>
                    <Th width={COL.accion}>Acción</Th>
                    <Th width={COL.ops} last>
                      {" "}
                    </Th>
                  </View>
                  {viajes.map((v, idx) => (
                    <View
                      key={v.id_viaje || `${v.matricula}-${idx}`}
                      style={[styles.tr, idx % 2 === 1 && styles.trAlt]}
                    >
                      <Td width={COL.fecha}>{v.fecha_viaje || "—"}</Td>
                      <Td width={COL.matricula} mono>
                        {v.matricula || "—"}
                      </Td>
                      <Td width={COL.desplazamiento}>{v.desplazamiento || "—"}</Td>
                      <Td width={COL.conductor}>
                        {v.usuario_nombre || v.usuario_email || "—"}
                      </Td>
                      <Td width={COL.kmIni} mono>
                        {formatKm_(v.km_inicial)}
                      </Td>
                      <Td width={COL.kmFin} mono>
                        {formatKm_(v.km_final)}
                      </Td>
                      <Td width={COL.km} mono>
                        {formatKm_(v.km_recorridos)}
                      </Td>
                      <Td width={COL.proyecto}>{v.proyecto_nombre || "—"}</Td>
                      <Td width={COL.accion}>{v.accion ? v.accion : "—"}</Td>
                      <View style={[styles.td, { width: COL.ops }, styles.cellLast]}>
                        <Pressable style={styles.accionBtn} onPress={() => openAccion(v)}>
                          <Text style={styles.accionBtnText}>
                            {v.accion ? "Editar" : "Informar"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <View style={styles.trFoot}>
                    <View style={[styles.td, { width: COL.fecha + COL.matricula + COL.desplazamiento + COL.conductor }]}>
                      <Text style={styles.footText}>Total</Text>
                    </View>
                    <View style={[styles.td, { width: COL.kmIni + COL.kmFin }]} />
                    <Td width={COL.km} mono>
                      {formatKm_(informe.totales.km_recorridos)}
                    </Td>
                    <View
                      style={[
                        styles.td,
                        { width: COL.proyecto + COL.accion + COL.ops },
                        styles.cellLast,
                      ]}
                    />
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No hay viajes cerrados de flota GREFA con estos filtros.
              </Text>
            </View>
          )}
        </>
      ) : null}

      <Modal visible={!!accionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Acción del viaje</Text>
            {accionModal ? (
              <Text style={styles.modalMeta}>
                {accionModal.fecha_viaje} · {accionModal.matricula}
              </Text>
            ) : null}
            <TextInput
              style={styles.modalInput}
              value={accionDraft}
              onChangeText={setAccionDraft}
              placeholder="Describe la acción realizada"
              placeholderTextColor={theme.colors.placeholder}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setAccionModal(null)}
                disabled={savingAccion}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalSave} onPress={saveAccion} disabled={savingAccion}>
                <Text style={styles.modalSaveText}>{savingAccion ? "…" : "Guardar"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  header: { gap: 10 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "800" },
  headerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  backBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: theme.colors.subtext, fontWeight: "700" },
  syncBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  syncText: { color: "#fff", fontWeight: "800" },
  exportBtn: {
    backgroundColor: "#1a5f3a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pdfBtn: {
    backgroundColor: "#6b3a1a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exportText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.45 },
  filtersCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 8,
  },
  loadingBox: { alignItems: "center", paddingVertical: 28, gap: 10 },
  loadingText: { color: theme.colors.subtext },
  errorCard: {
    backgroundColor: "#3a1520",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 12,
  },
  errorText: { color: "#ffb4b4", fontWeight: "600" },
  summaryCard: {
    backgroundColor: theme.colors.card2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 4,
  },
  summaryTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  summaryMeta: { color: theme.colors.subtext, fontSize: 13 },
  tableWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  trHead: {
    flexDirection: "row",
    backgroundColor: "#0a2a45",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    alignItems: "stretch",
  },
  trAlt: { backgroundColor: "#0b1f33" },
  trFoot: {
    flexDirection: "row",
    backgroundColor: "#0a2a45",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  th: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
    justifyContent: "center",
  },
  thText: { color: theme.colors.subtext, fontSize: 11, fontWeight: "800" },
  td: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
    justifyContent: "center",
  },
  tdText: { color: theme.colors.text, fontSize: 12 },
  tdMono: { fontVariant: ["tabular-nums"], fontWeight: "700" },
  cellLast: { borderRightWidth: 0 },
  footText: { color: theme.colors.subtext, fontSize: 12, fontWeight: "800" },
  accionBtn: {
    alignSelf: "center",
    backgroundColor: theme.colors.input,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  accionBtnText: { color: theme.colors.subtext, fontWeight: "700", fontSize: 12 },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  emptyText: { color: theme.colors.subtext, textAlign: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
  },
  modalTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  modalMeta: { color: theme.colors.subtext, fontSize: 13 },
  modalInput: {
    minHeight: 90,
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    padding: 12,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalCancelText: { color: theme.colors.subtext, fontWeight: "700" },
  modalSave: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSaveText: { color: "#fff", fontWeight: "800" },
});
