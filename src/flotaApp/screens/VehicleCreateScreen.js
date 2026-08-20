import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import { isAdministracion, isGestor } from "../auth/roles";
import { loadProjectSelectOptions } from "../../flotaWeb/lib/proyectoResolve";
import { normalizeDateToDmy } from "../../flotaWeb/lib/format";
import { theme } from "../ui/theme";
import { SelectField } from "../ui/form/Fields";

const INITIAL_FORM = {
  matricula: "",
  fecha_matriculacion: "",
  marca: "",
  modelo: "",
  combustible: "",
  propiedad: "",
  departamento_o_proyecto: "",
  departamento_o_proyecto_custom: "",
  responsable: "",
  itv_desde: "",
  itv_hasta: "",
  aseguradora: "",
  seguro_desde: "",
  seguro_hasta: "",
  poliza: "",
  email_de_notificaciones: "",
  activo: "SI",
  observaciones: "",
};

const OTRO_DEPARTAMENTO = "__OTRO__";

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

export default function VehicleCreateScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const canManageVehicles = isGestor(role) || isAdministracion(role);
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [projectOptions, setProjectOptions] = useState([]);
  const projectSelectOptions = useMemo(
    () => [{ value: "", label: "Selecciona..." }, ...projectOptions, { value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" }],
    [projectOptions]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await loadProjectSelectOptions(
          (action, params) => sheetsApi.get(action, params, { timeoutMs: 45000 }),
          user?.email || "",
          {
            readCache: (e) => localDb.getProjectSelectOptions(e),
            writeCache: (e, list) => localDb.setProjectSelectOptions(e, list),
          }
        );
        if (cancelled) return;
        // Desplegable = columna B (nombre), no id.
        setProjectOptions(opts.map((o) => ({ value: o.label, label: o.label })));
      } catch {
        if (!cancelled) setProjectOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const save = async () => {
    if (!canManageVehicles) {
      Alert.alert("Permisos insuficientes", "Solo los roles GESTOR y ADMINISTRACION pueden crear vehículos.");
      return;
    }
    if (!String(form.matricula || "").trim()) {
      Alert.alert("Falta matrícula", "La matrícula es obligatoria.");
      return;
    }
    const departamento_o_proyecto =
      String(form.departamento_o_proyecto || "").trim() === OTRO_DEPARTAMENTO
        ? String(form.departamento_o_proyecto_custom || "").trim()
        : String(form.departamento_o_proyecto || "").trim();
    const payload = {
      matricula: String(form.matricula || "").trim().toUpperCase(),
      fecha_matriculacion: normalizeDateToDmy(form.fecha_matriculacion) || "",
      marca: String(form.marca || "").trim(),
      modelo: String(form.modelo || "").trim(),
      combustible: String(form.combustible || "").trim(),
      propiedad: String(form.propiedad || "").trim(),
      departamento_o_proyecto,
      responsable: String(form.responsable || "").trim(),
      itv_desde: normalizeDateToDmy(form.itv_desde) || "",
      itv_hasta: normalizeDateToDmy(form.itv_hasta) || "",
      aseguradora: String(form.aseguradora || "").trim(),
      seguro_desde: normalizeDateToDmy(form.seguro_desde) || "",
      seguro_hasta: normalizeDateToDmy(form.seguro_hasta) || "",
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
        // ignore refresh error
      }

      Alert.alert("Guardado", "Vehículo creado correctamente.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("No se pudo guardar", e?.message || "Error al crear el vehículo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title="Alta de vehículo" onBack={() => navigation.goBack()} />
      <View style={styles.card}>
        <Text style={styles.label}>MATRICULA *</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.matricula} onChangeText={(v) => setForm((p) => ({ ...p, matricula: v }))} />

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

        <SelectField
          label="DEPARTAMENTO / PROYECTO"
          required={false}
          value={form.departamento_o_proyecto}
          onChange={(v) => setForm((p) => ({ ...p, departamento_o_proyecto: v }))}
          options={projectSelectOptions}
        />
        {form.departamento_o_proyecto === OTRO_DEPARTAMENTO ? (
          <TextInput
            style={styles.input}
            placeholder="Escribe proyecto/departamento"
            placeholderTextColor={theme.colors.placeholder}
            value={form.departamento_o_proyecto_custom}
            onChangeText={(v) => setForm((p) => ({ ...p, departamento_o_proyecto_custom: v }))}
          />
        ) : null}

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
        <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="Varios correos separados por ; o ," placeholderTextColor={theme.colors.placeholder} value={form.email_de_notificaciones} onChangeText={(v) => setForm((p) => ({ ...p, email_de_notificaciones: v }))} />

        <Text style={styles.label}>ACTIVO (SI/NO)</Text>
        <TextInput style={styles.input} placeholder="SI" placeholderTextColor={theme.colors.placeholder} value={form.activo} onChangeText={(v) => setForm((p) => ({ ...p, activo: v }))} />

        <Text style={styles.label}>OBSERVACIONES</Text>
        <TextInput style={styles.input} placeholderTextColor={theme.colors.placeholder} value={form.observaciones} onChangeText={(v) => setForm((p) => ({ ...p, observaciones: v }))} multiline />

        <View style={styles.actions}>
          <Pressable style={styles.buttonSecondary} onPress={() => navigation.goBack()} disabled={busy}>
            <Text style={styles.buttonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={save} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Guardando..." : "Guardar vehículo"}</Text>
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
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 4 },
  button: { marginTop: 4, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12, flex: 1 },
  buttonSecondary: { marginTop: 4, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border, flex: 1 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  disabled: { opacity: 0.7 },
});
