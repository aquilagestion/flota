import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { EXPENSE_TYPES, FUEL_BRANDS, FUEL_TYPES, PARKING_ZONES } from "../domain/expenseSchema";
import { theme } from "../ui/theme";
import { DateField, SelectField, TextField, TimeField } from "../ui/form/Fields";
import ImageField from "../ui/form/ImageField";
import { sheetsApi } from "../api/sheetsApi";

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

const initial = {
  matricula: "",
  departamento_o_proyecto: "",
  departamento_o_proyecto_custom: "",
  tipo_gasto: "",
  ticketLocalUris: [],
  compania: "",
  numero_poliza: "",
  cobertura: "",
  fecha_inicio_seguro: "",
  fecha_fin_seguro: "",
  prima: "",
  tipo_impuesto: "",
  periodo_ivm: "",
  importe_ivm: "",
  tipo_otro_impuesto: "",
  fecha_pago: "",
  fecha_proximo_pago: "",
  importe_otros_impuestos: "",
  fecha_multa: "",
  conductor_multa: "",
  lugar_multa: "",
  organismo_denunciante: "",
  tipo_infraccion: "",
  importe_multa: "",
  fecha_compra_repuestos: "",
  proveedor_repuestos: "",
  descripcion_repuestos: "",
  numero_factura_repuestos: "",
  importe_repuestos: "",
  fecha_compra_mantenimiento: "",
  proveedor_mantenimiento: "",
  descripcion_mantenimiento: "",
  numero_factura_mantenimiento: "",
  importe_mantenimiento: "",
  fecha_proximo_mantenimiento: "",
  kilometros_proximo_mantenimiento: "",
  fecha_repostaje: "",
  lugar_repostaje: "",
  marca_combustible: "",
  tipo_combustible: "",
  kilometros_repostaje: "",
  tipo_repostaje: "",
  litros_repostados: "",
  precio_por_litro: "",
  descuento: "",
  puntos_obtenidos: "",
  total_a_pagar: "",
  numero_ticket: "",
  fecha_aparcamiento: "",
  tipo_zona: "",
  hora_inicio_aparcamiento: "",
  hora_fin_aparcamiento: "",
  importe_aparcamiento: "",
  fecha_peaje: "",
  entrada_peaje: "",
  salida_peaje: "",
  importe_peaje: "",
  estacion_itv: "",
  fecha_inspeccion: "",
  fecha_proxima_inspeccion: "",
  importe_itv: "",
  fecha_otros_gastos: "",
  proveedor_otros_gastos: "",
  concepto_otros_gastos: "",
  importe_otros_gastos: "",
  observaciones: "",
};

const OTRO_DEPARTAMENTO = "__OTRO__";
const DEPARTAMENTOS_O_PROYECTOS = [
  { value: "Life Pygargus", label: "Life Pygargus" },
  { value: "Life Rhodopes", label: "Life Rhodopes" },
  { value: "Life Abilas", label: "Life Abilas" },
  { value: "Topillos", label: "Topillos" },
  { value: "Perdicera Guara", label: "Perdicera Guara" },
  { value: "Veterinarios", label: "Veterinarios" },
  { value: "Veterinarios Campo", label: "Veterinarios Campo" },
  { value: "Perdiceras Madrid", label: "Perdiceras Madrid" },
  { value: "Monachus Demanda", label: "Monachus Demanda" },
  { value: "Generales", label: "Generales" },
  { value: "CE Villalar", label: "CE Villalar" },
  { value: "Rescate", label: "Rescate" },
  { value: "Post Aquila-Perdiceras", label: "Post Aquila-Perdiceras" },
  { value: "Pigargos", label: "Pigargos" },
  { value: "Biodiversidad Urbana", label: "Biodiversidad Urbana" },
  { value: "Primillas", label: "Primillas" },
  { value: "Cigueñas Alcalá", label: "Cigueñas Alcalá" },
  { value: "No imputable", label: "No imputable" },
  { value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" },
];

const DEPARTAMENTOS_O_PROYECTOS_VALID = new Set(DEPARTAMENTOS_O_PROYECTOS.map((o) => o.value));

function normalizeExpenseType_(raw) {
  const v = String(raw || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!v) return "";
  if (v === "OTROS_IMPUESTOS") return "OTROS_IMPUESTOS";
  if (v === "GASTOS_MULTAS") return "MULTAS_SANCIONES";
  if (v === "MULTAS" || v === "MULTAS_SANCIONES") return "MULTAS_SANCIONES";
  if (v === "COMBUSTIBLE") return "COMBUSTIBLES";
  return v;
}

function buildExpenseTypeOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const options = [];
  for (const r of list) {
    const label = String(r?.tipo || r?.nombre || r?.label || r?.value || "").trim();
    if (!label) continue;
    const value = normalizeExpenseType_(label);
    if (!value) continue;
    if (!options.find((o) => o.value === value)) {
      options.push({ value, label });
    }
  }
  return options;
}

