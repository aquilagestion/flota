import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthContext } from "../auth/AuthContext";
import { localDb } from "../storage/localDb";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { useResponsiveLayout } from "../ui/responsiveLayout";
import * as Sharing from "expo-sharing";
import { exportVehiclesAsCsv, exportVehiclesAsPdf } from "../../utils/export";
import { isAdministracion, isGestor } from "../auth/roles";
import { boostFonts_, WEB_UI_FS } from "../ui/webUiBoost";

const VEHICLE_LIST_FIELDS_STORAGE_KEY = "gestiflota_vehicle_list_fields";
const DEFAULT_LIST_FIELDS = ["matricula", "marca", "modelo", "departamento_o_proyecto", "responsable"];
// Filtros pendientes de aplicar (lo que el usuario va cambiando)
const INITIAL_FILTERS = {
  matriculas: [],        // multi-selección
  propiedades: [],
  departamentos: [],
  responsables: [],
  activos: [],           // vacío = todos
};

function boostSheet_(defs) {
  if (WEB_UI_FS === 1) return defs;
  const out = {};
  for (const [k, v] of Object.entries(defs)) {
    out[k] = boostFonts_(v, WEB_UI_FS);
    if (v && typeof v.paddingVertical === "number") {
      out[k] = { ...out[k], paddingVertical: Math.round(v.paddingVertical * WEB_UI_FS) };
    }
  }
  return out;
}

