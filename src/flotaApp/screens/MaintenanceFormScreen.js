import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { theme } from "../ui/theme";
import { DateField, SelectField, TextField } from "../ui/form/Fields";
import ImageField from "../ui/form/ImageField";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system";

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

const initial = {
  matricula: "",
  departamento_o_proyecto: "",
  departamento_o_proyecto_custom: "",
  fecha: "",
  tipo: "",
  tipo_custom: "",
  taller: "",
  descripcion: "",
  kilometraje: "",
  coste: "",
  responsable: "",
  photoLocalUris: [],
  odometroLocalUri: "",
};

const OTRO_DEPARTAMENTO = "__OTRO__";
const DEPARTAMENTOS_O_PROYECTOS = [
  { value: "Life Pygargus", label: "Life Pygargus" },
  { value: "Life Rhodopes", label: "Life Rhodopes" },
  { value: "Life Abilas", label: "Life Abilas" },
  { value: "Topillos", label: "Topillos" },
  { value: "Perdicera Guara", label: "Perdicera Guara" },
  { value: "Veterinarios", label: "Veterinarios" },
  { value: "Veterinarios Campo", label: "Veterinarios Campo" },
  { value: "Perdiceras Madrid", label: "Perdiceras Madrid" },
  { value: "Monachus Demanda", label: "Monachus Demanda" },
  { value: "Generales", label: "Generales" },
  { value: "CE Villalar", label: "CE Villalar" },
  { value: "Rescate", label: "Rescate" },
  { value: "Post Aquila-Perdiceras", label: "Post Aquila-Perdiceras" },
  { value: "Pigargos", label: "Pigargos" },
  { value: "Biodiversidad Urbana", label: "Biodiversidad Urbana" },
  { value: "Primillas", label: "Primillas" },
  { value: "Cigueñas Alcalá", label: "Cigueñas Alcalá" },
  { value: "No imputable", label: "No imputable" },
  { value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" },
];

const DEPARTAMENTOS_O_PROYECTOS_VALID = new Set(DEPARTAMENTOS_O_PROYECTOS.map((o) => o.value));
const OTRO_TIPO = "__OTRO_TIPO__";

function mapProjectOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    const entries = Object.entries(r || {});
    const values = entries.map(([, v]) => String(v || "").trim());
    const colB = values.length >= 2 ? values[1] : "";
    const value = String(r?.id_proyecto || r?.id || (values.length ? values[0] : "")).trim();
    const label = String(r?.nombre_proyecto || r?.nombre || r?.proyecto || colB).trim();
    if (!value || !label) continue;
    if (!out.find((x) => x.value === value)) out.push({ value, label });
  }
  return out;
}

async function loadProjectRows_(email) {
  try {
    const res = await sheetsApi.get("proyecto_list_columna_b", { solo_activos: "SI", user_email: email || "" });
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  } catch {
    const res = await sheetsApi.get("proyecto_list", { solo_activos: "SI", user_email: email || "" });
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  }
}

function normalizeCatalogKey_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ");
}

/** Lee un campo de fila de hoja ignorando mayúsculas / acentos en el nombre de columna. */
function pickFieldInsensitive_(row, candidateNames) {
  if (!row || typeof row !== "object") return "";
  const map = {};
  for (const k of Object.keys(row)) {
    map[normalizeCatalogKey_(k)] = k;
  }
  for (const name of candidateNames) {
    const orig = map[normalizeCatalogKey_(name)];
    if (!orig) continue;
    const s = String(row[orig]).trim();
    if (s) return s;
  }
  return "";
}

/** Texto mostrable para una fila de CAT_TIPOS_MANTENIMIENTO (cabeceras variables en la hoja). */
function pickMaintenanceTipoLabel_(r) {
  const fromPreferred = pickFieldInsensitive_(r, [
    "tipo",
    "nombre",
    "descripcion",
    "descripción",
    "tipo_mantenimiento",
    "tipo mantenimiento",
    "tipo intervencion",
    "tipo intervención",
    "intervencion",
    "intervención",
    "label",
    "value",
    "texto",
  ]);
  if (fromPreferred) return fromPreferred;
  const skip = new Set(
    ["activo", "active", "orden", "id", "visible", "codigo", "código", "code"].map((x) =>
      normalizeCatalogKey_(x).replace(/\s/g, "")
    )
  );
  for (const k of Object.keys(r)) {
    const kn = normalizeCatalogKey_(k).replace(/\s/g, "");
    if (skip.has(kn)) continue;
    const s = String(r[k]).trim();
    if (s.length < 2) continue;
    if (/^(si|no|true|false)$/i.test(s)) continue;
    return s;
  }
  return "";
}