function sortMatriculas_(plates) {
  const list = Array.isArray(plates) ? plates.slice() : [];
  list.sort((a, b) =>
    String(a || "")
      .trim()
      .toUpperCase()
      .localeCompare(String(b || "").trim().toUpperCase(), "es", { numeric: true, sensitivity: "base" })
  );
  return list;
}

function requiredMissing(state) {
  const errs = [];
  if (!state.matricula.trim()) errs.push("MATRICULA");
  if (!state.departamento_o_proyecto || state.departamento_o_proyecto === OTRO_DEPARTAMENTO) {
    if (state.departamento_o_proyecto !== OTRO_DEPARTAMENTO) {
      errs.push("DEPARTAMENTO / PROYECTO");
    } else if (!String(state.departamento_o_proyecto_custom || "").trim()) {
      errs.push("DEPARTAMENTO / PROYECTO (nuevo)");
    }
  }
  if (!state.tipo_gasto) errs.push("TIPO DE GASTO");
  if (!Array.isArray(state.ticketLocalUris) || state.ticketLocalUris.length === 0) {
    errs.push("IMAGEN / TICKET (OBLIGATORIO)");
  }

  switch (state.tipo_gasto) {
    case "SEGURO":
      if (!state.compania.trim()) errs.push("COMPAÑIA");
      if (!state.numero_poliza.trim()) errs.push("Nº POLIZA");
      if (!state.cobertura.trim()) errs.push("COBERTURA");
      if (!state.fecha_inicio_seguro) errs.push("FECHA INICIO SEGURO");
      if (!state.fecha_fin_seguro) errs.push("FECHA FIN SEGURO");
      if (!state.prima) errs.push("PRIMA");
      break;
    case "IMPUESTOS":
      if (!state.periodo_ivm) errs.push("PERIODO I.V.M.");
      if (!state.importe_ivm) errs.push("IMPORTE I.V.M.");
      break;
    case "OTROS_IMPUESTOS":
      if (!state.tipo_otro_impuesto.trim()) errs.push("TIPO DE IMPUESTO");
      if (!state.fecha_pago) errs.push("FECHA DE PAGO");
      if (!state.fecha_proximo_pago) errs.push("FECHA PROXIMO PAGO");
      if (!state.importe_otros_impuestos) errs.push("IMPORTE OTROS IMPUESTOS");
      break;
    case "REPUESTOS_RECAMBIO":
      if (!state.fecha_compra_repuestos) errs.push("FECHA COMPRA REPUESTOS / RECAMBIOS");
      if (!state.proveedor_repuestos.trim()) errs.push("PROVEEDOR REPUESTOS / RECAMBIOS");
      if (!state.descripcion_repuestos.trim()) errs.push("DESCRIPCION REPUESTOS / RECAMBIOS");
      if (!state.numero_factura_repuestos.trim()) errs.push("Nº FACTURA REPUESTOS / RECAMBIOS");
      if (!state.importe_repuestos) errs.push("IMPORTE REPUESTOS / RECAMBIOS");
      break;
    case "MANTENIMIENTO_REPARACIONES":
      if (!state.fecha_compra_mantenimiento) errs.push("FECHA COMPRA MANTENIMIENTO / REPARACIONES");
      if (!state.proveedor_mantenimiento.trim()) errs.push("PROVEEDOR MANTENIMIENTO / REPARACIONES");
      if (!state.descripcion_mantenimiento.trim()) errs.push("DESCRIPCION MANTENIMIENTO / REPARACIONES");
      if (!state.numero_factura_mantenimiento.trim()) errs.push("Nº FACTURA MANTENIMIENTO / REPARACIONES");
      if (!state.importe_mantenimiento) errs.push("IMPORTE MANTENIMIENTO / REPARACIONES");
      if (!state.fecha_proximo_mantenimiento) errs.push("FECHA PROXIMO MANTENIMIENTO / REPARACIONES");
      if (!state.kilometros_proximo_mantenimiento) errs.push("KILOMETROS PROXIMO MANTENIMIENTO / REPARACIONES");
      break;
    case "COMBUSTIBLES":
      if (!state.fecha_repostaje) errs.push("FECHA REPOSTAJE");
      if (!state.lugar_repostaje.trim()) errs.push("LUGAR REPOSTAJE");
      if (!state.marca_combustible) errs.push("MARCA");
      if (!state.tipo_combustible) errs.push("TIPO COMBUSTIBLE");
      if (!state.kilometros_repostaje) errs.push("KILOMETROS REPOSTAJE");
      if (!state.tipo_repostaje) errs.push("TIPO REPOSTAJE");
      if (!state.litros_repostados) errs.push("LITROS REPOSTADOS");
      if (!state.precio_por_litro) errs.push("PRECIO / LITRO");
      if (!state.total_a_pagar) errs.push("TOTAL A PAGAR");
      if (!state.numero_ticket.trim()) errs.push("Nº FACTURA / TICKET");
      break;
    case "PARKING":
      if (!state.fecha_aparcamiento) errs.push("FECHA APARCAMIENTO");
      if (!state.tipo_zona) errs.push("TIPO ZONA");
      if (!state.hora_inicio_aparcamiento) errs.push("HORA INICIO APARCAMIENTO");
      if (!state.hora_fin_aparcamiento) errs.push("HORA FIN APARCAMIENTO");
      if (!state.importe_aparcamiento) errs.push("IMPORTE APARCAMIENTO");
      break;
    case "PEAJES":
      if (!state.fecha_peaje) errs.push("FECHA PEAJE");
      if (!state.importe_peaje) errs.push("IMPORTE PEAJE");
      break;
    case "ITV":
      if (!state.estacion_itv.trim()) errs.push("ESTACION ITV");
      if (!state.fecha_inspeccion) errs.push("FECHA INSPECCIÓN");
      if (!state.fecha_proxima_inspeccion) errs.push("FECHA PROXIMA INSPECCIÓN");
      if (!state.importe_itv) errs.push("IMPORTE ITV");
      break;
    case "OTROS":
      if (!state.fecha_otros_gastos) errs.push("FECHA OTROS GASTOS");
      if (!state.proveedor_otros_gastos.trim()) errs.push("PROVEEDOR OTROS GASTOS");
      if (!state.concepto_otros_gastos.trim()) errs.push("CONCEPTO OTROS GASTOS");
      if (!state.importe_otros_gastos) errs.push("IMPORTE OTROS GASTOS");
      break;
    case "MULTAS_SANCIONES":
      if (!state.fecha_multa) errs.push("FECHA MULTA");
      if (!state.conductor_multa.trim()) errs.push("CONDUCTOR");
      if (!state.lugar_multa.trim()) errs.push("LUGAR");
      if (!state.organismo_denunciante.trim()) errs.push("ORGANISMO DENUNCIANTE");
      if (!state.tipo_infraccion.trim()) errs.push("TIPO INFRACCIÓN");
      if (!state.importe_multa) errs.push("IMPORTE");
      break;
    default:
      break;
  }
  return errs;
}

