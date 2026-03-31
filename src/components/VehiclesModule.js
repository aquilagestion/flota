import React, { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatDate } from "../utils/format";
import { exportVehicleTemplateCsv } from "../utils/export";

const initialForm = {
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
  poliza: "",
  email_de_notificaciones: "",
  enlace_itv: "",
  enlace_permiso: "",
  activo: "SI",
  observaciones: "",
  seguro_desde: "",
  seguro_hasta: "",
  alerta_itv_enviada: "",
  alerta_seguro_enviada: "",
  alerta_enviada: "",
  vencimiento_itv: "",
  vencimiento_seguro: "",
  kilometro_actual: "",
  fecha_ultimo_mantenimiento: "",
};

const ACTIVO_OPTIONS = ["SI", "NO"];

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || "").trim().replace(/^"|"$/g, "");
    });
    return row;
  });
}

function sheetToCsvUrl(sheetUrl) {
  const raw = String(sheetUrl || "").trim();
  if (!raw) return null;
  if (raw.includes("format=csv")) return raw;
  const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  let gid = "0";
  const gidHashMatch = raw.match(/[#?&]gid=([0-9]+)/);
  if (gidHashMatch?.[1]) gid = gidHashMatch[1];
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

export default function VehiclesModule({
  vehiclesData,
  onSaveVehicle,
  onRemoveVehicle,
  onImportVehicles,
  onBackToMenu,
}) {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [undoItem, setUndoItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const scrollRef = useRef(null);

  const filteredVehicles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehiclesData;
    return vehiclesData.filter((v) =>
      [v.matricula, v.marca, v.modelo, v.departamento_o_proyecto, v.responsable, v.activo]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [vehiclesData, query]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!form.matricula.trim()) {
      Alert.alert("Falta matricula", "Define la matricula del vehiculo.");
      return;
    }
    onSaveVehicle(form, editingId);
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  };

  const editVehicle = (vehicle) => {
    setEditingId(vehicle.id);
    setForm({ ...initialForm, ...vehicle });
    setSelectedVehicle(vehicle);
    setShowForm(true);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(false);
  };

  const importFromCsvUrl = async (rawUrl) => {
    try {
      if (!String(rawUrl || "").trim()) {
        Alert.alert("URL invalida", "Pega un enlace antes de importar.");
        return;
      }
      const csvUrl = rawUrl.includes("docs.google.com/spreadsheets") ? sheetToCsvUrl(rawUrl) : rawUrl;
      if (!csvUrl) {
        Alert.alert("URL invalida", "No pude detectar un enlace valido.");
        return;
      }
      const response = await fetch(csvUrl);
      const text = await response.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        Alert.alert("Sin datos", "No se encontraron filas para importar.");
        return;
      }
      onImportVehicles(rows);
      Alert.alert("Importacion completada", `Se importaron ${rows.length} filas.`);
    } catch (error) {
      Alert.alert("Error", "No se pudo importar desde URL CSV/Google Sheets.");
    }
  };

  const requestDeleteVehicle = (vehicle) => {
    Alert.alert("Eliminar vehiculo", `Se eliminara ${vehicle.matricula || "este vehiculo"}.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          onRemoveVehicle(vehicle.id);
          setUndoItem(vehicle);
          if (selectedVehicle?.id === vehicle.id) setSelectedVehicle(null);
        },
      },
    ]);
  };

  const undoDelete = () => {
    if (!undoItem) return;
    onSaveVehicle({ ...undoItem }, undoItem.id);
    setUndoItem(null);
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
      <Text style={styles.moduleTitle}>Modulo Vehiculos</Text>
      <Pressable style={styles.menuBtn} onPress={onBackToMenu}>
        <Text style={styles.menuBtnText}>Menu</Text>
      </Pressable>

      <Text style={styles.label}>Importacion directa</Text>
      <TextInput
        style={styles.input}
        placeholder="Pega URL CSV o Google Sheets compartido"
        placeholderTextColor="#6f90af"
        value={importUrl}
        onChangeText={setImportUrl}
      />
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => importFromCsvUrl(importUrl)}>
          <Text style={styles.buttonText}>Importar CSV/Sheets</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondary]} onPress={exportVehicleTemplateCsv}>
          <Text style={styles.buttonText}>Exportar plantilla CSV</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.button, styles.primary, { marginBottom: 8 }]}
        onPress={() => {
          if (!showForm) {
            setEditingId(null);
            setForm(initialForm);
          }
          setShowForm((v) => !v);
        }}
      >
        <Text style={styles.buttonText}>
          {showForm ? "Ocultar formulario" : editingId ? "Continuar edicion" : "Nuevo vehiculo"}
        </Text>
      </Pressable>

      <TextInput
        style={styles.input}
        placeholder="Buscar por matricula, marca, proyecto..."
        placeholderTextColor="#6f90af"
        value={query}
        onChangeText={setQuery}
      />
      <Text style={styles.listTitle}>Vehiculos ({filteredVehicles.length})</Text>
      {undoItem ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Vehiculo eliminado.</Text>
          <Pressable onPress={undoDelete} style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedVehicle ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Consulta vehiculo</Text>
          <Text style={styles.meta}>Matricula: {selectedVehicle.matricula || "-"}</Text>
          <Text style={styles.meta}>Marca/Modelo: {selectedVehicle.marca || "-"} {selectedVehicle.modelo || ""}</Text>
          <Text style={styles.meta}>Combustible: {selectedVehicle.combustible || "-"}</Text>
          <Text style={styles.meta}>Propiedad: {selectedVehicle.propiedad || "-"}</Text>
          <Text style={styles.meta}>Proyecto: {selectedVehicle.departamento_o_proyecto || "-"}</Text>
          <Text style={styles.meta}>Responsable: {selectedVehicle.responsable || "-"}</Text>
          <Text style={styles.meta}>Email: {selectedVehicle.email_de_notificaciones || "-"}</Text>
          <Text style={styles.meta}>ITV: {selectedVehicle.itv_desde || "-"} / {selectedVehicle.itv_hasta || "-"}</Text>
          <Text style={styles.meta}>Seguro: {selectedVehicle.seguro_desde || "-"} / {selectedVehicle.seguro_hasta || "-"}</Text>
          <Text style={styles.meta}>Aseguradora: {selectedVehicle.aseguradora || "-"}</Text>
          <Text style={styles.meta}>Poliza: {selectedVehicle.poliza || "-"}</Text>
          <Text style={styles.meta}>Km actual: {selectedVehicle.kilometro_actual || "-"}</Text>
          <Text style={styles.meta}>Ultimo mantenimiento: {selectedVehicle.fecha_ultimo_mantenimiento || "-"}</Text>
          {!!selectedVehicle.observaciones && <Text style={styles.notesText}>{selectedVehicle.observaciones}</Text>}
          <View style={styles.actions}>
            <Pressable style={[styles.smallBtn, styles.editBtn]} onPress={() => editVehicle(selectedVehicle)}>
              <Text style={styles.smallText}>Editar</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, styles.secondary]} onPress={() => setSelectedVehicle(null)}>
              <Text style={styles.smallText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {filteredVehicles.map((vehicle) => (
        <View key={vehicle.id} style={styles.card}>
          <Pressable onPress={() => setSelectedVehicle(vehicle)} style={styles.cardTapArea}>
            <Text style={styles.vehicleTitle}>{vehicle.matricula || "Sin matricula"}</Text>
            <Text style={styles.meta}>
              {vehicle.marca || "Marca"} {vehicle.modelo || ""} - {vehicle.combustible || ""}
            </Text>
            <Text style={styles.meta}>Proyecto: {vehicle.departamento_o_proyecto || "-"}</Text>
            <Text style={styles.meta}>Responsable: {vehicle.responsable || "-"}</Text>
            <Text style={styles.meta}>Activo: {vehicle.activo || "-"}</Text>
            <Text style={styles.meta}>ITV: {vehicle.itv_desde || "-"} / {vehicle.itv_hasta || "-"}</Text>
            <Text style={styles.meta}>Seguro: {vehicle.seguro_desde || "-"} / {vehicle.seguro_hasta || "-"}</Text>
            <Text style={styles.meta}>Actualizado: {formatDate(vehicle.updatedAt)}</Text>
            {!!vehicle.observaciones && <Text style={styles.notesText}>{vehicle.observaciones}</Text>}
          </Pressable>
          <View style={styles.actions}>
            <Pressable style={[styles.smallBtn, styles.editBtn]} onPress={() => editVehicle(vehicle)}>
              <Text style={styles.smallText}>Editar</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, styles.deleteBtn]} onPress={() => requestDeleteVehicle(vehicle)}>
              <Text style={styles.smallText}>Eliminar</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {filteredVehicles.length === 0 && <Text style={styles.empty}>No hay vehiculos para mostrar.</Text>}

      {showForm ? (
        <>
          <Text style={styles.title}>{editingId ? "Actualizando vehiculo" : "Alta de vehiculo"}</Text>
          <TextInput style={styles.input} placeholder="Matricula" placeholderTextColor="#6f90af" value={form.matricula} onChangeText={(v) => update("matricula", v)} />
          <TextInput style={styles.input} placeholder="Fecha matriculacion" placeholderTextColor="#6f90af" value={form.fecha_matriculacion} onChangeText={(v) => update("fecha_matriculacion", v)} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Marca" placeholderTextColor="#6f90af" value={form.marca} onChangeText={(v) => update("marca", v)} />
            <TextInput style={[styles.input, styles.half]} placeholder="Modelo" placeholderTextColor="#6f90af" value={form.modelo} onChangeText={(v) => update("modelo", v)} />
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Combustible" placeholderTextColor="#6f90af" value={form.combustible} onChangeText={(v) => update("combustible", v)} />
            <TextInput style={[styles.input, styles.half]} placeholder="Propiedad" placeholderTextColor="#6f90af" value={form.propiedad} onChangeText={(v) => update("propiedad", v)} />
          </View>
          <TextInput style={styles.input} placeholder="Departamento o proyecto" placeholderTextColor="#6f90af" value={form.departamento_o_proyecto} onChangeText={(v) => update("departamento_o_proyecto", v)} />
          <TextInput style={styles.input} placeholder="Responsable" placeholderTextColor="#6f90af" value={form.responsable} onChangeText={(v) => update("responsable", v)} />
          <TextInput style={styles.input} placeholder="Email notificaciones" placeholderTextColor="#6f90af" value={form.email_de_notificaciones} onChangeText={(v) => update("email_de_notificaciones", v)} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="ITV desde" placeholderTextColor="#6f90af" value={form.itv_desde} onChangeText={(v) => update("itv_desde", v)} />
            <TextInput style={[styles.input, styles.half]} placeholder="ITV hasta" placeholderTextColor="#6f90af" value={form.itv_hasta} onChangeText={(v) => update("itv_hasta", v)} />
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Seguro desde" placeholderTextColor="#6f90af" value={form.seguro_desde} onChangeText={(v) => update("seguro_desde", v)} />
            <TextInput style={[styles.input, styles.half]} placeholder="Seguro hasta" placeholderTextColor="#6f90af" value={form.seguro_hasta} onChangeText={(v) => update("seguro_hasta", v)} />
          </View>
          <TextInput style={styles.input} placeholder="Aseguradora" placeholderTextColor="#6f90af" value={form.aseguradora} onChangeText={(v) => update("aseguradora", v)} />
          <TextInput style={styles.input} placeholder="Poliza" placeholderTextColor="#6f90af" value={form.poliza} onChangeText={(v) => update("poliza", v)} />
          <TextInput style={styles.input} placeholder="Vencimiento ITV" placeholderTextColor="#6f90af" value={form.vencimiento_itv} onChangeText={(v) => update("vencimiento_itv", v)} />
          <TextInput style={styles.input} placeholder="Vencimiento seguro" placeholderTextColor="#6f90af" value={form.vencimiento_seguro} onChangeText={(v) => update("vencimiento_seguro", v)} />
          <TextInput style={styles.input} placeholder="Kilometro actual" placeholderTextColor="#6f90af" value={form.kilometro_actual} onChangeText={(v) => update("kilometro_actual", v)} />
          <TextInput style={styles.input} placeholder="Fecha ultimo mantenimiento" placeholderTextColor="#6f90af" value={form.fecha_ultimo_mantenimiento} onChangeText={(v) => update("fecha_ultimo_mantenimiento", v)} />
          <TextInput style={styles.input} placeholder="Enlace ITV" placeholderTextColor="#6f90af" value={form.enlace_itv} onChangeText={(v) => update("enlace_itv", v)} />
          <TextInput style={styles.input} placeholder="Enlace permiso" placeholderTextColor="#6f90af" value={form.enlace_permiso} onChangeText={(v) => update("enlace_permiso", v)} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Alerta ITV enviada" placeholderTextColor="#6f90af" value={form.alerta_itv_enviada} onChangeText={(v) => update("alerta_itv_enviada", v)} />
            <TextInput style={[styles.input, styles.half]} placeholder="Alerta seguro enviada" placeholderTextColor="#6f90af" value={form.alerta_seguro_enviada} onChangeText={(v) => update("alerta_seguro_enviada", v)} />
          </View>
          <TextInput style={styles.input} placeholder="Alerta enviada" placeholderTextColor="#6f90af" value={form.alerta_enviada} onChangeText={(v) => update("alerta_enviada", v)} />
          <Text style={styles.label}>Activo</Text>
          <View style={styles.chipsRow}>
            {ACTIVO_OPTIONS.map((status) => (
              <Pressable key={status} onPress={() => update("activo", status)} style={[styles.chip, form.activo === status && styles.chipActive]}>
                <Text style={[styles.chipText, form.activo === status && styles.chipTextActive]}>{status}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[styles.input, styles.notes]} placeholder="Observaciones" placeholderTextColor="#6f90af" value={form.observaciones} onChangeText={(v) => update("observaciones", v)} multiline />
          <View style={styles.row}>
            <Pressable style={[styles.button, styles.primary]} onPress={submit}>
              <Text style={styles.buttonText}>{editingId ? "Guardar cambios" : "Crear vehiculo"}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondary]} onPress={cancelEdit}>
              <Text style={styles.buttonText}>Cancelar</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, paddingBottom: 26, backgroundColor: "#071423" },
  moduleTitle: { color: "white", fontSize: 26, fontWeight: "800", marginBottom: 8 },
  menuBtn: {
    alignSelf: "center",
    borderColor: "#4f88bf",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  menuBtnText: { color: "#b7ddff", fontWeight: "700", fontSize: 12 },
  title: { color: "white", fontSize: 22, fontWeight: "800", marginBottom: 10 },
  label: { color: "white", fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#132f4b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f4f7f",
    color: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  notes: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderColor: "#376895", borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  chipActive: { backgroundColor: "#2f6ba0", borderColor: "#5fb7ff" },
  chipText: { color: "#a8cae8", fontSize: 12 },
  chipTextActive: { color: "white", fontWeight: "700" },
  button: { flex: 1, borderRadius: 10, alignItems: "center", paddingVertical: 10, marginBottom: 12 },
  primary: { backgroundColor: "#1f7ae0" },
  secondary: { backgroundColor: "#31526f" },
  buttonText: { color: "white", fontWeight: "700" },
  listTitle: { color: "white", fontSize: 17, fontWeight: "700", marginVertical: 8 },
  card: {
    backgroundColor: "#0c1f34",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f4f7f",
    padding: 12,
    marginBottom: 10,
  },
  cardTapArea: { width: "100%" },
  vehicleTitle: { color: "white", fontWeight: "800", fontSize: 16 },
  meta: { color: "#9ac8ef", fontSize: 12, marginTop: 2 },
  notesText: { color: "#d3e7fb", marginTop: 6, fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  editBtn: { backgroundColor: "#2f6ba0" },
  deleteBtn: { backgroundColor: "#8b3a3a" },
  smallText: { color: "white", fontWeight: "700", fontSize: 12 },
  empty: { color: "#9ec4e9", marginTop: 6 },
  undoBar: {
    backgroundColor: "#1b3552",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#35638d",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  undoText: { color: "#cfe8ff", fontSize: 12 },
  undoBtn: { backgroundColor: "#2f6ba0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  undoBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  detailCard: {
    backgroundColor: "#10263d",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b557c",
    padding: 12,
    marginBottom: 10,
  },
  detailTitle: { color: "white", fontSize: 16, fontWeight: "800", marginBottom: 6 },
});
