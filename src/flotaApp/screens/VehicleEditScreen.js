import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import { isAdministracion, isGestor } from "../auth/roles";
import { theme } from "../ui/theme";

function getVehicleFieldValue_(vehicle, field) {
  if (!vehicle) return "";
  const normalizeKey = (k) =>
    String(k || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const wanted = normalizeKey(field);
  const keys = Object.keys(vehicle || {});
  for (const k of keys) {
    if (normalizeKey(k) === wanted) {
      const v = vehicle[k];
      return v === undefined || v === null ? "" : v;
    }
  }
  return "";
}

function initialFromVehicle_(vehicle) {
  return {
    matricula: String(getVehicleFieldValue_(vehicle, "matricula") || "").trim().toUpperCase(),
    fecha_matriculacion: String(getVehicleFieldValue_(vehicle, "fecha_matriculacion") || "").trim(),
    marca: String(getVehicleFieldValue_(vehicle, "marca") || "").trim(),
    modelo: String(getVehicleFieldValue_(vehicle, "modelo") || "").trim(),
    combustible: String(getVehicleFieldValue_(vehicle, "combustible") || "").trim(),
    propiedad: String(getVehicleFieldValue_(vehicle, "propiedad") || "").trim(),
    departamento_o_proyecto: String(getVehicleFieldValue_(vehicle, "departamento_o_proyecto") || "").trim(),
    responsable: String(getVehicleFieldValue_(vehicle, "responsable") || "").trim(),
    itv_desde: String(getVehicleFieldValue_(vehicle, "itv_desde") || "").trim(),
    itv_hasta: String(getVehicleFieldValue_(vehicle, "itv_hasta") || "").trim(),
    aseguradora: String(getVehicleFieldValue_(vehicle, "aseguradora") || "").trim(),
    seguro_desde: String(getVehicleFieldValue_(vehicle, "seguro_desde") || "").trim(),
    seguro_hasta: String(getVehicleFieldValue_(vehicle, "seguro_hasta") || "").trim(),
    poliza: String(getVehicleFieldValue_(vehicle, "poliza") || "").trim(),
    email_de_notificaciones: String(
      getVehicleFieldValue_(vehicle, "e-mail_de_notificaciones") || getVehicleFieldValue_(vehicle, "email_de_notificaciones") || ""
    ).trim(),
    activo: String(getVehicleFieldValue_(vehicle, "activo") || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
    observaciones: String(getVehicleFieldValue_(vehicle, "observaciones") || "").trim(),
  };
}

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
    </View>
  );
}

