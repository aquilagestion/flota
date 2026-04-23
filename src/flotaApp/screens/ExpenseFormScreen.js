import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { isColaborador } from "../auth/roles";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { EXPENSE_TYPES, FUEL_BRANDS, FUEL_TYPES, PARKING_ZONES, PAYMENT_METHODS } from "../domain/expenseSchema";
import { theme } from "../ui/theme";
import { DateField, SelectField, TextField, TimeField } from "../ui/form/Fields";
import ImageField from "../ui/form/ImageField";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system";

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
  id_viaje_propio: "",
  matricula: "",
  departamento_o_proyecto: "",
  departamento_o_proyecto_custom: "",
  tipo_gasto: "",
  forma_pago: "",
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
  entidad_combustible: "",
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
  entidad_parking: "",
  tipo_zona: "",
  hora_inicio_aparcamiento: "",
  hora_fin_aparcamiento: "",
  importe_aparcamiento: "",
  fecha_peaje: "",
  entidad_peaje: "",
  entrada_peaje: "",
  salida_peaje: "",
  importe_peaje: "",
  estacion_itv: "",
  fecha_inspeccion: "",
  fecha_proxima_inspeccion: "",
  importe_itv: "",
  numero_factura_itv: "",
  fecha_otros_gastos: "",
  proveedor_otros_gastos: "",
  concepto_otros_gastos: "",
  importe_otros_gastos: "",
  numero_factura_otros: "",
  observaciones: "",
  kilometros_actuales: "",
  odometroLocalUri: "",
  fecha_viaje_colaborador: "",
  km_inicial_colaborador: "",
  km_final_colaborador: "",
  km_recorridos_colaborador: "",
  origen_colaborador: "",
  destino_colaborador: "",
  proyecto_colaborador_id: "",
  proyecto_colaborador_nombre: "",
  motivo_colaborador: "",
  accion_colaborador: "",
  tarifa_eur_km_aplicada: "",
  importe_km_colaborador: "",
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

async function loadProjectRows_(email) {
  try {
    const res = await sheetsApi.get("proyecto_list_columna_b", { solo_activos: "SI", user_email: email || "" });
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  } catch {
    const res = await sheetsApi.get("proyecto_list", { solo_activos: "SI", user_email: email || "" });
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  }
}

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

function mapProjectOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const entries = Object.entries(r);
    const values = entries.map(([, v]) => String(v || "").trim());
    // Preferimos nombre visible de la columna B (normalmente nombre_proyecto).
    const colB = values.length >= 2 ? values[1] : "";
    const id =
      String(
        r.id_proyecto ||
          r.id ||
          (values.length ? values[0] : "")
      ).trim();
    const name =
      String(
        r.nombre_proyecto ||
          r.nombre ||
          r.proyecto ||
          colB
      ).trim();
    if (!id || !name) continue;
    if (!out.find((o) => o.value === id)) {
      out.push({ value: id, label: name });
    }
  }
  return out;
}

function mapTripOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    const id = String(r?.id_viaje || "").trim();
    const estado = String(r?.estado || "").trim().toUpperCase();
    if (!id || estado === "CERRADO") continue;
    const fecha = String(r?.fecha_viaje || "").trim();
    const mat = String(r?.matricula || "").trim().toUpperCase();
    const origen = String(r?.origen || "").trim();
    const destino = String(r?.destino || "").trim();
    const tipoVeh = String(r?.tipo_vehiculo || "").trim().toUpperCase();
    const prefix = tipoVeh === "ORGANIZACION" ? "Org" : "Propio";
    const label = [id, fecha, mat, `${origen}→${destino}`].filter(Boolean).join(" · ");
    out.push({
      value: id,
      label: `${prefix} · ${label}`,
      matricula: mat,
      proyecto_nombre: String(r?.proyecto_nombre || "").trim(),
    });
  }
  return out;
}

function extractKmFromOcrText_(text) {
  const raw = String(text || "");
  if (!raw) return "";
  const normalized = raw
    .toUpperCase()
    .replace(/[OQ]/g, "0")
    .replace(/[I|L]/g, "1");
  const lines = normalized.split(/\r?\n/);
  const candidates = [];
  const collect = (source) => {
    const re = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,7})/g;
    let m = null;
    while ((m = re.exec(source)) !== null) {
      const digits = String(m[1] || "").replace(/[^\d]/g, "");
      if (digits.length < 4 || digits.length > 7) continue;
      const n = parseInt(digits, 10);
      if (Number.isFinite(n)) candidates.push(n);
    }
  };
  for (const ln of lines) {
    if (/(KM|KMS|KILOMET|ODOMET)/.test(String(ln || ""))) {
      collect(String(ln || ""));
    }
  }
  if (!candidates.length) collect(normalized);
  if (!candidates.length) return "";
  candidates.sort((a, b) => b - a);
  return String(candidates[0]);
}

