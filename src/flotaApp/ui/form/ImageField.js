import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { extractDriveFileId } from "../../../flotaWeb/lib/format";
import { prepareTicketImageForA4FromFile } from "../../../flotaWeb/lib/expenseTicketImagePrepare";
import { theme } from "../theme";

async function ensurePermission(kind) {
  if (kind === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}

function isProbablyPdf_(uri, mimeHint = "") {
  const mime = String(mimeHint || "").trim().toLowerCase();
  if (mime.includes("pdf")) return true;
  const u = String(uri || "").trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith("data:application/pdf")) return true;
  return /\.pdf(\?|#|$)/i.test(u) || u.includes("mime=application/pdf");
}

function isDisplayableInlineImage_(uri) {
  const u = String(uri || "").trim();
  if (!u) return false;
  if (isProbablyPdf_(u)) return false;
  if (u.startsWith("data:image/") || u.startsWith("file:") || u.startsWith("content:")) {
    return true;
  }
  // blob: en web puede ser imagen o PDF; Image falla en PDF → onError.
  if (u.startsWith("blob:")) return true;
  const driveId = extractDriveFileId(u);
  if (driveId && !u.startsWith("data:")) return false;
  if (/^https?:\/\//i.test(u) && !/\.pdf(\?|#|$)/i.test(u)) return true;
  return false;
}

function openableTicketUrl_(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  const fileId = extractDriveFileId(u);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
  return u;
}

async function openTicketUri_(uri) {
  const target = openableTicketUrl_(uri);
  if (!target) {
    Alert.alert("Sin tiquet", "No hay URL de tiquet/comprobante para abrir.");
    return;
  }
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (target.startsWith("data:application/pdf")) {
        const win = window.open("", "_blank", "noopener,noreferrer");
        if (win) {
          win.document.write(
            `<!DOCTYPE html><html><head><title>Tiquet PDF</title></head><body style="margin:0"><embed src="${target}" type="application/pdf" width="100%" height="100%" /></body></html>`
          );
          win.document.close();
          return;
        }
      }
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    const can = await Linking.canOpenURL(target);
    if (!can && !target.startsWith("file:") && !target.startsWith("content:") && !target.startsWith("data:")) {
      Alert.alert("No se pudo abrir", "El enlace del tiquet no es usable en este dispositivo.");
      return;
    }
    await Linking.openURL(target);
  } catch (e) {
    Alert.alert("Error", e?.message || "No se pudo abrir el tiquet.");
  }
}

function fileToDataUri_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function commitUri_(uri, { multiple, valueUris, onChangeUri }) {
  const s = String(uri || "").trim();
  if (!s) return;
  if (multiple) onChangeUri([s, ...(valueUris || [])]);
  else onChangeUri(s);
}

function TicketPreviewItem_({ uri, index, onRemove, showRemove }) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [uri]);

  const canInline = isDisplayableInlineImage_(uri) && !imgError;
  const isPdf = isProbablyPdf_(uri);

  return (
    <View style={styles.itemWrap}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemLabel}>Archivo {index + 1}</Text>
        {showRemove ? (
          <Pressable
            style={[styles.btn, styles.btnDanger, styles.btnSmall]}
            onPress={(e) => {
              if (e?.preventDefault) e.preventDefault();
              if (e?.stopPropagation) e.stopPropagation();
              onRemove(index);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Quitar archivo ${index + 1}`}
          >
            <Text style={styles.btnText}>Quitar</Text>
          </Pressable>
        ) : null}
      </View>
      {canInline ? (
        <Pressable onPress={() => openTicketUri_(uri)} accessibilityRole="button">
          <Image
            source={{ uri }}
            style={styles.previewSmall}
            resizeMode="contain"
            onError={() => setImgError(true)}
          />
        </Pressable>
      ) : (
        <View style={styles.fallbackBox}>
          <Text style={styles.fallbackText}>
            {isPdf
              ? "Tiquet PDF adjunto. Pulsa «Ver PDF» para abrirlo."
              : "Tiquet/comprobante adjunto. La miniatura no está disponible aquí; ábrelo para verlo."}
          </Text>
          <Pressable style={styles.openBtn} onPress={() => openTicketUri_(uri)}>
            <Text style={styles.openBtnText}>{isPdf ? "Ver PDF" : "Abrir tiquet / factura"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ImageField({
  label,
  required,
  valueUri,
  onChangeUri,
  multiple = false,
  valueUris = [],
  allowPdf = true,
}) {
  const hasSingle = !!valueUri;
  const uris = useMemo(
    () => (Array.isArray(valueUris) ? valueUris.map((u) => String(u || "").trim()).filter(Boolean) : []),
    [valueUris]
  );
  const hasMultiple = uris.length > 0;
  const [imgError, setImgError] = useState(false);

  const preview = useMemo(() => {
    if (multiple) return null;
    return hasSingle ? valueUri : null;
  }, [multiple, valueUri, hasSingle]);

  useEffect(() => {
    setImgError(false);
  }, [preview]);

  const canInline = isDisplayableInlineImage_(preview) && !imgError;
  const isPdf = isProbablyPdf_(preview);

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
    let uri = String(res.assets?.[0]?.uri || "").trim();
    if (!uri) return;
    // Web: blob: caduca al salir del form; persistir data URI compacta para que el sync pueda subir tras guardar.
    if (Platform.OS === "web" && (uri.startsWith("blob:") || uri.startsWith("file:")) && typeof fetch === "function") {
      try {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const file = new File([blob], "ticket.jpg", { type: blob.type || "image/jpeg" });
        const prepared = await prepareTicketImageForA4FromFile(file);
        uri = String(prepared?.dataUrl || "").trim() || (await fileToDataUri_(file));
      } catch {
        // Si falla la conversión, se intenta con la URI original.
      }
    }
    commitUri_(uri, { multiple, valueUris: uris, onChangeUri });
  };

  const pickPdfOrFile = async () => {
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const el = document.createElement("input");
        el.type = "file";
        el.accept = allowPdf ? "image/*,application/pdf,.pdf" : "image/*";
        el.onchange = async (ev) => {
          const file = ev?.target?.files?.[0];
          if (!file) return;
          const mime = String(file.type || "").toLowerCase();
          if (allowPdf && (mime.includes("pdf") || /\.pdf$/i.test(file.name || ""))) {
            const dataUri = await fileToDataUri_(file);
            commitUri_(dataUri, { multiple, valueUris: uris, onChangeUri });
            return;
          }
          if (mime.startsWith("image/") || !mime) {
            try {
              const prepared = await prepareTicketImageForA4FromFile(file);
              const dataUri = String(prepared?.dataUrl || "").trim() || (await fileToDataUri_(file));
              commitUri_(dataUri, { multiple, valueUris: uris, onChangeUri });
            } catch {
              const dataUri = await fileToDataUri_(file);
              commitUri_(dataUri, { multiple, valueUris: uris, onChangeUri });
            }
            return;
          }
          Alert.alert("Formato no soportado", "Adjunta una imagen (JPG/PNG/…) o un PDF.");
        };
        el.click();
        return;
      }

      const res = await DocumentPicker.getDocumentAsync({
        type: allowPdf ? ["image/*", "application/pdf"] : ["image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = Array.isArray(res.assets) ? res.assets[0] : res;
      const uri = String(asset?.uri || "").trim();
      if (!uri) return;
      commitUri_(uri, { multiple, valueUris: uris, onChangeUri });
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo seleccionar el archivo.");
    }
  };

  const clearAll = () => {
    if (multiple) onChangeUri([]);
    else onChangeUri("");
  };

  const removeAt = (index) => {
    if (!multiple) {
      onChangeUri("");
      return;
    }
    onChangeUri(uris.filter((_, i) => i !== index));
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
        {allowPdf ? (
          <Pressable style={styles.btn} onPress={pickPdfOrFile}>
            <Text style={styles.btnText}>PDF / archivo</Text>
          </Pressable>
        ) : null}
        {(hasSingle || (multiple && hasMultiple)) && !multiple ? (
          <Pressable style={[styles.btn, styles.btnDanger]} onPress={clearAll}>
            <Text style={styles.btnText}>Quitar</Text>
          </Pressable>
        ) : null}
        {multiple && hasMultiple ? (
          <Pressable
            style={[styles.btn, styles.btnDanger]}
            onPress={(e) => {
              if (e?.preventDefault) e.preventDefault();
              if (e?.stopPropagation) e.stopPropagation();
              clearAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="Quitar todos los adjuntos"
          >
            <Text style={styles.btnText}>Quitar todos</Text>
          </Pressable>
        ) : null}
      </View>
      {multiple ? (
        hasMultiple ? (
          <View style={styles.listWrap}>
            <Text style={styles.countInline}>
              {uris.length} {uris.length === 1 ? "archivo" : "archivos"}
            </Text>
            {uris.map((uri, index) => (
              <TicketPreviewItem_ key={`${index}:${String(uri).slice(0, 48)}`} uri={uri} index={index} onRemove={removeAt} showRemove />
            ))}
          </View>
        ) : (
          <Text style={styles.help}>
            {allowPdf ? "Adjunta imagen (JPG/PNG/…) o PDF del tiquet/factura." : "Adjunta una imagen (ticket o foto)."}
          </Text>
        )
      ) : preview ? (
        <View style={styles.previewWrap}>
          {canInline ? (
            <Pressable onPress={() => openTicketUri_(preview)} accessibilityRole="button">
              <Image
                source={{ uri: preview }}
                style={styles.preview}
                resizeMode="contain"
                onError={() => setImgError(true)}
              />
            </Pressable>
          ) : (
            <View style={styles.fallbackBox}>
              <Text style={styles.fallbackText}>
                {isPdf
                  ? "Tiquet PDF adjunto. Pulsa «Ver PDF» para abrirlo."
                  : "Tiquet/comprobante adjunto. La miniatura no está disponible aquí; ábrelo para verlo."}
              </Text>
              <Pressable style={styles.openBtn} onPress={() => openTicketUri_(preview)}>
                <Text style={styles.openBtnText}>{isPdf ? "Ver PDF" : "Abrir tiquet / factura"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.help}>
          {allowPdf ? "Adjunta imagen (JPG/PNG/…) o PDF del tiquet/factura." : "Adjunta una imagen (ticket o foto)."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 72,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnSmall: {
    flexGrow: 0,
    flexBasis: "auto",
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  btnDanger: { borderColor: "#c96e6e" },
  btnText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  help: { color: theme.colors.subtext, marginTop: 6, fontSize: 12 },
  listWrap: { marginTop: 8, gap: 10 },
  countInline: { color: theme.colors.subtext, fontSize: 12, fontWeight: "700" },
  itemWrap: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#0b1220",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  itemLabel: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  previewWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#0b1220",
  },
  preview: { width: "100%", height: 180, backgroundColor: "#0b1220" },
  previewSmall: { width: "100%", height: 140, backgroundColor: "#0b1220" },
  fallbackBox: { padding: 14, gap: 10 },
  fallbackText: { color: theme.colors.subtext, fontSize: 13, lineHeight: 18 },
  openBtn: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: "#4f88bf",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openBtnText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
});
