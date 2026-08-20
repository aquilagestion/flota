import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthContext } from "../auth/AuthContext";
import { theme } from "../ui/theme";
import MenuIcon from "../ui/MenuIcon";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import {
  canAccessDestinos,
  canAccessFieldExpenseOps,
  canAccessMaintenance,
  canAccessTripsModule,
  canAccessUseVehicles,
  canAccessVehicleModule,
  canAccessWorkbench,
  canAccessManagementReports,
  canAccessKmFleetReport,
  canApproveExpenseSheets,
  canApproveRequests,
  canImportExpenseSheetExcel,
  canManageResponsableSolicitudes,
  canManageUsers,
  isAdministracion,
  isColaborador,
  isGestor,
  isResponsable,
  isUsuario,
  roleLabel,
} from "../auth/roles";
import { useSyncActions } from "../context/SyncContext";
import { loadPendingWorkbench } from "../lib/pendingWorkbench";
import { showSyncResultAlert } from "../lib/syncFeedback";
import { getInstalledAppVersion, fetchRemoteApkVersion } from "../lib/apkUpdateCheck";
import { isRemoteVersionNewer } from "../lib/versionCompare";
import { openApkDownloadInBrowser } from "../lib/apkUpdateDownload";
import { useApkUpdateActions } from "../context/ApkUpdateContext";
import { APP_BRAND, FULL_WEB_URL, USO_WEB_URL, isUsoRuntime } from "../config/appMode";
import { useResponsiveLayout } from "../ui/responsiveLayout";

const RIPPLE = { color: "rgba(255,255,255,0.12)" };

