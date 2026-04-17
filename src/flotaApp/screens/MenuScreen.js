import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthContext } from "../auth/AuthContext";
import { theme } from "../ui/theme";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import {
  canApproveExpenseSheets,
  canManageResponsableSolicitudes,
  isAdministracion,
  isGestor,
  isResponsable,
  roleLabel,
} from "../auth/roles";
import { syncService } from "../sync/syncService";

const RIPPLE = { color: "rgba(255,255,255,0.12)" };

function MenuTile({ icon, label, onPress, badge, warn, danger, dense, accessibilityLabel }) {
  const a11y = accessibilityLabel || label;
  const iconSize = dense ? 24 : 26;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.tile,
        dense && styles.tileDense,
        danger && styles.tileDanger,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.tileInner}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name={icon} size={iconSize} color={warn ? "#ffb4b4" : "#9ec4e9"} />
          {badge != null && Number(badge) > 0 ? (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText} maxFontSizeMultiplier={1.8}>
                {Number(badge) > 99 ? "99+" : String(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.tileLabel, dense && styles.tileLabelDense]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.85}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function MenuScreen({ navigation }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const { logout, role, user, changePassword, syncRoleFromUsersSheet } = useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const administracion = isAdministracion(role);
  const canApproveSheets = canApproveExpenseSheets(role);
  const canSolicitudesResp = canManageResponsableSolicitudes(role);

  useFocusEffect(
    useCallback(() => {
      if (gestor || administracion || responsable) return;
      syncRoleFromUsersSheet?.();
    }, [administracion, gestor, responsable, syncRoleFromUsersSheet])
  );

  const [outboxCount, setOutboxCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState("");
  const [pwdModal, setPwdModal] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  async function refreshOutboxState_() {
    const outbox = await localDb.getOutbox();
    setOutboxCount(outbox.length);
    const firstErr = outbox.find((j) => String(j?._syncError || "").trim());
    setLastSyncError(firstErr?._syncError ? String(firstErr._syncError) : "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (!alive || !list.length) return;
        await localDb.setVehicles(list);
      } catch {
        // fallback a cache local
      }
      try {
        if (alive) await refreshOutboxState_();
      } catch {
        // silent
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const syncNow = useCallback(async () => {
    try {
      const res = await syncService.flushIfOnline();
      await refreshOutboxState_();
      if (res?.remainingCount > 0) {
        const outbox = await localDb.getOutbox();
        const firstErr = outbox.find((j) => String(j?._syncError || "").trim());
        Alert.alert(
          "Sincronización parcial",
          `Pendientes: ${res.remainingCount}\n${firstErr?._syncError ? `Motivo: ${firstErr._syncError}` : "Sin detalle de error"}`
        );
      } else {
        Alert.alert("Sincronización OK", `Enviados: ${res?.pushed || 0}. Sin pendientes.`);
      }
    } catch (e) {
      Alert.alert("Error de sincronización", e?.message || "No se pudo sincronizar.");
    }
  }, []);

  const closePwdModal = () => {
    setPwdModal(false);
    setCurrentPwd("");
    setNewPwd("");
    setNewPwd2("");
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !newPwd2) {
      Alert.alert("Datos incompletos", "Completa los 3 campos.");
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert("Contraseña inválida", "Mínimo 6 caracteres.");
      return;
    }
    if (newPwd !== newPwd2) {
      Alert.alert("No coincide", "La confirmación no coincide.");
      return;
    }
    if (currentPwd === newPwd) {
      Alert.alert("Sin cambios", "La nueva debe ser distinta a la actual.");
      return;
    }
    try {
      setPwdBusy(true);
      await changePassword(currentPwd, newPwd);
      closePwdModal();
      Alert.alert("Contraseña actualizada", "Ya está guardada en USUARIOS.");
    } catch (e) {
      Alert.alert("No se pudo cambiar", e?.message || "Error inesperado.");
    } finally {
      setPwdBusy(false);
    }
  };

  const tiles = useMemo(() => {
    const out = [];
    const add = (id, label, icon, onPress, opts = {}) => out.push({ id, label, icon, onPress, ...opts });

    add("veh", "Vehículos", "car-outline", () => navigation.navigate("Vehiculos"));

    if (!administracion) {
      add("gasto", "Gastos", "cash-multiple", () => navigation.navigate("Gasto"));
      add("mant", "Mantenimiento", "wrench-outline", () => navigation.navigate("Mantenimiento"));
      add("hist", "Historial", "history", () => navigation.navigate("Historial"));
      add("hojas", "Hojas gasto", "file-document-outline", () => navigation.navigate("HojasGasto"));
      add("uso", "Uso vehículos", "calendar-range", () => navigation.navigate("Solicitudes"));
    }

    if (canApproveSheets) {
      add("aprob", "Aprobaciones", "clipboard-check-outline", () => navigation.navigate("Aprobaciones"));
    }
    if (gestor || administracion) {
      add("users", "Usuarios", "account-group-outline", () => navigation.navigate("Usuarios"));
    }
    if (canSolicitudesResp) {
      add("solresp", "Rol responsable", "account-arrow-up-outline", () => navigation.navigate("SolicitudesResponsable"));
    }
    if (gestor && !administracion) {
      add("dest", "Destinos", "folder-cog-outline", () => navigation.navigate("Destinos"));
    }

    if (!administracion) {
      add("sync", "Sincronizar", "cloud-sync-outline", syncNow, {
        badge: outboxCount,
        warn: !!lastSyncError,
        accessibilityLabel:
          outboxCount > 0
            ? `Sincronizar, ${outboxCount} pendientes${lastSyncError ? ". Hubo error previo." : ""}`
            : "Sincronizar pendientes",
      });
    }

    add("help", "Ayuda", "help-circle-outline", () => navigation.navigate("Ayuda"));
    add("pwd", "Contraseña", "lock-outline", () => setPwdModal(true));
    add("out", "Salir", "logout-variant", logout, { danger: true });

    return out;
  }, [
    administracion,
    canApproveSheets,
    canSolicitudesResp,
    gestor,
    navigation,
    outboxCount,
    lastSyncError,
    logout,
    syncNow,
  ]);

  const numCols = useMemo(() => {
    const n = tiles.length;
    if (winH < 620 || n >= 14) return 4;
    if (n > 9 || winW < 360) return 4;
    return 3;
  }, [tiles.length, winH, winW]);

  const denseTiles = tiles.length >= 12;
  const cellPct = `${100 / numCols}%`;

  const emailShort = String(user?.email || "").trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <Text style={styles.brand} maxFontSizeMultiplier={2}>
            FLOTA
          </Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText} maxFontSizeMultiplier={1.9}>
              {roleLabel(role)}
            </Text>
          </View>
        </View>
        {emailShort ? (
          <Text style={styles.emailLine} numberOfLines={1} maxFontSizeMultiplier={1.9}>
            {emailShort}
          </Text>
        ) : null}

        <View style={styles.grid}>
          {tiles.map((t) => (
            <View key={t.id} style={[styles.gridCell, { width: cellPct }]}>
              <MenuTile
                icon={t.icon}
                label={t.label}
                onPress={t.onPress}
                badge={t.badge}
                warn={t.warn}
                danger={t.danger}
                dense={denseTiles}
                accessibilityLabel={t.accessibilityLabel}
              />
            </View>
          ))}
        </View>
      </View>

      <Modal visible={pwdModal} animationType="fade" transparent onRequestClose={closePwdModal}>
        <Pressable style={styles.modalOverlay} onPress={closePwdModal}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Cambiar contraseña</Text>
            <Text style={styles.modalHint}>Se guarda en USUARIOS.</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Actual"
              placeholderTextColor={theme.colors.placeholder}
              value={currentPwd}
              onChangeText={setCurrentPwd}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Nueva (mín. 6)"
              placeholderTextColor={theme.colors.placeholder}
              value={newPwd}
              onChangeText={setNewPwd}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Confirmar nueva"
              placeholderTextColor={theme.colors.placeholder}
              value={newPwd2}
              onChangeText={setNewPwd2}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnGhost} onPress={closePwdModal} disabled={pwdBusy}>
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnPrimary, pwdBusy && styles.buttonDisabled]}
                onPress={handleChangePassword}
                disabled={pwdBusy}
              >
                <Text style={styles.modalBtnPrimaryText}>{pwdBusy ? "…" : "Guardar"}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  root: { flex: 1, paddingHorizontal: 10, paddingTop: 4 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  brand: { color: theme.colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 0.5 },
  roleChip: {
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  roleChipText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  emailLine: {
    color: "#a8c8e8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, flex: 1, alignContent: "flex-start" },
  gridCell: { padding: 3 },
  tile: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 74,
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 1 },
    }),
  },
  tileDense: { minHeight: 62, paddingVertical: 0 },
  tileDanger: { borderColor: "rgba(201,110,110,0.55)" },
  tilePressed: { backgroundColor: "#112a45" },
  tileInner: { alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 4 },
  iconWrap: { position: "relative", marginBottom: 4 },
  badgeCount: {
    position: "absolute",
    right: -10,
    top: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.bg,
  },
  badgeCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  tileLabel: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 14,
  },
  tileLabelDense: { fontSize: 10, lineHeight: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  modalHint: { color: theme.colors.subtext, fontSize: 13, marginTop: 4, marginBottom: 12 },
  modalInput: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    marginBottom: 10,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 15 },
  modalBtnPrimary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
});
