import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import * as Sharing from "expo-sharing";
import { exportVehiclesAsCsv, exportVehiclesAsPdf } from "../../utils/export";
import { isAdministracion, isGestor } from "../auth/roles";

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

const FIELDS_FLOTA_SHEET = [
  "matricula",
  "fecha_matriculacion",
  "marca",
  "modelo",
  "combustible",
  "propiedad",
  "departamento_o_proyecto",
  "responsable",
  "itv_desde",
  "itv_hasta",
  "aseguradora",
  "seguro_desde",
  "seguro_hasta",
  "poliza",
  "e-mail_de_notificaciones",
  "activo",
  "observaciones",
];

const INITIAL_FORM = {
  matricula: "",
  fecha_matriculacion: "",
  marca: "",
  modelo: "",
  combustible: "",
  propiedad: "",
  departamento_o_proyecto: "",
  responsable: "",
  itv_desde: "",
  itv_hasta: "",
  aseguradora: "",
  seguro_desde: "",
  seguro_hasta: "",
  poliza: "",
  email_de_notificaciones: "",
  activo: "SI",
  observaciones: "",
};

function getVehicleFieldValue_(vehicle, field) {
  if (!vehicle) return "";
  const normalizeKey = (k) =>
    String(k || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const wanted = normalizeKey(field);
  const keys = Object.keys(vehicle || {});
  for (const k of keys) {
    if (normalizeKey(k) === wanted) {
      const v = vehicle[k];
      return v === undefined || v === null ? "" : v;
    }
  }
  return "";
}

function buildVehicleDetailEntries_(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return [];
  const used = new Set();
  const out = [];

  for (const key of FIELDS_FLOTA_SHEET) {
    const value = getVehicleFieldValue_(vehicle, key);
    out.push({ key, value: value === undefined || value === null ? "" : value });
    used.add(String(key).trim().toLowerCase());
  }

  // Añade cualquier campo adicional que devuelva el backend (sin perder ninguno).
  for (const rawKey of Object.keys(vehicle)) {
    const k = String(rawKey || "").trim();
    if (!k) continue;
    const lk = k.toLowerCase();
    if (lk === "_row") continue;
    if (used.has(lk)) continue;
    out.push({ key: k, value: vehicle[rawKey] === undefined || vehicle[rawKey] === null ? "" : vehicle[rawKey] });
  }
  return out;
}

function sortVehiclesByMatricula_(list) {
  const rows = Array.isArray(list) ? list.slice() : [];
  rows.sort((a, b) => {
    const av = String(getVehicleFieldValue_(a, "matricula") || "").trim().toUpperCase();
    const bv = String(getVehicleFieldValue_(b, "matricula") || "").trim().toUpperCase();
    return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
  });
  return rows;
}

export default function VehiclesScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const gestor = isGestor(role);
  const administracion = isAdministracion(role);
  const canManageVehicles = gestor || administracion;
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");

  const [form, setForm] = useState(INITIAL_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState(FIELDS_FLOTA_SHEET);
  const [exporting, setExporting] = useState(false);

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const detailEntries = useMemo(() => buildVehicleDetailEntries_(selectedVehicle), [selectedVehicle]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      [
        getVehicleFieldValue_(v, "matricula"),
        getVehicleFieldValue_(v, "marca"),
        getVehicleFieldValue_(v, "modelo"),
        getVehicleFieldValue_(v, "departamento_o_proyecto"),
        getVehicleFieldValue_(v, "responsable"),
        getVehicleFieldValue_(v, "activo"),
        getVehicleFieldValue_(v, "propiedad"),
        getVehicleFieldValue_(v, "combustible"),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [vehicles, queryText]);

  const loadVehicles_ = React.useCallback(async () => {
    setLoading(true);
    const cached = await localDb.getVehicles();
    if (cached.length) setVehicles(sortVehiclesByMatricula_(cached));
    try {
      const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const sorted = sortVehiclesByMatricula_(list);
      setVehicles(sorted);
      await localDb.setVehicles(sorted);
    } catch {
      // offline / sin permisos: usamos cache
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadVehicles_();
  }, [loadVehicles_]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      loadVehicles_();
    });
    return unsub;
  }, [navigation, loadVehicles_]);

  const save = async () => {
    if (!canManageVehicles) {
      Alert.alert("Permisos insuficientes", "Solo los roles GESTOR y ADMINISTRACION pueden crear o editar vehículos.");
      return;
    }
    if (!form.matricula.trim()) {
      Alert.alert("Falta matrícula", "La matrícula es obligatoria.");
      return;
    }

    const payload = {
      matricula: form.matricula.trim().toUpperCase(),
      fecha_matriculacion: String(form.fecha_matriculacion || "").trim(),
      marca: String(form.marca || "").trim(),
      modelo: String(form.modelo || "").trim(),
      combustible: String(form.combustible || "").trim(),
      propiedad: String(form.propiedad || "").trim(),
      departamento_o_proyecto: String(form.departamento_o_proyecto || "").trim(),
      responsable: String(form.responsable || "").trim(),
      itv_desde: String(form.itv_desde || "").trim(),
      itv_hasta: String(form.itv_hasta || "").trim(),
      aseguradora: String(form.aseguradora || "").trim(),
      seguro_desde: String(form.seguro_desde || "").trim(),
      seguro_hasta: String(form.seguro_hasta || "").trim(),
      poliza: String(form.poliza || "").trim(),
      // Header en Sheets: "e-mail_de_notificaciones"
      "e-mail_de_notificaciones": String(form.email_de_notificaciones || "").trim(),
      activo: String(form.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
      observaciones: String(form.observaciones || "").trim(),
      email_de_notificaciones: String(form.email_de_notificaciones || "").trim(),
    };

    try {
      const syncTargets = (await localDb.getSyncTargets()) || {};
      await sheetsApi.post(
        "flota_crear",
        {
          ...payload,
          destination: {
            mode: syncTargets.mode || "both",
            corporate_drive_folder_id: syncTargets.corpDriveFolder || "",
            corporate_spreadsheet_id: syncTargets.corpSpreadsheetId || "",
            personal_drive_folder_id: syncTargets.userDriveFolder || "",
            personal_spreadsheet_id: syncTargets.userSpreadsheetId || "",
            auto_create_personal: !!syncTargets.autoCreatePersonal,
          },
        },
        { user_email: user?.email || "" }
      );
      Alert.alert("Guardado", "Vehículo guardado en la hoja flota.");
      // refresco real para garantizar que vienen todos los campos
      const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const sorted = sortVehiclesByMatricula_(list);
      setVehicles(sorted);
      await localDb.setVehicles(sorted);

      setForm(INITIAL_FORM);
      setShowCreateForm(false);
    } catch (e) {
      Alert.alert("Guardado offline", "No se pudo guardar en Sheets (sin conexión o API_URL sin configurar). Se queda en caché local.");
      const keyToReplace = String(payload.matricula || "").trim().toUpperCase();
      const next = [payload, ...vehicles.filter((v) => String(getVehicleFieldValue_(v, "matricula") || "").trim().toUpperCase() !== keyToReplace)];
      const sorted = sortVehiclesByMatricula_(next);
      setVehicles(sorted);
      await localDb.setVehicles(sorted);
      setForm(INITIAL_FORM);
      setShowCreateForm(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
      <Header title="Vehículos" onBack={() => navigation.navigate("Menu")} />

      <View style={styles.stickyBar}>
        <View style={styles.card}>
        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
        <Pressable style={styles.buttonSecondary} onPress={() => { setSelectedExportFields(FIELDS_FLOTA_SHEET); setExportModalVisible(true); }}>
          <Text style={styles.buttonText}>Exportar flota (elegir campos y exportar)</Text>
        </Pressable>
        {canManageVehicles ? (
          <Pressable style={styles.button} onPress={() => navigation.navigate("VehiculoNuevo")}>
            <Text style={styles.buttonText}>Alta nuevo vehículo</Text>
          </Pressable>
        ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Listado ({filtered.length})</Text>
      <TextInput
        style={styles.input}
        placeholder="Buscar por matrícula / responsable / proyecto"
        placeholderTextColor={theme.colors.placeholder}
        value={queryText}
        onChangeText={setQueryText}
      />
      {loading ? <Text style={styles.message}>Cargando…</Text> : null}
      {filtered.map((v, idx) => (
        <Pressable
          key={String(v.id || getVehicleFieldValue_(v, "matricula") || `row-${idx}`)}
          style={styles.rowCard}
          onPress={() => {
            setSelectedVehicle(v);
            setDetailsModalVisible(true);
          }}
        >
          <Text style={styles.rowTitle}>{getVehicleFieldValue_(v, "matricula") || "—"}</Text>
          <Text style={styles.meta}>
            {getVehicleFieldValue_(v, "marca") || "-"} {getVehicleFieldValue_(v, "modelo") || ""}
          </Text>
        </Pressable>
      ))}
      {filtered.length === 0 ? <Text style={styles.message}>No hay vehículos.</Text> : null}

      {showCreateForm ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Alta vehículo (pestaña flota)</Text>

          <Text style={styles.label}>MATRICULA *</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={theme.colors.placeholder}
            value={form.matricula}
            onChangeText={(v) => setForm((p) => ({ ...p, matricula: v }))}
          />

          <Text style={styles.label}>FECHA MATRICULACION</Text>
          <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.fecha_matriculacion} onChangeText={(v) => setForm((p) => ({ ...p, fecha_matriculacion: v }))} />

          <Text style={styles.label}>MARCA</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.marca} onChangeText={(v) => setForm((p) => ({ ...p, marca: v }))} />

          <Text style={styles.label}>MODELO</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.modelo} onChangeText={(v) => setForm((p) => ({ ...p, modelo: v }))} />

          <Text style={styles.label}>COMBUSTIBLE</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.combustible} onChangeText={(v) => setForm((p) => ({ ...p, combustible: v }))} />

          <Text style={styles.label}>PROPIEDAD</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.propiedad} onChangeText={(v) => setForm((p) => ({ ...p, propiedad: v }))} />

          <Text style={styles.label}>DEPARTAMENTO / PROYECTO</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.departamento_o_proyecto} onChangeText={(v) => setForm((p) => ({ ...p, departamento_o_proyecto: v }))} />

          <Text style={styles.label}>RESPONSABLE</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.responsable} onChangeText={(v) => setForm((p) => ({ ...p, responsable: v }))} />

          <Text style={styles.label}>ITV DESDE</Text>
          <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.itv_desde} onChangeText={(v) => setForm((p) => ({ ...p, itv_desde: v }))} />

          <Text style={styles.label}>ITV HASTA</Text>
          <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.itv_hasta} onChangeText={(v) => setForm((p) => ({ ...p, itv_hasta: v }))} />

          <Text style={styles.label}>ASEGURADORA</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.aseguradora} onChangeText={(v) => setForm((p) => ({ ...p, aseguradora: v }))} />

          <Text style={styles.label}>SEGURO DESDE</Text>
          <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.seguro_desde} onChangeText={(v) => setForm((p) => ({ ...p, seguro_desde: v }))} />

          <Text style={styles.label}>SEGURO HASTA</Text>
          <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.seguro_hasta} onChangeText={(v) => setForm((p) => ({ ...p, seguro_hasta: v }))} />

          <Text style={styles.label}>POLIZA</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.poliza} onChangeText={(v) => setForm((p) => ({ ...p, poliza: v }))} />

          <Text style={styles.label}>E-MAIL DE NOTIFICACIONES</Text>
          <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={theme.colors.placeholder} value={form.email_de_notificaciones} onChangeText={(v) => setForm((p) => ({ ...p, email_de_notificaciones: v }))} />

          <Text style={styles.label}>ACTIVO (SI/NO)</Text>
          <TextInput style={styles.input} placeholder="SI" placeholderTextColor={theme.colors.placeholder} value={form.activo} onChangeText={(v) => setForm((p) => ({ ...p, activo: v }))} />

          <Text style={styles.label}>OBSERVACIONES</Text>
          <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.observaciones} onChangeText={(v) => setForm((p) => ({ ...p, observaciones: v }))} multiline />

          <View style={styles.formActions}>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() => {
                setShowCreateForm(false);
                setForm(INITIAL_FORM);
              }}
            >
              <Text style={styles.buttonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={save}>
              <Text style={styles.buttonText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={exportModalVisible} transparent animationType="fade" onRequestClose={() => setExportModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Campos a exportar</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <View style={styles.chipsRow}>
                {FIELDS_FLOTA_SHEET.map((f) => {
                  const active = selectedExportFields.includes(f);
                  return (
                    <Pressable
                      key={f}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        setSelectedExportFields((prev) => (active ? prev.filter((x) => x !== f) : [...prev, f]));
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.buttonSecondary} onPress={() => setExportModalVisible(false)} disabled={exporting}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </Pressable>
            <Pressable
              style={[styles.buttonSecondary, exporting && styles.buttonDisabled]}
              onPress={() => setSelectedExportFields([])}
              disabled={exporting}
            >
              <Text style={styles.buttonText}>Limpiar selección</Text>
            </Pressable>
              <Pressable
                style={[styles.button, exporting && styles.buttonDisabled]}
                onPress={async () => {
                  try {
                    setExporting(true);
                    const csvUri = await exportVehiclesAsCsv(filtered, selectedExportFields);
                    setExportModalVisible(false);

                    Alert.alert(
                      "Exportación lista",
                      "¿Cómo quieres compartirlo?",
                      [
                        {
                          text: "Compartir CSV",
                          onPress: async () => {
                            try {
                              if (await Sharing.isAvailableAsync()) {
                                await Sharing.shareAsync(csvUri, {
                                  mimeType: "text/csv",
                                  dialogTitle: "Compartir CSV",
                                });
                              }
                            } catch {
                              Alert.alert("Error", "No se pudo compartir el CSV.");
                            }
                          },
                        },
                        {
                          text: "Imprimir (PDF)",
                          onPress: async () => {
                            try {
                              // Print.printAsync abre el diálogo del sistema.
                              await exportVehiclesAsPdf(filtered, selectedExportFields);
                            } catch (e) {
                              Alert.alert("Error", e?.message || "No se pudo generar/imprimir el PDF.");
                            }
                          },
                        },
                        { text: "Cerrar", style: "cancel" },
                      ],
                      { cancelable: true }
                    );
                  } catch (e) {
                    Alert.alert("Error", e?.message || "No se pudo exportar");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
              >
                <Text style={styles.buttonText}>{exporting ? "Exportando…" : "Exportar CSV"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Datos del vehículo</Text>

            <ScrollView style={{ maxHeight: 420 }}>
              {detailEntries.map((entry) => (
                <View key={entry.key} style={{ marginBottom: 10 }}>
                  <Text style={styles.detailKey}>{entry.key}</Text>
                  <Text style={styles.detailVal}>{String(entry.value || "-")}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              {canManageVehicles ? (
                <Pressable
                  style={styles.button}
                  onPress={() => {
                    setDetailsModalVisible(false);
                    navigation.navigate("VehiculoEditar", { vehicle: selectedVehicle });
                  }}
                >
                  <Text style={styles.buttonText}>Editar vehículo</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.buttonSecondary} onPress={() => setDetailsModalVisible(false)}>
                <Text style={styles.buttonText}>Cerrar</Text>
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
  content: { padding: 14, paddingTop: 22, paddingBottom: 26 },
  stickyBar: { backgroundColor: theme.colors.bg, paddingBottom: 8 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  input: { backgroundColor: theme.colors.input, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  button: { marginTop: 4, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonSecondary: { marginTop: 4, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  formActions: { flexDirection: "row", gap: 10, justifyContent: "space-between", marginTop: 2 },
  rowCard: { backgroundColor: theme.colors.card2, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 10 },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  meta: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  message: { color: theme.colors.subtext, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  modalCard: { backgroundColor: theme.colors.card, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 10 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "space-between", marginTop: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.colors.card2 },
  chipActive: { backgroundColor: "#2f6ba0", borderColor: "#5fb7ff" },
  chipText: { color: "#d6ebff", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: theme.colors.text },
  detailKey: { color: theme.colors.subtext, fontWeight: "800", fontSize: 12, marginBottom: 4 },
  detailVal: { color: theme.colors.text, fontWeight: "700", fontSize: 12 },
});

