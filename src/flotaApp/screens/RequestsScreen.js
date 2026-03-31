import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { canApproveRequests, isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Solicitudes de uso</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function normalizeEstado_(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (s === "APROBADA" || s === "RECHAZADA" || s === "PENDIENTE" || s === "CANCELADA") return s;
  return "PENDIENTE";
}

function parseItem_(x) {
  return {
    id_solicitud: String(x?.id_solicitud || x?.id || "").trim(),
    estado: normalizeEstado_(x?.estado || ""),
    matricula: String(x?.matricula || "").trim(),
    trabajador_email: String(x?.trabajador_email || x?.usuario_email || "").trim().toLowerCase(),
    fecha_desde: String(x?.fecha_desde || "").trim(),
    fecha_hasta: String(x?.fecha_hasta || "").trim(),
    motivo: String(x?.motivo || "").trim(),
  };
}

function parseDateFlexible_(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rangesOverlap_(aStart, aEnd, bStart, bEnd) {
  const a0 = aStart?.getTime?.();
  const a1 = (aEnd || aStart)?.getTime?.();
  const b0 = bStart?.getTime?.();
  const b1 = (bEnd || bStart)?.getTime?.();
  if (![a0, a1, b0, b1].every((n) => typeof n === "number" && !Number.isNaN(n))) return false;
  return a0 <= b1 && b0 <= a1;
}

export default function RequestsScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const allowed = canApproveRequests(role);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const [estadoFiltro, setEstadoFiltro] = useState("PENDIENTE");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const byEstado = items.filter((x) => (estadoFiltro ? x.estado === estadoFiltro : true));
    if (!q) return byEstado;
    return byEstado.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [items, query, estadoFiltro]);

  const load = async () => {
    setLoading(true);
    try {
      let assignedNow = new Set();
      if (responsable && !gestor) {
        const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const flota = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
        const me = String(user?.email || "").trim().toLowerCase();
        const mine = flota.filter((v) => {
          const resp = String(v?.responsable || "").trim().toLowerCase();
          const notify = String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "")
            .trim()
            .toLowerCase();
          return !!me && (resp === me || notify === me);
        });
        assignedNow = new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
        setAssignedSet(assignedNow);
      } else {
        setAssignedSet(new Set());
      }

      const res = await sheetsApi.get("solicitud_list", {
        estado: estadoFiltro,
        trabajador_email: "",
        user_email: user?.email || "",
      });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      let next = rows.map(parseItem_);
      if (responsable && !gestor) {
        const me = String(user?.email || "").trim().toLowerCase();
        next = next.filter((s) => {
          const mat = String(s?.matricula || "").trim().toUpperCase();
          const owner = String(s?.trabajador_email || "").trim().toLowerCase();
          return assignedNow.has(mat) || owner === me;
        });
      }
      setItems(next);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar solicitudes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [estadoFiltro, user?.email, responsable, gestor]);

  const resolver = async (item, estado) => {
    if (!allowed) {
      Alert.alert("Permisos insuficientes", "Solo RESPONSABLE o GESTOR pueden resolver solicitudes.");
      return;
    }
    if (responsable && !gestor) {
      const mat = String(item?.matricula || "").trim().toUpperCase();
      if (!assignedSet.has(mat)) {
        Alert.alert("Permisos insuficientes", "Solo puedes resolver solicitudes de vehículos a tu cargo.");
        return;
      }
    }
    try {
      if (estado === "APROBADA") {
        const approvedRes = await sheetsApi.get("solicitud_list", {
          estado: "APROBADA",
          trabajador_email: "",
          user_email: user?.email || "",
        });
        const approvedRows = Array.isArray(approvedRes?.data) ? approvedRes.data : Array.isArray(approvedRes) ? approvedRes : [];
        const currentMat = String(item?.matricula || "").trim().toUpperCase();
        const itemStart = parseDateFlexible_(item?.fecha_desde);
        const itemEnd = parseDateFlexible_(item?.fecha_hasta);
        const conflict = approvedRows
          .map(parseItem_)
          .find((x) => {
            if (String(x?.id_solicitud || "") === String(item?.id_solicitud || "")) return false;
            if (String(x?.matricula || "").trim().toUpperCase() !== currentMat) return false;
            return rangesOverlap_(itemStart, itemEnd, parseDateFlexible_(x?.fecha_desde), parseDateFlexible_(x?.fecha_hasta));
          });
        if (conflict) {
          Alert.alert(
            "Solape detectado",
            `Ya existe una solicitud APROBADA para ${currentMat} en ese rango (${conflict.fecha_desde || "-"} → ${conflict.fecha_hasta || "-"})`
          );
          return;
        }
      }

      await sheetsApi.post(
        "solicitud_resolver",
        {
          id_solicitud: item.id_solicitud,
          estado: estado,
          resuelto_por_email: user?.email || "",
        },
        { user_email: user?.email || "" }
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo resolver la solicitud.");
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      {!allowed ? (
        <View style={styles.card}>
          <Text style={styles.message}>Solo RESPONSABLE o GESTOR pueden aprobar/rechazar solicitudes.</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <SelectField
          label="Estado"
          value={estadoFiltro}
          onChange={setEstadoFiltro}
          options={[
            { value: "PENDIENTE", label: "PENDIENTE" },
            { value: "APROBADA", label: "APROBADA" },
            { value: "RECHAZADA", label: "RECHAZADA" },
            { value: "CANCELADA", label: "CANCELADA" },
          ]}
        />
        <TextField label="Buscar" value={query} onChangeText={setQuery} placeholder="matrícula, email o motivo" />
        <Pressable style={styles.buttonSecondary} onPress={load}>
          <Text style={styles.buttonText}>Recargar</Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.message}>Cargando...</Text> : null}

      {filtered.map((x) => (
        <View key={x.id_solicitud || `${x.trabajador_email}-${x.matricula}-${x.fecha_desde}`} style={styles.card}>
          <Text style={styles.sectionTitle}>{x.matricula || "Sin matrícula"} · {x.estado}</Text>
          <Text style={styles.message}>{x.trabajador_email || "-"}</Text>
          <Text style={styles.message}>{x.fecha_desde || "-"} → {x.fecha_hasta || "-"}</Text>
          <Text style={styles.message}>{x.motivo || "-"}</Text>
          {allowed && x.estado === "PENDIENTE" ? (
            <View style={styles.row}>
              <Pressable style={styles.button} onPress={() => resolver(x, "APROBADA")}>
                <Text style={styles.buttonText}>Aprobar</Text>
              </Pressable>
              <Pressable style={styles.buttonDanger} onPress={() => resolver(x, "RECHAZADA")}>
                <Text style={styles.buttonText}>Rechazar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },
  message: { color: theme.colors.subtext, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
});
