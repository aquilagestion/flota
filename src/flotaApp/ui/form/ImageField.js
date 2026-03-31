import React, { useMemo } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../theme";

async function ensurePermission(kind) {
  if (kind === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}

export default function ImageField({ label, required, valueUri, onChangeUri, multiple = false, valueUris = [] }) {
  const hasSingle = !!valueUri;
  const hasMultiple = Array.isArray(valueUris) && valueUris.length > 0;

  const preview = useMemo(() => {
    if (multiple) return hasMultiple ? valueUris[0] : null;
    return hasSingle ? valueUri : null;
  }, [multiple, valueUri, valueUris, hasSingle, hasMultiple]);

  const pick = async (source) => {
    const ok = await ensurePermission(source);
    if (!ok) {
      Alert.alert("Permiso denegado", "Necesito permiso para acceder a la cámara/galería.");
      return;
    }
    const res =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.75, allowsEditing: false });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    if (multiple) onChangeUri([uri, ...(valueUris || [])]);
    else onChangeUri(uri);
  };

  const clear = () => {
    if (multiple) onChangeUri([]);
    else onChangeUri("");
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>
        {label} {required ? <Text style={{ color: "#ffadad" }}>*</Text> : null}
      </Text>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => pick("camera")}>
          <Text style={styles.btnText}>Cámara</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => pick("library")}>
          <Text style={styles.btnText}>Galería</Text>
        </Pressable>
        {(hasSingle || hasMultiple) ? (
          <Pressable style={[styles.btn, styles.btnDanger]} onPress={clear}>
            <Text style={styles.btnText}>Quitar</Text>
          </Pressable>
        ) : null}
      </View>
      {preview ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: preview }} style={styles.preview} />
          {multiple && hasMultiple ? <Text style={styles.count}>+{valueUris.length} fotos</Text> : null}
        </View>
      ) : (
        <Text style={styles.help}>Adjunta una imagen (ticket o foto).</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnDanger: { borderColor: "#c96e6e" },
  btnText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  help: { color: theme.colors.subtext, marginTop: 6, fontSize: 12 },
  previewWrap: { marginTop: 8, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  preview: { width: "100%", height: 180, backgroundColor: "#000" },
  count: { position: "absolute", right: 8, top: 8, backgroundColor: "rgba(0,0,0,0.55)", color: "white", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontWeight: "800", fontSize: 12 },
});

