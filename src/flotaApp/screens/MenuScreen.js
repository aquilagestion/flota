import React, { useContext, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { theme } from "../ui/theme";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import { canApproveRequests, isGestor, isResponsable, roleLabel } from "../auth/roles";
import { syncService } from "../sync/syncService";

function MenuCard({ title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.menuCard}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

export default function MenuScreen({ navigation }) {
  const { logout, role, user, changePassword } = useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const canApprove = canApproveRequests(role);
  const [outboxCount, setOutboxCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState("");
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

  const syncNow = async () => {
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
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !newPwd2) {
      Alert.alert("Datos incompletos", "Debes completar los 3 campos de contraseña.");
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert("Contraseña inválida", "La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPwd !== newPwd2) {
      Alert.alert("No coincide", "La confirmación no coincide con la nueva contraseña.");
      return;
    }
    if (currentPwd === newPwd) {
      Alert.alert("Sin cambios", "La nueva contraseña debe ser diferente a la actual.");
      return;
    }

    try {
      setPwdBusy(true);
      await changePassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setNewPwd2("");
      Alert.alert("Contraseña actualizada", "La nueva contraseña ya se guardó en USUARIOS.");
    } catch (e) {
      Alert.alert("No se pudo cambiar", e?.message || "Error inesperado al cambiar la contraseña.");
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>FLOTA</Text>
        <Text style={styles.subtitle}>Operativa de campo · Offline · Sin Google Forms</Text>
        <Text style={styles.badge}>Rol: {roleLabel(role)}</Text>
      </View>

      <Text style={styles.section}>Sección</Text>
      <MenuCard
        title="Vehículos"
        subtitle={gestor ? "Alta/consulta de vehículos." : "Consulta de vehículos y datos de flota."}
        onPress={() => navigation.navigate("Vehiculos")}
      />
      <MenuCard
        title="Introducción gastos"
        subtitle="Formulario real (seguro, impuestos, combustible, parking, etc.)."
        onPress={() => navigation.navigate("Gasto")}
      />
      <MenuCard title="Mantenimiento" subtitle="Registro operativo con fotos y kilometraje." onPress={() => navigation.navigate("Mantenimiento")} />
      <MenuCard
        title="Historial"
        subtitle={
          gestor
            ? "Timeline unificada por vehículo."
            : responsable
              ? "Tus registros + registros de vehículos a tu cargo."
              : "Tus registros grabados."
        }
        onPress={() => navigation.navigate("Historial")}
      />
      {canApprove ? (
        <MenuCard
          title="Solicitudes de uso"
          subtitle="Aprobar/rechazar solicitudes de uso de vehículos."
          onPress={() => navigation.navigate("Solicitudes")}
        />
      ) : null}
      {gestor ? (
        <MenuCard
          title="Usuarios y roles"
          subtitle="Autorizar responsables y activar/desactivar usuarios."
          onPress={() => navigation.navigate("Usuarios")}
        />
      ) : null}
      {gestor ? (
        <MenuCard
          title="Destinos corporativos"
          subtitle="Carpeta Drive/Sheet por defecto y destino personal opcional."
          onPress={() => navigation.navigate("Destinos")}
        />
      ) : null}
      <MenuCard
        title={`Sincronizar pendientes (${outboxCount})`}
        subtitle={lastSyncError ? `Último error: ${lastSyncError}` : "Forzar envío de registros locales al Sheet."}
        onPress={syncNow}
      />

      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>Cambiar contraseña</Text>
        <Text style={styles.menuSubtitle}>Actualiza tu contraseña en cualquier momento. Se guardará en USUARIOS.</Text>
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          secureTextEntry
          placeholder="Contraseña actual"
          placeholderTextColor={theme.colors.placeholder}
          value={currentPwd}
          onChangeText={setCurrentPwd}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Nueva contraseña"
          placeholderTextColor={theme.colors.placeholder}
          value={newPwd}
          onChangeText={setNewPwd}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Confirmar nueva contraseña"
          placeholderTextColor={theme.colors.placeholder}
          value={newPwd2}
          onChangeText={setNewPwd2}
        />
        <Pressable style={[styles.button, pwdBusy && styles.buttonDisabled]} onPress={handleChangePassword} disabled={pwdBusy}>
          <Text style={styles.buttonText}>{pwdBusy ? "Actualizando..." : "Guardar nueva contraseña"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 10 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  subtitle: { color: theme.colors.subtext, marginTop: 6 },
  badge: {
    marginTop: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "800",
    fontSize: 12,
  },
  section: { color: theme.colors.text, fontWeight: "800", marginTop: 12, marginBottom: 8, fontSize: 16 },
  menuCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 17, marginBottom: 3 },
  menuSubtitle: { color: theme.colors.subtext, fontSize: 13 },
  input: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  button: { marginTop: 2, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  logoutBtn: {
    marginTop: 8,
    alignSelf: "center",
    borderColor: "#c96e6e",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: { color: "#ffadad", fontWeight: "800", fontSize: 12 },
});

