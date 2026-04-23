import React, { useContext, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { theme } from "../ui/theme";
import { TextField } from "../ui/form/Fields";

export default function CollaboratorProfileScreen({ navigation }) {
  const { user, getColaboradorProfile, updateColaboradorProfile } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", telefono: "", nif: "", iban: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profile = await getColaboradorProfile?.();
        if (!alive) return;
        setForm({
          nombre: String(profile?.nombre || "").trim(),
          telefono: String(profile?.telefono || "").trim(),
          nif: String(profile?.nif || "").trim(),
          iban: String(profile?.iban || "").trim(),
        });
      } catch {
        // ignore first load failures
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getColaboradorProfile]);

  const save = async () => {
    try {
      setSaving(true);
      if (!String(form.nombre || "").trim()) {
        Alert.alert("Nombre obligatorio", "Introduce tu nombre.");
        return;
      }
      await updateColaboradorProfile?.(form);
      Alert.alert("Guardado", "Tus datos se han actualizado en USUARIOS y COLABORADORES.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("No se pudo guardar", e?.message || "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Mis datos colaborador</Text>
        <Text style={styles.meta}>{String(user?.email || "").trim().toLowerCase()}</Text>
        <TextField label="Nombre" value={form.nombre} onChangeText={(v) => setForm((p) => ({ ...p, nombre: v }))} />
        <TextField label="Teléfono" value={form.telefono} onChangeText={(v) => setForm((p) => ({ ...p, telefono: v }))} />
        <TextField label="NIF" value={form.nif} onChangeText={(v) => setForm((p) => ({ ...p, nif: v }))} />
        <TextField label="IBAN" value={form.iban} onChangeText={(v) => setForm((p) => ({ ...p, iban: v }))} />
        <Pressable style={[styles.button, (saving || loading) && styles.disabled]} onPress={save} disabled={saving || loading}>
          <Text style={styles.buttonText}>{saving ? "Guardando..." : "Guardar datos"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 24 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14 },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 18, marginBottom: 4 },
  meta: { color: theme.colors.subtext, marginBottom: 8 },
  button: { marginTop: 8, borderRadius: 10, backgroundColor: theme.colors.primary, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  disabled: { opacity: 0.7 },
});
