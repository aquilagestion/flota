import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { downloadAndInstallApkUpdate, openApkDownloadInBrowser } from "../lib/apkUpdateDownload";
import { theme } from "./theme";

function formatMb_(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppUpdateBanner({ remoteVersion, downloadUrl, releaseNotes, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progressRatio, setProgressRatio] = useState(null);
  const [progressDetail, setProgressDetail] = useState("");

  if (Platform.OS === "web") return null;

  async function handleDownload() {
    const url = String(downloadUrl || "").trim();
    if (!url || busy) return;
    setBusy(true);
    setPhase("downloading");
    setProgressRatio(0);
    setProgressDetail("");
    try {
      await downloadAndInstallApkUpdate({
        downloadUrl: url,
        version: remoteVersion,
        onProgress: (nextPhase, ratio, meta) => {
          setPhase(nextPhase);
          if (nextPhase === "downloading") {
            if (typeof ratio === "number" && Number.isFinite(ratio)) {
              setProgressRatio(Math.max(0, Math.min(1, ratio)));
            }
            const written = meta?.written;
            const total = meta?.total;
            if (written && total) {
              setProgressDetail(`${formatMb_(written)} / ${formatMb_(total)}`);
            } else if (written) {
              setProgressDetail(`${formatMb_(written)} descargados`);
            } else if (meta?.attempt) {
              setProgressDetail(`Reintentando (${meta.attempt})…`);
            }
          } else {
            setProgressRatio(null);
            setProgressDetail("");
          }
        },
      });
      Alert.alert(
        "Instalación",
        "Si no se abrió el instalador, elige «Instalador de paquetes» en el selector o usa el botón Navegador.",
        [{ text: "Entendido" }]
      );
    } catch (e) {
      Alert.alert(
        "No se pudo actualizar",
        String(e?.message || "Error al descargar o instalar la actualización.") +
          "\n\nPuedes usar «Navegador» para descargar el APK directamente.",
        [
          { text: "Cerrar", style: "cancel" },
          {
            text: "Abrir en navegador",
            onPress: () => {
              openApkDownloadInBrowser(url).catch((err) => {
                Alert.alert("Error", String(err?.message || "No se pudo abrir el enlace."));
              });
            },
          },
        ]
      );
    } finally {
      setBusy(false);
      setPhase("");
      setProgressRatio(null);
      setProgressDetail("");
    }
  }

  async function handleBrowserDownload() {
    const url = String(downloadUrl || "").trim();
    if (!url || busy) return;
    try {
      await openApkDownloadInBrowser(url);
    } catch (e) {
      Alert.alert("Error", String(e?.message || "No se pudo abrir el enlace."));
    }
  }

  const phaseLabel =
    phase === "preparing"
      ? "Preparando APK…"
      : phase === "installing"
        ? "Abriendo instalador…"
        : phase === "downloading"
          ? progressRatio != null
            ? `Descargando… ${Math.round(progressRatio * 100)}%`
            : "Descargando…"
          : busy
            ? "Descargando…"
            : "";

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.body}>
        <Text style={styles.title}>Nueva versión disponible</Text>
        <Text style={styles.text}>
          Hay una actualización de GESTIFLOTA ({remoteVersion}). Descarga e instala desde la app. El aviso volverá a
          mostrarse al reabrir la app si no actualizas.
        </Text>
        {releaseNotes ? <Text style={styles.notes}>{releaseNotes}</Text> : null}
        {phaseLabel ? (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <View style={styles.progressTextWrap}>
              <Text style={styles.progressText}>{phaseLabel}</Text>
              {progressDetail ? <Text style={styles.progressSubText}>{progressDetail}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onDismiss} style={styles.btnGhost} disabled={busy} accessibilityRole="button">
          <Text style={styles.btnGhostText}>Cerrar por ahora</Text>
        </Pressable>
        <Pressable
          onPress={handleBrowserDownload}
          style={[styles.btnGhost, busy && styles.btnDisabled]}
          disabled={busy || !downloadUrl}
          accessibilityRole="button"
        >
          <Text style={styles.btnGhostText}>Navegador</Text>
        </Pressable>
        <Pressable
          onPress={handleDownload}
          style={[styles.btnPrimary, (!downloadUrl || busy) && styles.btnDisabled]}
          disabled={!downloadUrl || busy}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>{busy ? "Espere…" : "Descargar e instalar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#0e2a45",
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 9999,
  },
  body: { gap: 6 },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  text: { color: theme.colors.subtext, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  notes: { color: "#cfe3f7", fontSize: 12, lineHeight: 17 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  progressTextWrap: { flex: 1, gap: 2 },
  progressText: { color: theme.colors.subtext, fontSize: 12, fontWeight: "700" },
  progressSubText: { color: theme.colors.subtext, fontSize: 11, fontWeight: "600", opacity: 0.85 },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  btnGhost: { paddingVertical: 8, paddingHorizontal: 10 },
  btnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 12 },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  btnDisabled: { opacity: 0.5 },
});