// Helper: toggle item en array de seleccionados
function toggleItem_(arr, item) {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// Desplegable multi-selección reutilizable
function MultiSelect({ label, options, selected, onChange }) {
  const { height: winH } = useWindowDimensions();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(selected || []);
  React.useEffect(() => {
    if (!open) setDraft(selected || []);
  }, [selected, open]);
  const hasSelection = selected.length > 0;
  const preview = hasSelection ? selected.join(", ") : "Todos";
  const listMaxH = Math.min(320, Math.max(160, winH * 0.38));

  const closeCancel = () => {
    setDraft(selected || []);
    setOpen(false);
  };

  return (
    <View style={msStyles.wrap}>
      <Text style={msStyles.label}>{label}</Text>
      <Pressable style={[msStyles.trigger, open && msStyles.triggerOpen]} onPress={() => setOpen(true)}>
        <Text style={msStyles.triggerText} numberOfLines={1}>{preview}</Text>
        <Text style={msStyles.arrow}>▼</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={closeCancel}>
        <View style={msStyles.modalBackdrop}>
          <View style={[msStyles.modalCard, { maxHeight: winH * 0.82 }]}>
            <Text style={msStyles.modalTitle}>{label}</Text>
            <Text style={msStyles.scrollHint}>↕ Desplaza para ver todas las opciones</Text>
            <ScrollView
              style={[msStyles.modalList, { maxHeight: listMaxH }]}
              contentContainerStyle={msStyles.modalListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              persistentScrollbar={Platform.OS === "android"}
              nestedScrollEnabled
            >
              {options.map((opt) => {
                const active = draft.includes(opt);
                return (
                  <Pressable
                    key={opt}
                    style={[msStyles.option, active && msStyles.optionActive]}
                    onPress={() => setDraft((prev) => toggleItem_(prev, opt))}
                  >
                    <Text style={msStyles.checkBox}>{active ? "☑" : "☐"}</Text>
                    <Text style={[msStyles.optionText, active && msStyles.optionTextActive]}>{opt || "(vacío)"}</Text>
                  </Pressable>
                );
              })}
              {options.length === 0 ? (
                <Text style={msStyles.emptyText}>Sin valores disponibles</Text>
              ) : null}
            </ScrollView>
            <View style={msStyles.modalActions}>
              <Pressable style={msStyles.clearBtn} onPress={() => setDraft([])}>
                <Text style={msStyles.clearBtnText}>Limpiar selección</Text>
              </Pressable>
              <Pressable
                style={msStyles.acceptBtn}
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                <Text style={msStyles.acceptBtnText}>Aceptar</Text>
              </Pressable>
              <Pressable style={msStyles.cancelBtn} onPress={closeCancel}>
                <Text style={msStyles.cancelBtnText}>Volver</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const msStyles = StyleSheet.create(boostSheet_({
  wrap: { flex: 1, minWidth: 180, zIndex: 10, position: "relative", marginBottom: 8, overflow: "visible" },
  label: { color: "#8ab4d4", fontSize: 11, fontFamily: "Arial", fontWeight: "800", marginBottom: 4, textTransform: "uppercase" },
  trigger: { flexDirection: "row", alignItems: "center", backgroundColor: "#1c2d3a", borderRadius: 8, borderWidth: 1, borderColor: "#2e4a5f", paddingHorizontal: 10, paddingVertical: 9 },
  triggerOpen: { borderColor: "#5fb7ff" },
  triggerText: { flex: 1, color: "#d6ebff", fontSize: 13, fontFamily: "Arial" },
  arrow: { color: "#8ab4d4", fontSize: 12, marginLeft: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  modalCard: {
    backgroundColor: "#0b1520",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2e4a5f",
    padding: 14,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    overflow: "hidden",
    elevation: 28,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  modalTitle: { color: "#d6ebff", fontSize: 15, fontFamily: "Arial", fontWeight: "900", marginBottom: 4 },
  scrollHint: { color: "#8ab4d4", fontSize: 11, fontFamily: "Arial", marginBottom: 8 },
  modalList: { backgroundColor: "#0b1520" },
  modalListContent: { paddingBottom: 4 },
  option: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1e3344", backgroundColor: "#0b1520" },
  optionActive: { backgroundColor: "#1e3a52" },
  optionText: { color: "#d6ebff", fontSize: 13, fontFamily: "Arial", flex: 1 },
  optionTextActive: { color: "#5fb7ff", fontWeight: "800" },
  checkBox: { color: "#5fb7ff", fontSize: 16, marginRight: 8, width: 20 },
  emptyText: { color: "#8ab4d4", fontSize: 12, fontFamily: "Arial", paddingVertical: 10, textAlign: "center", backgroundColor: "#0b1520" },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2e4a5f",
    backgroundColor: "#0b1520",
  },
  clearBtn: { flex: 1, minWidth: 120, padding: 11, alignItems: "center", borderWidth: 1, borderColor: "#2e4a5f", borderRadius: 8, backgroundColor: "#1c2d3a" },
  clearBtnText: { color: "#ff9090", fontSize: 12, fontFamily: "Arial", fontWeight: "800" },
  acceptBtn: { flex: 1, minWidth: 120, padding: 11, alignItems: "center", borderRadius: 8, backgroundColor: "#2f6ba0" },
  acceptBtnText: { color: "#fff", fontSize: 12, fontFamily: "Arial", fontWeight: "900" },
  cancelBtn: { flex: 1, minWidth: 120, padding: 11, alignItems: "center", borderRadius: 8, backgroundColor: "#243544", borderWidth: 1, borderColor: "#2e4a5f" },
  cancelBtnText: { color: "#d6ebff", fontSize: 12, fontFamily: "Arial", fontWeight: "800" },
}));

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
  const layout = useResponsiveLayout();
  const gestor = isGestor(role);
  const administracion = isAdministracion(role);
  const canManageVehicles = gestor || administracion;
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  // pendingFilters: lo que el usuario está configurando
  const [pendingFilters, setPendingFilters] = useState(INITIAL_FILTERS);
  // appliedFilters: lo que se aplica al listado (solo cambia al pulsar Buscar)
  const [appliedFilters, setAppliedFilters] = useState(null);

  // Opciones únicas derivadas de los datos cargados
  const filterOptions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    return {
      matriculas: uniq(vehicles.map((v) => String(getVehicleFieldValue_(v, "matricula") || "").trim())),
      propiedades: uniq(vehicles.map((v) => String(getVehicleFieldValue_(v, "propiedad") || "").trim())),
      departamentos: uniq(vehicles.map((v) => String(getVehicleFieldValue_(v, "departamento_o_proyecto") || "").trim())),
      responsables: uniq(vehicles.map((v) => String(getVehicleFieldValue_(v, "responsable") || "").trim())),
      activos: uniq(vehicles.map((v) => String(getVehicleFieldValue_(v, "activo") || "").trim().toUpperCase())),
    };
  }, [vehicles]);

  const [form, setForm] = useState(INITIAL_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState(FIELDS_FLOTA_SHEET);
  const [exporting, setExporting] = useState(false);

  const [listFieldsModalVisible, setListFieldsModalVisible] = useState(false);
  const [listFields, setListFields] = useState(DEFAULT_LIST_FIELDS);

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const detailEntries = useMemo(() => buildVehicleDetailEntries_(selectedVehicle), [selectedVehicle]);

  const filtered = useMemo(() => {
    // Sin búsqueda aplicada: mostrar lista completa
    if (!appliedFilters) return vehicles;
    const q = queryText.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matricula = String(getVehicleFieldValue_(v, "matricula") || "").trim();
      const propiedad = String(getVehicleFieldValue_(v, "propiedad") || "").trim();
      const departamento = String(getVehicleFieldValue_(v, "departamento_o_proyecto") || "").trim();
      const responsable = String(getVehicleFieldValue_(v, "responsable") || "").trim();
      const activo = String(getVehicleFieldValue_(v, "activo") || "").trim().toUpperCase();

      if (appliedFilters.matriculas.length && !appliedFilters.matriculas.includes(matricula)) return false;
      if (appliedFilters.propiedades.length && !appliedFilters.propiedades.includes(propiedad)) return false;
      if (appliedFilters.departamentos.length && !appliedFilters.departamentos.includes(departamento)) return false;
      if (appliedFilters.responsables.length && !appliedFilters.responsables.includes(responsable)) return false;
      if (appliedFilters.activos.length && !appliedFilters.activos.includes(activo)) return false;

      if (!q) return true;
      return [matricula, getVehicleFieldValue_(v, "marca"), getVehicleFieldValue_(v, "modelo"),
        departamento, responsable, activo, propiedad, getVehicleFieldValue_(v, "combustible")]
        .join(" ").toLowerCase().includes(q);
    });
  }, [vehicles, queryText, appliedFilters]);

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
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(VEHICLE_LIST_FIELDS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const valid = Array.isArray(parsed) ? parsed.filter((f) => FIELDS_FLOTA_SHEET.includes(f)) : [];
        if (valid.length) setListFields(valid);
      } catch {
        // usamos valores por defecto
      }
    })();
  }, []);

  const persistListFields_ = async (fields) => {
    setListFields(fields);
    try {
      await AsyncStorage.setItem(VEHICLE_LIST_FIELDS_STORAGE_KEY, JSON.stringify(fields));
    } catch {
      // sin persistencia offline: se mantiene en memoria
    }
  };

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
    <ScrollView style={styles.safe} contentContainerStyle={layout.contentContainerStyle} stickyHeaderIndices={[1]}>
      <Header title="Vehículos" onBack={() => navigation.navigate("Menu")} />

      <View style={styles.stickyBar}>
        <View style={styles.card}>
        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
        <View style={styles.quickActionsRow}>
          <Pressable
            style={[styles.buttonSecondary, styles.quickActionBtn, layout.isNative && styles.quickActionBtnNative]}
            onPress={() => {
              setSelectedExportFields(FIELDS_FLOTA_SHEET);
              setExportModalVisible(true);
            }}
          >
            <Text style={styles.buttonText}>Exportar flota (elegir campos y exportar)</Text>
          </Pressable>
          <Pressable style={[styles.buttonSecondary, styles.quickActionBtn, layout.isNative && styles.quickActionBtnNative]} onPress={() => setListFieldsModalVisible(true)}>
            <Text style={styles.buttonText}>Campos del listado</Text>
          </Pressable>
        </View>
        {canManageVehicles ? (
          <Pressable style={styles.button} onPress={() => navigation.navigate("VehiculoNuevo")}>
            <Text style={styles.buttonText}>Alta nuevo vehículo</Text>
          </Pressable>
        ) : null}
        </View>
      </View>

      {/* Bloque de filtros */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Filtros</Text>
        <View style={styles.filtersGrid}>
          <MultiSelect
            label="Matrícula"
            options={filterOptions.matriculas}
            selected={pendingFilters.matriculas}
            onChange={(v) => setPendingFilters((p) => ({ ...p, matriculas: v }))}
          />
          <MultiSelect
            label="Propiedad"
            options={filterOptions.propiedades}
            selected={pendingFilters.propiedades}
            onChange={(v) => setPendingFilters((p) => ({ ...p, propiedades: v }))}
          />
          <MultiSelect
            label="Departamento / Proyecto"
            options={filterOptions.departamentos}
            selected={pendingFilters.departamentos}
            onChange={(v) => setPendingFilters((p) => ({ ...p, departamentos: v }))}
          />
          <MultiSelect
            label="Responsable"
            options={filterOptions.responsables}
            selected={pendingFilters.responsables}
            onChange={(v) => setPendingFilters((p) => ({ ...p, responsables: v }))}
          />
          <MultiSelect
            label="Activo"
            options={filterOptions.activos}
            selected={pendingFilters.activos}
            onChange={(v) => setPendingFilters((p) => ({ ...p, activos: v }))}
          />
        </View>
        <View style={styles.filterActions}>
          <Pressable
            style={styles.button}
            onPress={() => setAppliedFilters({ ...pendingFilters })}
          >
            <Text style={styles.buttonText}>Buscar</Text>
          </Pressable>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => {
              setPendingFilters(INITIAL_FILTERS);
              setAppliedFilters(null);
              setQueryText("");
            }}
          >
            <Text style={styles.buttonText}>Limpiar</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        {appliedFilters ? `Resultado: ${filtered.length} vehículo${filtered.length !== 1 ? "s" : ""}` : `Total: ${vehicles.length} vehículo${vehicles.length !== 1 ? "s" : ""}`}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Búsqueda libre sobre el resultado"
        placeholderTextColor={theme.colors.placeholder}
        value={queryText}
        onChangeText={setQueryText}
      />
      {loading ? <Text style={styles.message}>Cargando…</Text> : null}
      {filtered.map((v, idx) => {
        const extraFields = listFields.filter((f) => f !== "matricula");
        return (
          <Pressable
            key={String(v.id || getVehicleFieldValue_(v, "matricula") || `row-${idx}`)}
            style={styles.rowCard}
            onPress={() => {
              setSelectedVehicle(v);
              setDetailsModalVisible(true);
            }}
          >
            <Text style={styles.rowTitle}>{getVehicleFieldValue_(v, "matricula") || "—"}</Text>
            {extraFields.length ? (
              <View style={styles.rowFieldsBox}>
                {extraFields.map((f) => (
                  <Text key={f} style={styles.meta}>
                    <Text style={styles.metaLabel}>{f}: </Text>
                    {String(getVehicleFieldValue_(v, f) || "-")}
                  </Text>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
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
                    setExportModalVisible(false);
                    if (Platform.OS === "web") {
                      // Web: descarga directa via blob
                      const { buildVehiclesCsvString, buildVehiclesHtml } = await import("../../utils/exportWeb");
                      const csv = buildVehiclesCsvString(filtered, selectedExportFields);
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `flota-vehiculos-${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } else {
                      const csvUri = await exportVehiclesAsCsv(filtered, selectedExportFields);
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(csvUri, { mimeType: "text/csv", dialogTitle: "Compartir CSV" });
                      }
                    }
                  } catch (e) {
                    Alert.alert("Error", e?.message || "No se pudo exportar CSV");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
              >
                <Text style={styles.buttonText}>{exporting ? "Exportando…" : "Exportar CSV"}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, exporting && styles.buttonDisabled]}
                onPress={async () => {
                  try {
                    setExporting(true);
                    setExportModalVisible(false);
                    if (Platform.OS === "web") {
                      const { buildVehiclesHtml } = await import("../../utils/exportWeb");
                      const html = buildVehiclesHtml(filtered, selectedExportFields);
                      const w = window.open("", "_blank");
                      w.document.write(html);
                      w.document.close();
                      w.focus();
                      w.print();
                    } else {
                      await exportVehiclesAsPdf(filtered, selectedExportFields);
                    }
                  } catch (e) {
                    Alert.alert("Error", e?.message || "No se pudo imprimir");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
              >
                <Text style={styles.buttonText}>{exporting ? "Generando…" : "Imprimir / PDF"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={listFieldsModalVisible} transparent animationType="fade" onRequestClose={() => setListFieldsModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Campos del listado</Text>
            <Text style={styles.message}>Elige qué campos se muestran en cada tarjeta del listado (además de la matrícula).</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <View style={styles.chipsRow}>
                {FIELDS_FLOTA_SHEET.filter((f) => f !== "matricula").map((f) => {
                  const active = listFields.includes(f);
                  return (
                    <Pressable
                      key={f}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        const next = active ? listFields.filter((x) => x !== f) : [...listFields, f];
                        persistListFields_(next);
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.buttonSecondary} onPress={() => persistListFields_(DEFAULT_LIST_FIELDS)}>
                <Text style={styles.buttonText}>Restablecer</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setListFieldsModalVisible(false)}>
                <Text style={styles.buttonText}>Cerrar</Text>
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

const styles = StyleSheet.create(boostSheet_({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingTop: 22, paddingBottom: 26 },
  stickyBar: { backgroundColor: theme.colors.bg, paddingBottom: 8 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, overflow: "visible" },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6, fontSize: 14 },
  input: { backgroundColor: theme.colors.input, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  button: { marginTop: 4, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonSecondary: { marginTop: 4, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border },
  quickActionsRow: { flexDirection: "row", gap: 10, justifyContent: "flex-start", alignItems: "flex-start" },
  quickActionBtn: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    maxWidth: "40%",
  },
  quickActionBtnNative: { flex: 1, maxWidth: undefined, minWidth: 0 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 12, fontFamily: "Arial" },
  filtersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, zIndex: 20 },
  filterActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  formActions: { flexDirection: "row", gap: 10, justifyContent: "space-between", marginTop: 2 },
  rowCard: { backgroundColor: theme.colors.card2, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 10 },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  rowFieldsBox: { marginTop: 4 },
  meta: { color: theme.colors.subtext, marginTop: 2, fontSize: 12 },
  metaLabel: { color: theme.colors.subtext, fontWeight: "800" },
  message: { color: theme.colors.subtext, marginBottom: 8, fontSize: 13 },
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
}));