/** Normaliza URI a file:// para envío al OCR remoto (PaddleOCR/OpenCV). */
async function prepareImageUriForOcr_(sourceUri) {
  const raw = String(sourceUri || "").trim();
  if (!raw) return null;
  let local = raw;
  if (!raw.startsWith("file://")) {
    const dest = `${FileSystem.cacheDirectory}ocr_odometro_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: raw, to: dest });
    local = dest;
  }
  return local;
}

function requiredMissing(state) {
  const errs = [];
  const isKmColab = state.tipo_gasto === "KILOMETRAJE_COLABORADOR";
  if (!isKmColab && !state.matricula.trim()) errs.push("MATRICULA");
  if (!isKmColab && (!state.departamento_o_proyecto || state.departamento_o_proyecto === OTRO_DEPARTAMENTO)) {
    if (state.departamento_o_proyecto !== OTRO_DEPARTAMENTO) {
      errs.push("DEPARTAMENTO / PROYECTO");
    } else if (!String(state.departamento_o_proyecto_custom || "").trim()) {
      errs.push("DEPARTAMENTO / PROYECTO (nuevo)");
    }
  }
  if (!state.tipo_gasto) errs.push("TIPO DE GASTO");
  if (!state.forma_pago) errs.push("FORMA DE PAGO");
  if (!isKmColab && (!Array.isArray(state.ticketLocalUris) || state.ticketLocalUris.length === 0)) {
    errs.push("IMAGEN / TICKET (OBLIGATORIO)");
  }
  if (isKmColab) {
    if (!state.fecha_viaje_colaborador) errs.push("FECHA VIAJE");
    if (!String(state.km_inicial_colaborador || "").trim()) errs.push("KM INICIAL");
    if (!String(state.km_final_colaborador || "").trim()) errs.push("KM FINAL");
    if (!String(state.origen_colaborador || "").trim()) errs.push("ORIGEN");
    if (!String(state.destino_colaborador || "").trim()) errs.push("DESTINO");
    if (!String(state.proyecto_colaborador_id || "").trim()) errs.push("PROYECTO A IMPUTAR");
    if (!String(state.motivo_colaborador || "").trim()) errs.push("MOTIVO");
    var kmIni = Number(String(state.km_inicial_colaborador || "").replace(",", "."));
    var kmFin = Number(String(state.km_final_colaborador || "").replace(",", "."));
    if (Number.isFinite(kmIni) && Number.isFinite(kmFin) && kmFin <= kmIni) {
      errs.push("KM FINAL (debe ser mayor que KM INICIAL)");
    }
    if (!String(state.tarifa_eur_km_aplicada || "").trim()) errs.push("TARIFA EUR/KM");
    return errs;
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
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      break;
    case "COMBUSTIBLES":
      if (!state.fecha_repostaje) errs.push("FECHA REPOSTAJE");
      if (!state.entidad_combustible.trim()) errs.push("ENTIDAD");
      if (!state.tipo_combustible) errs.push("TIPO COMBUSTIBLE");
      if (!state.kilometros_repostaje) errs.push("KILOMETROS REPOSTAJE");
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      if (!state.tipo_repostaje) errs.push("TIPO REPOSTAJE");
      if (!state.litros_repostados) errs.push("LITROS REPOSTADOS");
      if (!state.precio_por_litro) errs.push("PRECIO / LITRO");
      if (!state.total_a_pagar) errs.push("TOTAL A PAGAR");
      if (!state.numero_ticket.trim()) errs.push("Nº FACTURA / TICKET");
      break;
    case "PARKING":
      if (!state.fecha_aparcamiento) errs.push("FECHA APARCAMIENTO");
      if (!state.entidad_parking.trim()) errs.push("ENTIDAD");
      if (!state.tipo_zona) errs.push("TIPO ZONA");
      if (!state.hora_inicio_aparcamiento) errs.push("HORA INICIO APARCAMIENTO");
      if (!state.hora_fin_aparcamiento) errs.push("HORA FIN APARCAMIENTO");
      if (!state.importe_aparcamiento) errs.push("IMPORTE APARCAMIENTO");
      break;
    case "PEAJES":
      if (!state.fecha_peaje) errs.push("FECHA PEAJE");
      if (!state.entidad_peaje.trim()) errs.push("ENTIDAD");
      if (!state.importe_peaje) errs.push("IMPORTE PEAJE");
      break;
    case "ITV":
      if (!state.estacion_itv.trim()) errs.push("ESTACION ITV");
      if (!state.fecha_inspeccion) errs.push("FECHA INSPECCIÓN");
      if (!state.fecha_proxima_inspeccion) errs.push("FECHA PROXIMA INSPECCIÓN");
      if (!state.importe_itv) errs.push("IMPORTE ITV");
      if (!state.numero_factura_itv.trim()) errs.push("Nº FACTURA ITV");
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      break;
    case "OTROS":
      if (!state.fecha_otros_gastos) errs.push("FECHA OTROS GASTOS");
      if (!state.proveedor_otros_gastos.trim()) errs.push("PROVEEDOR OTROS GASTOS");
      if (!state.concepto_otros_gastos.trim()) errs.push("CONCEPTO OTROS GASTOS");
      if (!state.importe_otros_gastos) errs.push("IMPORTE OTROS GASTOS");
      if (!state.numero_factura_otros.trim()) errs.push("Nº FACTURA OTROS GASTOS");
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

export default function ExpenseFormScreen({ navigation, route }) {
  const { user, role } = React.useContext(AuthContext);
  const colaborador = isColaborador(role);
  const idViajePropio = String(route?.params?.idViajePropio || "").trim();
  const viajeContext = route?.params?.viajeContext || null;
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
  const [ticketOcrBusy, setTicketOcrBusy] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState("");
  const [readingKm, setReadingKm] = useState(false);
  const [lastOcrUri, setLastOcrUri] = useState("");
  const [projectOptions, setProjectOptions] = useState([]);
  const [tripOptions, setTripOptions] = useState([]);
  const departmentProjectOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (opt) => {
      const value = String(opt?.value || "").trim();
      const label = String(opt?.label || "").trim();
      if (!value || !label || seen.has(value)) return;
      seen.add(value);
      out.push({ value, label });
    };
    for (const p of projectOptions) add(p);
    for (const d of DEPARTAMENTOS_O_PROYECTOS) {
      if (String(d?.value || "") === OTRO_DEPARTAMENTO) continue;
      add(d);
    }
    add({ value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" });
    return out;
  }, [projectOptions]);
  const departmentProjectValues = useMemo(
    () => new Set(departmentProjectOptions.map((o) => String(o?.value || "").trim())),
    [departmentProjectOptions]
  );
  const kmPhotoRequired = useMemo(
    () => ["COMBUSTIBLES", "MANTENIMIENTO_REPARACIONES", "ITV"].includes(String(form.tipo_gasto || "")),
    [form.tipo_gasto]
  );

  useEffect(() => {
    async function loadVehicles() {
      const draft = await localDb.getExpensesDraft();
      if (draft) {
        const nextDraft = { ...draft };
        const eid = String(nextDraft?._editExpenseId || "").trim();
        if (eid) setEditExpenseId(eid);
        delete nextDraft._editExpenseId;
        setForm((p) => ({ ...p, ...nextDraft }));
      }
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
        const withKm = opts.some((o) => o.value === "KILOMETRAJE_COLABORADOR")
          ? opts
          : [{ value: "KILOMETRAJE_COLABORADOR", label: "KILOMETRAJE COLABORADOR" }, ...opts];
        if (withKm.length) setExpenseTypeOptions(withKm);
      } catch {
        // fallback a constantes locales
      }
      try {
        const rows = await loadProjectRows_(user?.email || "");
        const opts = mapProjectOptions_(rows);
        setProjectOptions(opts);
      } catch {
        setProjectOptions([]);
      }
      try {
        const tRes = await sheetsApi.get("viaje_vehiculo_propio_list", { user_email: user?.email || "" });
        const tRows = Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : [];
        setTripOptions(mapTripOptions_(tRows));
      } catch {
        setTripOptions([]);
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
      departamento_o_proyecto: departmentProjectValues.has(dept) ? dept : OTRO_DEPARTAMENTO,
      departamento_o_proyecto_custom: departmentProjectValues.has(dept) ? "" : dept,
    }));
  }, [form.matricula, vehiclesData, form.departamento_o_proyecto, departmentProjectValues]);

  useEffect(() => {
    if (form.tipo_gasto !== "KILOMETRAJE_COLABORADOR") return;
    const id = String(form.proyecto_colaborador_id || "").trim();
    if (!id) return;
    const match = projectOptions.find((p) => p.value === id);
    if (!match) return;
    if (String(form.proyecto_colaborador_nombre || "").trim() === match.label) return;
    setForm((p) => ({ ...p, proyecto_colaborador_nombre: match.label }));
  }, [form.tipo_gasto, form.proyecto_colaborador_id, form.proyecto_colaborador_nombre, projectOptions]);

  useEffect(() => {
    if (form.tipo_gasto !== "KILOMETRAJE_COLABORADOR") return;
    if (!form.fecha_viaje_colaborador) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await sheetsApi.get("tarifa_km_get_vigente", {
          fecha_servicio: form.fecha_viaje_colaborador,
          user_email: user?.email || "",
        });
        const data = res?.data || res || {};
        const eur = Number(String(data?.eur_km || "").replace(",", "."));
        if (cancelled || !Number.isFinite(eur) || eur < 0) return;
        setForm((p) => ({ ...p, tarifa_eur_km_aplicada: String(eur) }));
      } catch {
        // backend decidirá tarifa en guardado
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.tipo_gasto, form.fecha_viaje_colaborador, user?.email]);

  useEffect(() => {
    if (form.tipo_gasto !== "KILOMETRAJE_COLABORADOR") return;
    const kmIni = Number(String(form.km_inicial_colaborador || "").replace(",", "."));
    const kmFin = Number(String(form.km_final_colaborador || "").replace(",", "."));
    const tarifa = Number(String(form.tarifa_eur_km_aplicada || "").replace(",", "."));
    if (!Number.isFinite(kmIni) || !Number.isFinite(kmFin) || !Number.isFinite(tarifa) || kmFin < kmIni) {
      if (String(form.km_recorridos_colaborador || "").trim() || String(form.importe_km_colaborador || "").trim()) {
        setForm((p) => ({ ...p, km_recorridos_colaborador: "", importe_km_colaborador: "" }));
      }
      return;
    }
    const kms = kmFin - kmIni;
    const importe = Number((kms * tarifa).toFixed(2));
    const kmsStr = String(kms);
    const importeStr = importe.toFixed(2);
    if (form.km_recorridos_colaborador === kmsStr && form.importe_km_colaborador === importeStr) return;
    setForm((p) => ({ ...p, km_recorridos_colaborador: kmsStr, importe_km_colaborador: importeStr }));
  }, [
    form.tipo_gasto,
    form.km_inicial_colaborador,
    form.km_final_colaborador,
    form.tarifa_eur_km_aplicada,
    form.km_recorridos_colaborador,
    form.importe_km_colaborador,
  ]);

  useEffect(() => {
    if (!idViajePropio || !viajeContext) return;
    setForm((p) => ({
      ...p,
      id_viaje_propio: String(p.id_viaje_propio || idViajePropio).trim(),
      matricula: String(p.matricula || viajeContext?.matricula || "").trim().toUpperCase(),
      departamento_o_proyecto: String(p.departamento_o_proyecto || viajeContext?.proyecto_nombre || "").trim(),
      forma_pago: String(p.forma_pago || "Usuario"),
    }));
  }, [idViajePropio, viajeContext]);

  useEffect(() => {
    if (form.tipo_gasto !== "COMBUSTIBLES") return;
    const kmActual = String(form.kilometros_actuales || "").trim();
    const kmRepostaje = String(form.kilometros_repostaje || "").trim();
    if (!kmActual || kmRepostaje) return;
    setForm((p) => ({ ...p, kilometros_repostaje: kmActual }));
  }, [form.tipo_gasto, form.kilometros_actuales, form.kilometros_repostaje]);

  useEffect(() => {
    if (form.tipo_gasto !== "COMBUSTIBLES") return;
    const parseDecimal = (v) => {
      const n = parseFloat(String(v || "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    const litros = parseDecimal(form.litros_repostados);
    const precio = parseDecimal(form.precio_por_litro);
    const descuento = parseDecimal(form.descuento);
    if (!litros || !precio) {
      if (String(form.total_a_pagar || "").trim()) set("total_a_pagar", "");
      return;
    }
    const total = Math.max(0, litros * precio - descuento);
    const next = total.toFixed(2);
    if (String(form.total_a_pagar || "") !== next) {
      set("total_a_pagar", next);
    }
  }, [form.tipo_gasto, form.litros_repostados, form.precio_por_litro, form.descuento]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const applyTicketOcrResult_ = (ocr) => {
    const dateYmd = String(ocr?.date || "").trim();
    const dateDmy = dateYmd ? formatYmdToEsDmy(dateYmd) : "";
    const total = String(ocr?.total || "").trim();
    const vendor = String(ocr?.vendor || "").trim();
    const ticketNum = String(ocr?.invoiceNumber || "").trim();
    setForm((prev) => {
      const next = { ...prev };
      switch (String(prev.tipo_gasto || "").trim().toUpperCase()) {
        case "COMBUSTIBLES":
          if (total && !next.total_a_pagar) next.total_a_pagar = total;
          if (dateDmy && !next.fecha_repostaje) next.fecha_repostaje = dateDmy;
          if (vendor && !next.entidad_combustible) next.entidad_combustible = vendor;
          if (ticketNum && !next.numero_ticket) next.numero_ticket = ticketNum;
          break;
        case "PARKING":
          if (total && !next.importe_aparcamiento) next.importe_aparcamiento = total;
          if (dateDmy && !next.fecha_aparcamiento) next.fecha_aparcamiento = dateDmy;
          if (vendor && !next.entidad_parking) next.entidad_parking = vendor;
          break;
        case "PEAJES":
          if (total && !next.importe_peaje) next.importe_peaje = total;
          if (dateDmy && !next.fecha_peaje) next.fecha_peaje = dateDmy;
          if (vendor && !next.entidad_peaje) next.entidad_peaje = vendor;
          break;
        case "ITV":
          if (total && !next.importe_itv) next.importe_itv = total;
          if (dateDmy && !next.fecha_inspeccion) next.fecha_inspeccion = dateDmy;
          if (vendor && !next.estacion_itv) next.estacion_itv = vendor;
          if (ticketNum && !next.numero_factura_itv) next.numero_factura_itv = ticketNum;
          break;
        case "REPUESTOS_RECAMBIO":
          if (total && !next.importe_repuestos) next.importe_repuestos = total;
          if (dateDmy && !next.fecha_compra_repuestos) next.fecha_compra_repuestos = dateDmy;
          if (vendor && !next.proveedor_repuestos) next.proveedor_repuestos = vendor;
          if (ticketNum && !next.numero_factura_repuestos) next.numero_factura_repuestos = ticketNum;
          break;
        case "MANTENIMIENTO_REPARACIONES":
          if (total && !next.importe_mantenimiento) next.importe_mantenimiento = total;
          if (dateDmy && !next.fecha_compra_mantenimiento) next.fecha_compra_mantenimiento = dateDmy;
          if (vendor && !next.proveedor_mantenimiento) next.proveedor_mantenimiento = vendor;
          if (ticketNum && !next.numero_factura_mantenimiento) next.numero_factura_mantenimiento = ticketNum;
          break;
        case "OTROS":
          if (total && !next.importe_otros_gastos) next.importe_otros_gastos = total;
          if (dateDmy && !next.fecha_otros_gastos) next.fecha_otros_gastos = dateDmy;
          if (vendor && !next.proveedor_otros_gastos) next.proveedor_otros_gastos = vendor;
          if (ticketNum && !next.numero_factura_otros) next.numero_factura_otros = ticketNum;
          break;
        default:
          if (total && !next.importe) next.importe = total;
          if (dateDmy && !next.fecha) next.fecha = dateDmy;
          break;
      }
      return next;
    });
  };

  const runTicketOcr = async () => {
    const firstTicket = Array.isArray(form.ticketLocalUris) ? String(form.ticketLocalUris[0] || "").trim() : "";
    if (!firstTicket) {
      Alert.alert("Sin ticket", "Primero adjunta al menos una imagen de ticket.");
      return;
    }
    try {
      setTicketOcrBusy(true);
      const extracted = await syncService.extractTicketDataFromLocalUri(firstTicket);
      applyTicketOcrResult_(extracted);
      const lines = [];
      if (extracted?.date) lines.push(`Fecha: ${extracted.date}`);
      if (extracted?.total) lines.push(`Importe: ${extracted.total}`);
      if (extracted?.vendor) lines.push(`Proveedor: ${extracted.vendor}`);
      if (extracted?.invoiceNumber) lines.push(`Nº ticket/factura: ${extracted.invoiceNumber}`);
      Alert.alert("OCR ticket", lines.length ? `Datos detectados:\n${lines.join("\n")}\n\nSe han aplicado al formulario.` : "Lectura completada.");
    } catch (e) {
      Alert.alert("OCR ticket no disponible", e?.message || "No se pudieron extraer datos del ticket.");
    } finally {
      setTicketOcrBusy(false);
    }
  };

  const readKmFromPhoto = async (uri) => {
    const photoUri = String(uri || "").trim();
    if (!photoUri) return;
    try {
      setReadingKm(true);
      const ocrUri = await prepareImageUriForOcr_(photoUri);
      if (!ocrUri) return;
      const extracted = await syncService.extractOdometerKmFromLocalUri(ocrUri);
      const km = String(extracted?.km || "").trim();
      if (!km) return;
      setForm((p) => ({
        ...p,
        kilometros_actuales: km,
        kilometros_repostaje: p.tipo_gasto === "COMBUSTIBLES" ? km : p.kilometros_repostaje,
      }));
      Alert.alert("KM detectados", `Lectura automática detectada: ${km} km`);
    } catch (e) {
      const detail = String(e?.message || "").trim();
      Alert.alert(
        "Lectura automática no disponible",
        detail
          ? `${detail}\n\nPuedes introducirlos manualmente.`
          : "No se pudieron leer km de la foto. Puedes introducirlos manualmente."
      );
    } finally {
      setReadingKm(false);
    }
  };

  useEffect(() => {
    if (!kmPhotoRequired) return;
    const uri = String(form.odometroLocalUri || "").trim();
    if (!uri) {
      if (lastOcrUri) setLastOcrUri("");
      return;
    }
    if (readingKm) return;
    if (uri === lastOcrUri) return;
    setLastOcrUri(uri);
    readKmFromPhoto(uri);
  }, [kmPhotoRequired, form.odometroLocalUri, readingKm, lastOcrUri]);

  const vehicleSelectOptions = useMemo(
    () => vehicleOptions.map((m) => ({ value: m, label: m })),
    [vehicleOptions]
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (kmPhotoRequired && readingKm) {
        Alert.alert(
          "Lectura en curso",
          "Espera a que termine la lectura automática de km o introduce los km manualmente."
        );
        return;
      }
      const missing = requiredMissing(form);
      if (missing.length) {
        Alert.alert("Faltan datos obligatorios", missing.join("\n"));
        return;
      }

      const departamento_o_proyecto =
        form.departamento_o_proyecto === OTRO_DEPARTAMENTO
          ? String(form.departamento_o_proyecto_custom || "").trim()
          : String(form.departamento_o_proyecto || "").trim();
      const isKmColab = form.tipo_gasto === "KILOMETRAJE_COLABORADOR";
      if (!isKmColab && !departamento_o_proyecto) {
        Alert.alert("Falta proyecto/departamento", "Selecciona un departamento/proyecto o escribe uno nuevo.");
        return;
      }

      const localId = editExpenseId || `${Date.now()}`;
      const payload = {
        local_id: localId,
        id_gasto: localId,
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
        kilometros_actuales: String(form.kilometros_actuales || "").trim(),
        odometro_local_uri: String(form.odometroLocalUri || "").trim(),
        responsable_email: String(user?.email || "").trim().toLowerCase(),
        departamento_o_proyecto: isKmColab
          ? String(form.proyecto_colaborador_nombre || "").trim()
          : departamento_o_proyecto,
        fecha: isKmColab ? String(form.fecha_viaje_colaborador || "").trim() : String(form.fecha || "").trim(),
        km_inicial_colaborador: String(form.km_inicial_colaborador || "").trim(),
        km_final_colaborador: String(form.km_final_colaborador || "").trim(),
        km_recorridos_colaborador: String(form.km_recorridos_colaborador || "").trim(),
        origen_colaborador: String(form.origen_colaborador || "").trim(),
        destino_colaborador: String(form.destino_colaborador || "").trim(),
        id_proyecto: String(form.proyecto_colaborador_id || "").trim(),
        proyecto_nombre: String(form.proyecto_colaborador_nombre || "").trim(),
        id_viaje_propio: String(form.id_viaje_propio || idViajePropio || "").trim(),
        motivo_colaborador: String(form.motivo_colaborador || "").trim(),
        accion_colaborador: String(form.accion_colaborador || "").trim(),
        tarifa_eur_km_aplicada: String(form.tarifa_eur_km_aplicada || "").trim(),
        importe_km_colaborador: String(form.importe_km_colaborador || "").trim(),
        coste_total: isKmColab ? Number(String(form.importe_km_colaborador || "0").replace(",", ".")) || 0 : undefined,
        importe_sin_iva: isKmColab ? Number(String(form.importe_km_colaborador || "0").replace(",", ".")) || 0 : undefined,
        usuario_uid: user?.uid || "",
        usuario_email: user?.email || "",
        usuario_rol: role || "",
        createdAtLocal: new Date().toISOString(),
      };
      const localList = await localDb.getExpenses();
      if (editExpenseId) {
        const nextList = localList.map((x) => {
          const xid = String(x?.id || x?.local_id || "").trim();
          if (xid !== editExpenseId) return x;
          return { id: editExpenseId, ...x, ...payload };
        });
        await localDb.setExpenses(nextList);

        // Si el gasto aún está en outbox, actualizamos ese job para no duplicar envíos.
        const outbox = await localDb.getOutbox();
        let touched = false;
        const nextOutbox = outbox.map((job) => {
          if (job?.kind !== "expense") return job;
          const jLocalId = String(job?.payload?.local_id || "").trim();
          if (jLocalId && jLocalId === editExpenseId) {
            touched = true;
            return { ...job, payload: { ...job.payload, ...payload } };
          }
          return job;
        });
        if (touched) await localDb.setOutbox(nextOutbox);
      } else {
        await localDb.setExpenses([{ id: payload.local_id, ...payload }, ...localList]);
        await syncService.queue({ kind: "expense", payload });
      }
      // No bloqueamos la UI esperando subida de adjuntos: sincronización en segundo plano.
      syncService.flushIfOnline().catch(() => {});
      Alert.alert(
        "Guardado",
        editExpenseId
          ? "Gasto actualizado. Si estaba pendiente de sincronizar, se ha actualizado también en la cola."
          : (idViajePropio || form.id_viaje_propio)
            ? "Gasto de viaje guardado y asociado al viaje. Se sincronizará en segundo plano."
            : "Registro guardado. La sincronización de adjuntos continúa en segundo plano."
      );
      if ((idViajePropio || form.id_viaje_propio) && !editExpenseId) {
        navigation.goBack();
        return;
      }
      setEditExpenseId("");
      setForm(initial);
      await localDb.setExpensesDraft(null);
    } catch (e) {
      Alert.alert("Error al guardar", e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header title={idViajePropio ? "Gasto de viaje vehículo propio" : "Introducción gastos"} onBack={() => navigation.navigate("Menu")} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>GASTOS</Text>
        <SelectField
          label="TIPO DE GASTO"
          required
          value={form.tipo_gasto}
          onChange={(v) => set("tipo_gasto", normalizeExpenseType_(v))}
          options={expenseTypeOptions}
        />
        <SelectField
          label="FORMA DE PAGO"
          required
          value={form.forma_pago}
          onChange={(v) => set("forma_pago", v)}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
        />
        <SelectField
          label="ASIGNAR A VIAJE INICIADO (opcional)"
          required={false}
          value={form.id_viaje_propio}
          onChange={(v) => {
            const id = String(v || "").trim();
            const selected = tripOptions.find((t) => t.value === id);
            setForm((p) => ({
              ...p,
              id_viaje_propio: id,
              matricula: String(p.matricula || selected?.matricula || "").trim().toUpperCase(),
              departamento_o_proyecto: String(p.departamento_o_proyecto || selected?.proyecto_nombre || "").trim(),
            }));
          }}
          options={[{ value: "", label: "Sin viaje" }, ...tripOptions]}
        />
        {form.tipo_gasto !== "KILOMETRAJE_COLABORADOR" ? (
          <>
            <Text style={styles.sectionTitle}>VEHICULO</Text>
            {colaborador ? (
              <TextField
                label="MATRICULA"
                required
                value={form.matricula}
                onChangeText={(v) => set("matricula", String(v || "").toUpperCase())}
                placeholder="Introduce matrícula libre"
                autoCapitalize="characters"
              />
            ) : (
              <SelectField label="MATRICULA" required value={form.matricula} onChange={(v) => set("matricula", v)} options={vehicleSelectOptions} />
            )}
            <SelectField
              label="DEPARTAMENTO / PROYECTO"
              required
              value={form.departamento_o_proyecto}
              onChange={(v) => set("departamento_o_proyecto", v)}
              options={departmentProjectOptions}
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
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>VIAJE COLABORADOR</Text>
            <DateField
              label="FECHA"
              required
              value={form.fecha_viaje_colaborador}
              onChange={(v) => set("fecha_viaje_colaborador", v)}
            />
            <TextField
              label="KM INICIAL"
              required
              value={form.km_inicial_colaborador}
              onChangeText={(v) => set("km_inicial_colaborador", String(v || "").replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
            />
            <TextField
              label="KM FINAL"
              required
              value={form.km_final_colaborador}
              onChangeText={(v) => set("km_final_colaborador", String(v || "").replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
            />
            <TextField label="ORIGEN" required value={form.origen_colaborador} onChangeText={(v) => set("origen_colaborador", v)} />
            <TextField label="DESTINO" required value={form.destino_colaborador} onChangeText={(v) => set("destino_colaborador", v)} />
            <SelectField
              label="PROYECTO A IMPUTAR"
              required
              value={form.proyecto_colaborador_id}
              onChange={(v) => set("proyecto_colaborador_id", v)}
              options={[{ value: "", label: projectOptions.length ? "Selecciona..." : "Sin proyectos en PROYECTOS" }, ...projectOptions]}
            />
            <TextField label="MOTIVO" required value={form.motivo_colaborador} onChangeText={(v) => set("motivo_colaborador", v)} multiline />
            <TextField label="ACCIÓN (opcional)" required={false} value={form.accion_colaborador} onChangeText={(v) => set("accion_colaborador", v)} />
            <TextField
              label="TARIFA EUR/KM"
              required
              value={form.tarifa_eur_km_aplicada}
              onChangeText={(v) => set("tarifa_eur_km_aplicada", String(v || "").replace(",", "."))}
              keyboardType="decimal-pad"
            />
            <TextField label="KM RECORRIDOS (AUTO)" required value={form.km_recorridos_colaborador} onChangeText={() => {}} editable={false} />
            <TextField label="IMPORTE KM (AUTO)" required value={form.importe_km_colaborador} onChangeText={() => {}} editable={false} />
          </>
        )}

        <ImageField
          label="Imagen ticket"
          required={form.tipo_gasto !== "KILOMETRAJE_COLABORADOR"}
          multiple
          valueUris={form.ticketLocalUris}
          onChangeUri={(arr) => set("ticketLocalUris", arr)}
        />
        <Pressable
          style={[styles.ocrActionBtn, ticketOcrBusy && styles.ocrActionBtnDisabled]}
          onPress={runTicketOcr}
          disabled={ticketOcrBusy}
        >
          <Text style={styles.ocrActionText}>{ticketOcrBusy ? "Leyendo ticket..." : "Leer ticket (OCR)"}</Text>
        </Pressable>
        {kmPhotoRequired ? (
          <>
            <ImageField
              label="Foto cuentakilómetros"
              required={false}
              valueUri={form.odometroLocalUri}
              onChangeUri={(uri) => set("odometroLocalUri", uri)}
            />
            {readingKm ? (
              <View style={styles.ocrRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.ocrText}>Leyendo km desde foto...</Text>
              </View>
            ) : null}
            <TextField
              label="KILÓMETROS ACTUALES"
              required
              value={form.kilometros_actuales}
              onChangeText={(v) => set("kilometros_actuales", String(v || "").replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              placeholder="Lectura actual del cuentakm"
            />
          </>
        ) : null}
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
          <TextField label="ENTIDAD" required value={form.entidad_combustible} onChangeText={(v) => set("entidad_combustible", v)} />
          <TextField label="LUGAR REPOSTAJE" required={false} value={form.lugar_repostaje} onChangeText={(v) => set("lugar_repostaje", v)} />
          <SelectField label="MARCA" required={false} value={form.marca_combustible} onChange={(v) => set("marca_combustible", v)} options={FUEL_BRANDS.map((b) => ({ value: b, label: b }))} />
          <SelectField label="TIPO COMBUSTIBLE" required value={form.tipo_combustible} onChange={(v) => set("tipo_combustible", v)} options={FUEL_TYPES.map((t) => ({ value: t, label: t }))} />
          <TextField label="KILOMETROS REPOSTAJE" required value={form.kilometros_repostaje} onChangeText={(v) => set("kilometros_repostaje", v)} keyboardType="number-pad" />
          <SelectField label="TIPO REPOSTAJE" required value={form.tipo_repostaje} onChange={(v) => set("tipo_repostaje", v)} options={[{ value: "PARCIAL", label: "PARCIAL" }, { value: "COMPLETO", label: "COMPLETO" }]} />
          <TextField label="LITROS REPOSTADOS" required value={form.litros_repostados} onChangeText={(v) => set("litros_repostados", v)} keyboardType="decimal-pad" />
          <TextField label="PRECIO / LITRO" required value={form.precio_por_litro} onChangeText={(v) => set("precio_por_litro", v)} keyboardType="decimal-pad" />
          <TextField label="DESCUENTO" required={false} value={form.descuento} onChangeText={(v) => set("descuento", v)} keyboardType="decimal-pad" />
          <TextField label="PUNTOS OBTENIDOS" required={false} value={form.puntos_obtenidos} onChangeText={(v) => set("puntos_obtenidos", v)} keyboardType="decimal-pad" />
          <TextField label="TOTAL A PAGAR (AUTO)" required value={form.total_a_pagar} onChangeText={() => {}} keyboardType="decimal-pad" editable={false} />
          <TextField label="Nº FACTURA / TICKET" required value={form.numero_ticket} onChangeText={(v) => set("numero_ticket", v)} />
        </View>
      ) : null}

      {form.tipo_gasto === "PARKING" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>APARCAMIENTO</Text>
          <DateField label="FECHA APARCAMIENTO" required value={form.fecha_aparcamiento} onChange={(v) => set("fecha_aparcamiento", v)} />
          <TextField label="ENTIDAD" required value={form.entidad_parking} onChangeText={(v) => set("entidad_parking", v)} />
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
          <TextField label="ENTIDAD" required value={form.entidad_peaje} onChangeText={(v) => set("entidad_peaje", v)} />
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
          <TextField label="Nº FACTURA ITV" required value={form.numero_factura_itv} onChangeText={(v) => set("numero_factura_itv", v)} />
          <TextField label="IMPORTE ITV" required value={form.importe_itv} onChangeText={(v) => set("importe_itv", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "OTROS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTROS GASTOS</Text>
          <DateField label="FECHA OTROS GASTOS" required value={form.fecha_otros_gastos} onChange={(v) => set("fecha_otros_gastos", v)} />
          <TextField label="PROVEEDOR OTROS GASTOS" required value={form.proveedor_otros_gastos} onChangeText={(v) => set("proveedor_otros_gastos", v)} />
          <TextField label="CONCEPTO OTROS GASTOS" required value={form.concepto_otros_gastos} onChangeText={(v) => set("concepto_otros_gastos", v)} />
          <TextField label="Nº FACTURA OTROS GASTOS" required value={form.numero_factura_otros} onChangeText={(v) => set("numero_factura_otros", v)} />
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
        <Text style={styles.saveText}>
          {saving ? "Guardando…" : editExpenseId ? "Actualizar gasto" : "Guardar gasto"}
        </Text>
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
  ocrRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4, marginBottom: 8 },
  ocrText: { color: theme.colors.subtext, fontSize: 12 },
  ocrActionBtn: {
    marginTop: -2,
    marginBottom: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  ocrActionBtnDisabled: { opacity: 0.7 },
  ocrActionText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#5fb7ff" },
  saveText: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
});

