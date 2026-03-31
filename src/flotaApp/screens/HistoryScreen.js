import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { collection, getDocs, query } from "firebase/firestore";
import { firestore } from "../firebase/firebase";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { AuthContext } from "../auth/AuthContext";
import { isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

function Header({ title, onBack, onSync }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
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

function normalizeEvent(kind, raw) {
  const date =
    raw?.createdAtLocal ||
    raw?.fecha_repostaje ||
    raw?.fecha ||
    raw?.fecha_peaje ||
    raw?.fecha_aparcamiento ||
    raw?.fecha_inspeccion ||
    raw?.fecha_otros_gastos ||
    raw?.fecha_compra_mantenimiento ||
    raw?.fecha_compra_repuestos ||
    "";
  return {
    id: raw.id || raw._id || `${kind}-${Math.random().toString(16).slice(2, 8)}`,
    kind,
    vehiclePlate: raw.vehiclePlate || raw.matricula || "",
    date,
    title: kind === "expense" ? `Gasto: ${raw.tipo_gasto || ""}` : "Mantenimiento",
    subtitle: kind === "expense" ? raw.proveedor_otros_gastos || raw.lugar_repostaje || raw.compania || "" : raw.tipo || "",
    raw,
  };
}

function parseSortDate_(value) {
  if (!value) return 0;
  if (value instanceof Date) return !isNaN(value.getTime()) ? value.getTime() : 0;

  const s = String(value).trim();
  if (!s) return 0;

  // dd/MM/yyyy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return !isNaN(d.getTime()) ? d.getTime() : 0;
  }

  // yyyy-MM-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return !isNaN(d.getTime()) ? d.getTime() : 0;
  }

  // ISO / fallback
  const d = new Date(s);
  return !isNaN(d.getTime()) ? d.getTime() : 0;
}

export default function HistoryScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const [vehicle, setVehicle] = useState("");
  const [vehicleOptions, setVehicleOptions] = useState([]);
  const [events, setEvents] = useState([]);
  const [assignedSet, setAssignedSet] = useState(new Set());

  const filterByOwner = (list = [], assignedOverride = null) => {
    if (gestor) return list;
    const me = String(user?.email || "").trim().toLowerCase();
    if (!me) return [];
    const assigned = assignedOverride || assignedSet;
    return list.filter((r) => {
      const owner = String(
        r?.responsable_email ||
          r?.usuario_email ||
          r?.user_email ||
          ""
      )
        .trim()
        .toLowerCase();
      if (owner === me) return true;
      if (responsable) {
        const mat = String(r?.matricula || r?.vehiclePlate || "").trim().toUpperCase();
        return assigned.has(mat);
      }
      return false;
    });
  };

  const load = async () => {
    let assignedNow = assignedSet;
    if (responsable && !gestor) {
      try {
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
      } catch {
        assignedNow = new Set();
        setAssignedSet(new Set());
      }
    } else {
      assignedNow = new Set();
      setAssignedSet(new Set());
    }

    const cachedVehicles = await localDb.getVehicles();
    setVehicleOptions(cachedVehicles.map((v) => v.matricula).filter(Boolean));

    const localExpenses = filterByOwner(await localDb.getExpenses(), assignedNow);
    const localMaint = filterByOwner(await localDb.getMaintenances(), assignedNow);
    setEvents([
      ...localExpenses.map((e) => normalizeEvent("expense", e)),
      ...localMaint.map((m) => normalizeEvent("maintenance", m)),
    ]);

    try {
      const [expensesSnap, maintSnap, vehiclesSnap] = await Promise.all([
        getDocs(query(collection(firestore, "expenses"))),
        getDocs(query(collection(firestore, "maintenances"))),
        getDocs(query(collection(firestore, "vehicles"))),
      ]);
      const expenses = filterByOwner(expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() })), assignedNow);
      const maint = filterByOwner(maintSnap.docs.map((d) => ({ id: d.id, ...d.data() })), assignedNow);
      const vehicles = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      await localDb.setVehicles(vehicles);
      await localDb.setExpenses(expenses);
      await localDb.setMaintenances(maint);

      setVehicleOptions(vehicles.map((v) => v.matricula).filter(Boolean));
      setEvents([
        ...expenses.map((e) => normalizeEvent("expense", e)),
        ...maint.map((m) => normalizeEvent("maintenance", m)),
      ]);
    } catch {
      // offline
    }
  };

  useEffect(() => {
    load();
  }, [user?.email, gestor, responsable]);

  const filtered = useMemo(() => {
    const list = vehicle
      ? events.filter((e) => String(e.vehiclePlate).toUpperCase() === String(vehicle).toUpperCase())
      : events;
    // Orden real por fecha (dd/MM/yyyy o ISO). Evita ordenar por texto.
    return list.sort((a, b) => parseSortDate_(b.date) - parseSortDate_(a.date));
  }, [events, vehicle]);

  const syncNow = async () => {
    await syncService.flushIfOnline();
    await load();
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title="Historial" onBack={() => navigation.navigate("Menu")} onSync={syncNow} />

      <View style={styles.card}>
        <SelectField
          label="Filtrar por vehículo"
          required={false}
          value={vehicle}
          onChange={setVehicle}
          options={[{ value: "", label: "TODOS" }, ...vehicleOptions.map((m) => ({ value: m, label: m }))]}
        />
        <Text style={styles.meta}>Registros: {filtered.length}</Text>
      </View>

      {filtered.map((e) => (
        <View key={e.id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{e.title}</Text>
          <Text style={styles.rowSub}>Vehículo: {e.vehiclePlate || "—"}</Text>
          <Text style={styles.rowSub}>Fecha: {e.date || "—"}</Text>
          {e.subtitle ? <Text style={styles.rowSub}>{e.subtitle}</Text> : null}
        </View>
      ))}
      {filtered.length === 0 ? <Text style={styles.empty}>Sin registros todavía.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  headerRow: { flexDirection: "row", gap: 10 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  syncBtn: { backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  syncText: { color: theme.colors.text, fontWeight: "900", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  meta: { color: theme.colors.subtext, fontSize: 12 },
  rowCard: { backgroundColor: theme.colors.card2, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 10 },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 15 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  empty: { color: theme.colors.subtext, marginTop: 8 },
});