export default function ExpenseFormScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const [form, setForm] = useState(initial);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState(EXPENSE_TYPES);
  const [vehiclesData, setVehiclesData] = useState(() => localDb.getVehiclesMemory());
  const [vehicleOptions, setVehicleOptions] = useState(() =>
    localDb
      .getVehiclesMemory()
      .map((v) => String(v?.matricula || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const [autosaveMsg, setAutosaveMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadVehicles() {
      const draft = await localDb.getExpensesDraft();
      if (draft) setForm((p) => ({ ...p, ...draft }));
      const cached = await localDb.getVehicles();
      if (cached.length) {
        const normalized = cached
          .map((v) => ({ ...v, matricula: String(v?.matricula || "").trim().toUpperCase() }))
          .filter((v) => v.matricula);
        setVehiclesData(normalized);
        setVehicleOptions(sortMatriculas_([...new Set(normalized.map((v) => v.matricula))]));
      }
      try {
        const res = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const normalized = list
          .map((v) => ({ ...v, matricula: String(v?.matricula || "").trim().toUpperCase() }))
          .filter((v) => v.matricula);
        await localDb.setVehicles(normalized);
        setVehiclesData(normalized);
        setVehicleOptions(sortMatriculas_([...new Set(normalized.map((v) => v.matricula))]));
      } catch {
        // offline
      }

      try {
        const cat = await sheetsApi.get("cat_tipos_gasto_list", { user_email: user?.email || "" });
        const rows = Array.isArray(cat?.data) ? cat.data : Array.isArray(cat) ? cat : [];
        const opts = buildExpenseTypeOptions_(rows);
        if (opts.length) setExpenseTypeOptions(opts);
      } catch {
        // fallback a constantes locales
      }
    }
    loadVehicles();
  }, [user?.email]);

  useEffect(() => {
    let t = setTimeout(async () => {
      await localDb.setExpensesDraft(form);
    }, 350);
    setAutosaveMsg("Borrador guardado");
    const msgTimer = setTimeout(() => setAutosaveMsg(""), 1200);
    return () => {
      clearTimeout(t);
      clearTimeout(msgTimer);
    };
  }, [form]);

  // Auto-relleno opcional desde la ficha del vehículo (pero el usuario puede sobrescribir)
  useEffect(() => {
    const plate = String(form.matricula || "").trim().toUpperCase();
    if (!plate) return;
    if (form.departamento_o_proyecto) return; // si el usuario ya eligió, no pisamos
    const selectedVehicle = vehiclesData.find(
      (v) => String(v?.matricula || "").trim().toUpperCase() === plate
    );
    const dept = String(selectedVehicle?.departamento_o_proyecto || "").trim();
    if (!dept) return;
    setForm((p) => ({
      ...p,
      departamento_o_proyecto: DEPARTAMENTOS_O_PROYECTOS_VALID.has(dept) ? dept : OTRO_DEPARTAMENTO,
      departamento_o_proyecto_custom: DEPARTAMENTOS_O_PROYECTOS_VALID.has(dept) ? "" : dept,
    }));
  }, [form.matricula, vehiclesData, form.departamento_o_proyecto]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const vehicleSelectOptions = useMemo(
    () => vehicleOptions.map((m) => ({ value: m, label: m })),
    [vehicleOptions]
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const missing = requiredMissing(form);
      if (missing.length) {
        Alert.alert("Faltan datos obligatorios", missing.join("\n"));
        return;
      }

      const departamento_o_proyecto =
        form.departamento_o_proyecto === OTRO_DEPARTAMENTO
          ? String(form.departamento_o_proyecto_custom || "").trim()
          : String(form.departamento_o_proyecto || "").trim();
      if (!departamento_o_proyecto) {
        Alert.alert("Falta proyecto/departamento", "Selecciona un departamento/proyecto o escribe uno nuevo.");
        return;
      }

      const payload = {
        vehiclePlate: form.matricula.trim().toUpperCase(),
        tipo_gasto: form.tipo_gasto,
        ...form,
        matricula: form.matricula.trim().toUpperCase(),
        // Alias de compatibilidad con cabeceras legacy del Apps Script
        poliza: String(form.numero_poliza || "").trim(),
        marca: String(form.marca_combustible || "").trim(),
        tipo_impuesto_otro: String(form.tipo_otro_impuesto || "").trim(),
        impuestos_fecha_proximo_pago: String(form.fecha_proximo_pago || "").trim(),
        conductor: String(form.conductor_multa || "").trim(),
        lugar: String(form.lugar_multa || "").trim(),
        fecha: String(form.fecha_multa || "").trim(),
        organismo_denunciante: String(form.organismo_denunciante || "").trim(),
        tipo_infraccion: String(form.tipo_infraccion || "").trim(),
        importe: String(form.importe_multa || "").trim(),
        responsable_email: String(user?.email || "").trim().toLowerCase(),
        departamento_o_proyecto, // sobrescribe el valor "__OTRO__" si aplica
        usuario_uid: user?.uid || "",
        usuario_email: user?.email || "",
        usuario_rol: role || "",
        createdAtLocal: new Date().toISOString(),
      };
      const localList = await localDb.getExpenses();
      await localDb.setExpenses([{ id: `${Date.now()}`, ...payload }, ...localList]);
      await syncService.queue({ kind: "expense", payload });
      // No bloqueamos la UI esperando subida de adjuntos: sincronización en segundo plano.
      syncService.flushIfOnline().catch(() => {});
      Alert.alert("Guardado", "Registro guardado. La sincronización de adjuntos continúa en segundo plano.");
      setForm(initial);
    } catch (e) {
      Alert.alert("Error al guardar", e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title="Introducción gastos" onBack={() => navigation.navigate("Menu")} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>VEHICULO</Text>
        <SelectField label="MATRICULA" required value={form.matricula} onChange={(v) => set("matricula", v)} options={vehicleSelectOptions} />
        <SelectField
          label="DEPARTAMENTO / PROYECTO"
          required
          value={form.departamento_o_proyecto}
          onChange={(v) => set("departamento_o_proyecto", v)}
          options={DEPARTAMENTOS_O_PROYECTOS}
        />
        {form.departamento_o_proyecto === OTRO_DEPARTAMENTO ? (
          <TextField
            label="Proyecto/departamento (nuevo)"
            required
            value={form.departamento_o_proyecto_custom}
            onChangeText={(v) => set("departamento_o_proyecto_custom", v)}
            placeholder="Escribe aquí"
          />
        ) : null}

        <Text style={styles.sectionTitle}>GASTOS</Text>
        <SelectField label="TIPO DE GASTO" required value={form.tipo_gasto} onChange={(v) => set("tipo_gasto", normalizeExpenseType_(v))} options={expenseTypeOptions} />

        <ImageField
          label="Imagen ticket"
          required
          multiple
          valueUris={form.ticketLocalUris}
          onChangeUri={(arr) => set("ticketLocalUris", arr)}
        />
        {autosaveMsg ? <Text style={styles.autosave}>{autosaveMsg}</Text> : null}
      </View>

      {form.tipo_gasto === "SEGURO" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SEGURO</Text>
          <TextField label="COMPAÑIA" required value={form.compania} onChangeText={(v) => set("compania", v)} />
          <TextField label="Nº POLIZA" required value={form.numero_poliza} onChangeText={(v) => set("numero_poliza", v)} />
          <TextField label="COBERTURA" required value={form.cobertura} onChangeText={(v) => set("cobertura", v)} />
          <DateField label="FECHA INICIO SEGURO" required value={form.fecha_inicio_seguro} onChange={(v) => set("fecha_inicio_seguro", v)} />
          <DateField label="FECHA FIN SEGURO" required value={form.fecha_fin_seguro} onChange={(v) => set("fecha_fin_seguro", v)} />
          <TextField label="PRIMA" required value={form.prima} onChangeText={(v) => set("prima", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "IMPUESTOS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>I.V.M.</Text>
          <DateField label="PERIODO I.V.M." required value={form.periodo_ivm} onChange={(v) => set("periodo_ivm", v)} />
          <TextField label="IMPORTE I.V.M." required value={form.importe_ivm} onChangeText={(v) => set("importe_ivm", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "OTROS_IMPUESTOS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTROS IMPUESTOS</Text>
          <TextField label="TIPO DE IMPUESTO" required value={form.tipo_otro_impuesto} onChangeText={(v) => set("tipo_otro_impuesto", v)} />
          <DateField label="FECHA DE PAGO" required value={form.fecha_pago} onChange={(v) => set("fecha_pago", v)} />
          <DateField label="FECHA PROXIMO PAGO" required value={form.fecha_proximo_pago} onChange={(v) => set("fecha_proximo_pago", v)} />
          <TextField label="IMPORTE OTROS IMPUESTOS" required value={form.importe_otros_impuestos} onChangeText={(v) => set("importe_otros_impuestos", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "REPUESTOS_RECAMBIO" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>REPUESTOS Y RECAMBIOS</Text>
          <DateField label="FECHA COMPRA REPUESTOS / RECAMBIOS" required value={form.fecha_compra_repuestos} onChange={(v) => set("fecha_compra_repuestos", v)} />
          <TextField label="PROVEEDOR REPUESTOS / RECAMBIOS" required value={form.proveedor_repuestos} onChangeText={(v) => set("proveedor_repuestos", v)} />
          <TextField label="DESCRIPCION REPUESTOS / RECAMBIOS" required value={form.descripcion_repuestos} onChangeText={(v) => set("descripcion_repuestos", v)} multiline />
          <TextField label="Nº FACTURA REPUESTOS / RECAMBIOS" required value={form.numero_factura_repuestos} onChangeText={(v) => set("numero_factura_repuestos", v)} />
          <TextField label="IMPORTE REPUESTOS / RECAMBIOS" required value={form.importe_repuestos} onChangeText={(v) => set("importe_repuestos", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "MANTENIMIENTO_REPARACIONES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MANTENIMIENTO / REPARACIONES</Text>
          <DateField label="FECHA COMPRA MANTENIMIENTO / REPARACIONES" required value={form.fecha_compra_mantenimiento} onChange={(v) => set("fecha_compra_mantenimiento", v)} />
          <TextField label="PROVEEDOR MANTENIMIENTO / REPARACIONES" required value={form.proveedor_mantenimiento} onChangeText={(v) => set("proveedor_mantenimiento", v)} />
          <TextField label="DESCRIPCION MANTENIMIENTO / REPARACIONES" required value={form.descripcion_mantenimiento} onChangeText={(v) => set("descripcion_mantenimiento", v)} multiline />
          <TextField label="Nº FACTURA MANTENIMIENTO / REPARACIONES" required value={form.numero_factura_mantenimiento} onChangeText={(v) => set("numero_factura_mantenimiento", v)} />
          <TextField label="IMPORTE MANTENIMIENTO / REPARACIONES" required value={form.importe_mantenimiento} onChangeText={(v) => set("importe_mantenimiento", v)} keyboardType="decimal-pad" />
          <DateField label="FECHA PROXIMO MANTENIMIENTO / REPARACIONES" required value={form.fecha_proximo_mantenimiento} onChange={(v) => set("fecha_proximo_mantenimiento", v)} />
          <TextField label="KILOMETROS PROXIMO MANTENIMIENTO / REPARACIONES" required value={form.kilometros_proximo_mantenimiento} onChangeText={(v) => set("kilometros_proximo_mantenimiento", v)} keyboardType="number-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "COMBUSTIBLES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>COMBUSTIBLE</Text>
          <DateField label="FECHA REPOSTAJE" required value={form.fecha_repostaje} onChange={(v) => set("fecha_repostaje", v)} />
          <TextField label="LUGAR REPOSTAJE" required value={form.lugar_repostaje} onChangeText={(v) => set("lugar_repostaje", v)} />
          <SelectField label="MARCA" required value={form.marca_combustible} onChange={(v) => set("marca_combustible", v)} options={FUEL_BRANDS.map((b) => ({ value: b, label: b }))} />
          <SelectField label="TIPO COMBUSTIBLE" required value={form.tipo_combustible} onChange={(v) => set("tipo_combustible", v)} options={FUEL_TYPES.map((t) => ({ value: t, label: t }))} />
          <TextField label="KILOMETROS REPOSTAJE" required value={form.kilometros_repostaje} onChangeText={(v) => set("kilometros_repostaje", v)} keyboardType="number-pad" />
          <SelectField label="TIPO REPOSTAJE" required value={form.tipo_repostaje} onChange={(v) => set("tipo_repostaje", v)} options={[{ value: "PARCIAL", label: "PARCIAL" }, { value: "COMPLETO", label: "COMPLETO" }]} />
          <TextField label="LITROS REPOSTADOS" required value={form.litros_repostados} onChangeText={(v) => set("litros_repostados", v)} keyboardType="decimal-pad" />
          <TextField label="PRECIO / LITRO" required value={form.precio_por_litro} onChangeText={(v) => set("precio_por_litro", v)} keyboardType="decimal-pad" />
          <TextField label="DESCUENTO" required={false} value={form.descuento} onChangeText={(v) => set("descuento", v)} keyboardType="decimal-pad" />
          <TextField label="PUNTOS OBTENIDOS" required={false} value={form.puntos_obtenidos} onChangeText={(v) => set("puntos_obtenidos", v)} keyboardType="decimal-pad" />
          <TextField label="TOTAL A PAGAR" required value={form.total_a_pagar} onChangeText={(v) => set("total_a_pagar", v)} keyboardType="decimal-pad" />
          <TextField label="Nº FACTURA / TICKET" required value={form.numero_ticket} onChangeText={(v) => set("numero_ticket", v)} />
        </View>
      ) : null}

      {form.tipo_gasto === "PARKING" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>APARCAMIENTO</Text>
          <DateField label="FECHA APARCAMIENTO" required value={form.fecha_aparcamiento} onChange={(v) => set("fecha_aparcamiento", v)} />
          <SelectField label="TIPO ZONA" required value={form.tipo_zona} onChange={(v) => set("tipo_zona", v)} options={PARKING_ZONES.map((z) => ({ value: z, label: z }))} />
          <TimeField label="HORA INICIO APARCAMIENTO" required value={form.hora_inicio_aparcamiento} onChange={(v) => set("hora_inicio_aparcamiento", v)} />
          <TimeField label="HORA FIN APARCAMIENTO" required value={form.hora_fin_aparcamiento} onChange={(v) => set("hora_fin_aparcamiento", v)} />
          <TextField label="IMPORTE APARCAMIENTO" required value={form.importe_aparcamiento} onChangeText={(v) => set("importe_aparcamiento", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "PEAJES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PEAJES</Text>
          <DateField label="FECHA PEAJE" required value={form.fecha_peaje} onChange={(v) => set("fecha_peaje", v)} />
          <TextField label="ENTRADA PEAJE" required={false} value={form.entrada_peaje} onChangeText={(v) => set("entrada_peaje", v)} />
          <TextField label="SALIDA PEAJE" required={false} value={form.salida_peaje} onChangeText={(v) => set("salida_peaje", v)} />
          <TextField label="IMPORTE PEAJE" required value={form.importe_peaje} onChangeText={(v) => set("importe_peaje", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "ITV" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>I.T.V.</Text>
          <TextField label="ESTACION ITV" required value={form.estacion_itv} onChangeText={(v) => set("estacion_itv", v)} />
          <DateField label="FECHA INSPECCIÓN" required value={form.fecha_inspeccion} onChange={(v) => set("fecha_inspeccion", v)} />
          <DateField label="FECHA PROXIMA INSPECCIÓN" required value={form.fecha_proxima_inspeccion} onChange={(v) => set("fecha_proxima_inspeccion", v)} />
          <TextField label="IMPORTE ITV" required value={form.importe_itv} onChangeText={(v) => set("importe_itv", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "OTROS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTROS GASTOS</Text>
          <DateField label="FECHA OTROS GASTOS" required value={form.fecha_otros_gastos} onChange={(v) => set("fecha_otros_gastos", v)} />
          <TextField label="PROVEEDOR OTROS GASTOS" required value={form.proveedor_otros_gastos} onChangeText={(v) => set("proveedor_otros_gastos", v)} />
          <TextField label="CONCEPTO OTROS GASTOS" required value={form.concepto_otros_gastos} onChangeText={(v) => set("concepto_otros_gastos", v)} />
          <TextField label="IMPORTE OTROS GASTOS" required value={form.importe_otros_gastos} onChangeText={(v) => set("importe_otros_gastos", v)} keyboardType="decimal-pad" />
          <TextField label="OBSERVACIONES / ANOTACIONES" required={false} value={form.observaciones} onChangeText={(v) => set("observaciones", v)} multiline />
        </View>
      ) : null}

      {form.tipo_gasto === "MULTAS_SANCIONES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MULTAS / SANCIONES</Text>
          <DateField label="FECHA" required value={form.fecha_multa} onChange={(v) => set("fecha_multa", v)} />
          <TextField label="CONDUCTOR" required value={form.conductor_multa} onChangeText={(v) => set("conductor_multa", v)} />
          <TextField label="LUGAR" required value={form.lugar_multa} onChangeText={(v) => set("lugar_multa", v)} />
          <TextField label="ORGANISMO DENUNCIANTE" required value={form.organismo_denunciante} onChangeText={(v) => set("organismo_denunciante", v)} />
          <TextField label="TIPO INFRACCIÓN" required value={form.tipo_infraccion} onChangeText={(v) => set("tipo_infraccion", v)} />
          <TextField label="IMPORTE" required value={form.importe_multa} onChangeText={(v) => set("importe_multa", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      <Pressable style={[styles.saveBtn, saving && { opacity: 0.75 }]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar gasto"}</Text>
      </Pressable>
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
  autosave: { color: theme.colors.subtext, fontSize: 12, marginTop: 4 },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#5fb7ff" },
  saveText: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
});