function MenuTile({ icon, label, onPress, badge, warn, danger, dense, compact, tileWidthStyle, accessibilityLabel }) {
  const a11y = accessibilityLabel || label;
  // El módulo es compacto: reducimos el icono para que encaje con el estrechamiento del tile.
  const iconSize = dense ? (Platform.OS === "web" ? 22 : 18) : Platform.OS === "web" ? 26 : 20;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.tile,
        tileWidthStyle,
        compact && styles.tileCompact,
        dense && styles.tileDense,
        !compact && Platform.OS !== "web" && styles.tileNative,
        danger && styles.tileDanger,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.tileInner}>
        <View style={styles.iconWrap}>
          <MenuIcon name={icon} size={iconSize} color="#9ec4e9" warn={warn} />
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
  const layout = useResponsiveLayout();
  const { logout, role, user, changePassword, syncRoleFromUsersSheet, booting } = useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const colaborador = isColaborador(role);
  const administracion = isAdministracion(role);
  const canApproveSheets = canApproveExpenseSheets(role);
  const canSolicitudesResp = canManageResponsableSolicitudes(role);
  const canWorkbench = canAccessWorkbench(role);
  const canApproveUse = canApproveRequests(role);

  useFocusEffect(
    useCallback(() => {
      syncRoleFromUsersSheet?.();
      refreshPendingCounts_();
    }, [syncRoleFromUsersSheet, user?.email, role])
  );

  const [outboxCount, setOutboxCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState("");
  const [pendingUseCount, setPendingUseCount] = useState(0);
  const [pendingEscalationCount, setPendingEscalationCount] = useState(0);
  const [pendingSheetsCount, setPendingSheetsCount] = useState(0);
  const [workbenchTotal, setWorkbenchTotal] = useState(0);
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

  async function refreshPendingCounts_() {
    try {
      await refreshOutboxState_();
      const wb = await loadPendingWorkbench({ userEmail: user?.email, role });
      setPendingUseCount(wb.useRequests?.count || 0);
      setPendingEscalationCount(wb.useRequests?.escalationCount || 0);
      setPendingSheetsCount(wb.sheets?.count || 0);
      setWorkbenchTotal(wb.totalActionable || 0);
    } catch {
      // mantener últimos valores
    }
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
        if (alive) await refreshPendingCounts_();
      } catch {
        // silent
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, role]);

  const { syncNow: runSync } = useSyncActions();

  const syncNow = useCallback(async () => {
    try {
      const res = await runSync({
        onComplete: async () => {
          await refreshPendingCounts_();
        },
      });
      await showSyncResultAlert(res);
    } catch (e) {
      Alert.alert("Error de sincronización", e?.message || "No se pudo sincronizar.");
    }
  }, [runSync, role, user?.email]);

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

  const handleLogout = useCallback(async () => {
    const msgConfirm =
      "Antes de salir se sincronizarán tus gastos y hojas con el servidor. Al volver a entrar, la app cargará solo lo del Sheet.\n\n¿Salir?";
    const confirmFirst =
      Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(msgConfirm)
        : await new Promise((resolve) => {
            Alert.alert("Salir", msgConfirm.replace(/\n\n¿Salir\?$/, ""), [
              { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
              { text: "Salir", style: "destructive", onPress: () => resolve(true) },
            ]);
          });
    if (!confirmFirst) return;

    const askForce = async (title, body) => {
      if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
        return window.confirm(`${title}\n\n${body}\n\n¿Salir igual?`);
      }
      return new Promise((resolve) => {
        Alert.alert(title, body, [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Salir igual", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    };

    try {
      const r = await logout();
      if (r?.needsConfirm) {
        const errHint = r.syncError ? `\n\nDetalle: ${r.syncError}` : "";
        const ok = await askForce(
          "Pendientes sin enviar",
          `Quedan ${r.remaining} elemento(s) sin sincronizar.${errHint}\n\nSi sales ahora, al volver a entrar solo verás lo del Sheet y se perderán esos pendientes.`
        );
        if (ok) await logout({ force: true });
      }
    } catch (e) {
      const ok = await askForce("Error al salir", e?.message || "No se pudo cerrar la sesión.");
      if (ok) await logout({ force: true });
    }
  }, [logout]);

  const usoApp = isUsoRuntime();

  const tiles = useMemo(() => {
    const out = [];
    const add = (id, label, icon, onPress, opts = {}) => out.push({ id, label, icon, onPress, ...opts });

    // RESERVAS-AUTOS / gestiflota-uso: SOLO comandos de uso de vehículos.
    // Gastos, informes, usuarios, destinos, rol responsable, etc. viven solo en GESTIFLOTA.
    if (usoApp) {
      if (canAccessVehicleModule(role)) {
        add("veh", "Vehículos", "car-outline", () => navigation.navigate("Vehiculos"));
      }
      {
        const useBadge =
          canApproveUse && gestor && pendingEscalationCount > 0
            ? pendingEscalationCount
            : canApproveUse
              ? pendingUseCount
              : 0;
        add("uso", "Solicitudes y calendario", "calendar-range", () => navigation.navigate("Solicitudes"), {
          badge: useBadge,
          warn: gestor && pendingEscalationCount > 0,
          accessibilityLabel:
            canApproveUse && useBadge > 0
              ? gestor && pendingEscalationCount > 0
                ? `Solicitudes y calendario, ${pendingEscalationCount} solicitudes escaladas`
                : `Solicitudes y calendario, ${pendingUseCount} solicitudes pendientes`
              : "Solicitudes y calendario",
        });
      }
      if (colaborador) {
        add("perfil_colab", "Mis datos colaborador", "account-edit-outline", () => navigation.navigate("PerfilColaborador"));
      } else if (!administracion && (isUsuario(role) || isResponsable(role) || gestor)) {
        add("perfil_colab", "Mis datos", "account-edit-outline", () => navigation.navigate("PerfilColaborador"));
      }
      add("sync", "Sincronizar", "cloud-sync-outline", syncNow, {
        badge: outboxCount,
        warn: !!lastSyncError,
        accessibilityLabel:
          outboxCount > 0
            ? `Sincronizar, ${outboxCount} pendientes${lastSyncError ? ". Hubo error previo." : ""}`
            : "Sincronizar con el Sheet",
      });
      if (Platform.OS === "web" && FULL_WEB_URL) {
        add("gestiflota", "Abrir GESTIFLOTA", "open-in-new", () => {
          Linking.openURL(FULL_WEB_URL).catch(() => {
            Alert.alert("No se pudo abrir", FULL_WEB_URL);
          });
        });
      }
      add("incid", "Incidencias", "message-alert-outline", () => navigation.navigate("IncidenciaSugerencia"));
      add("help", "Ayuda", "help-circle-outline", () => navigation.navigate("Ayuda"));
      add("pwd", "Contraseña", "lock-outline", () => setPwdModal(true));
      add("out", "Salir", "logout-variant", handleLogout, { danger: true });
      return out;
    }

    if (canAccessVehicleModule(role)) add("veh", "Vehículos", "car-outline", () => navigation.navigate("Vehiculos"));

    if (canWorkbench) {
      add("bandeja", "Mi bandeja", "inbox-outline", () => navigation.navigate("Bandeja"), {
        badge: workbenchTotal,
        accessibilityLabel:
          workbenchTotal > 0 ? `Mi bandeja, ${workbenchTotal} pendientes` : "Mi bandeja de pendientes",
      });
    }

    if (canAccessFieldExpenseOps(role)) {
      add("gasto", "Gastos", "cash-multiple", async () => {
        try {
          await localDb.setExpensesDraft(null);
        } catch {
          // silent
        }
        navigation.navigate("Gasto");
      });
      add("gasto_edit", "Editar gastos", "file-edit-outline", () => navigation.navigate("GastosEditar"));
      add("hist", colaborador ? "Mis gastos" : "Historial", "history", () => navigation.navigate("Historial"));
      add("hojas", "Hojas gasto", "file-document-outline", () => navigation.navigate("HojasGasto"));
      if (canImportExpenseSheetExcel(role)) {
        add("import_excel", "Importar Excel", "file-upload-outline", () => navigation.navigate("ImportarHojaExcel"));
      }
    }
    if (canAccessMaintenance(role)) add("mant", "Mantenimiento", "wrench-outline", () => navigation.navigate("Mantenimiento"));
    {
      const useBadge =
        canApproveUse && gestor && pendingEscalationCount > 0 ? pendingEscalationCount : canApproveUse ? pendingUseCount : 0;
      add("uso", "Uso vehículos", "calendar-range", () => navigation.navigate("Solicitudes"), {
        badge: useBadge,
        warn: gestor && pendingEscalationCount > 0,
        accessibilityLabel:
          canApproveUse && useBadge > 0
            ? gestor && pendingEscalationCount > 0
              ? `Uso vehículos, ${pendingEscalationCount} solicitudes escaladas`
              : `Uso vehículos, ${pendingUseCount} solicitudes pendientes`
            : "Uso vehículos",
      });
      if (Platform.OS === "web" && USO_WEB_URL) {
        add("uso_web", "Uso (web aparte)", "open-in-new", () => {
          Linking.openURL(USO_WEB_URL).catch(() => {
            Alert.alert("No se pudo abrir", USO_WEB_URL);
          });
        });
      }
    }

    if (canAccessTripsModule(role)) add("veh_prop", "Grabar viajes", "car-estate", () => navigation.navigate("VehiculoPropio"));

    if (canAccessManagementReports(role)) {
      add("informe", "Informe mensual", "chart-bar", () => navigation.navigate("InformeMensual"));
    }
    if (canAccessKmFleetReport(role)) {
      add("informe_km", "Informe km flota", "speedometer", () => navigation.navigate("InformeKmFlota"));
    }
    if (canApproveSheets) {
      add("aprob", "Aprobaciones", "clipboard-check-outline", () => navigation.navigate("Aprobaciones"), {
        badge: pendingSheetsCount,
        accessibilityLabel:
          pendingSheetsCount > 0
            ? `Aprobaciones, ${pendingSheetsCount} hojas pendientes`
            : "Aprobaciones de hojas de gasto",
      });
    }
    if (canManageUsers(role)) {
      add("users", "Usuarios", "account-group-outline", () => navigation.navigate("Usuarios"));
    }
    if (canSolicitudesResp) {
      add("solresp", "Rol responsable", "account-arrow-up-outline", () => navigation.navigate("SolicitudesResponsable"));
    }
    if (canAccessDestinos(role)) {
      add("dest", "Destinos", "folder-cog-outline", () => navigation.navigate("Destinos"));
    }
    if (colaborador) {
      add("perfil_colab", "Mis datos colaborador", "account-edit-outline", () => navigation.navigate("PerfilColaborador"));
    } else if (!administracion && (isUsuario(role) || isResponsable(role) || gestor)) {
      add("perfil_colab", "Mis datos", "account-edit-outline", () => navigation.navigate("PerfilColaborador"));
    }

    if (canAccessFieldExpenseOps(role) || gestor || responsable) {
      add("sync", "Sincronizar", "cloud-sync-outline", syncNow, {
        badge: outboxCount,
        warn: !!lastSyncError,
        accessibilityLabel:
          outboxCount > 0
            ? `Sincronizar, ${outboxCount} pendientes${lastSyncError ? ". Hubo error previo." : ""}`
            : "Sincronizar pendientes",
      });
    }

    add("incid", "Incidencias", "message-alert-outline", () => navigation.navigate("IncidenciaSugerencia"));
    add("help", "Ayuda", "help-circle-outline", () => navigation.navigate("Ayuda"));
    add("pwd", "Contraseña", "lock-outline", () => setPwdModal(true));
    add("out", "Salir", "logout-variant", handleLogout, { danger: true });

    return out;
  }, [
    administracion,
    canApproveSheets,
    canApproveUse,
    canSolicitudesResp,
    canWorkbench,
    colaborador,
    gestor,
    navigation,
    outboxCount,
    lastSyncError,
    pendingSheetsCount,
    pendingEscalationCount,
    pendingUseCount,
    workbenchTotal,
    handleLogout,
    responsable,
    role,
    syncNow,
    usoApp,
  ]);

  const numCols = useMemo(() => {
    if (Platform.OS === "web") return 4;
    if (usoApp) return layout.usoMenuCols;
    const n = tiles.length;
    let base = 4;
    if (!(winH < 620 || n >= 14 || n > 9 || winW < 360)) base = 3;
    if (winH < 620 || n >= 14) base = 4;
    if (n > 9 || winW < 360) base = 4;
    return Math.min(8, base * 2);
  }, [tiles.length, winH, winW, layout.usoMenuCols, usoApp]);

  const denseTiles = tiles.length >= 12;
  const cellPct = `${100 / numCols}%`;

  const emailShort = String(user?.email || "").trim();
  const appVersion = getInstalledAppVersion();
  const { forceRefresh } = useApkUpdateActions();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const onCheckUpdate = useCallback(async () => {
    if (Platform.OS === "web" || checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const remote = await fetchRemoteApkVersion();
      const remoteV = String(remote?.version || "").trim();
      const next = await forceRefresh();
      if (next) return;
      if (remoteV && isRemoteVersionNewer(appVersion, remoteV)) {
        Alert.alert(
          "Actualización disponible",
          `En el dispositivo: v${appVersion}\nÚltima publicada: v${remoteV}\n\nSi no ve el aviso abajo, pulse Descargar.`,
          [
            { text: "Cerrar", style: "cancel" },
            {
              text: "Descargar",
              onPress: () => {
                openApkDownloadInBrowser(remote.downloadUrl).catch((e) => {
                  Alert.alert("Error", String(e?.message || "No se pudo abrir el enlace."));
                });
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        "Actualizaciones",
        remoteV
          ? `En el dispositivo: v${appVersion}\nÚltima publicada: v${remoteV}\n\nYa tiene la versión más reciente.`
          : `En el dispositivo: v${appVersion}\n\nNo se pudo leer la versión publicada.`
      );
    } catch {
      Alert.alert("Actualizaciones", "No se pudo comprobar. Revisa la conexión a internet.");
    } finally {
      setCheckingUpdate(false);
    }
  }, [appVersion, checkingUpdate, forceRefresh]);

  if (booting || !role) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={[styles.root, styles.loadingRoot]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Cargando menú...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <Text style={styles.brand} maxFontSizeMultiplier={2}>
            {APP_BRAND}
          </Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText} maxFontSizeMultiplier={1.9}>
              {roleLabel(role)}
            </Text>
          </View>
        </View>
        {appVersion ? (
          Platform.OS === "web" ? (
            <Text style={styles.versionLine} maxFontSizeMultiplier={1.8}>
              v{appVersion}
            </Text>
          ) : (
            <Pressable onPress={onCheckUpdate} accessibilityRole="button" accessibilityLabel="Comprobar actualización">
              <Text style={styles.versionLine} maxFontSizeMultiplier={1.8}>
                v{appVersion}
                {checkingUpdate ? " · comprobando..." : " · toca para buscar actualización"}
              </Text>
            </Pressable>
          )
        ) : null}
        {emailShort ? (
          <Text style={styles.emailLine} numberOfLines={1} maxFontSizeMultiplier={1.9}>
            {emailShort}
          </Text>
        ) : null}
        {usoApp ? (
          <Text style={styles.emailLine} maxFontSizeMultiplier={1.9}>
            RESERVAS-AUTOS · solicitudes y calendario de vehículos
          </Text>
        ) : null}

        <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuScrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, usoApp ? layout.menuGridStyle : null]}>
          {tiles.map((t) => (
            <View key={t.id} style={[styles.gridCell, { width: cellPct }, usoApp && layout.isWeb ? styles.gridCellUso : null]}>
              <MenuTile
                icon={t.icon}
                label={t.label}
                onPress={t.onPress}
                badge={t.badge}
                warn={t.warn}
                danger={t.danger}
                dense={denseTiles}
                compact={usoApp && layout.isWeb}
                tileWidthStyle={usoApp ? layout.menuTileWidthStyle : null}
                accessibilityLabel={t.accessibilityLabel}
              />
            </View>
          ))}
        </View>
        </ScrollView>
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
                <Text style={styles.modalBtnPrimaryText}>{pwdBusy ? "..." : "Guardar"}</Text>
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
  loadingRoot: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: theme.colors.subtext, fontWeight: "700", fontSize: 14 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  brand: { color: theme.colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 0.5 },
  versionLine: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
    paddingHorizontal: 2,
  },
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
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, alignContent: "flex-start" },
  menuScroll: { flex: 1 },
  menuScrollContent: { flexGrow: 1, paddingBottom: 12 },
  gridUso: { width: "75%", alignSelf: "center", flex: 0, justifyContent: "center" },
  gridCell: {
    padding: 3,
    ...Platform.select({
      web: { paddingVertical: 6, paddingHorizontal: 3 },
      default: {},
    }),
  },
  gridCellUso: { alignItems: "center" },
  tile: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 74,
    justifyContent: "center",
    ...Platform.select({
      web: { minHeight: 148 },
      android: { elevation: 1 },
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 1 },
    }),
  },
  tileNative: { minHeight: 88 },
  tileCompact: { width: "75%" },
  tileDense: {
    minHeight: 62,
    paddingVertical: 0,
    ...Platform.select({
      web: { minHeight: 124 },
      default: {},
    }),
  },
  tileDanger: { borderColor: "rgba(201,110,110,0.55)" },
  tilePressed: { backgroundColor: "#112a45" },
  tileInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...Platform.select({
      web: { paddingVertical: 16 },
      default: {},
    }),
  },
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
    fontFamily: "Arial",
    fontSize: Platform.OS === "web" ? 15 : 12,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: Platform.OS === "web" ? 20 : 16,
  },
  tileLabelDense: {
    fontSize: Platform.OS === "web" ? 15 : 12,
    lineHeight: Platform.OS === "web" ? 18 : 14,
    fontFamily: "Arial",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...Platform.select({
      web: {
        width: "50%",
        maxWidth: 520,
        maxHeight: "50%",
        alignSelf: "center",
        overflow: "auto",
      },
      default: { width: "100%" },
    }),
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
