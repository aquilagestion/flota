import React, { useContext, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import { theme } from "../ui/theme";
import { TextField } from "../ui/form/Fields";
import { useResponsiveLayout } from "../ui/responsiveLayout";
import { WEB_UI_FS, boostFonts_ } from "../ui/webUiBoost";

export default function CollaboratorProfileScreen({ navigation }) {
  const { user, getColaboradorProfile, updateColaboradorProfile, syncRoleFromUsersSheet } = useContext(AuthContext);
  const layout = useResponsiveLayout();
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

  const goToMenu_ = () => {
    if (!navigation) return;
    try {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Menu" }],
        })
      );
    } catch {
      try {
        navigation.navigate("Menu");
      } catch {
        navigation.goBack?.();
      }
    }
  };

  const save = async () => {
    if (!String(form.nombre || "").trim()) {
      Alert.alert("Nombre obligatorio", "Introduce tu nombre.");
      return;
    }
    setSaving(true);
    try {
      await updateColaboradorProfile?.(form);
      try {
        await syncRoleFromUsersSheet?.();
      } catch {
        // silent
      }
      setSaving(false);
      goToMenu_();
    } catch (e) {
      setSaving(false);
      Alert.alert("No se pudo guardar", e?.message || "Error inesperado.");
    }
  };

  const closeWithoutSave = () => {
    goToMenu_();
  };

  return (
    <>
      <ScrollView style={styles.safe} contentContainerStyle={[styles.content, layout.cardWidthStyle]}>
        <View style={styles.card}>
          <Text style={styles.title}>Mis datos colaborador</Text>
          <Text style={styles.meta}>{String(user?.email || "").trim().toLowerCase()}</Text>
          <View style={layout.fieldWrapStyle}>
            <TextField textScale={WEB_UI_FS} label="Nombre" value={form.nombre} onChangeText={(v) => setForm((p) => ({ ...p, nombre: v }))} />
          </View>
          <View style={layout.fieldWrapStyle}>
            <TextField textScale={WEB_UI_FS} label="Teléfono" value={form.telefono} onChangeText={(v) => setForm((p) => ({ ...p, telefono: v }))} />
          </View>
          <View style={layout.fieldWrapStyle}>
            <TextField textScale={WEB_UI_FS} label="NIF" value={form.nif} onChangeText={(v) => setForm((p) => ({ ...p, nif: v }))} />
          </View>
          <View style={layout.fieldWrapStyle}>
            <TextField textScale={WEB_UI_FS} label="IBAN" value={form.iban} onChangeText={(v) => setForm((p) => ({ ...p, iban: v }))} />
          </View>
          <View style={layout.actionsRowStyle}>
            <Pressable style={[styles.buttonSecondary, (saving || loading) && styles.disabled]} onPress={closeWithoutSave} disabled={saving || loading}>
              <Text style={styles.buttonSecondaryText}>Salir sin guardar</Text>
            </Pressable>
            <Pressable style={[styles.button, (saving || loading) && styles.disabled]} onPress={save} disabled={saving || loading}>
              <Text style={styles.buttonText}>{saving ? "Guardando..." : "Guardar datos"}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal visible={saving} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.savingBackdrop}>
          <View style={styles.savingCard}>
            <ActivityIndicator size="large" color="#5fb7ff" />
            <Text style={styles.savingText}>Guardando datos...</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

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

const styles = StyleSheet.create(boostSheet_({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 24, width: "100%" },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14, width: "100%" },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 18, marginBottom: 4 },
  meta: { color: theme.colors.subtext, marginBottom: 8, fontSize: 13 },
  button: { flex: 1, borderRadius: 10, backgroundColor: theme.colors.primary, paddingVertical: 12, alignItems: "center" },
  buttonSecondary: { flex: 1, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  buttonSecondaryText: { color: theme.colors.subtext, fontWeight: "900", fontSize: 14 },
  disabled: { opacity: 0.7 },
  savingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  savingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: "center",
    minWidth: 220,
    ...Platform.select({ web: { maxWidth: "50%" }, default: {} }),
  },
  savingText: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginTop: 14,
    textAlign: "center",
  },
}));
