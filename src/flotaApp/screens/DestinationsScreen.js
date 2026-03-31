import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { localDb } from "../storage/localDb";
import { theme } from "../ui/theme";
import { TextField } from "../ui/form/Fields";
import { AuthContext } from "../auth/AuthContext";
import { isGestor } from "../auth/roles";

const DEFAULT_FOLDER_URL = "https://drive.google.com/drive/folders/1QIff1sdYQYdr1rd2JA1ua7iF579Mrcdv";
const DEFAULT_FOLDER_ID = "1QIff1sdYQYdr1rd2JA1ua7iF579Mrcdv";
const DEFAULT_SPREADSHEET_ID = "1v6YJ7Y3KjSUUaTog8tuw1elircOR5dbPZaddNkZ4gGY";

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Destinos de guardado</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function extractDriveFolderId_(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m?.[1]) return m[1];
  return s;
}

export default function DestinationsScreen({ navigation }) {
  const { role } = React.useContext(AuthContext);
  const gestor = isGestor(role);
  const [form, setForm] = useState({
    corpDriveFolder: DEFAULT_FOLDER_ID,
    corpSpreadsheetId: DEFAULT_SPREADSHEET_ID,
    userDriveFolder: "",
    userSpreadsheetId: "",
    mode: "corporate", // corporate | personal | both
    autoCreatePersonal: false,
  });

  useEffect(() => {
    (async () => {
      const saved = await localDb.getSyncTargets();
      if (saved) {
        setForm((p) => ({
          ...p,
          ...saved,
          // Si había configuración previa sin libro corporativo, aplicamos el default.
          corpSpreadsheetId: saved.corpSpreadsheetId || DEFAULT_SPREADSHEET_ID,
        }));
      } else {
        // Inicializa con carpeta corporativa por defecto
        await localDb.setSyncTargets(form);
      }
    })();
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!gestor) {
      Alert.alert("Permisos insuficientes", "Solo el rol GESTOR puede modificar destinos.");
      return;
    }
    const next = {
      ...form,
      corpDriveFolder: extractDriveFolderId_(form.corpDriveFolder) || DEFAULT_FOLDER_ID,
      userDriveFolder: extractDriveFolderId_(form.userDriveFolder),
    };
    await localDb.setSyncTargets(next);
    setForm(next);
    Alert.alert("Guardado", "Configuración de destinos actualizada.");
  };

  if (!gestor) {
    return (
      <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
        <Header onBack={() => navigation.navigate("Menu")} />
        <View style={styles.card}>
          <Text style={styles.help}>Solo el rol GESTOR puede acceder a configuración de destinos.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Destino corporativo (administración)</Text>
        <Text style={styles.help}>Carpeta por defecto: {DEFAULT_FOLDER_URL}</Text>
        <TextField
          label="Carpeta Drive corporativa (ID o URL)"
          value={form.corpDriveFolder}
          onChangeText={(v) => set("corpDriveFolder", v)}
          placeholder={DEFAULT_FOLDER_ID}
          editable={gestor}
        />
        <TextField
          label="Libro corporativo (Spreadsheet ID)"
          value={form.corpSpreadsheetId}
          onChangeText={(v) => set("corpSpreadsheetId", v)}
          placeholder={DEFAULT_SPREADSHEET_ID}
          editable={gestor}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Destino personal (usuario)</Text>
        <TextField
          label="Carpeta Drive personal (ID o URL)"
          value={form.userDriveFolder}
          onChangeText={(v) => set("userDriveFolder", v)}
          placeholder="Opcional"
          editable={gestor}
        />
        <TextField
          label="Libro personal (Spreadsheet ID)"
          value={form.userSpreadsheetId}
          onChangeText={(v) => set("userSpreadsheetId", v)}
          placeholder="Opcional"
          editable={gestor}
        />
        <Pressable style={[styles.toggle, !gestor && { opacity: 0.6 }]} onPress={() => gestor && set("autoCreatePersonal", !form.autoCreatePersonal)}>
          <Text style={styles.toggleText}>{form.autoCreatePersonal ? "SI" : "NO"} · Crear carpeta/libro personal automáticamente</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Modo de envío</Text>
        <View style={styles.row}>
          {[
            { id: "corporate", label: "Solo corporativo" },
            { id: "personal", label: "Solo personal" },
            { id: "both", label: "Ambos" },
          ].map((m) => (
                  <Pressable key={m.id} style={[styles.chip, form.mode === m.id && styles.chipActive, !gestor && { opacity: 0.6 }]} onPress={() => gestor && set("mode", m.id)}>
              <Text style={[styles.chipText, form.mode === m.id && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {gestor ? (
        <Pressable style={styles.button} onPress={save}>
          <Text style={styles.buttonText}>Guardar configuración</Text>
        </Pressable>
      ) : (
        <Text style={styles.help}>Solo el rol GESTOR puede modificar esta configuración.</Text>
      )}
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
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  help: { color: theme.colors.subtext, fontSize: 12, marginBottom: 8 },
  toggle: { marginTop: 6, backgroundColor: theme.colors.card2, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, paddingHorizontal: 10 },
  toggleText: { color: theme.colors.text, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.colors.card2 },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: "#5fb7ff" },
  chipText: { color: theme.colors.subtext, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: theme.colors.text },
  button: { marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
});

