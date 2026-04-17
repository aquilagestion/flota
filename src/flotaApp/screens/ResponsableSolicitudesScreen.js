import React, { useCallback, useContext, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { canManageResponsableSolicitudes } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { TextField } from "../ui/form/Fields";

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Solicitudes RESPONSABLE</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function matriculaOf_(v) {
  return String(v?.matricula ?? v?.Matricula ?? "").trim().toUpperCase();
}

function parseSolicitud_(x) {
  return {
    id_solicitud: String(x?.id_solicitud || "").trim(),
    email: String(x?.email || "").trim().toLowerCase(),
    nombre: String(x?.nombre || "").trim(),
    estado: String(x?.estado || "").trim().toUpperCase(),
    fecha_solicitud: String(x?.fecha_solicitud || "").trim(),
  };
}

export default function ResponsableSolicitudesScreen({ navigation }) {
  const { role, user } = useContext(AuthContext);
  const allowed = canManageResponsableSolicitudes(role);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [plates, setPlates] = useState([]);
  const [selectionById, setSelectionById] = useState({});
  const [commentById, setCommentById] = useState({});
  const [busyId, setBusyId] = useState("");

  const loadVehicles = useCallback(async () => {
    try {
      const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
      const list = asList_(res);
      const mats = list.map(matriculaOf_).filter(Boolean);
      mats.sort();
      setPlates(mats);
    } catch {
      setPlates([]);
    }
  }, [user?.email]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sheetsApi.get("solicitudes_responsable_list", {
        estado: "PENDIENTE",
        user_email: user?.email || "",
      });
      setItems(asList_(res).map(parseSolicitud_).filter((s) => s.id_solicitud && s.email));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  React.useEffect(() => {
    if (!allowed) return;
    loadVehicles();
    load();
  }, [allowed, load, loadVehicles]);

  const togglePlate = useCallback((solicitudId, plate) => {
    setSelectionById((prev) => {
      const cur = new Set(prev[solicitudId] || []);
      if (cur.has(plate)) cur.delete(plate);
      else cur.add(plate);
      return { ...prev, [solicitudId]: Array.from(cur) };
    });
  }, []);

  const resolve = useCallback(
    async (row, estado) => {
      const sid = row.id_solicitud;
      if (!sid) return;
      const selected = selectionById[sid] || [];
      if (estado === "APROBADA" && !selected.length) {
        Alert.alert("Matrículas", "Selecciona al menos un vehículo para asignar al responsable.");
        return;
      }
      const comentario = String(commentById[sid] || "").trim();
      setBusyId(sid);
      try {
        await sheetsApi.post(
          "solicitud_responsable_resolver",
          {
            id_solicitud: sid,
            estado,
            vehiculos_asignados: selected,
            comentario,
          },
          { user_email: user?.email || "" }
        );
        setSelectionById((p) => {
          const n = { ...p };
          delete n[sid];
          return n;
        });
        setCommentById((p) => {
          const n = { ...p };
          delete n[sid];
          return n;
        });
        await load();
        Alert.alert("Listo", estado === "APROBADA" ? "Solicitud aprobada y FLOTA/USUARIOS actualizados." : "Solicitud rechazada.");
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo resolver la solicitud.");
      } finally {
        setBusyId("");
      }
    },
    [commentById, load, selectionById, user?.email]
  );

  if (!allowed) {
    return (
      <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
        <Header onBack={() => navigation.navigate("Menu")} />
        <View style={styles.card}>
          <Text style={styles.message}>Solo GESTOR o ADMINISTRACIÓN pueden gestionar estas solicitudes.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      <View style={styles.card}>
        <Text style={styles.message}>Aprueba el rol RESPONSABLE y asigna vehículos en FLOTA (responsable y e-mail de notificaciones).</Text>
        <Pressable style={styles.buttonSecondary} onPress={() => { load(); loadVehicles(); }} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Cargando..." : "Recargar"}</Text>
        </Pressable>
      </View>

      {loading && !items.length ? (
        <ActivityIndicator color={theme.colors.text} style={{ marginVertical: 20 }} />
      ) : null}

      {items.map((row) => {
        const selected = new Set(selectionById[row.id_solicitud] || []);
        return (
          <View key={row.id_solicitud} style={styles.card}>
            <Text style={styles.sectionTitle}>{row.nombre || row.email}</Text>
            <Text style={styles.message}>Email: {row.email}</Text>
            <Text style={styles.message}>ID: {row.id_solicitud}</Text>
            <Text style={styles.message}>Fecha solicitud: {row.fecha_solicitud || "—"}</Text>
            <Text style={styles.subLabel}>Vehículos a asignar (toca para marcar)</Text>
            <View style={styles.chipWrap}>
              {plates.map((p) => {
                const on = selected.has(p);
                return (
                  <Pressable
                    key={`${row.id_solicitud}-${p}`}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => togglePlate(row.id_solicitud, p)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!plates.length ? <Text style={styles.message}>No hay matrículas en FLOTA o no se pudo cargar flota_list.</Text> : null}
            <TextField
              label="Comentario (opcional)"
              value={commentById[row.id_solicitud] || ""}
              onChangeText={(t) => setCommentById((prev) => ({ ...prev, [row.id_solicitud]: t }))}
              placeholder="Visible en el correo al solicitante"
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.button, busyId === row.id_solicitud && styles.buttonDisabled]}
                disabled={!!busyId}
                onPress={() => resolve(row, "APROBADA")}
              >
                <Text style={styles.buttonText}>{busyId === row.id_solicitud ? "…" : "Aprobar"}</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonDanger, busyId === row.id_solicitud && styles.buttonDisabled]}
                disabled={!!busyId}
                onPress={() => resolve(row, "RECHAZADA")}
              >
                <Text style={styles.buttonText}>{busyId === row.id_solicitud ? "…" : "Rechazar"}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {!loading && !items.length ? (
        <View style={styles.card}>
          <Text style={styles.message}>No hay solicitudes pendientes.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  subLabel: { color: theme.colors.text, fontWeight: "700", fontSize: 13, marginTop: 10, marginBottom: 6 },
  message: { color: theme.colors.subtext, marginBottom: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card2 },
  chipOn: { borderColor: theme.colors.primary, backgroundColor: "#1a3d5c" },
  chipStatic: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  chipText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 12 },
  chipTextOn: { color: theme.colors.text },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonDanger: { flex: 1, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 12, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 8, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 13 },
});
