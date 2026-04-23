import React, { useContext, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { sheetsApi } from "../api/sheetsApi";
import { DateField, SelectField, TextField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

function mapProjectOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    const entries = Object.entries(r || {});
    const values = entries.map(([, v]) => String(v || "").trim());
    const colB = values.length >= 2 ? values[1] : "";
    const value = String(r?.id_proyecto || r?.id || (values.length ? values[0] : "")).trim();
    const label = String(r?.nombre_proyecto || r?.nombre || r?.proyecto || colB).trim();
    if (!value || !label) continue;
    if (!out.find((x) => x.value === value)) out.push({ value, label });
  }
  return out;
}

function fmtMoney_(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0,00";
  return x.toFixed(2).replace(".", ",");
}

const initialForm = {
  tipo_vehiculo: "PROPIO",
  matricula: "",
  fecha_viaje: "",
  origen: "",
  destino: "",
  km_inicial: "",
  id_proyecto: "",
  accion: "",
  motivo: "",
};

export default function OwnVehicleTripsScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [form, setForm] = useState(initialForm);
  const [projects, setProjects] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [tripToClose, setTripToClose] = useState(null);
  const [kmFinal, setKmFinal] = useState("");
  const myEmail = String(user?.email || "").trim().toLowerCase();

  const projectOptions = useMemo(() => projects, [projects]);
  const fleetOptions = useMemo(
    () =>
      fleet.map((v) => {
        const mat = String(v?.matricula || "").trim().toUpperCase();
        const marca = String(v?.marca || "").trim();
        const modelo = String(v?.modelo || "").trim();
        return {
          value: mat,
          label: [mat, marca, modelo].filter(Boolean).join(" · "),
        };
      }),
    [fleet]
  );

  const loadData = React.useCallback(async () => {
    if (!myEmail) return;
    setLoading(true);
    try {
      const [tRes, fRes] = await Promise.all([
        sheetsApi.get("viaje_vehiculo_propio_list", { user_email: myEmail }),
        sheetsApi.get("flota_list", { user_email: myEmail }),
      ]);
      let pRows = [];
      try {
        const pRes = await sheetsApi.get("proyecto_list_columna_b", { solo_activos: "SI", user_email: myEmail });
        pRows = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      } catch {
        const pRes = await sheetsApi.get("proyecto_list", { solo_activos: "SI", user_email: myEmail });
        pRows = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      }
      const tRows = Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : [];
      const fRows = Array.isArray(fRes?.data) ? fRes.data : Array.isArray(fRes) ? fRes : [];
      const fleetMapped = fRows
        .map((v) => ({
          matricula: String(v?.matricula || "").trim().toUpperCase(),
          marca: String(v?.marca || "").trim(),
          modelo: String(v?.modelo || "").trim(),
        }))
        .filter((v) => v.matricula);
      setFleet(fleetMapped);
      setProjects(mapProjectOptions_(pRows));
      setTrips(tRows.sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || ""))));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar viajes/proyectos.");
    } finally {
      setLoading(false);
    }
  }, [myEmail]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validateForm = () => {
    const missing = [];
    if (String(form.tipo_vehiculo || "PROPIO").toUpperCase() === "ORGANIZACION") {
      if (!String(form.matricula || "").trim()) missing.push("Vehículo organización");
    } else if (!String(form.matricula || "").trim()) {
      missing.push("Matrícula");
    }
    if (!String(form.fecha_viaje || "").trim()) missing.push("Fecha");
    if (!String(form.origen || "").trim()) missing.push("Origen");
    if (!String(form.destino || "").trim()) missing.push("Destino");
    if (!String(form.km_inicial || "").trim()) missing.push("Km inicial");
    if (!String(form.id_proyecto || "").trim()) missing.push("Proyecto");
    if (missing.length) return missing;
    const kmIni = Number(String(form.km_inicial || "").replace(",", "."));
    if (!Number.isFinite(kmIni) || kmIni < 0) return ["Km inicial inválido"];
    return [];
  };

  const createTrip = async () => {
    if (saving) return;
    const missing = validateForm();
    if (missing.length) {
      Alert.alert("Faltan datos", missing.join("\n"));
      return;
    }
    try {
      setSaving(true);
      const p = projectOptions.find((x) => x.value === form.id_proyecto);
      const tipoVehiculo = String(form.tipo_vehiculo || "PROPIO").trim().toUpperCase();
      await sheetsApi.post(
        "viaje_vehiculo_propio_crear",
        {
          user_email: myEmail,
          usuario_email: myEmail,
          usuario_nombre: String(user?.displayName || user?.nombre || "").trim(),
          matricula: String(form.matricula || "").trim().toUpperCase(),
          tipo_vehiculo: tipoVehiculo,
          fecha_viaje: form.fecha_viaje,
          origen: form.origen,
          destino: form.destino,
          km_inicial: Number(String(form.km_inicial || "").replace(",", ".")),
          id_proyecto: form.id_proyecto,
          proyecto_nombre: p?.label || "",
          accion: form.accion,
          motivo: form.motivo,
        },
        { user_email: myEmail }
      );
      setForm(initialForm);
      await loadData();
      Alert.alert("Viaje creado", "Ya puedes añadir gastos y cerrar el viaje al finalizar.");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear el viaje.");
    } finally {
      setSaving(false);
    }
  };

  const openCloseTrip = (trip) => {
    setTripToClose(trip);
    setKmFinal("");
    setCloseModal(true);
  };

  const closeTrip = async () => {
    const id = String(tripToClose?.id_viaje || "").trim();
    const km = Number(String(kmFinal || "").replace(",", "."));
    if (!id) return;
    if (!Number.isFinite(km) || km < 0) {
      Alert.alert("Km final inválido", "Introduce un valor numérico válido.");
      return;
    }
    try {
      await sheetsApi.post(
        "viaje_vehiculo_propio_cerrar",
        {
          id_viaje: id,
          km_final: km,
          user_email: myEmail,
        },
        { user_email: myEmail }
      );
      setCloseModal(false);
      setTripToClose(null);
      await loadData();
      Alert.alert("Viaje cerrado", "Se ha calculado km, tarifa e importe total.");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo cerrar el viaje.");
    }
  };

  const addTripExpense = (trip) => {
    navigation.navigate("Gasto", {
      idViajePropio: String(trip?.id_viaje || "").trim(),
      viajeContext: {
        matricula: String(trip?.matricula || "").trim().toUpperCase(),
        proyecto_nombre: String(trip?.proyecto_nombre || "").trim(),
      },
    });
  };

  const showTripDetail = async (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id) return;
    try {
      const res = await sheetsApi.get("viaje_vehiculo_propio_detalle", { id_viaje: id, user_email: myEmail });
      const data = res?.data || res || {};
      const gastos = Array.isArray(data?.gastos) ? data.gastos : [];
      Alert.alert(
        `Viaje ${id}`,
        `Estado: ${String(data?.viaje?.estado || trip?.estado || "")}\n` +
          `Gastos asociados: ${gastos.length}\n` +
          `Importe km: ${fmtMoney_(data?.viaje?.importe_km)} €\n` +
          `Importe gastos: ${fmtMoney_(data?.viaje?.importe_gastos)} €\n` +
          `Total: ${fmtMoney_(data?.viaje?.importe_total)} €`
      );
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo obtener el detalle.");
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Grabación de viajes</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.navigate("Menu")}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nuevo viaje</Text>
        <SelectField
          label="Tipo de vehículo"
          required
          value={form.tipo_vehiculo}
          onChange={(v) => set("tipo_vehiculo", String(v || "PROPIO").toUpperCase())}
          options={[
            { value: "PROPIO", label: "Vehículo propio (matrícula libre)" },
            { value: "ORGANIZACION", label: "Vehículo organización (flota)" },
          ]}
        />
        {String(form.tipo_vehiculo || "PROPIO").toUpperCase() === "ORGANIZACION" ? (
          <SelectField
            label="Vehículo de la organización"
            required
            value={form.matricula}
            onChange={(v) => set("matricula", String(v || "").toUpperCase())}
            options={[{ value: "", label: fleetOptions.length ? "Selecciona..." : "Sin vehículos en FLOTA" }, ...fleetOptions]}
          />
        ) : (
          <TextField
            label="Matrícula del vehículo"
            required
            value={form.matricula}
            onChangeText={(v) => set("matricula", String(v || "").toUpperCase())}
            autoCapitalize="characters"
          />
        )}
        <DateField label="Fecha" required value={form.fecha_viaje} onChange={(v) => set("fecha_viaje", v)} />
        <TextField label="Origen" required value={form.origen} onChangeText={(v) => set("origen", v)} />
        <TextField label="Destino" required value={form.destino} onChangeText={(v) => set("destino", v)} />
        <TextField
          label="Km inicial"
          required
          value={form.km_inicial}
          onChangeText={(v) => set("km_inicial", String(v || "").replace(/[^\d.,]/g, ""))}
          keyboardType="decimal-pad"
        />
        <SelectField
          label="Proyecto"
          required
          value={form.id_proyecto}
          onChange={(v) => set("id_proyecto", v)}
          options={[{ value: "", label: projectOptions.length ? "Selecciona..." : "Sin proyectos en hoja PROYECTOS" }, ...projectOptions]}
        />
        <TextField label="Acción (opcional)" required={false} value={form.accion} onChangeText={(v) => set("accion", v)} />
        <TextField label="Motivo (opcional)" required={false} value={form.motivo} onChangeText={(v) => set("motivo", v)} multiline />
        <Pressable style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={createTrip} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? "Guardando..." : "Crear viaje"}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Viajes</Text>
      {loading ? <Text style={styles.meta}>Cargando...</Text> : null}
      {trips.map((trip) => {
        const estado = String(trip?.estado || "").trim().toUpperCase();
        const cerrado = estado === "CERRADO";
        return (
          <View key={String(trip?.id_viaje || Math.random())} style={styles.row}>
            <Text style={styles.rowTitle}>{String(trip?.id_viaje || "Viaje")}</Text>
            <Text style={styles.rowSub}>
              {String(trip?.fecha_viaje || "")} · {String(trip?.matricula || "")} · {estado || "—"}
            </Text>
            <Text style={styles.rowSub}>
              {String(trip?.origen || "")} → {String(trip?.destino || "")}
            </Text>
            <Text style={styles.rowSub}>
              Km: {String(trip?.km_inicial || "0")} {cerrado ? `→ ${String(trip?.km_final || "0")}` : ""}
            </Text>
            {cerrado ? (
              <Text style={styles.rowAmount}>Total: {fmtMoney_(trip?.importe_total)} EUR</Text>
            ) : (
              <Text style={styles.rowAmount}>En curso</Text>
            )}
            <View style={styles.actions}>
              <Pressable style={styles.actionBtn} onPress={() => showTripDetail(trip)}>
                <Text style={styles.actionText}>Detalle</Text>
              </Pressable>
              {!cerrado ? (
                <>
                  <Pressable style={styles.actionBtn} onPress={() => addTripExpense(trip)}>
                    <Text style={styles.actionText}>Añadir gasto</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.actionWarn]} onPress={() => openCloseTrip(trip)}>
                    <Text style={styles.actionText}>Cerrar viaje</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        );
      })}
      {!trips.length && !loading ? <Text style={styles.meta}>No hay viajes creados todavía.</Text> : null}

      <Modal visible={closeModal} transparent animationType="fade" onRequestClose={() => setCloseModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCloseModal(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Cerrar viaje</Text>
            <Text style={styles.meta}>Introduce el km final para calcular la liquidación.</Text>
            <TextField
              label="Km final"
              required
              value={kmFinal}
              onChangeText={setKmFinal}
              keyboardType="decimal-pad"
              placeholder="Ej: 23540"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnGhost} onPress={() => setCloseModal(false)}>
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalBtnPrimary} onPress={closeTrip}>
                <Text style={styles.modalBtnPrimaryText}>Cerrar viaje</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
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
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  primaryBtn: { marginTop: 4, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  primaryText: { color: theme.colors.text, fontWeight: "900" },
  section: { color: theme.colors.text, fontWeight: "900", marginBottom: 8, marginTop: 4 },
  row: { backgroundColor: theme.colors.card2, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 10 },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  rowAmount: { color: theme.colors.text, marginTop: 6, fontWeight: "900" },
  actions: { marginTop: 8, flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    paddingVertical: 8,
  },
  actionWarn: { borderColor: "#d6b260" },
  actionText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  meta: { color: theme.colors.subtext, fontSize: 12, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: theme.colors.card, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 15 },
  modalBtnPrimary: { backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
