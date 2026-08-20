import React, { useCallback, useContext, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import {
  buildYearOptions_,
  currentPeriod_,
  estadoLabel_,
  fetchInformeGobiernoMensual,
  formatHorasMedia_,
  MESES_ES,
  parseInformeGobierno_,
} from "../lib/gobiernoMensual";
import { SelectField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

function Header({ onBack, onRefresh, refreshing }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Informe mensual</Text>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
        <Pressable style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          <Text style={styles.syncText}>{refreshing ? "…" : "Refrescar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatRow({ label, value, hint }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export default function GobiernoMensualScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const initial = currentPeriod_();
  const [anio, setAnio] = useState(String(initial.anio));
  const [mes, setMes] = useState(initial.mes);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [informe, setInforme] = useState(null);

  const yearOptions = useMemo(() => buildYearOptions_(4), []);
  const mesOptions = useMemo(
    () => MESES_ES.map((m) => ({ value: m.value, label: m.label.toUpperCase() })),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchInformeGobiernoMensual(user?.email, anio, mes);
      setInforme(parseInformeGobierno_(res));
    } catch (e) {
      setInforme(null);
      setError(e?.message || "No se pudo cargar el informe.");
    } finally {
      setLoading(false);
    }
  }, [anio, mes, user?.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const estadosOrdenados = useMemo(() => {
    if (!informe?.hojas_por_estado) return [];
    return Object.keys(informe.hojas_por_estado).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }, [informe]);

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} onRefresh={load} refreshing={loading} />

      <View style={styles.filtersCard}>
        <SelectField label="Año" value={anio} onChange={setAnio} options={yearOptions} />
        <SelectField label="Mes" value={mes} onChange={setMes} options={mesOptions} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Cargando informe…</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && informe ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {informe.periodo?.etiqueta || `${mes}/${anio}`}
            </Text>
            {informe.generado_en ? (
              <Text style={styles.summaryMeta}>Generado: {informe.generado_en.replace("T", " ")}</Text>
            ) : null}
          </View>

          <Section title="Hojas de gasto por estado">
            <Text style={styles.criterio}>{informe.criterios?.hojas_por_estado}</Text>
            <StatRow label="Total hojas en el mes" value={String(informe.hojas_totales)} />
            {estadosOrdenados.length ? (
              estadosOrdenados.map((est) => (
                <StatRow
                  key={est}
                  label={estadoLabel_(est)}
                  value={String(informe.hojas_por_estado[est])}
                />
              ))
            ) : (
              <Text style={styles.emptyLine}>Sin hojas enviadas en este periodo.</Text>
            )}
          </Section>

          <Section title="Tiempo medio de aprobación">
            <Text style={styles.criterio}>{informe.criterios?.tiempo_aprobacion}</Text>
            <StatRow
              label="Media"
              value={formatHorasMedia_(informe.tiempo_aprobacion?.horas_media)}
            />
            <StatRow
              label="Hojas aprobadas analizadas"
              value={String(informe.tiempo_aprobacion?.muestras || 0)}
            />
          </Section>

          <Section title="Gastos sin hoja">
            <Text style={styles.criterio}>{informe.criterios?.gastos_sin_hoja}</Text>
            <StatRow label="Total líneas sin hoja" value={String(informe.gastos_sin_hoja_totales)} />
            {informe.gastos_sin_hoja.length ? (
              informe.gastos_sin_hoja.map((row) => (
                <View key={row.email} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>
                    {row.nombre || row.email}
                  </Text>
                  <Text style={styles.listItemSub}>
                    {row.email} · {row.gastos_count} gasto(s)
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyLine}>Ningún gasto suelto en el mes.</Text>
            )}
          </Section>

          <Section title="Vehículos sin responsable activo">
            <Text style={styles.criterio}>{informe.criterios?.vehiculos_sin_responsable}</Text>
            <StatRow
              label="Vehículos afectados"
              value={String(informe.vehiculos_sin_responsable_count)}
            />
            {informe.vehiculos_sin_responsable.length ? (
              informe.vehiculos_sin_responsable.map((v) => (
                <View key={v.matricula} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>{v.matricula}</Text>
                  <Text style={styles.listItemSub}>
                    Resp.: {v.responsable || "—"} · Notif.: {v.email_notificaciones || "—"}
                  </Text>
                  {v.departamento_o_proyecto ? (
                    <Text style={styles.listItemSub}>{v.departamento_o_proyecto}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyLine}>Todos los vehículos activos tienen responsable válido.</Text>
            )}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 14, paddingBottom: 28, gap: 10 },
  header: { marginBottom: 4 },
  title: { color: "#e8f5ff", fontSize: 22, fontWeight: "800" },
  headerRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  backBtn: {
    backgroundColor: "#12324f",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#2a5f8f",
  },
  backText: { color: "#9ec4e9", fontWeight: "700" },
  syncBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  syncText: { color: "#fff", fontWeight: "800" },
  filtersCard: {
    backgroundColor: "#0d2238",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1f4068",
  },
  loadingBox: { alignItems: "center", padding: 24, gap: 10 },
  loadingText: { color: "#9ec4e9" },
  errorCard: {
    backgroundColor: "#4a1f1f",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#8b3a3a",
  },
  errorText: { color: "#ffc8c8", fontWeight: "700" },
  summaryCard: {
    backgroundColor: "#102a45",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a5f8f",
  },
  summaryTitle: { color: "#e8f5ff", fontSize: 18, fontWeight: "800", textTransform: "capitalize" },
  summaryMeta: { color: "#9ec4e9", fontSize: 11, marginTop: 4 },
  card: {
    backgroundColor: "#0d2238",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f4068",
    gap: 6,
  },
  sectionTitle: { color: "#e8f5ff", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  criterio: { color: "#7fa8cc", fontSize: 11, marginBottom: 6, lineHeight: 16 },
  statRow: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#1a3555" },
  statLabel: { color: "#9ec4e9", fontSize: 12, fontWeight: "600" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 2 },
  statHint: { color: "#7fa8cc", fontSize: 10, marginTop: 2 },
  listItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a3555",
  },
  listItemTitle: { color: "#e8f5ff", fontWeight: "800", fontSize: 14 },
  listItemSub: { color: "#9ec4e9", fontSize: 12, marginTop: 2 },
  emptyLine: { color: "#7fa8cc", fontStyle: "italic", marginTop: 4 },
});
