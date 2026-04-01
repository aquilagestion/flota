import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { ROLES, isAdministracion, isGestor, normalizeRole } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { TextField } from "../ui/form/Fields";

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
  const administracion = isAdministracion(role);
  const canManageUsers = gestor || administracion;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => `${x.email} ${x.nombre} ${x.rol}`.toLowerCase().includes(q));
  }, [items, query]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      let res = null;
      try {
        res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" }, { timeoutMs: 45000 });
      } catch (firstErr) {
        const msg = String(firstErr?.message || "").toLowerCase();
        const isTimeout = msg.includes("timeout");
        if (!isTimeout) throw firstErr;
        // Reintento único para redes lentas.
        res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" }, { timeoutMs: 45000 });
      }
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(rows.map((r) => parseUser_(r)).filter(Boolean));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo cargar USUARIOS desde Sheets.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      load();
    });
    return unsub;
  }, [navigation, load]);

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />

      {!canManageUsers ? (
        <View style={styles.card}>
          <Text style={styles.message}>Solo los roles GESTOR y ADMINISTRACION pueden administrar usuarios y roles.</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <TextField label="Buscar usuario" value={query} onChangeText={setQuery} placeholder="email o nombre" />
        <Pressable style={styles.buttonSecondary} onPress={load}>
          <Text style={styles.buttonText}>Recargar</Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.message}>Cargando usuarios...</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Usuarios ({filtered.length})</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.th, styles.colNombre]}>Nombre</Text>
          <Text style={[styles.th, styles.colRol]}>Rol</Text>
          <Text style={[styles.th, styles.colActivo]}>Activo</Text>
        </View>
        {filtered.map((item, idx) => (
          <Pressable
            key={item.email}
            style={[styles.tableRow, idx % 2 ? styles.tableRowAlt : null]}
            onPress={() => navigation.navigate("UsuarioEditar", { userItem: item })}
            disabled={!canManageUsers}
          >
            <Text style={[styles.td, styles.colNombre]} numberOfLines={2}>
              {item.nombre || "-"}
            </Text>
            <Text style={[styles.td, styles.colRol]} numberOfLines={1}>
              {item.rol || "-"}
            </Text>
            <Text style={[styles.td, styles.colActivo]} numberOfLines={1}>
              {item.activo || "NO"}
            </Text>
          </Pressable>
        ))}
        {!canManageUsers ? (
          <Text style={[styles.message, { marginTop: 8 }]}>Sin permisos para editar usuarios.</Text>
        ) : (
          <Text style={[styles.message, { marginTop: 8 }]}>Pulsa una fila para editar los datos del usuario.</Text>
        )}
      </View>

      {!loading && filtered.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.message}>No hay usuarios para mostrar con el filtro actual.</Text>
        </View>
      ) : null}
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
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.border, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  tableRow: { flexDirection: "row", borderWidth: 1, borderTopWidth: 0, borderColor: theme.colors.border, backgroundColor: theme.colors.card },
  tableRowAlt: { backgroundColor: theme.colors.card2 },
  th: { color: theme.colors.text, fontWeight: "900", paddingHorizontal: 4, paddingVertical: 8, fontSize: 10 },
  td: { color: theme.colors.text, paddingHorizontal: 4, paddingVertical: 8, fontSize: 10 },
  colNombre: { flex: 1.8 },
  colRol: { flex: 1 },
  colActivo: { flex: 0.7 },
});
