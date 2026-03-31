import React, { useContext, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const { logout, role, user } = useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const canApprove = canApproveRequests(role);
  const [outboxCount, setOutboxCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState("");

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
      <MenuCard
        title="Destinos corporativos"
        subtitle={gestor ? "Carpeta Drive/Sheet por defecto y destino personal opcional." : "Consulta de destinos configurados por administración."}
        onPress={() => navigation.navigate("Destinos")}
      />
      <MenuCard
        title={`Sincronizar pendientes (${outboxCount})`}
        subtitle={lastSyncError ? `Último error: ${lastSyncError}` : "Forzar envío de registros locales al Sheet."}
        onPress={syncNow}
      />

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