function isCatalogRowActivo_(r) {
  const a = pickFieldInsensitive_(r, ["activo", "active", "habilitado", "visible"]);
  if (!a) return true;
  const u = String(a).trim().toUpperCase();
  return u !== "NO" && u !== "N" && u !== "FALSE" && u !== "0";
}

function buildMaintenanceTypeOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const options = [];
  for (const r of list) {
    if (!isCatalogRowActivo_(r)) continue;
    const label = pickMaintenanceTipoLabel_(r);
    if (!label) continue;
    if (!options.find((o) => o.value === label)) options.push({ value: label, label });
  }
  if (!options.find((o) => o.value === OTRO_TIPO)) {
    options.push({ value: OTRO_TIPO, label: "OTRO (escribir)" });
  }
  return options;
}

function sortMatriculas_(plates) {
  const list = Array.isArray(plates) ? plates.slice() : [];
  list.sort((a, b) =>
    String(a || "")
      .trim()
      .toUpperCase()
      .localeCompare(String(b || "").trim().toUpperCase(), "es", { numeric: true, sensitivity: "base" })
  );
  return list;
}

async function prepareImageUriForOcr_(sourceUri) {
  const raw = String(sourceUri || "").trim();
  if (!raw) return null;
  let local = raw;
  if (!raw.startsWith("file://")) {
    const dest = `${FileSystem.cacheDirectory}ocr_odometro_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: raw, to: dest });
    local = dest;
  }
  return local;
}

export default function MaintenanceFormScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const [form, setForm] = useState(initial);
  const [vehicleOptions, setVehicleOptions] = useState(() =>
    localDb
      .getVehiclesMemory()
      .map((v) => String(v?.matricula || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const [maintenanceTypeOptions, setMaintenanceTypeOptions] = useState([
    { value: "Cambio de aceite", label: "Cambio de aceite" },
    { value: "Revisión", label: "Revisión" },
    { value: "Frenos", label: "Frenos" },
    { value: OTRO_TIPO, label: "OTRO (escribir)" },
  ]);
  const [vehiclesData, setVehiclesData] = useState(() => localDb.getVehiclesMemory());
  const [projectOptions, setProjectOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [readingKm, setReadingKm] = useState(false);
  const [lastOcrUri, setLastOcrUri] = useState("");
  const departmentProjectOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (opt) => {
      const value = String(opt?.value || "").trim();
      const label = String(opt?.label || "").trim();
      if (!value || !label || seen.has(value)) return;
      seen.add(value);
      out.push({ value, label });
    };
    for (const p of projectOptions) add(p);
    for (const d of DEPARTAMENTOS_O_PROYECTOS) {
      if (String(d?.value || "") === OTRO_DEPARTAMENTO) continue;
      add(d);
    }
    add({ value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" });
    return out;
  }, [projectOptions]);
  const departmentProjectValues = useMemo(
    () => new Set(departmentProjectOptions.map((o) => String(o?.value || "").trim())),
    [departmentProjectOptions]
  );

  useEffect(() => {
    async function loadVehicles() {
      const cached = await localDb.getVehicles();
      if (cached.length) {
        const normalized = cached
          .map((v) => ({ ...v, matricula: String(v?.matricula || "").trim().toUpperCase() }))
          .filter((v) => v.matricula);
        setVehiclesData(normalized);
        setVehicleOptions(sortMatriculas_([...new Set(normalized.map((v) => v.matricula))]));
      }
      try {
        const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const normalized = list
          .map((v) => ({ ...v, matricula: String(v?.matricula || "").trim().toUpperCase() }))
          .filter((v) => v.matricula);
        await localDb.setVehicles(normalized);
        setVehiclesData(normalized);
        setVehicleOptions(sortMatriculas_([...new Set(normalized.map((v) => v.matricula))]));
      } catch {
        // offline
      }

      try {
        const cat = await sheetsApi.get("cat_tipos_mantenimiento_list", { user_email: user?.email || "" });
        const rows = Array.isArray(cat?.data) ? cat.data : Array.isArray(cat) ? cat : [];
        const opts = buildMaintenanceTypeOptions_(rows);
        if (opts.length) setMaintenanceTypeOptions(opts);
      } catch {
        // fallback local
      }
      try {
        const rows = await loadProjectRows_(user?.email || "");
        setProjectOptions(mapProjectOptions_(rows));
      } catch {
        setProjectOptions([]);
      }
    }
    loadVehicles();
  }, [user?.email]);

  // Auto-relleno opcional desde la ficha del vehículo (pero el usuario puede sobrescribir)
  useEffect(() => {
    const plate = String(form.matricula || "").trim().toUpperCase();
    if (!plate) return;
    if (form.departamento_o_proyecto) return; // si el usuario ya eligió, no pisamos
    const selectedVehicle = vehiclesData.find(
      (v) => String(v?.matricula || "").trim().toUpperCase() === plate
    );
    const dept = String(selectedVehicle?.departamento_o_proyecto || "").trim();
    if (!dept) return;
    setForm((p) => ({
      ...p,
      departamento_o_proyecto: departmentProjectValues.has(dept) ? dept : OTRO_DEPARTAMENTO,
      departamento_o_proyecto_custom: departmentProjectValues.has(dept) ? "" : dept,
    }));
  }, [form.matricula, vehiclesData, form.departamento_o_proyecto, departmentProjectValues]);

  const vehicleSelectOptions = useMemo(
    () => vehicleOptions.map((m) => ({ value: m, label: m })),
    [vehicleOptions]
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const readKmFromPhoto = async (uri) => {
    const photoUri = String(uri || "").trim();
    if (!photoUri) return;
    try {
      setReadingKm(true);
      const ocrUri = await prepareImageUriForOcr_(photoUri);
      if (!ocrUri) return;
      const extracted = await syncService.extractOdometerKmFromLocalUri(ocrUri);
      const km = String(extracted?.km || "").trim();
      if (!km) return;
      set("kilometraje", km);
      Alert.alert("KM detectados", `Lectura automática detectada: ${km} km`);
    } catch (e) {
      const detail = String(e?.message || "").trim();
      Alert.alert(
        "Lectura automática no disponible",
        detail
          ? `${detail}\n\nPuedes introducirlos manualmente.`
          : "No se pudieron leer km de la foto. Puedes introducirlos manualmente."
      );
    } finally {
      setReadingKm(false);
    }
  };

  useEffect(() => {
    const uri = String(form.odometroLocalUri || "").trim();
    if (!uri) {
      if (lastOcrUri) setLastOcrUri("");
      return;
    }
    if (readingKm) return;
    if (uri === lastOcrUri) return;
    setLastOcrUri(uri);
    readKmFromPhoto(uri);
  }, [form.odometroLocalUri, readingKm, lastOcrUri]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!form.matricula.trim()) return Alert.alert("Falta matrícula", "Selecciona la matrícula.");
      if (!form.fecha) return Alert.alert("Falta fecha", "La fecha es obligatoria.");
      const tipoFinal = form.tipo === OTRO_TIPO ? String(form.tipo_custom || "").trim() : String(form.tipo || "").trim();
      if (!tipoFinal) return Alert.alert("Falta tipo", "El tipo es obligatorio.");
      if (!String(form.taller || "").trim()) return Alert.alert("Falta taller/proveedor", "El taller/proveedor es obligatorio.");
      if (!form.descripcion.trim()) return Alert.alert("Falta descripción", "La descripción es obligatoria.");
      if (!Array.isArray(form.photoLocalUris) || form.photoLocalUris.length === 0) {
        return Alert.alert("Falta factura/fotos", "Adjunta al menos una foto o ticket para el mantenimiento.");
      }
      if (readingKm) {
        return Alert.alert("Lectura en curso", "Espera a que termine la lectura automática de km o introduce el kilometraje manualmente.");
      }
      if (!String(form.kilometraje || "").trim()) {
        return Alert.alert("Falta kilometraje", "El kilometraje es obligatorio. Puedes introducirlo manualmente si el OCR no lo detecta.");
      }
      const departamento_o_proyecto =
        form.departamento_o_proyecto === OTRO_DEPARTAMENTO
          ? String(form.departamento_o_proyecto_custom || "").trim()
          : String(form.departamento_o_proyecto || "").trim();
      if (!departamento_o_proyecto) return Alert.alert("Falta proyecto/departamento", "Selecciona un departamento/proyecto o escribe uno nuevo.");

      const payload = {
        vehiclePlate: form.matricula.trim().toUpperCase(),
        ...form,
        matricula: form.matricula.trim().toUpperCase(),
        tipo: tipoFinal,
        taller: String(form.taller || "").trim(),
        responsable_email: String(user?.email || "").trim().toLowerCase(),
        observaciones: String(form.descripcion || "").trim(),
        departamento_o_proyecto, // sobrescribe el valor "__OTRO__" si aplica
        usuario_uid: user?.uid || "",
        usuario_email: user?.email || "",
        usuario_rol: role || "",
        createdAtLocal: new Date().toISOString(),
      };
      const localList = await localDb.getMaintenances();
      await localDb.setMaintenances([{ id: `${Date.now()}`, ...payload }, ...localList]);
      await syncService.queue({ kind: "maintenance", payload });
      // No bloqueamos la UI esperando subida de adjuntos: sincronización en segundo plano.
      syncService.flushIfOnline().catch(() => {});
      Alert.alert("Guardado", "Registro guardado. La sincronización de adjuntos continúa en segundo plano.");
      setForm(initial);
    } catch (e) {
      Alert.alert("Error al guardar", e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title="Mantenimiento" onBack={() => navigation.navigate("Menu")} />
      <View style={styles.card}>
        <SelectField label="Vehículo (MATRICULA)" required value={form.matricula} onChange={(v) => set("matricula", v)} options={vehicleSelectOptions} />
        <SelectField
          label="DEPARTAMENTO / PROYECTO"
          required
          value={form.departamento_o_proyecto}
          onChange={(v) => set("departamento_o_proyecto", v)}
          options={departmentProjectOptions}
        />
        {form.departamento_o_proyecto === OTRO_DEPARTAMENTO ? (
          <TextField
            label="Proyecto/departamento (nuevo)"
            required
            value={form.departamento_o_proyecto_custom}
            onChangeText={(v) => set("departamento_o_proyecto_custom", v)}
            placeholder="Escribe aquí"
          />
        ) : null}
        <DateField label="Fecha" required value={form.fecha} onChange={(v) => set("fecha", v)} />
        <SelectField label="Tipo" required value={form.tipo} onChange={(v) => set("tipo", v)} options={maintenanceTypeOptions} />
        {form.tipo === OTRO_TIPO ? (
          <TextField label="Tipo (nuevo)" required value={form.tipo_custom} onChangeText={(v) => set("tipo_custom", v)} />
        ) : null}
        <TextField label="Taller / Proveedor" required value={form.taller} onChangeText={(v) => set("taller", v)} />
        <TextField label="Descripción" required value={form.descripcion} onChangeText={(v) => set("descripcion", v)} multiline />
        <ImageField
          label="Foto cuentakilómetros"
          required={false}
          valueUri={form.odometroLocalUri}
          onChangeUri={(uri) => set("odometroLocalUri", uri)}
        />
        {readingKm ? (
          <View style={styles.ocrRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.ocrText}>Leyendo km desde foto...</Text>
          </View>
        ) : null}
        <TextField
          label="Kilometraje"
          required
          value={form.kilometraje}
          onChangeText={(v) => set("kilometraje", String(v || "").replace(/[^\d]/g, ""))}
          keyboardType="number-pad"
        />
        <TextField label="Coste" required={false} value={form.coste} onChangeText={(v) => set("coste", v)} keyboardType="decimal-pad" />
        <TextField label="Responsable" required={false} value={form.responsable} onChangeText={(v) => set("responsable", v)} />
        <ImageField label="Fotos" required multiple valueUris={form.photoLocalUris} onChangeUri={(arr) => set("photoLocalUris", arr)} />
      </View>
      <Pressable style={[styles.saveBtn, saving && { opacity: 0.75 }]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar mantenimiento"}</Text>
      </Pressable>
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
  ocrRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  ocrText: { color: theme.colors.subtext, fontSize: 12, fontWeight: "700" },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#5fb7ff" },
  saveText: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
});

