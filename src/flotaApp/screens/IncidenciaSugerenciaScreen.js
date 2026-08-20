import React, { useContext, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";
import { WEB_UI_FS, boostFonts_ } from "../ui/webUiBoost";

const TIPO_OPTIONS = [
  { value: "INCIDENCIA", label: "Incidencia" },
  { value: "SUGERENCIA", label: "Sugerencia de mejora" },
];

export default function IncidenciaSugerenciaScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [tipo, setTipo] = useState("INCIDENCIA");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const subject = String(asunto || "").trim();
    const body = String(mensaje || "").trim();
    if (!subject) {
      Alert.alert("Falta asunto", "Escribe un asunto breve.");
      return;
    }
    if (!body) {
      Alert.alert("Falta mensaje", "Describe la incidencia o sugerencia.");
      return;
    }
    try {
      setSending(true);
      await sheetsApi.post(
        "incidencia_sugerencia_enviar",
        {
          tipo: String(tipo || "INCIDENCIA").trim().toUpperCase(),
          asunto: subject,
          mensaje: body,
          nombre: String(user?.displayName || user?.nombre || "").trim(),
        },
        { user_email: String(user?.email || "").trim().toLowerCase() }
      );
      Alert.alert("Enviado", "Tu mensaje se ha enviado al gestor. Gracias.");
      setAsunto("");
      setMensaje("");
      setTipo("INCIDENCIA");
      navigation.goBack();
    } catch (e) {
      Alert.alert("No se pudo enviar", e?.message || "Error inesperado.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Incidencias y sugerencias</Text>
        <Text style={styles.meta}>
          El mensaje se envía por correo a los gestores de GESTIFLOTA.
        </Text>
        <Text style={styles.meta}>{String(user?.email || "").trim().toLowerCase()}</Text>
        <SelectField textScale={WEB_UI_FS} label="Tipo" required value={tipo} onChange={setTipo} options={TIPO_OPTIONS} />
        <TextField textScale={WEB_UI_FS} label="Asunto" required value={asunto} onChangeText={setAsunto} placeholder="Resumen breve" />
        <TextField
          textScale={WEB_UI_FS}
          label="Mensaje"
          required
          value={mensaje}
          onChangeText={setMensaje}
          placeholder="Describe la incidencia o la mejora que propones"
          multiline
        />
        <Pressable style={[styles.button, sending && styles.disabled]} onPress={send} disabled={sending}>
          <Text style={styles.buttonText}>{sending ? "Enviando..." : "Enviar al gestor"}</Text>
        </Pressable>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  content: { padding: 14, paddingBottom: 24 },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
  },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 18, marginBottom: 4 },
  meta: { color: theme.colors.subtext, marginBottom: 6, fontSize: 13 },
  button: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  disabled: { opacity: 0.7 },
  backBtn: { marginTop: 10, alignItems: "center", paddingVertical: 8 },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 13 },
}));
