import React, { useCallback, useContext, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import {
  canAccessExpenseSheetApprovals,
  canAccessFieldExpenseOps,
  canApproveRequests,
  isGestor,
  isResponsable,
} from "../auth/roles";
import { loadPendingWorkbench } from "../lib/pendingWorkbench";
import { slaBadgeColors_ } from "../lib/solicitudSla";
import { useSyncActions } from "../context/SyncContext";
import { showSyncResultAlert } from "../lib/syncFeedback";
import { formatDateEsValue } from "../../flotaWeb/lib/format";
import { theme } from "../ui/theme";

function Header({ onBack, onSync }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Mi bandeja</Text>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
        <Pressable style={styles.syncBtn} onPress={onSync}>
          <Text style={styles.syncText}>Sincronizar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, count, children, onOpen, openLabel }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count > 0 ? (
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {children}
      {onOpen ? (
        <Pressable style={styles.openBtn} onPress={onOpen}>
          <Text style={styles.openBtnText}>{openLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function WorkbenchScreen({ navigation }) {
  const { user, role } = useContext(AuthContext);
  const { syncNow } = useSyncActions();
  const responsable = isResponsable(role);
  const gestor = isGestor(role);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadPendingWorkbench({ userEmail: user?.email, role });
      setData(next);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [role, user?.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSync = async () => {
    const res = await syncNow({
      onComplete: async () => {
        await load();
      },
    });
    await showSyncResultAlert(res);
  };

  const me = String(user?.email || "")
    .trim()
    .toLowerCase();

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} onSync={handleSync} />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Cargando pendientes…</Text>
        </View>
      ) : null}

      {!loading && data ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen</Text>
            <Text style={styles.summaryLine}>
              {data.totalActionable > 0
                ? `${data.totalActionable} tarea(s) pendiente(s) de tu acción`
                : "Sin tareas pendientes de tu acción"}
            </Text>
          </View>

          <Section
            title="Sincronización"
            count={data.sync.count}
            onOpen={
              canAccessFieldExpenseOps(role) ? () => navigation.navigate("GastosEditar") : undefined
            }
            openLabel={canAccessFieldExpenseOps(role) ? "Ir a editar gastos" : undefined}
          >
            {data.sync.count === 0 ? (
              <Text style={styles.empty}>Cola de envío vacía.</Text>
            ) : (
              data.sync.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemText}>{item.summary}</Text>
                </View>
              ))
            )}
          </Section>

          {canApproveRequests(role) ? (
            <Section
              title="Uso de vehículos"
              count={data.useRequests.count}
              onOpen={() => navigation.navigate("Solicitudes")}
              openLabel="Ir a uso de vehículos"
            >
              {gestor && data.useRequests.escalationCount > 0 ? (
                <View style={styles.escalationBanner}>
                  <Text style={styles.escalationBannerText}>
                    {data.useRequests.escalationCount} solicitud(es) escalada(s) — sin responsable activo o más de 48h en PENDIENTE
                  </Text>
                </View>
              ) : null}
              {data.useRequests.error ? (
                <Text style={styles.empty}>No se pudieron cargar solicitudes.</Text>
              ) : data.useRequests.count === 0 ? (
                <Text style={styles.empty}>Sin solicitudes pendientes de aprobación.</Text>
              ) : (
                data.useRequests.items.map((item) => {
                  const slaColors = item.sla?.level ? slaBadgeColors_(item.sla.level) : null;
                  return (
                  <View key={item.id_solicitud || `${item.matricula}-${item.fecha_inicio}`} style={styles.itemRow}>
                    <View style={styles.itemHeadRow}>
                      <Text style={[styles.itemTitle, styles.flex1]}>
                        {item.matricula} · {item.trabajador_nombre || item.trabajador_email}
                      </Text>
                      {item.sla?.label && slaColors ? (
                        <View style={[styles.slaChip, slaColors.badge]}>
                          <Text style={[styles.slaChipText, slaColors.text]}>{item.sla.label}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemSub}>
                      {formatDateEsValue(item.fecha_inicio)}
                      {item.fecha_fin ? ` → ${formatDateEsValue(item.fecha_fin)}` : ""}
                    </Text>
                    {item.motivo ? <Text style={styles.itemSub}>{item.motivo}</Text> : null}
                    {item.needsGestorEscalation ? (
                      <Text style={styles.escalationTag}>Escalado al gestor</Text>
                    ) : null}
                    {!item.vehicleHasActiveApprover ? (
                      <Text style={styles.warnTag}>Sin responsable activo</Text>
                    ) : null}
                  </View>
                  );
                })
              )}
            </Section>
          ) : null}

          {canAccessExpenseSheetApprovals(role) ? (
            <Section
              title="Hojas de gasto"
              count={data.sheets.count}
              onOpen={() => navigation.navigate("Aprobaciones")}
              openLabel="Ir a aprobaciones"
            >
              {data.sheets.error ? (
                <Text style={styles.empty}>No se pudieron cargar hojas.</Text>
              ) : data.sheets.count === 0 ? (
                <Text style={styles.empty}>Sin hojas pendientes de revisión.</Text>
              ) : (
                data.sheets.items.map((item) => {
                  const scope =
                    item.usuario_email === me ? "Propia" : responsable ? "Equipo" : "Usuario";
                  return (
                    <View key={item.hoja_gasto_id} style={styles.itemRow}>
                      <Text style={styles.itemTitle}>
                        {item.num_hoja_gasto || item.hoja_gasto_id} · {scope}
                      </Text>
                      <Text style={styles.itemSub}>
                        {item.usuario_nombre || item.usuario_email} · {item.hoja_gasto_estado} ·{" "}
                        {Number(item.hoja_gasto_total || 0).toFixed(2)} €
                      </Text>
                    </View>
                  );
                })
              )}
            </Section>
          ) : null}
        </>
      ) : null}

      {!loading && !data ? <Text style={styles.empty}>No se pudo cargar la bandeja.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 28 },
  header: { alignItems: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", gap: 10 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: {
    borderColor: "#4f88bf",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  syncBtn: {
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  syncText: { color: theme.colors.text, fontWeight: "900", fontSize: 12 },
  loadingBox: { alignItems: "center", paddingVertical: 24, gap: 10 },
  loadingText: { color: theme.colors.subtext, fontWeight: "700" },
  summaryCard: {
    backgroundColor: theme.colors.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  summaryTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 15, marginBottom: 4 },
  summaryLine: { color: theme.colors.subtext, fontSize: 13 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 15 },
  countChip: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 8,
    marginTop: 8,
  },
  itemTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 13 },
  itemSub: { color: theme.colors.subtext, fontSize: 12, marginTop: 3 },
  itemText: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  empty: { color: theme.colors.subtext, fontSize: 13 },
  openBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    alignItems: "center",
  },
  openBtnText: { color: "#b7ddff", fontWeight: "900", fontSize: 12 },
  flex1: { flex: 1 },
  escalationBanner: {
    backgroundColor: "#5a2a2a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d06b6b",
    padding: 10,
    marginBottom: 8,
  },
  escalationBannerText: { color: "#ffc8c8", fontWeight: "800", fontSize: 12 },
  itemHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  slaChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  slaChipText: { fontWeight: "900", fontSize: 10 },
  escalationTag: { color: "#ffc8c8", fontWeight: "800", fontSize: 11, marginTop: 4 },
  warnTag: { color: "#ffe0a8", fontWeight: "700", fontSize: 11, marginTop: 2 },
});