export default function VehicleEditScreen({ navigation, route }) {
  const { user, role } = React.useContext(AuthContext);
  const canManageVehicles = isGestor(role) || isAdministracion(role);
  const sourceVehicle = route?.params?.vehicle || {};
  const [form, setForm] = useState(() => initialFromVehicle_(sourceVehicle));
  const [busy, setBusy] = useState(false);
  const title = useMemo(() => {
    const m = String(form.matricula || "").trim().toUpperCase();
    return m ? `Editar vehículo: ${m}` : "Editar vehículo";
  }, [form.matricula]);

  const save = async () => {
    if (!canManageVehicles) {
      Alert.alert("Permisos insuficientes", "Solo los roles GESTOR y ADMINISTRACION pueden editar vehículos.");
      return;
    }
    if (!String(form.matricula || "").trim()) {
      Alert.alert("Falta matrícula", "La matrícula es obligatoria.");
      return;
    }
    const payload = {
      matricula: String(form.matricula || "").trim().toUpperCase(),
      fecha_matriculacion: String(form.fecha_matriculacion || "").trim(),
      marca: String(form.marca || "").trim(),
      modelo: String(form.modelo || "").trim(),
      combustible: String(form.combustible || "").trim(),
      propiedad: String(form.propiedad || "").trim(),
      departamento_o_proyecto: String(form.departamento_o_proyecto || "").trim(),
      responsable: String(form.responsable || "").trim(),
      itv_desde: String(form.itv_desde || "").trim(),
      itv_hasta: String(form.itv_hasta || "").trim(),
      aseguradora: String(form.aseguradora || "").trim(),
      seguro_desde: String(form.seguro_desde || "").trim(),
      seguro_hasta: String(form.seguro_hasta || "").trim(),
      poliza: String(form.poliza || "").trim(),
      "e-mail_de_notificaciones": String(form.email_de_notificaciones || "").trim(),
      activo: String(form.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
      observaciones: String(form.observaciones || "").trim(),
      email_de_notificaciones: String(form.email_de_notificaciones || "").trim(),
    };

    try {
      setBusy(true);
      const syncTargets = (await localDb.getSyncTargets()) || {};
      await sheetsApi.post(
        "flota_crear",
        {
          ...payload,
          destination: {
            mode: syncTargets.mode || "both",
            corporate_drive_folder_id: syncTargets.corpDriveFolder || "",
            corporate_spreadsheet_id: syncTargets.corpSpreadsheetId || "",
            personal_drive_folder_id: syncTargets.userDriveFolder || "",
            personal_spreadsheet_id: syncTargets.userSpreadsheetId || "",
            auto_create_personal: !!syncTargets.autoCreatePersonal,
          },
        },
        { user_email: user?.email || "" }
      );

      try {
        const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        await localDb.setVehicles(list);
      } catch {
        // si falla el refresco remoto, mantenemos el guardado principal
      }

      Alert.alert("Guardado", "Vehículo actualizado correctamente.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("No se pudo guardar", e?.message || "Error al actualizar el vehículo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title={title} onBack={() => navigation.goBack()} />
      <View style={styles.card}>
        <Text style={styles.label}>MATRICULA *</Text>
        <TextInput style={[styles.input, styles.readonly]} value={form.matricula} editable={false} />

        <Text style={styles.label}>FECHA MATRICULACION</Text>
        <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.fecha_matriculacion} onChangeText={(v) => setForm((p) => ({ ...p, fecha_matriculacion: v }))} />

        <Text style={styles.label}>MARCA</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.marca} onChangeText={(v) => setForm((p) => ({ ...p, marca: v }))} />

        <Text style={styles.label}>MODELO</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.modelo} onChangeText={(v) => setForm((p) => ({ ...p, modelo: v }))} />

        <Text style={styles.label}>COMBUSTIBLE</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.combustible} onChangeText={(v) => setForm((p) => ({ ...p, combustible: v }))} />

        <Text style={styles.label}>PROPIEDAD</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.propiedad} onChangeText={(v) => setForm((p) => ({ ...p, propiedad: v }))} />

        <Text style={styles.label}>DEPARTAMENTO / PROYECTO</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.departamento_o_proyecto} onChangeText={(v) => setForm((p) => ({ ...p, departamento_o_proyecto: v }))} />

        <Text style={styles.label}>RESPONSABLE</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.responsable} onChangeText={(v) => setForm((p) => ({ ...p, responsable: v }))} />

        <Text style={styles.label}>ITV DESDE</Text>
        <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.itv_desde} onChangeText={(v) => setForm((p) => ({ ...p, itv_desde: v }))} />

        <Text style={styles.label}>ITV HASTA</Text>
        <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.itv_hasta} onChangeText={(v) => setForm((p) => ({ ...p, itv_hasta: v }))} />

        <Text style={styles.label}>ASEGURADORA</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.aseguradora} onChangeText={(v) => setForm((p) => ({ ...p, aseguradora: v }))} />

        <Text style={styles.label}>SEGURO DESDE</Text>
        <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.seguro_desde} onChangeText={(v) => setForm((p) => ({ ...p, seguro_desde: v }))} />

        <Text style={styles.label}>SEGURO HASTA</Text>
        <TextInput style={styles.input} placeholder="dd/mm/aaaa" placeholderTextColor={theme.colors.placeholder} value={form.seguro_hasta} onChangeText={(v) => setForm((p) => ({ ...p, seguro_hasta: v }))} />

        <Text style={styles.label}>POLIZA</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.poliza} onChangeText={(v) => setForm((p) => ({ ...p, poliza: v }))} />

        <Text style={styles.label}>E-MAIL DE NOTIFICACIONES</Text>
        <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={theme.colors.placeholder} value={form.email_de_notificaciones} onChangeText={(v) => setForm((p) => ({ ...p, email_de_notificaciones: v }))} />

        <Text style={styles.label}>ACTIVO (SI/NO)</Text>
        <TextInput style={styles.input} placeholder="SI" placeholderTextColor={theme.colors.placeholder} value={form.activo} onChangeText={(v) => setForm((p) => ({ ...p, activo: v }))} />

        <Text style={styles.label}>OBSERVACIONES</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.observaciones} onChangeText={(v) => setForm((p) => ({ ...p, observaciones: v }))} multiline />

        <View style={styles.actions}>
          <Pressable style={styles.buttonSecondary} onPress={() => navigation.goBack()} disabled={busy}>
            <Text style={styles.buttonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={save} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Guardando..." : "Guardar cambios"}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  input: { backgroundColor: theme.colors.input, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  readonly: { opacity: 0.8 },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 4 },
  button: { marginTop: 4, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12, flex: 1 },
  buttonSecondary: { marginTop: 4, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border, flex: 1 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  disabled: { opacity: 0.7 },
});
