import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { ROLES, isAdministracion, isGestor, normalizeRole } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";

function normalizeActive_(value) {
  const v = String(value ?? "")
    .trim()
    .toUpperCase();
  return v === "SI" || v === "TRUE" || v === "1" ? "SI" : "NO";
}

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Editar usuario</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
    </View>
  );
}

export default function UserEditScreen({ navigation, route }) {
  const { role, user } = React.useContext(AuthContext);
  const canManageUsers = isGestor(role) || isAdministracion(role);
  const initial = route?.params?.userItem || {};
  const [item, setItem] = useState({
    email: String(initial.email || "").trim().toLowerCase(),
    nombre: String(initial.nombre || "").trim(),
    rol: normalizeRole(initial.rol || initial.role || ROLES.OPERARIO),
    activo: normalizeActive_(initial.activo ?? "SI"),
    telefono: String(initial.telefono || "").trim(),
    fecha_alta: String(initial.fecha_alta || "").trim(),
  });
  const [saving, setSaving] = useState(false);

  const saveUser = async () => {
    if (!canManageUsers) {
      Alert.alert("Permisos insuficientes", "Solo GESTOR o ADMINISTRACION puede modificar roles.");
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
    setSaving(true);
    for (const action of actions) {
      try {
        await sheetsApi.post(action, payload, { user_email: user?.email || "" });
        Alert.alert("Guardado", `Usuario actualizado (${item.email}).`);
        navigation.goBack();
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    Alert.alert("No se pudo guardar", lastErr?.message || "Endpoint de guardado de usuarios no disponible.");
    setSaving(false);
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.goBack()} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{item.email || "Usuario"}</Text>
        <TextField label="Nombre" value={item.nombre} onChangeText={(v) => setItem((p) => ({ ...p, nombre: v }))} />
        <SelectField
          label="Rol"
          value={item.rol}
          onChange={(v) => setItem((p) => ({ ...p, rol: normalizeRole(v) }))}
          options={[
            { value: ROLES.USUARIO, label: ROLES.USUARIO },
            { value: ROLES.GESTOR, label: ROLES.GESTOR },
            { value: ROLES.ADMINISTRACION, label: ROLES.ADMINISTRACION },
            { value: ROLES.RESPONSABLE, label: ROLES.RESPONSABLE },
            { value: ROLES.COLABORADOR, label: ROLES.COLABORADOR },
            { value: ROLES.OPERARIO, label: ROLES.OPERARIO },
          ]}
        />
        <SelectField
          label="Activo"
          value={item.activo}
          onChange={(v) => setItem((p) => ({ ...p, activo: normalizeActive_(v) }))}
          options={[
            { value: "SI", label: "SI" },
            { value: "NO", label: "NO" },
          ]}
        />
        <TextField label="Teléfono" value={item.telefono} onChangeText={(v) => setItem((p) => ({ ...p, telefono: v }))} />
        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={saveUser} disabled={saving || !canManageUsers}>
          <Text style={styles.buttonText}>{saving ? "Guardando..." : "Guardar usuario"}</Text>
        </Pressable>
      </View>
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
  button: { marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
});
