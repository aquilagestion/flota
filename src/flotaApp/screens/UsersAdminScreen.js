import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { ROLES, isGestor, normalizeRole } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Usuarios y roles</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function normalizeActive_(value) {
  const v = String(value ?? "")
    .trim()
    .toUpperCase();
  return v === "SI" || v === "TRUE" || v === "1" ? "SI" : "NO";
}

function parseUser_(u) {
  const email = String(u?.email || "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    nombre: String(u?.nombre || "").trim(),
    rol: normalizeRole(u?.rol || u?.role || ROLES.OPERARIO),
    activo: normalizeActive_(u?.activo ?? "SI"),
    telefono: String(u?.telefono || "").trim(),
    fecha_alta: String(u?.fecha_alta || "").trim(),
  };
}

export default function UsersAdminScreen({ navigation }) {
  const { role, user } = React.useContext(AuthContext);
  const gestor = isGestor(role);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => `${x.email} ${x.nombre} ${x.rol}`.toLowerCase().includes(q));
  }, [items, query]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(rows.map((r) => parseUser_(r)).filter(Boolean));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo cargar USUARIOS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveUser = async (item) => {
    if (!gestor) {
      Alert.alert("Permisos insuficientes", "Solo GESTOR puede modificar roles.");
      return;
    }

    const payload = {
      email: item.email,
      nombre: item.nombre,
      rol: item.rol,
      activo: item.activo,
      telefono: item.telefono,
      fecha_alta: item.fecha_alta,
      actualizado_por_email: user?.email || "",
    };

    const actions = ["usuario_guardar", "usuarios_guardar", "usuario_upsert"];
    let lastErr = null;
    for (const action of actions) {
      try {
        await sheetsApi.post(action, payload, { user_email: user?.email || "" });
        Alert.alert("Guardado", `Usuario actualizado (${item.email}).`);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    Alert.alert("No se pudo guardar", lastErr?.message || "Endpoint de guardado de usuarios no disponible.");
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />

      {!gestor ? (
        <View style={styles.card}>
          <Text style={styles.message}>Solo el rol GESTOR puede administrar usuarios y roles.</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <TextField label="Buscar usuario" value={query} onChangeText={setQuery} placeholder="email o nombre" />
        <Pressable style={styles.buttonSecondary} onPress={load}>
          <Text style={styles.buttonText}>Recargar</Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.message}>Cargando usuarios...</Text> : null}

      {filtered.map((item) => (
        <View key={item.email} style={styles.card}>
          <Text style={styles.sectionTitle}>{item.email}</Text>
          <TextField label="Nombre" value={item.nombre} onChangeText={(v) => setItems((p) => p.map((x) => (x.email === item.email ? { ...x, nombre: v } : x)))} />
          <SelectField
            label="Rol"
            value={item.rol}
            onChange={(v) => setItems((p) => p.map((x) => (x.email === item.email ? { ...x, rol: normalizeRole(v) } : x)))}
            options={[
              { value: ROLES.GESTOR, label: ROLES.GESTOR },
              { value: ROLES.RESPONSABLE, label: ROLES.RESPONSABLE },
              { value: ROLES.OPERARIO, label: ROLES.OPERARIO },
            ]}
          />
          <SelectField
            label="Activo"
            value={item.activo}
            onChange={(v) => setItems((p) => p.map((x) => (x.email === item.email ? { ...x, activo: normalizeActive_(v) } : x)))}
            options={[
              { value: "SI", label: "SI" },
              { value: "NO", label: "NO" },
            ]}
          />
          <TextField label="Teléfono" value={item.telefono} onChangeText={(v) => setItems((p) => p.map((x) => (x.email === item.email ? { ...x, telefono: v } : x)))} />
          <Pressable style={[styles.button, !gestor && { opacity: 0.6 }]} onPress={() => saveUser(item)} disabled={!gestor}>
            <Text style={styles.buttonText}>Guardar usuario</Text>
          </Pressable>
        </View>
      ))}
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
  message: { color: theme.colors.subtext, marginBottom: 8 },
  button: { marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
});
