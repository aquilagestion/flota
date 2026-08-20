import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import { canRecordExpenseOnBehalf, isColaborador } from "../auth/roles";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { EXPENSE_TYPES, FUEL_BRANDS, FUEL_TYPES, PARKING_ZONES, PAYMENT_METHODS } from "../domain/expenseSchema";
import {
  IVA_RATE_OPTIONS,
  IVA_RATE_OTRO,
  IVA_RATE_PRESET_VALUES,
  ivaSelectValueFromStored_,
  isIvaOtroSelected_,
  calcFuelFromTotalLitrosIva_,
  calcBilleteBreakdown_,
  calcIvaBreakdown_,
  expenseNeedsIvaBreakdown_,
  expenseTotalForIva_,
} from "../lib/expenseIva";
import { buildDepartmentProjectSelectOptions } from "../../flotaWeb/lib/departmentProjectSelectOptions";
import { withNumberedSelectLabels } from "../../flotaWeb/lib/numberedSelectOptions";
import { loadProjectSelectOptions } from "../../flotaWeb/lib/proyectoResolve";
import { formatDateEsValue, normalizeDateToDmy } from "../../flotaWeb/lib/format";
import { theme } from "../ui/theme";
import { DateField, SelectField, TextField, TimeField } from "../ui/form/Fields";
import ImageField from "../ui/form/ImageField";
import { sheetsApi } from "../api/sheetsApi";
import * as FileSystem from "expo-file-system";
import ExpenseVoiceFillWizard from "../ui/ExpenseVoiceFillWizard";
import { ExpenseFieldVoiceProvider } from "../ui/ExpenseFieldVoiceProvider";
import { applyVoiceFieldNative, buildVoiceFieldSnapshot, voiceFieldsSupportedForTipo } from "../lib/expenseVoiceApply";
import { scrollToVoiceFieldWithRetry } from "../../flotaWeb/lib/expenseVoiceFieldScroll";
import { hydrateExpenseFormFromRecord, hydrateExpenseTicketPreviews_, buildExpenseEntityAliases_ } from "../../flotaWeb/lib/expenseFormHydrate";
import {
  ABILAS_OTROS_SUBTIPOS,
  lifeProjectKeyFromText_,
  normalizeAbilasOtrosSubtipo_,
} from "../../flotaWeb/lib/lifeOtrosSheet";
import {
  realignTicketDriveFields,
  ticketDriveFieldsFromLists,
  parseTicketDriveUrlsOrdered,
  parseTicketDriveFileNamesOrdered,
  compactTicketLocalUrisForPersist,
  ticketUrisNeedDriveUpload,
} from "../lib/expenseSheetTickets";

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
  iva_porcentaje: "21",
  base_imponible: "",
  cuota_iva: "",
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
  precio_por_litro_sin_iva: "",
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
  numero_factura_peaje: "",
  entrada_peaje: "",
  salida_peaje: "",
  importe_peaje: "",
  fecha_ida_billete: "",
  fecha_vuelta_billete: "",
  origen_billete: "",
  destino_billete: "",
  numero_reserva_billete: "",
  numero_personas_billete: "",
  compania_billete: "",
  precio_total_billete: "",
  tasas_billete: "",
  concepto_billete: "",
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
  numero_personas_hospedaje: "",
  numero_comensales_manutencion: "",
  subtipo_otros: "",
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

function normalizeExpenseType_(raw) {
  const v = String(raw || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!v) return "";
  if (v === "OTROS_IMPUESTOS" || v === "OTRO_IMPUESTO") return "OTROS_IMPUESTOS";
  if (v === "GASTOS_MULTAS") return "MULTAS_SANCIONES";
  if (v === "MULTAS" || v === "MULTAS_SANCIONES") return "MULTAS_SANCIONES";
  if (v === "COMBUSTIBLE" || v === "COMBUSTIBLES") return "COMBUSTIBLES";
  if (v === "SEGURO" || v === "SEGUROS") return "SEGURO";
  if (v === "PARKING" || v === "PARKIG" || v === "APARCAMIENTO") return "PARKING";
  if (v === "PEAJE" || v === "PEAJES") return "PEAJES";
  if (v === "BILLETE" || v === "BILLETES" || v === "GASTOS_BILLETES" || v === "GASTO_BILLETES" || v === "TICKET") {
    return "GASTOS_BILLETES";
  }
  if (v === "IMPUESTO" || v === "IMPUESTOS" || v === "IVM") return "IMPUESTOS";
  if (v === "REPUESTO" || v === "REPUESTOS" || v === "REPUESTOS_RECAMBIO" || v === "RECAMBIOS") return "REPUESTOS_RECAMBIO";
  if (
    v === "MANTENIMIENTO" ||
    v === "REPARACIONES" ||
    v === "MANTENIMIENTO_REPARACIONES" ||
    v === "MANTENIMIENTO_REPARACION"
  ) {
    return "MANTENIMIENTO_REPARACIONES";
  }
  if (v === "KILOMETRAJE_COLAB" || v === "KILOMETRAJE_COLABORADOR" || v === "KM_COLABORADOR") {
    return "KILOMETRAJE_COLABORADOR";
  }
  // Hospedaje y Manutención son tipos propios del catálogo (columna A), no se fusionan con OTROS.
  if (v === "HOSPEDAJE") return "HOSPEDAJE";
  if (v === "MANUTENCION") return "MANUTENCION";
  return v;
}

/** Activo en catálogo (Sí / SI / true / 1). */
function isCatActivoSi_(raw) {
  const s = String(raw == null ? "" : raw)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return true;
  return s === "SI" || s === "S" || s === "TRUE" || s === "1" || s === "YES" || s === "Y";
}

function pickExpenseTypeLabelFromRow_(row) {
  if (!row || typeof row !== "object") return "";
  const direct =
    row.Tipo_Gasto ||
    row.tipo_gasto ||
    row.tipo ||
    row.Tipo ||
    row.nombre ||
    row.label ||
    row.value ||
    "";
  const fromDirect = String(direct || "").trim();
  if (fromDirect) return fromDirect;
  // Columna A: primer valor no vacío que no sea el flag activo
  const entries = Object.entries(row);
  for (const [k, v] of entries) {
    const key = String(k || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!key || key === "activo" || key === "_row") continue;
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

function pickExpenseTypeActivoFromRow_(row) {
  if (!row || typeof row !== "object") return "";
  if (row.activo != null && String(row.activo).trim() !== "") return row.activo;
  if (row.Activo != null && String(row.Activo).trim() !== "") return row.Activo;
  const entries = Object.entries(row);
  if (entries.length >= 2) return entries[1][1];
  return "";
}

function buildExpenseTypeOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const options = [];
  for (const r of list) {
    if (!isCatActivoSi_(pickExpenseTypeActivoFromRow_(r))) continue;
    const label = pickExpenseTypeLabelFromRow_(r);
    if (!label) continue;
    const value = normalizeExpenseType_(label);
    if (!value) continue;
    if (!options.find((o) => o.value === value)) {
      options.push({ value, label: label.replace(/_/g, " ") });
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

function mapTripOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    const id = String(r?.id_viaje || "").trim();
    const estado = String(r?.estado || "").trim().toUpperCase();
    // Solo viajes no cerrados (ABIERTO / EN_CURSO / vacío).
    if (!id || estado === "CERRADO") continue;
    const fecha = formatDateEsValue(r?.fecha_viaje) || String(r?.fecha_viaje || "").trim();
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
      usuario_email: String(r?.usuario_email || r?.responsable_email || "").trim().toLowerCase(),
      estado: estado || "ABIERTO",
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

function formatYmdToEsDmy(ymd) {
  const raw = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "";
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
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

/** Alert compatible con web (window.alert) y nativo. En web RN Alert a menudo no pinta nada. */
function notifyUser_(title, message) {
  const t = String(title || "").trim();
  const m = String(message || "").trim();
  const text = m ? `${t}\n\n${m}` : t;
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(text);
    return;
  }
  Alert.alert(t || "Aviso", m || "");
}

function requiredMissing(state) {
  const errs = [];
  const s = (v) => String(v ?? "").trim();
  const isKmColab = state.tipo_gasto === "KILOMETRAJE_COLABORADOR";
  const isOtros = state.tipo_gasto === "OTROS";
  const isBillete = state.tipo_gasto === "GASTOS_BILLETES";
  if (!isKmColab && !isOtros && !isBillete && !s(state.matricula)) errs.push("MATRICULA");
  if (!isKmColab && (!state.departamento_o_proyecto || state.departamento_o_proyecto === OTRO_DEPARTAMENTO)) {
    if (state.departamento_o_proyecto !== OTRO_DEPARTAMENTO) {
      errs.push("DEPARTAMENTO / PROYECTO");
    } else if (!s(state.departamento_o_proyecto_custom)) {
      errs.push("DEPARTAMENTO / PROYECTO (nuevo)");
    }
  }
  if (!state.tipo_gasto) errs.push("TIPO DE GASTO");
  if (!state.forma_pago) errs.push("FORMA DE PAGO");
  if (isKmColab) {
    if (!state.fecha_viaje_colaborador) errs.push("FECHA VIAJE");
    if (!s(state.km_inicial_colaborador)) errs.push("KM INICIAL");
    if (!s(state.km_final_colaborador)) errs.push("KM FINAL");
    if (!s(state.origen_colaborador)) errs.push("ORIGEN");
    if (!s(state.destino_colaborador)) errs.push("DESTINO");
    if (!s(state.proyecto_colaborador_id)) errs.push("PROYECTO A IMPUTAR");
    if (!s(state.motivo_colaborador)) errs.push("MOTIVO");
    var kmIni = Number(String(state.km_inicial_colaborador || "").replace(",", "."));
    var kmFin = Number(String(state.km_final_colaborador || "").replace(",", "."));
    if (Number.isFinite(kmIni) && Number.isFinite(kmFin) && kmFin <= kmIni) {
      errs.push("KM FINAL (debe ser mayor que KM INICIAL)");
    }
    if (!s(state.tarifa_eur_km_aplicada)) errs.push("TARIFA EUR/KM");
    return errs;
  }

  switch (state.tipo_gasto) {
    case "SEGURO":
      if (!s(state.compania)) errs.push("COMPAÑIA");
      if (!s(state.numero_poliza)) errs.push("Nº POLIZA");
      if (!s(state.cobertura)) errs.push("COBERTURA");
      if (!state.fecha_inicio_seguro) errs.push("FECHA INICIO SEGURO");
      if (!state.fecha_fin_seguro) errs.push("FECHA FIN SEGURO");
      if (!state.prima) errs.push("PRIMA");
      break;
    case "IMPUESTOS":
      if (!state.periodo_ivm) errs.push("PERIODO I.V.M.");
      if (!state.importe_ivm) errs.push("IMPORTE I.V.M.");
      break;
    case "OTROS_IMPUESTOS":
      if (!s(state.tipo_otro_impuesto)) errs.push("TIPO DE IMPUESTO");
      if (!state.fecha_pago) errs.push("FECHA DE PAGO");
      if (!state.fecha_proximo_pago) errs.push("FECHA PROXIMO PAGO");
      if (!state.importe_otros_impuestos) errs.push("IMPORTE OTROS IMPUESTOS");
      break;
    case "REPUESTOS_RECAMBIO":
      if (!state.fecha_compra_repuestos) errs.push("FECHA COMPRA REPUESTOS / RECAMBIOS");
      if (!s(state.proveedor_repuestos)) errs.push("PROVEEDOR REPUESTOS / RECAMBIOS");
      if (!s(state.descripcion_repuestos)) errs.push("DESCRIPCION REPUESTOS / RECAMBIOS");
      if (!state.importe_repuestos) errs.push("IMPORTE REPUESTOS / RECAMBIOS");
      break;
    case "MANTENIMIENTO_REPARACIONES":
      if (!state.fecha_compra_mantenimiento) errs.push("FECHA COMPRA MANTENIMIENTO / REPARACIONES");
      if (!s(state.proveedor_mantenimiento)) errs.push("PROVEEDOR MANTENIMIENTO / REPARACIONES");
      if (!s(state.descripcion_mantenimiento)) errs.push("DESCRIPCION MANTENIMIENTO / REPARACIONES");
      if (!state.importe_mantenimiento) errs.push("IMPORTE MANTENIMIENTO / REPARACIONES");
      if (!state.fecha_proximo_mantenimiento) errs.push("FECHA PROXIMO MANTENIMIENTO / REPARACIONES");
      if (!state.kilometros_proximo_mantenimiento) errs.push("KILOMETROS PROXIMO MANTENIMIENTO / REPARACIONES");
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      break;
    case "COMBUSTIBLES":
      if (!state.fecha_repostaje) errs.push("FECHA REPOSTAJE");
      if (!s(state.entidad_combustible)) errs.push("ENTIDAD");
      if (!state.tipo_combustible) errs.push("TIPO COMBUSTIBLE");
      if (!state.kilometros_repostaje) errs.push("KILOMETROS REPOSTAJE");
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      if (!state.tipo_repostaje) errs.push("TIPO REPOSTAJE");
      if (!state.litros_repostados) errs.push("LITROS REPOSTADOS");
      if (!state.total_a_pagar) errs.push("TOTAL A PAGAR");
      break;
    case "PARKING":
      if (!state.fecha_aparcamiento) errs.push("FECHA APARCAMIENTO");
      if (!s(state.entidad_parking)) errs.push("ENTIDAD");
      if (!state.tipo_zona) errs.push("TIPO ZONA");
      if (!state.hora_inicio_aparcamiento) errs.push("HORA INICIO APARCAMIENTO");
      if (!state.hora_fin_aparcamiento) errs.push("HORA FIN APARCAMIENTO");
      if (!state.importe_aparcamiento) errs.push("IMPORTE APARCAMIENTO");
      break;
    case "PEAJES":
      if (!state.fecha_peaje) errs.push("FECHA PEAJE");
      if (!s(state.entidad_peaje)) errs.push("ENTIDAD");
      if (!state.importe_peaje) errs.push("IMPORTE PEAJE");
      break;
    case "GASTOS_BILLETES":
      if (!state.fecha_ida_billete) errs.push("FECHA IDA");
      if (!s(state.origen_billete)) errs.push("ORIGEN");
      if (!s(state.destino_billete)) errs.push("DESTINO");
      if (!s(state.numero_reserva_billete)) errs.push("N FACTURA");
      if (!s(state.numero_personas_billete)) errs.push("N PERSONAS");
      if (!s(state.compania_billete)) errs.push("PROVEEDOR");
      if (!state.precio_total_billete) errs.push("IMPORTE TOTAL");
      break;
    case "ITV":
      if (!s(state.estacion_itv)) errs.push("ESTACION ITV");
      if (!state.fecha_inspeccion) errs.push("FECHA INSPECCIÓN");
      if (!state.fecha_proxima_inspeccion) errs.push("FECHA PROXIMA INSPECCIÓN");
      if (!state.importe_itv) errs.push("IMPORTE ITV");
      if (!state.kilometros_actuales) errs.push("KILOMETROS ACTUALES");
      break;
    case "OTROS":
      if (!state.fecha_otros_gastos) errs.push("FECHA OTROS GASTOS");
      if (!s(state.proveedor_otros_gastos)) errs.push("PROVEEDOR OTROS GASTOS");
      if (!s(state.concepto_otros_gastos)) errs.push("CONCEPTO OTROS GASTOS");
      if (!state.importe_otros_gastos) errs.push("IMPORTE OTROS GASTOS");
      {
        const dept =
          state.departamento_o_proyecto === OTRO_DEPARTAMENTO
            ? s(state.departamento_o_proyecto_custom)
            : s(state.departamento_o_proyecto);
        if (lifeProjectKeyFromText_(dept) === "ABILAS" && !normalizeAbilasOtrosSubtipo_(state.subtipo_otros)) {
          errs.push("SUBTIPO OTROS (Alimentación / Educación / Veterinarios)");
        }
      }
      break;
    case "HOSPEDAJE":
      if (!state.fecha_otros_gastos) errs.push("FECHA");
      if (!s(state.proveedor_otros_gastos)) errs.push("ENTIDAD / ESTABLECIMIENTO");
      if (!state.importe_otros_gastos) errs.push("IMPORTE");
      if (!s(state.numero_personas_hospedaje)) errs.push("Nº HUÉSPEDES");
      break;
    case "MANUTENCION":
      if (!state.fecha_otros_gastos) errs.push("FECHA");
      if (!s(state.proveedor_otros_gastos)) errs.push("NOMBRE ESTABLECIMIENTO");
      if (!state.importe_otros_gastos) errs.push("IMPORTE");
      if (!s(state.numero_comensales_manutencion)) errs.push("Nº COMENSALES");
      break;
    case "MULTAS_SANCIONES":
      if (!state.fecha_multa) errs.push("FECHA MULTA");
      if (!s(state.conductor_multa)) errs.push("CONDUCTOR");
      if (!s(state.lugar_multa)) errs.push("LUGAR");
      if (!s(state.organismo_denunciante)) errs.push("ORGANISMO DENUNCIANTE");
      if (!s(state.tipo_infraccion)) errs.push("TIPO INFRACCIÓN");
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
  const canOnBehalf = canRecordExpenseOnBehalf(role);
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
  const [saveStatusMsg, setSaveStatusMsg] = useState("");
  const [ticketOcrBusy, setTicketOcrBusy] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState("");
  const [readingKm, setReadingKm] = useState(false);
  const [lastOcrUri, setLastOcrUri] = useState("");
  const [projectOptions, setProjectOptions] = useState([]);
  const [tripOptionsAll, setTripOptionsAll] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  /** Vacío = grabar a nombre propio; si GESTOR elige otro email, ese es el titular. */
  const [onBehalfEmail, setOnBehalfEmail] = useState("");
  const [voiceWizardVisible, setVoiceWizardVisible] = useState(false);
  const formScrollRef = useRef(null);
  /** Evita que hydrate async de tickets reinyecte adjuntos tras quitarlos. */
  const ticketsUserEditedRef = useRef(false);
  const ticketPreviewSeqRef = useRef(0);
  const { width } = useWindowDimensions();
  const threeCol = Platform.OS === "web" && width >= 900;
  const departmentProjectOptions = useMemo(
    () => buildDepartmentProjectSelectOptions(projectOptions),
    [projectOptions]
  );
  const numberedProjectOptions = useMemo(
    () => withNumberedSelectLabels(projectOptions),
    [projectOptions]
  );
  const departmentProjectValues = useMemo(
    () => new Set(departmentProjectOptions.map((o) => String(o?.value || "").trim())),
    [departmentProjectOptions]
  );
  const kmPhotoRequired = useMemo(
    () => ["COMBUSTIBLES", "MANTENIMIENTO_REPARACIONES", "ITV"].includes(String(form.tipo_gasto || "")),
    [form.tipo_gasto]
  );
  const selfEmail = String(user?.email || "").trim().toLowerCase();
  const titularEmail = String(onBehalfEmail || selfEmail).trim().toLowerCase();
  const tripOptions = useMemo(() => {
    // Siempre los viajes del titular del gasto (yo u «a nombre de»).
    return tripOptionsAll.filter((t) => {
      const owner = String(t?.usuario_email || "").trim().toLowerCase();
      if (!owner) return true;
      if (!titularEmail) return true;
      return owner === titularEmail;
    });
  }, [titularEmail, tripOptionsAll]);

  const reloadOpenTrips_ = useCallback(async () => {
    const email = String(user?.email || "").trim().toLowerCase();
    if (!email) {
      setTripOptionsAll([]);
      return;
    }
    try {
      const tRes = await sheetsApi.get(
        "viaje_vehiculo_propio_list",
        { user_email: email },
        { timeoutMs: 45000 }
      );
      const tRows = Array.isArray(tRes?.data)
        ? tRes.data
        : Array.isArray(tRes?.data?.viajes)
          ? tRes.data.viajes
          : Array.isArray(tRes)
            ? tRes
            : [];
      setTripOptionsAll(mapTripOptions_(tRows));
    } catch {
      // Mantener lista previa si falla el refresco.
    }
  }, [user?.email]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const draft = await localDb.getExpensesDraft();
        const eid = String(draft?._editExpenseId || "").trim();
        if (cancelled) return;
        if (eid && draft) {
          // Solo cargar borrador cuando se abre desde «Editar gastos» / Modificar.
          const nextDraft = { ...draft };
          delete nextDraft._editExpenseId;
          const hydrated = hydrateExpenseFormFromRecord(nextDraft);
          ticketsUserEditedRef.current = false;
          ticketPreviewSeqRef.current += 1;
          const previewSeq = ticketPreviewSeqRef.current;
          setEditExpenseId(eid);
          setForm({ ...initial, ...hydrated });
          {
            const owner = String(hydrated?.responsable_email || "").trim().toLowerCase();
            const me = String(user?.email || "").trim().toLowerCase();
            if (canOnBehalf && owner && me && owner !== me) setOnBehalfEmail(owner);
            else setOnBehalfEmail("");
          }
          // Tickets Drive → preview visible en web y APK.
          try {
            const withTickets = await hydrateExpenseTicketPreviews_(hydrated, {
              apiGet: (action, params) => sheetsApi.get(action, params),
              userEmail: String(user?.email || "").trim(),
            });
            if (
              !cancelled &&
              previewSeq === ticketPreviewSeqRef.current &&
              !ticketsUserEditedRef.current &&
              Array.isArray(withTickets?.ticketLocalUris) &&
              withTickets.ticketLocalUris.length
            ) {
              // Conservar refs Drive alineadas (mismos índices) bajo las previews data URI.
              const driveUrls = parseTicketDriveUrlsOrdered(hydrated);
              const driveNames = parseTicketDriveFileNamesOrdered(hydrated);
              const uris = withTickets.ticketLocalUris;
              while (driveUrls.length < uris.length) driveUrls.push("");
              while (driveNames.length < uris.length) driveNames.push("");
              setForm((p) => ({
                ...p,
                ticketLocalUris: uris,
                ...ticketDriveFieldsFromLists(driveUrls.slice(0, uris.length), driveNames.slice(0, uris.length)),
              }));
            }
          } catch {
            /* preview opcional */
          }
        } else {
          // Entrada normal (Menú → Gastos): siempre formulario vacío.
          ticketsUserEditedRef.current = false;
          setEditExpenseId("");
          setForm({ ...initial });
          setOnBehalfEmail("");
          await localDb.setExpensesDraft(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.email, canOnBehalf])
  );

  useEffect(() => {
    const fromRoute = String(route?.params?.onBehalfEmail || "").trim().toLowerCase();
    const me = String(user?.email || "").trim().toLowerCase();
    if (!canOnBehalf) {
      setOnBehalfEmail("");
      return;
    }
    if (fromRoute && me && fromRoute !== me) setOnBehalfEmail(fromRoute);
  }, [route?.params?.onBehalfEmail, user?.email, canOnBehalf]);

  useEffect(() => {
    async function loadVehicles() {
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
        const withBilletes = withKm.some((o) => o.value === "GASTOS_BILLETES")
          ? withKm
          : [{ value: "GASTOS_BILLETES", label: "GASTOS BILLETES" }, ...withKm];
        if (withBilletes.length) setExpenseTypeOptions(withBilletes);
      } catch {
        // fallback a constantes locales
      }
      try {
        const cached = await localDb.getProjectSelectOptions(user?.email || "");
        if (cached.length) setProjectOptions(cached);
        const opts = await loadProjectSelectOptions(
          (action, params) => sheetsApi.get(action, params, { timeoutMs: 45000 }),
          user?.email || "",
          {
            readCache: (e) => localDb.getProjectSelectOptions(e),
            writeCache: (e, list) => localDb.setProjectSelectOptions(e, list),
          }
        );
        if (opts.length) setProjectOptions(opts);
      } catch {
        // mantener caché si ya se cargó
      }
      await reloadOpenTrips_();
      if (canOnBehalf) {
        try {
          const res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" });
          const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          const users = rows
            .map((u) => {
              const email = String(u?.email || "").trim().toLowerCase();
              const nombre = String(u?.nombre || "").trim();
              const activo = String(u?.activo || u?.estado || "SI").trim().toUpperCase();
              if (!email) return null;
              if (activo === "NO" || activo === "FALSE" || activo === "0" || activo === "INACTIVO") return null;
              return { value: email, label: nombre ? `${nombre} (${email})` : email };
            })
            .filter(Boolean)
            .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
          setUserOptions(users);
        } catch {
          setUserOptions([]);
        }
      }
    }
    loadVehicles();
  }, [user?.email, canOnBehalf, reloadOpenTrips_]);

  useFocusEffect(
    useCallback(() => {
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
          if (!cancelled && opts.length) setProjectOptions(opts);
        } catch {
          // mantener lista actual
        }
        if (!cancelled) await reloadOpenTrips_();
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.email, reloadOpenTrips_])
  );

  useEffect(() => {
    let t = setTimeout(async () => {
      if (!editExpenseId) return;
      // Solo autosave en modo edición. Compactar tiquets para no hinchar localStorage web.
      try {
        const aligned = realignTicketDriveFields(form, form.ticketLocalUris || []);
        const driveParallel = parseTicketDriveUrlsOrdered(aligned);
        while (driveParallel.length < (aligned.ticketLocalUris || []).length) driveParallel.push("");
        const storageUris = compactTicketLocalUrisForPersist(aligned.ticketLocalUris, driveParallel);
        await localDb.setExpensesDraft({
          ...form,
          ticketLocalUris: storageUris,
          _editExpenseId: editExpenseId,
        });
        setAutosaveMsg("Borrador guardado");
      } catch {
        // No bloquear la UI si el borrador no cabe en storage.
      }
    }, 350);
    const msgTimer = setTimeout(() => setAutosaveMsg(""), 1200);
    return () => {
      clearTimeout(t);
      clearTimeout(msgTimer);
    };
  }, [form, editExpenseId]);

  // Auto-relleno / rematch desde ficha del vehículo cuando llega la lista PROYECTOS
  useEffect(() => {
    const plate = String(form.matricula || "").trim().toUpperCase();
    const current = String(form.departamento_o_proyecto || "").trim();
    const custom = String(form.departamento_o_proyecto_custom || "").trim();

    // Si por voz/sync quedó el id de columna A (PRO-…), pasar al nombre de columna B
    if (current && /^PRO[-_]?\d+/i.test(current) && projectOptions.length) {
      const hit = projectOptions.find((o) => String(o?.value || "").trim() === current);
      const name = String(hit?.label || "").trim();
      if (name && name !== current) {
        setForm((p) => ({
          ...p,
          departamento_o_proyecto: name,
          departamento_o_proyecto_custom: "",
        }));
        return;
      }
    }

    if (!plate) return;
    const selectedVehicle = vehiclesData.find(
      (v) => String(v?.matricula || "").trim().toUpperCase() === plate
    );
    const dept = String(selectedVehicle?.departamento_o_proyecto || "").trim();

    // Si quedó en «otro» porque la lista aún no había cargado, rematch al nombre de columna B
    if (current === OTRO_DEPARTAMENTO && custom && departmentProjectValues.has(custom)) {
      setForm((p) => ({
        ...p,
        departamento_o_proyecto: custom,
        departamento_o_proyecto_custom: "",
      }));
      return;
    }

    if (current && current !== OTRO_DEPARTAMENTO) return;
    if (!dept) return;
    if (departmentProjectValues.has(dept)) {
      setForm((p) => ({
        ...p,
        departamento_o_proyecto: dept,
        departamento_o_proyecto_custom: "",
      }));
      return;
    }
    if (!current) {
      setForm((p) => ({
        ...p,
        departamento_o_proyecto: OTRO_DEPARTAMENTO,
        departamento_o_proyecto_custom: dept,
      }));
    }
  }, [
    form.matricula,
    vehiclesData,
    form.departamento_o_proyecto,
    form.departamento_o_proyecto_custom,
    departmentProjectValues,
    projectOptions,
  ]);

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
    if (!kmActual) return;
    if (String(form.kilometros_repostaje || "").trim() === kmActual) return;
    setForm((p) => ({ ...p, kilometros_repostaje: kmActual }));
  }, [form.tipo_gasto, form.kilometros_actuales, form.kilometros_repostaje]);

  useEffect(() => {
    if (form.tipo_gasto !== "COMBUSTIBLES") return;
    const fuel = calcFuelFromTotalLitrosIva_(
      form.total_a_pagar,
      form.litros_repostados,
      form.iva_porcentaje ?? "21"
    );
    const nextPrecio = fuel.precio_litro_con_iva_str;
    const nextSin = fuel.precio_litro_sin_iva_str;
    if (
      String(form.precio_por_litro || "") === nextPrecio &&
      String(form.precio_por_litro_sin_iva || "") === nextSin
    ) {
      return;
    }
    setForm((p) => ({
      ...p,
      precio_por_litro: nextPrecio,
      precio_por_litro_sin_iva: nextSin,
      descuento: p.descuento || "",
    }));
  }, [
    form.tipo_gasto,
    form.litros_repostados,
    form.total_a_pagar,
    form.iva_porcentaje,
    form.precio_por_litro,
    form.precio_por_litro_sin_iva,
  ]);

  const ivaBreakdown = useMemo(() => {
    if (!expenseNeedsIvaBreakdown_(form.tipo_gasto)) return null;
    if (String(form.tipo_gasto || "").trim().toUpperCase() === "GASTOS_BILLETES") {
      return calcBilleteBreakdown_(form.precio_total_billete, form.tasas_billete, form.iva_porcentaje ?? "21");
    }
    return calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
  }, [
    form.tipo_gasto,
    form.iva_porcentaje,
    form.total_a_pagar,
    form.prima,
    form.importe_ivm,
    form.importe_otros_impuestos,
    form.importe_repuestos,
    form.importe_mantenimiento,
    form.importe_aparcamiento,
    form.importe_peaje,
    form.precio_total_billete,
    form.tasas_billete,
    form.importe_itv,
    form.importe_otros_gastos,
    form.importe_multa,
    form.importe_km_colaborador,
  ]);

  const fuelBreakdown = useMemo(() => {
    if (String(form.tipo_gasto || "").toUpperCase() !== "COMBUSTIBLES") return null;
    return calcFuelFromTotalLitrosIva_(
      form.total_a_pagar,
      form.litros_repostados,
      form.iva_porcentaje ?? "21"
    );
  }, [form.tipo_gasto, form.total_a_pagar, form.litros_repostados, form.iva_porcentaje]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setTicketLocalUris = useCallback((nextUris) => {
    ticketsUserEditedRef.current = true;
    ticketPreviewSeqRef.current += 1;
    setForm((p) => ({ ...p, ...realignTicketDriveFields(p, nextUris) }));
  }, []);

  const handleVoiceFieldApplied = useCallback(
    (key, value) => {
      applyVoiceFieldNative(key, value, setForm, projectOptions, vehicleOptions);
    },
    [projectOptions, vehicleOptions]
  );

  const handleVoiceFieldFocus = useCallback((key) => {
    scrollToVoiceFieldWithRetry(key, formScrollRef);
  }, []);

  const handleVoiceOdometerImagePicked = useCallback(async (uriOrFile) => {
    const uri =
      Platform.OS === "web" && uriOrFile && typeof uriOrFile !== "string"
        ? URL.createObjectURL(uriOrFile)
        : uriOrFile;
    if (!uri) return false;
    setForm((p) => ({ ...p, odometroLocalUri: uri }));
    return true;
  }, []);

  const handleVoiceTicketImagePicked = useCallback(async (uriOrFile) => {
    let uri = "";
    if (Platform.OS === "web" && uriOrFile && typeof uriOrFile !== "string") {
      const file = uriOrFile;
      const mime = String(file?.type || "").toLowerCase();
      try {
        uri = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } catch {
        uri = URL.createObjectURL(file);
      }
      if (!uri && mime) return false;
    } else {
      uri = String(uriOrFile || "").trim();
    }
    if (!uri) return false;
    ticketsUserEditedRef.current = true;
    ticketPreviewSeqRef.current += 1;
    setForm((p) => {
      const prev = Array.isArray(p.ticketLocalUris) ? p.ticketLocalUris : [];
      return { ...p, ...realignTicketDriveFields(p, [...prev, uri]) };
    });
    return true;
  }, []);

  const voiceInitialValues = useMemo(
    () => buildVoiceFieldSnapshot(form.tipo_gasto, form, { projectOptions, platform: "native" }),
    [form, projectOptions]
  );

  const applyTicketOcrResult_ = (ocr) => {
    const dateDmy = normalizeDateToDmy(ocr?.date) || "";
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
          if (ticketNum && !next.numero_factura_peaje) next.numero_factura_peaje = ticketNum;
          break;
        case "GASTOS_BILLETES":
          if (total && !next.precio_total_billete) next.precio_total_billete = total;
          if (dateDmy && !next.fecha_ida_billete) next.fecha_ida_billete = dateDmy;
          if (vendor && !next.compania_billete) next.compania_billete = vendor;
          if (ticketNum && !next.numero_reserva_billete) next.numero_reserva_billete = ticketNum;
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
        case "HOSPEDAJE":
        case "MANUTENCION":
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
      notifyUser_("Sin tiquet", "Primero adjunta al menos una imagen o un PDF de tiquet.");
      return;
    }
    if (
      firstTicket.startsWith("data:application/pdf") ||
      /\.pdf(\?|#|$)/i.test(firstTicket) ||
      firstTicket.toLowerCase().includes("application/pdf")
    ) {
      notifyUser_("OCR no disponible", "El OCR de tiquet solo funciona con imágenes (JPG/PNG). El PDF sí se guarda y se incluye en la hoja.");
      return;
    }
    try {
      setTicketOcrBusy(true);
      const extracted = await syncService.extractTicketDataFromLocalUri(firstTicket);
      applyTicketOcrResult_(extracted);
      const lines = [];
      if (extracted?.date) lines.push(`Fecha: ${normalizeDateToDmy(extracted.date) || extracted.date}`);
      if (extracted?.total) lines.push(`Importe: ${extracted.total}`);
      if (extracted?.vendor) lines.push(`Proveedor: ${extracted.vendor}`);
      if (extracted?.invoiceNumber) lines.push(`Nº ticket/factura: ${extracted.invoiceNumber}`);
      notifyUser_("OCR ticket", lines.length ? `Datos detectados:\n${lines.join("\n")}\n\nSe han aplicado al formulario.` : "Lectura completada.");
    } catch (e) {
      notifyUser_("OCR ticket no disponible", e?.message || "No se pudieron extraer datos del ticket.");
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
      notifyUser_("KM detectados", `Lectura automática detectada: ${km} km`);
    } catch (e) {
      const detail = String(e?.message || "").trim();
      notifyUser_(
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
    const wasEditing = !!editExpenseId;
    setSaving(true);
    setSaveStatusMsg(wasEditing ? "Actualizando gasto…" : "Guardando gasto…");
    try {
      if (kmPhotoRequired && readingKm) {
        notifyUser_(
          "Lectura en curso",
          "Espera a que termine la lectura automática de km o introduce los km manualmente."
        );
        return;
      }
      const missing = requiredMissing(form);
      if (missing.length) {
        notifyUser_("Faltan datos obligatorios", missing.join("\n"));
        return;
      }

      const departamento_o_proyecto =
        form.departamento_o_proyecto === OTRO_DEPARTAMENTO
          ? String(form.departamento_o_proyecto_custom || "").trim()
          : String(form.departamento_o_proyecto || "").trim();
      const isKmColab = form.tipo_gasto === "KILOMETRAJE_COLABORADOR";
      const isOtros = form.tipo_gasto === "OTROS";
      const isBillete = form.tipo_gasto === "GASTOS_BILLETES";
      if (!isKmColab && !departamento_o_proyecto) {
        notifyUser_("Falta proyecto/departamento", "Selecciona un departamento/proyecto o escribe uno nuevo.");
        return;
      }

      const plateForSave = isKmColab
        ? "COLABORADOR"
        : isOtros || isBillete
          ? String(form.matricula || "").trim().toUpperCase() || (isBillete ? "BILLETES" : "OTROS")
          : String(form.matricula || "").trim().toUpperCase();
      if (!isKmColab && !isOtros && !isBillete && !plateForSave) {
        notifyUser_("Faltan datos obligatorios", "MATRICULA");
        return;
      }
      const localId = editExpenseId || `${Date.now()}`;
      const entityAliases = buildExpenseEntityAliases_(form);
      const billeteBreakdown =
        String(form.tipo_gasto || "").trim().toUpperCase() === "GASTOS_BILLETES"
          ? calcBilleteBreakdown_(form.precio_total_billete, form.tasas_billete, form.iva_porcentaje ?? "21")
          : null;
      const localList = await localDb.getExpenses();
      const existingExpense = localList.find((x) => String(x?.id || x?.local_id || "").trim() === editExpenseId) || null;
      const payload = {
        local_id: localId,
        id_gasto: localId,
        vehiclePlate: plateForSave,
        tipo_gasto: form.tipo_gasto,
        ...form,
        ...entityAliases,
        matricula: plateForSave,
        // Alias de compatibilidad con cabeceras legacy del Apps Script
        poliza: String(entityAliases.poliza || form.numero_poliza || "").trim(),
        marca: String(entityAliases.marca || form.marca_combustible || "").trim(),
        tipo_impuesto_otro: String(form.tipo_otro_impuesto || "").trim(),
        impuestos_fecha_proximo_pago: String(form.fecha_proximo_pago || "").trim(),
        conductor: String(form.conductor_multa || "").trim(),
        lugar: String(form.lugar_multa || "").trim(),
        organismo_denunciante: String(form.organismo_denunciante || "").trim(),
        tipo_infraccion: String(form.tipo_infraccion || "").trim(),
        importe: String(form.importe_multa || "").trim(),
        kilometros_actuales: String(form.kilometros_actuales || "").trim(),
        odometro_local_uri: String(form.odometroLocalUri || "").trim(),
        responsable_email: titularEmail,
        grabado_por_email: selfEmail,
        grabado_por_nombre: String(user?.displayName || user?.nombre || "").trim(),
        departamento_o_proyecto: isKmColab
          ? String(form.proyecto_colaborador_nombre || "").trim()
          : departamento_o_proyecto,
        fecha: (() => {
          if (isKmColab) return String(form.fecha_viaje_colaborador || "").trim();
          const t = String(form.tipo_gasto || "").trim().toUpperCase();
          const byTipo = {
            COMBUSTIBLES: form.fecha_repostaje,
            PARKING: form.fecha_aparcamiento,
            PEAJES: form.fecha_peaje,
            GASTOS_BILLETES: form.fecha_ida_billete,
            ITV: form.fecha_inspeccion,
            REPUESTOS_RECAMBIO: form.fecha_compra_repuestos,
            MANTENIMIENTO_REPARACIONES: form.fecha_compra_mantenimiento,
            OTROS: form.fecha_otros_gastos,
            HOSPEDAJE: form.fecha_otros_gastos,
            MANUTENCION: form.fecha_otros_gastos,
            MULTAS_SANCIONES: form.fecha_multa,
            MULTAS: form.fecha_multa,
            SEGURO: form.fecha_inicio_seguro,
            SEGUROS: form.fecha_inicio_seguro,
            IMPUESTOS: form.periodo_ivm,
            OTROS_IMPUESTOS: form.fecha_pago,
          };
          return String(byTipo[t] || form.fecha || "").trim();
        })(),
        km_inicial_colaborador: String(form.km_inicial_colaborador || "").trim(),
        km_final_colaborador: String(form.km_final_colaborador || "").trim(),
        km_recorridos_colaborador: String(form.km_recorridos_colaborador || "").trim(),
        origen_colaborador: String(form.origen_colaborador || "").trim(),
        destino_colaborador: String(form.destino_colaborador || "").trim(),
        id_proyecto: String(form.proyecto_colaborador_id || "").trim(),
        proyecto_nombre: String(form.proyecto_colaborador_nombre || "").trim(),
        id_viaje_propio: isOtros ? "" : String(form.id_viaje_propio || idViajePropio || "").trim(),
        motivo_colaborador: String(form.motivo_colaborador || "").trim(),
        accion_colaborador: String(form.accion_colaborador || "").trim(),
        tarifa_eur_km_aplicada: String(form.tarifa_eur_km_aplicada || "").trim(),
        importe_km_colaborador: String(form.importe_km_colaborador || "").trim(),
        coste_total: (() => {
          if (billeteBreakdown) return billeteBreakdown.total;
          const br = calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
          return br.total;
        })(),
        importe_sin_iva: (() => {
          if (billeteBreakdown) return billeteBreakdown.base_imponible;
          const br = calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
          return br.base_imponible;
        })(),
        iva_porcentaje: (() => {
          if (billeteBreakdown) return billeteBreakdown.iva_porcentaje;
          const br = calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
          return br.iva_porcentaje;
        })(),
        base_imponible: (() => {
          if (billeteBreakdown) return billeteBreakdown.base_imponible;
          const br = calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
          return br.base_imponible;
        })(),
        cuota_iva: (() => {
          if (billeteBreakdown) return billeteBreakdown.cuota_iva;
          const br = calcIvaBreakdown_(expenseTotalForIva_(form), form.iva_porcentaje ?? "21");
          return br.cuota_iva;
        })(),
        usuario_uid: user?.uid || "",
        usuario_email: selfEmail,
        usuario_rol: role || "",
        createdAtLocal: new Date().toISOString(),
      };
      // Lista de adjuntos del form es la fuente de verdad (incluye quitar 1 de N).
      // No reinyectar ticket_drive_* del gasto local antiguo: resucitaría archivos quitados.
      // Tras hydrate, ticketLocalUris puede ser data URI de preview: no persistir si ya hay Drive.
      {
        const aligned = realignTicketDriveFields(form, form.ticketLocalUris || []);
        const driveParallel = parseTicketDriveUrlsOrdered(aligned);
        while (driveParallel.length < (aligned.ticketLocalUris || []).length) driveParallel.push("");
        const namesParallel = parseTicketDriveFileNamesOrdered(aligned);
        const storageUris = compactTicketLocalUrisForPersist(aligned.ticketLocalUris, driveParallel);
        const storageDrive = storageUris.map((u, i) => {
          if (/^https?:\/\//i.test(u)) return u;
          return String(driveParallel[i] || "").trim();
        });
        Object.assign(payload, {
          ticketLocalUris: storageUris,
          ...ticketDriveFieldsFromLists(storageDrive, namesParallel),
        });
      }
      const needsTicketUpload = ticketUrisNeedDriveUpload(payload.ticketLocalUris);
      let queuedSyncJob = false;
      if (editExpenseId) {
        const nextList = localList.map((x) => {
          const xid = String(x?.id || x?.local_id || "").trim();
          if (xid !== editExpenseId) return x;
          return {
            ...x,
            ...payload,
            id: editExpenseId,
            local_id: editExpenseId,
            id_gasto: String(x?.id_gasto || payload.id_gasto || editExpenseId).trim(),
            createdAtLocal: x?.createdAtLocal || payload.createdAtLocal,
            ticketLocalUris: Array.isArray(payload.ticketLocalUris) ? payload.ticketLocalUris : [],
            odometroLocalUri: String(payload.odometroLocalUri || x?.odometroLocalUri || "").trim(),
          };
        });
        await localDb.setExpenses(nextList);

        // Actualizar fecha en líneas de hojas locales (snapshot) para que la relación no quede desfasada.
        try {
          const sheets = await localDb.getExpenseSheets();
          const remoteGasId = String(
            existingExpense?.id_gasto || payload.id_gasto || editExpenseId || ""
          ).trim();
          const localGasId = String(editExpenseId || "").trim();
          const nextFecha = normalizeDateToDmy(payload.fecha || "") || String(payload.fecha || "").trim();
          if (nextFecha && Array.isArray(sheets) && sheets.length) {
            let sheetsTouched = false;
            const nextSheets = sheets.map((s) => {
              const lines = Array.isArray(s?.lineas) ? s.lineas : [];
              if (!lines.length) return s;
              let lineTouched = false;
              const nextLines = lines.map((ln) => {
                const keys = [
                  ln?.id_gasto,
                  ln?.expense_id,
                  ln?.id,
                  ln?.local_id,
                  ln?.sourceExpenseId,
                ]
                  .map((k) => String(k || "").trim())
                  .filter(Boolean);
                const match =
                  (remoteGasId && keys.includes(remoteGasId)) ||
                  (localGasId && keys.includes(localGasId));
                if (!match) return ln;
                lineTouched = true;
                return { ...ln, fecha: nextFecha };
              });
              if (!lineTouched) return s;
              sheetsTouched = true;
              return { ...s, lineas: nextLines };
            });
            if (sheetsTouched) await localDb.setExpenseSheets(nextSheets);
          }
        } catch {
          /* no bloquear el guardado del gasto */
        }

        // Si el gasto aún está en outbox, actualizamos ese job para no duplicar envíos.
        const outbox = await localDb.getOutbox();
        let touched = false;
        const nextOutbox = outbox.map((job) => {
          if (job?.kind !== "expense") return job;
          const jLocalId = String(job?.payload?.local_id || "").trim();
          if (jLocalId && jLocalId === editExpenseId) {
            touched = true;
            queuedSyncJob = true;
            return { ...job, payload: { ...job.payload, ...payload } };
          }
          return job;
        });
        if (touched) {
          await localDb.setOutbox(nextOutbox);
        } else {
          const remoteId = String(existingExpense?.id_gasto || "").trim();
          if (/^GAS/i.test(remoteId)) {
            const deduped = outbox.filter((job) => {
              if (job?.kind !== "expense_update") return true;
              const lid = String(job?.payload?.local_id || "").trim();
              return lid !== editExpenseId;
            });
            await localDb.setOutbox(deduped);
            await syncService.queue({
              kind: "expense_update",
              payload: { ...payload, id_gasto: remoteId },
            });
            queuedSyncJob = true;
          } else {
            notifyUser_(
              "Guardado local",
              "El gasto se guardó en el dispositivo, pero aún no tiene ID remoto (GAS…). No se pudo actualizar en el servidor. Sincroniza el alta pendiente e inténtalo de nuevo."
            );
            return;
          }
        }
      } else {
        await localDb.setExpenses([{ id: payload.local_id, ...payload }, ...localList]);
        await syncService.queue({ kind: "expense", payload });
        queuedSyncJob = true;
      }

      if (needsTicketUpload) setSaveStatusMsg("Subiendo tiquet…");
      else setSaveStatusMsg(wasEditing ? "Sincronizando cambios…" : "Sincronizando…");

      const flushRes = await syncService.flushIfOnline();
      if (flushRes?.online === false) {
        notifyUser_(
          "Guardado local",
          wasEditing
            ? "Gasto actualizado en el dispositivo. Sin conexión: se sincronizará cuando haya red."
            : "Registro guardado en el dispositivo. Sin conexión: se sincronizará cuando haya red."
        );
      } else if (queuedSyncJob) {
        const outboxAfter = await localDb.getOutbox();
        const stillPending = (Array.isArray(outboxAfter) ? outboxAfter : []).find((job) => {
          if (job?.kind !== "expense" && job?.kind !== "expense_update") return false;
          const lid = String(job?.payload?.local_id || "").trim();
          const gid = String(job?.payload?.id_gasto || "").trim();
          return (lid && lid === localId) || (gid && gid === localId) || (editExpenseId && lid === editExpenseId);
        });
        if (stillPending) {
          const cause =
            String(stillPending?._syncError || "").trim() ||
            (Array.isArray(flushRes?.errors) && flushRes.errors[0] ? String(flushRes.errors[0]) : "") ||
            "Error de sincronización desconocido.";
          notifyUser_(
            wasEditing ? "No se pudo actualizar el gasto" : "No se pudo guardar el gasto",
            cause
          );
          return;
        }
        notifyUser_(
          "Guardado",
          wasEditing
            ? needsTicketUpload
              ? "Gasto actualizado y tiquet sincronizado."
              : "Gasto actualizado correctamente."
            : (idViajePropio || form.id_viaje_propio)
              ? "Gasto de viaje guardado y asociado al viaje."
              : needsTicketUpload
                ? "Registro guardado y tiquet subido."
                : "Registro guardado correctamente."
        );
      } else {
        notifyUser_("Guardado", wasEditing ? "Gasto actualizado localmente." : "Registro guardado.");
      }

      setEditExpenseId("");
      setOnBehalfEmail("");
      setForm(initial);
      await localDb.setExpensesDraft(null);
      // Tras editar, volver a la lista de gastos para poder elegir otro.
      if (wasEditing) {
        navigation.navigate("GastosEditar");
        return;
      }
      if (idViajePropio || form.id_viaje_propio) {
        navigation.goBack();
      }
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/quota|setItem|almacenamiento local/i.test(msg)) {
        try {
          await localDb.compactLocalStorageForQuota();
          notifyUser_(
            "Espacio local lleno",
            "Se ha liberado caché de tiquets/fotos del navegador. Vuelve a pulsar Guardar."
          );
          return;
        } catch {
          // fall through
        }
      }
      notifyUser_("Error al guardar", e?.message || "Error inesperado");
    } finally {
      setSaving(false);
      setSaveStatusMsg("");
    }
  };

  const generalSection = (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>DATOS GENERALES</Text>
      {canOnBehalf ? (
        <SelectField
          label="GRABAR A NOMBRE DE"
          required={false}
          value={onBehalfEmail}
          onChange={(v) => {
            const next = String(v || "").trim().toLowerCase();
            setOnBehalfEmail(next === selfEmail ? "" : next);
            setForm((p) => ({ ...p, id_viaje_propio: "" }));
          }}
          options={[
            { value: "", label: selfEmail ? `Yo (${selfEmail})` : "Yo (usuario actual)" },
            ...userOptions.filter((u) => u.value !== selfEmail),
          ]}
        />
      ) : null}
      {form.tipo_gasto !== "KILOMETRAJE_COLABORADOR" ? (
        <>
          <SelectField
            label="DEPARTAMENTO / PROYECTO"
            required
            voiceKey="departamento_o_proyecto"
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
      ) : null}
      <SelectField
        label="TIPO DE GASTO"
        required
        voiceKey="tipo_gasto"
        value={form.tipo_gasto}
        onChange={(v) => {
          const next = normalizeExpenseType_(v);
          setForm((p) => ({
            ...p,
            tipo_gasto: next,
            ...(next === "OTROS" ? { id_viaje_propio: "", matricula: "" } : null),
          }));
        }}
        options={expenseTypeOptions}
      />
      <SelectField
        label="FORMA DE PAGO"
        required
        voiceKey="forma_pago"
        value={form.forma_pago}
        onChange={(v) => set("forma_pago", v)}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
      />
      {form.tipo_gasto && form.tipo_gasto !== "OTROS" && form.tipo_gasto !== "KILOMETRAJE_COLABORADOR" ? (
        <>
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
            options={[
              {
                value: "",
                label: tripOptions.length
                  ? "Sin viaje"
                  : "Sin viajes abiertos (crea uno en Grabación de viajes)",
              },
              ...tripOptions,
            ]}
          />
          {!tripOptions.length ? (
            <Text style={styles.metaHint}>
              No hay viajes abiertos para {titularEmail || "este usuario"}. Crea o reabre un viaje en «Grabación de
              viajes» y vuelve a esta pantalla.
            </Text>
          ) : null}
          <Text style={styles.sectionTitle}>VEHICULO</Text>
          {colaborador ? (
            <TextField
              label="MATRICULA"
              required={form.tipo_gasto !== "GASTOS_BILLETES"}
              voiceKey="matricula"
              value={form.matricula}
              onChangeText={(v) => set("matricula", String(v || "").toUpperCase())}
              placeholder="Introduce matrícula libre"
              autoCapitalize="characters"
            />
          ) : (
            <SelectField
              label="MATRICULA"
              required={form.tipo_gasto !== "GASTOS_BILLETES"}
              voiceKey="matricula"
              value={form.matricula}
              onChange={(v) => set("matricula", v)}
              options={vehicleSelectOptions}
            />
          )}
          {kmPhotoRequired ? (
            <TextField
              label="KILÓMETROS DEL VEHÍCULO"
              required
              voiceKey="kilometros_actuales"
              value={form.kilometros_actuales}
              onChangeText={(v) => set("kilometros_actuales", String(v || "").replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              placeholder="Lectura actual del cuentakilómetros"
            />
          ) : null}
        </>
      ) : null}
      {form.tipo_gasto === "KILOMETRAJE_COLABORADOR" ? (
        <>
          <Text style={styles.sectionTitle}>VIAJE COLABORADOR</Text>
          <DateField
            label="FECHA"
            required
            voiceKey="fecha_viaje_colaborador"
            value={form.fecha_viaje_colaborador}
            onChange={(v) => set("fecha_viaje_colaborador", v)}
          />
          <TextField
            label="KM INICIAL"
            required
            voiceKey="km_inicial_colaborador"
            value={form.km_inicial_colaborador}
            onChangeText={(v) => set("km_inicial_colaborador", String(v || "").replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
          />
          <TextField
            label="KM FINAL"
            required
            voiceKey="km_final_colaborador"
            value={form.km_final_colaborador}
            onChangeText={(v) => set("km_final_colaborador", String(v || "").replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
          />
          <TextField label="ORIGEN" required voiceKey="origen_colaborador" value={form.origen_colaborador} onChangeText={(v) => set("origen_colaborador", v)} />
          <TextField label="DESTINO" required voiceKey="destino_colaborador" value={form.destino_colaborador} onChangeText={(v) => set("destino_colaborador", v)} />
          <SelectField
            label="PROYECTO A IMPUTAR"
            required
            voiceKey="proyecto_colaborador_id"
            value={form.proyecto_colaborador_id}
            onChange={(v) => set("proyecto_colaborador_id", v)}
            options={[{ value: "", label: numberedProjectOptions.length ? "Selecciona..." : "Sin proyectos en PROYECTOS" }, ...numberedProjectOptions]}
          />
          <TextField label="MOTIVO" required voiceKey="motivo_colaborador" value={form.motivo_colaborador} onChangeText={(v) => set("motivo_colaborador", v)} multiline />
          <TextField label="ACCIÓN (opcional)" required={false} voiceKey="accion_colaborador" value={form.accion_colaborador} onChangeText={(v) => set("accion_colaborador", v)} />
          <TextField
            label="TARIFA EUR/KM"
            required
            voiceKey="tarifa_eur_km_aplicada"
            value={form.tarifa_eur_km_aplicada}
            onChangeText={(v) => set("tarifa_eur_km_aplicada", String(v || "").replace(",", "."))}
            keyboardType="decimal-pad"
          />
          <TextField label="KM RECORRIDOS (AUTO)" required value={form.km_recorridos_colaborador} onChangeText={() => {}} editable={false} />
          <TextField label="IMPORTE KM (AUTO)" required value={form.importe_km_colaborador} onChangeText={() => {}} editable={false} />
        </>
      ) : null}
      {autosaveMsg ? <Text style={styles.autosave}>{autosaveMsg}</Text> : null}
    </View>
  );

  const ticketSection = (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>TICKET / ADJUNTOS</Text>
      <ImageField
        label="Imagen o PDF tiquet"
        multiple
        allowPdf
        valueUris={form.ticketLocalUris}
        onChangeUri={setTicketLocalUris}
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
            allowPdf={false}
            valueUri={form.odometroLocalUri}
            onChangeUri={(uri) => set("odometroLocalUri", uri)}
          />
          {readingKm ? (
            <View style={styles.ocrRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.ocrText}>Leyendo km desde foto...</Text>
            </View>
          ) : null}
          <Text style={styles.autosave}>
            {form.tipo_gasto === "COMBUSTIBLES"
              ? "Los km del vehículo (bloque 1) se copian automáticamente a kilómetros de repostaje."
              : "Indica los kilómetros del vehículo en el bloque 1 (Datos generales)."}
          </Text>
        </>
      ) : null}
    </View>
  );

  const gastoSection = (
    <>
      {form.tipo_gasto === "SEGURO" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SEGURO</Text>
          <TextField label="COMPAÑIA" required voiceKey="compania" value={form.compania} onChangeText={(v) => set("compania", v)} />
          <TextField label="Nº POLIZA" required voiceKey="numero_poliza" value={form.numero_poliza} onChangeText={(v) => set("numero_poliza", v)} />
          <TextField label="COBERTURA" required voiceKey="cobertura" value={form.cobertura} onChangeText={(v) => set("cobertura", v)} />
          <DateField label="FECHA INICIO SEGURO" required voiceKey="fecha_inicio_seguro" value={form.fecha_inicio_seguro} onChange={(v) => set("fecha_inicio_seguro", v)} />
          <DateField label="FECHA FIN SEGURO" required voiceKey="fecha_fin_seguro" value={form.fecha_fin_seguro} onChange={(v) => set("fecha_fin_seguro", v)} />
          <TextField label="PRIMA" required voiceKey="prima" value={form.prima} onChangeText={(v) => set("prima", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "IMPUESTOS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>I.V.M.</Text>
          <DateField label="PERIODO I.V.M." required voiceKey="periodo_ivm" value={form.periodo_ivm} onChange={(v) => set("periodo_ivm", v)} />
          <TextField label="IMPORTE I.V.M." required voiceKey="importe_ivm" value={form.importe_ivm} onChangeText={(v) => set("importe_ivm", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "OTROS_IMPUESTOS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTROS IMPUESTOS</Text>
          <TextField label="TIPO DE IMPUESTO" required voiceKey="tipo_otro_impuesto" value={form.tipo_otro_impuesto} onChangeText={(v) => set("tipo_otro_impuesto", v)} />
          <DateField label="FECHA DE PAGO" required voiceKey="fecha_pago" value={form.fecha_pago} onChange={(v) => set("fecha_pago", v)} />
          <DateField label="FECHA PROXIMO PAGO" required voiceKey="fecha_proximo_pago" value={form.fecha_proximo_pago} onChange={(v) => set("fecha_proximo_pago", v)} />
          <TextField label="IMPORTE OTROS IMPUESTOS" required voiceKey="importe_otros_impuestos" value={form.importe_otros_impuestos} onChangeText={(v) => set("importe_otros_impuestos", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "REPUESTOS_RECAMBIO" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>REPUESTOS Y RECAMBIOS</Text>
          <DateField label="FECHA COMPRA REPUESTOS / RECAMBIOS" required voiceKey="fecha_compra_repuestos" value={form.fecha_compra_repuestos} onChange={(v) => set("fecha_compra_repuestos", v)} />
          <TextField label="PROVEEDOR REPUESTOS / RECAMBIOS" required voiceKey="proveedor_repuestos" value={form.proveedor_repuestos} onChangeText={(v) => set("proveedor_repuestos", v)} />
          <TextField label="DESCRIPCION REPUESTOS / RECAMBIOS" required voiceKey="descripcion_repuestos" value={form.descripcion_repuestos} onChangeText={(v) => set("descripcion_repuestos", v)} multiline />
          <TextField label="Nº FACTURA REPUESTOS / RECAMBIOS" required={false} voiceKey="numero_factura_repuestos" value={form.numero_factura_repuestos} onChangeText={(v) => set("numero_factura_repuestos", v)} />
          <TextField label="IMPORTE REPUESTOS / RECAMBIOS" required voiceKey="importe_repuestos" value={form.importe_repuestos} onChangeText={(v) => set("importe_repuestos", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "MANTENIMIENTO_REPARACIONES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MANTENIMIENTO / REPARACIONES</Text>
          <DateField label="FECHA COMPRA MANTENIMIENTO / REPARACIONES" required voiceKey="fecha_compra_mantenimiento" value={form.fecha_compra_mantenimiento} onChange={(v) => set("fecha_compra_mantenimiento", v)} />
          <TextField label="PROVEEDOR MANTENIMIENTO / REPARACIONES" required voiceKey="proveedor_mantenimiento" value={form.proveedor_mantenimiento} onChangeText={(v) => set("proveedor_mantenimiento", v)} />
          <TextField label="DESCRIPCION MANTENIMIENTO / REPARACIONES" required voiceKey="descripcion_mantenimiento" value={form.descripcion_mantenimiento} onChangeText={(v) => set("descripcion_mantenimiento", v)} multiline />
          <TextField label="Nº FACTURA MANTENIMIENTO / REPARACIONES" required={false} voiceKey="numero_factura_mantenimiento" value={form.numero_factura_mantenimiento} onChangeText={(v) => set("numero_factura_mantenimiento", v)} />
          <TextField label="IMPORTE MANTENIMIENTO / REPARACIONES" required voiceKey="importe_mantenimiento" value={form.importe_mantenimiento} onChangeText={(v) => set("importe_mantenimiento", v)} keyboardType="decimal-pad" />
          <DateField label="FECHA PROXIMO MANTENIMIENTO / REPARACIONES" required voiceKey="fecha_proximo_mantenimiento" value={form.fecha_proximo_mantenimiento} onChange={(v) => set("fecha_proximo_mantenimiento", v)} />
          <TextField label="KILOMETROS PROXIMO MANTENIMIENTO / REPARACIONES" required voiceKey="kilometros_proximo_mantenimiento" value={form.kilometros_proximo_mantenimiento} onChangeText={(v) => set("kilometros_proximo_mantenimiento", v)} keyboardType="number-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "COMBUSTIBLES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>COMBUSTIBLE</Text>
          <DateField label="FECHA REPOSTAJE" required voiceKey="fecha_repostaje" value={form.fecha_repostaje} onChange={(v) => set("fecha_repostaje", v)} />
          <TextField label="ENTIDAD" required voiceKey="entidad_combustible" value={form.entidad_combustible} onChangeText={(v) => set("entidad_combustible", v)} />
          <TextField label="LUGAR REPOSTAJE" required={false} voiceKey="lugar_repostaje" value={form.lugar_repostaje} onChangeText={(v) => set("lugar_repostaje", v)} />
          <SelectField label="MARCA" required={false} voiceKey="marca_combustible" value={form.marca_combustible} onChange={(v) => set("marca_combustible", v)} options={FUEL_BRANDS.map((b) => ({ value: b, label: b }))} />
          <SelectField label="TIPO COMBUSTIBLE" required voiceKey="tipo_combustible" value={form.tipo_combustible} onChange={(v) => set("tipo_combustible", v)} options={FUEL_TYPES.map((t) => ({ value: t, label: t }))} />
          <TextField
            label="KILOMETROS REPOSTAJE (auto desde km vehículo)"
            required
            value={form.kilometros_repostaje}
            onChangeText={(v) => set("kilometros_repostaje", String(v || "").replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
          />
          <SelectField label="TIPO REPOSTAJE" required voiceKey="tipo_repostaje" value={form.tipo_repostaje} onChange={(v) => set("tipo_repostaje", v)} options={[{ value: "PARCIAL", label: "PARCIAL" }, { value: "COMPLETO", label: "COMPLETO" }]} />
          <Text style={styles.autosave}>
            Indica litros, total pagado e IVA (abajo). El precio por litro y el neto se calculan solos.
          </Text>
          <TextField label="LITROS REPOSTADOS" required voiceKey="litros_repostados" value={form.litros_repostados} onChangeText={(v) => set("litros_repostados", v)} keyboardType="decimal-pad" />
          <TextField label="TOTAL A PAGAR (CON IVA)" required voiceKey="total_a_pagar" value={form.total_a_pagar} onChangeText={(v) => set("total_a_pagar", v)} keyboardType="decimal-pad" />
          <SelectField
            label="IVA %"
            required
            voiceKey="iva_porcentaje"
            value={ivaSelectValueFromStored_(form.iva_porcentaje)}
            onChange={(v) => {
              const next = String(v);
              if (next === IVA_RATE_OTRO) {
                setForm((prev) => {
                  const cur = String(prev.iva_porcentaje ?? "").trim();
                  if (IVA_RATE_PRESET_VALUES.includes(cur)) {
                    return { ...prev, iva_porcentaje: "" };
                  }
                  return { ...prev, iva_porcentaje: cur || "" };
                });
                return;
              }
              set("iva_porcentaje", next);
            }}
            options={IVA_RATE_OPTIONS}
          />
          {isIvaOtroSelected_(form.iva_porcentaje) ? (
            <TextField
              label="IVA % (otro)"
              required
              voiceKey="iva_porcentaje_otro"
              value={String(form.iva_porcentaje ?? "")}
              onChangeText={(v) => set("iva_porcentaje", String(v).replace(/[^\d.,]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="Ej. 5"
            />
          ) : null}
          <TextField
            label="PRECIO / LITRO CON IVA (AUTO)"
            value={fuelBreakdown?.precio_litro_con_iva_str || form.precio_por_litro || ""}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <TextField
            label="PRECIO / LITRO SIN IVA (AUTO)"
            value={fuelBreakdown?.precio_litro_sin_iva_str || form.precio_por_litro_sin_iva || ""}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <TextField
            label="TOTAL NETO SIN IVA (AUTO)"
            value={fuelBreakdown?.base_imponible_str || ""}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <TextField
            label="CUOTA IVA (AUTO)"
            value={fuelBreakdown?.cuota_iva_str || ""}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <TextField label="PUNTOS OBTENIDOS" required={false} value={form.puntos_obtenidos} onChangeText={(v) => set("puntos_obtenidos", v)} keyboardType="decimal-pad" />
          <TextField label="Nº FACTURA / TICKET (opcional)" required={false} voiceKey="numero_ticket" value={form.numero_ticket} onChangeText={(v) => set("numero_ticket", v)} />
        </View>
      ) : null}

      {form.tipo_gasto === "PARKING" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>APARCAMIENTO</Text>
          <DateField label="FECHA APARCAMIENTO" required voiceKey="fecha_aparcamiento" value={form.fecha_aparcamiento} onChange={(v) => set("fecha_aparcamiento", v)} />
          <TextField label="ENTIDAD" required voiceKey="entidad_parking" value={form.entidad_parking} onChangeText={(v) => set("entidad_parking", v)} />
          <SelectField label="TIPO ZONA" required voiceKey="tipo_zona" value={form.tipo_zona} onChange={(v) => set("tipo_zona", v)} options={PARKING_ZONES.map((z) => ({ value: z, label: z }))} />
          <TimeField label="HORA INICIO APARCAMIENTO" required voiceKey="hora_inicio_aparcamiento" value={form.hora_inicio_aparcamiento} onChange={(v) => set("hora_inicio_aparcamiento", v)} />
          <TimeField label="HORA FIN APARCAMIENTO" required voiceKey="hora_fin_aparcamiento" value={form.hora_fin_aparcamiento} onChange={(v) => set("hora_fin_aparcamiento", v)} />
          <TextField label="IMPORTE APARCAMIENTO" required voiceKey="importe_aparcamiento" value={form.importe_aparcamiento} onChangeText={(v) => set("importe_aparcamiento", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "PEAJES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PEAJES</Text>
          <DateField label="FECHA PEAJE" required voiceKey="fecha_peaje" value={form.fecha_peaje} onChange={(v) => set("fecha_peaje", v)} />
          <TextField label="ENTIDAD" required voiceKey="entidad_peaje" value={form.entidad_peaje} onChangeText={(v) => set("entidad_peaje", v)} />
          <TextField
            label="Nº FACTURA / TIQUET (opcional)"
            required={false}
            voiceKey="numero_factura_peaje"
            value={form.numero_factura_peaje}
            onChangeText={(v) => set("numero_factura_peaje", v)}
          />
          <TextField label="ENTRADA PEAJE" required={false} voiceKey="entrada_peaje" value={form.entrada_peaje} onChangeText={(v) => set("entrada_peaje", v)} />
          <TextField label="SALIDA PEAJE" required={false} voiceKey="salida_peaje" value={form.salida_peaje} onChangeText={(v) => set("salida_peaje", v)} />
          <TextField label="IMPORTE PEAJE" required voiceKey="importe_peaje" value={form.importe_peaje} onChangeText={(v) => set("importe_peaje", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "GASTOS_BILLETES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>GASTOS BILLETES</Text>
          <TextField label="ORIGEN" required voiceKey="origen_billete" value={form.origen_billete} onChangeText={(v) => set("origen_billete", v)} />
          <TextField label="DESTINO" required voiceKey="destino_billete" value={form.destino_billete} onChangeText={(v) => set("destino_billete", v)} />
          <DateField label="FECHA IDA" required voiceKey="fecha_ida_billete" value={form.fecha_ida_billete} onChange={(v) => set("fecha_ida_billete", v)} />
          <DateField label="FECHA VUELTA" required={false} voiceKey="fecha_vuelta_billete" value={form.fecha_vuelta_billete} onChange={(v) => set("fecha_vuelta_billete", v)} />
          <TextField label="N FACTURA" required voiceKey="numero_reserva_billete" value={form.numero_reserva_billete} onChangeText={(v) => set("numero_reserva_billete", v)} />
          <TextField
            label="N PERSONAS"
            required
            voiceKey="numero_personas_billete"
            value={form.numero_personas_billete}
            onChangeText={(v) => set("numero_personas_billete", String(v || "").replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
          />
          <TextField label="PROVEEDOR / COMPAÑÍA" required voiceKey="compania_billete" value={form.compania_billete} onChangeText={(v) => set("compania_billete", v)} />
          <TextField label="IMPORTE TOTAL BILLETE" required voiceKey="precio_total_billete" value={form.precio_total_billete} onChangeText={(v) => set("precio_total_billete", v)} keyboardType="decimal-pad" />
          <TextField label="TASAS (SIN IVA)" required={false} voiceKey="tasas_billete" value={form.tasas_billete} onChangeText={(v) => set("tasas_billete", v)} keyboardType="decimal-pad" />
          <Text style={styles.autosave}>
            Mismos campos que el Excel LIFE GREFA: n.º factura, n.º personas y tasas. El concepto será «Origen → Destino». El importe del gasto es precio + tasas.
          </Text>
        </View>
      ) : null}

      {form.tipo_gasto === "ITV" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>I.T.V.</Text>
          <TextField label="ESTACION ITV" required voiceKey="estacion_itv" value={form.estacion_itv} onChangeText={(v) => set("estacion_itv", v)} />
          <DateField label="FECHA INSPECCIÓN" required voiceKey="fecha_inspeccion" value={form.fecha_inspeccion} onChange={(v) => set("fecha_inspeccion", v)} />
          <DateField label="FECHA PROXIMA INSPECCIÓN" required voiceKey="fecha_proxima_inspeccion" value={form.fecha_proxima_inspeccion} onChange={(v) => set("fecha_proxima_inspeccion", v)} />
          <TextField label="Nº FACTURA ITV (opcional)" required={false} voiceKey="numero_factura_itv" value={form.numero_factura_itv} onChangeText={(v) => set("numero_factura_itv", v)} />
          <TextField label="IMPORTE ITV" required voiceKey="importe_itv" value={form.importe_itv} onChangeText={(v) => set("importe_itv", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {form.tipo_gasto === "OTROS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTROS GASTOS</Text>
          {lifeProjectKeyFromText_(
            form.departamento_o_proyecto === OTRO_DEPARTAMENTO
              ? form.departamento_o_proyecto_custom
              : form.departamento_o_proyecto
          ) === "ABILAS" ? (
            <SelectField
              label="SUBTIPO (ABILAS)"
              required
              voiceKey="subtipo_otros"
              value={form.subtipo_otros}
              onChange={(v) => set("subtipo_otros", normalizeAbilasOtrosSubtipo_(v) || String(v || "").trim())}
              options={[
                { value: "", label: "Selecciona…" },
                ...ABILAS_OTROS_SUBTIPOS.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          ) : null}
          <DateField label="FECHA" required voiceKey="fecha_otros_gastos" value={form.fecha_otros_gastos} onChange={(v) => set("fecha_otros_gastos", v)} />
          <TextField label="PROVEEDOR" required voiceKey="proveedor_otros_gastos" value={form.proveedor_otros_gastos} onChangeText={(v) => set("proveedor_otros_gastos", v)} />
          <TextField label="CONCEPTO" required voiceKey="concepto_otros_gastos" value={form.concepto_otros_gastos} onChangeText={(v) => set("concepto_otros_gastos", v)} />
          <TextField label="Nº FACTURA (opcional)" required={false} voiceKey="numero_factura_otros" value={form.numero_factura_otros} onChangeText={(v) => set("numero_factura_otros", v)} />
          <TextField label="IMPORTE" required voiceKey="importe_otros_gastos" value={form.importe_otros_gastos} onChangeText={(v) => set("importe_otros_gastos", v)} keyboardType="decimal-pad" />
          <TextField label="OBSERVACIONES / ANOTACIONES" required={false} voiceKey="observaciones" value={form.observaciones} onChangeText={(v) => set("observaciones", v)} multiline />
        </View>
      ) : null}

      {form.tipo_gasto === "HOSPEDAJE" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>HOSPEDAJE</Text>
          <DateField label="FECHA" required voiceKey="fecha_otros_gastos" value={form.fecha_otros_gastos} onChange={(v) => set("fecha_otros_gastos", v)} />
          <TextField label="ENTIDAD / ESTABLECIMIENTO" required voiceKey="proveedor_otros_gastos" value={form.proveedor_otros_gastos} onChangeText={(v) => set("proveedor_otros_gastos", v)} />
          <TextField label="CONCEPTO" required={false} voiceKey="concepto_otros_gastos" value={form.concepto_otros_gastos} onChangeText={(v) => set("concepto_otros_gastos", v)} placeholder="Hospedaje" />
          <TextField label="Nº FACTURA / TIQUET (opcional)" required={false} voiceKey="numero_factura_otros" value={form.numero_factura_otros} onChangeText={(v) => set("numero_factura_otros", v)} />
          <TextField
            label="Nº HUÉSPEDES"
            required
            voiceKey="numero_personas_hospedaje"
            value={form.numero_personas_hospedaje}
            onChangeText={(v) => set("numero_personas_hospedaje", v)}
            keyboardType="number-pad"
          />
          <TextField label="IMPORTE" required voiceKey="importe_otros_gastos" value={form.importe_otros_gastos} onChangeText={(v) => set("importe_otros_gastos", v)} keyboardType="decimal-pad" />
          <TextField label="OBSERVACIONES" required={false} voiceKey="observaciones" value={form.observaciones} onChangeText={(v) => set("observaciones", v)} multiline />
        </View>
      ) : null}

      {form.tipo_gasto === "MANUTENCION" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MANUTENCIÓN</Text>
          <DateField label="FECHA" required voiceKey="fecha_otros_gastos" value={form.fecha_otros_gastos} onChange={(v) => set("fecha_otros_gastos", v)} />
          <TextField label="NOMBRE ESTABLECIMIENTO" required voiceKey="proveedor_otros_gastos" value={form.proveedor_otros_gastos} onChangeText={(v) => set("proveedor_otros_gastos", v)} />
          <TextField label="CONCEPTO" required={false} voiceKey="concepto_otros_gastos" value={form.concepto_otros_gastos} onChangeText={(v) => set("concepto_otros_gastos", v)} placeholder="Manutención" />
          <TextField label="Nº FACTURA / TIQUET (opcional)" required={false} voiceKey="numero_factura_otros" value={form.numero_factura_otros} onChangeText={(v) => set("numero_factura_otros", v)} />
          <TextField
            label="Nº COMENSALES"
            required
            voiceKey="numero_comensales_manutencion"
            value={form.numero_comensales_manutencion}
            onChangeText={(v) => set("numero_comensales_manutencion", v)}
            keyboardType="number-pad"
          />
          <TextField label="IMPORTE" required voiceKey="importe_otros_gastos" value={form.importe_otros_gastos} onChangeText={(v) => set("importe_otros_gastos", v)} keyboardType="decimal-pad" />
          <TextField label="OBSERVACIONES" required={false} voiceKey="observaciones" value={form.observaciones} onChangeText={(v) => set("observaciones", v)} multiline />
        </View>
      ) : null}

      {form.tipo_gasto === "MULTAS_SANCIONES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MULTAS / SANCIONES</Text>
          <DateField label="FECHA" required voiceKey="fecha_multa" value={form.fecha_multa} onChange={(v) => set("fecha_multa", v)} />
          <TextField label="CONDUCTOR" required voiceKey="conductor_multa" value={form.conductor_multa} onChangeText={(v) => set("conductor_multa", v)} />
          <TextField label="LUGAR" required voiceKey="lugar_multa" value={form.lugar_multa} onChangeText={(v) => set("lugar_multa", v)} />
          <TextField label="ORGANISMO DENUNCIANTE" required voiceKey="organismo_denunciante" value={form.organismo_denunciante} onChangeText={(v) => set("organismo_denunciante", v)} />
          <TextField label="TIPO INFRACCIÓN" required voiceKey="tipo_infraccion" value={form.tipo_infraccion} onChangeText={(v) => set("tipo_infraccion", v)} />
          <TextField label="IMPORTE" required voiceKey="importe_multa" value={form.importe_multa} onChangeText={(v) => set("importe_multa", v)} keyboardType="decimal-pad" />
        </View>
      ) : null}

      {ivaBreakdown && form.tipo_gasto !== "COMBUSTIBLES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DESGLOSE IVA</Text>
          <Text style={styles.autosave}>
            A partir del importe total (con IVA) y el % elegido (4 / 10 / 21 / 0 u otro). Base = total ÷ (1 + IVA/100).
          </Text>
          <TextField
            label="IMPORTE TOTAL (CON IVA)"
            value={ivaBreakdown.total.toFixed(2)}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <SelectField
            label="IVA %"
            required
            voiceKey="iva_pct"
            value={ivaSelectValueFromStored_(form.iva_porcentaje)}
            onChange={(v) => {
              const next = String(v);
              if (next === IVA_RATE_OTRO) {
                setForm((prev) => {
                  const cur = String(prev.iva_porcentaje ?? "").trim();
                  if (IVA_RATE_PRESET_VALUES.includes(cur)) {
                    return { ...prev, iva_porcentaje: "" };
                  }
                  return { ...prev, iva_porcentaje: cur || "" };
                });
                return;
              }
              set("iva_porcentaje", next);
            }}
            options={IVA_RATE_OPTIONS}
          />
          {isIvaOtroSelected_(form.iva_porcentaje) ? (
            <TextField
              label="IVA % (otro)"
              required
              voiceKey="iva_porcentaje_otro"
              value={String(form.iva_porcentaje ?? "")}
              onChangeText={(v) => set("iva_porcentaje", String(v).replace(/[^\d.,]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="Ej. 5"
            />
          ) : null}
          <TextField
            label="BASE IMPONIBLE / NETO (AUTO)"
            value={ivaBreakdown.base_imponible_str}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
          <TextField
            label="CUOTA IVA (AUTO)"
            value={ivaBreakdown.cuota_iva_str}
            onChangeText={() => {}}
            editable={false}
            keyboardType="decimal-pad"
          />
        </View>
      ) : null}
    </>
  );

  return (
    <ExpenseFieldVoiceProvider
      tipo={form.tipo_gasto}
      projectOptions={projectOptions}
      vehicleOptions={vehicleOptions}
      onApply={handleVoiceFieldApplied}
    >
      <ScrollView ref={formScrollRef} style={styles.safe} contentContainerStyle={styles.content}>
        <Header title={idViajePropio ? "Gasto de viaje vehículo propio" : "Introducción gastos"} onBack={() => navigation.navigate("Menu")} />

        {voiceFieldsSupportedForTipo(form.tipo_gasto) ? (
          <Pressable style={styles.voiceAllBtn} onPress={() => setVoiceWizardVisible(true)}>
            <Text style={styles.voiceAllBtnText}>🎤 Rellenar todo con voz</Text>
          </Pressable>
        ) : null}

        {threeCol ? (
          <View style={styles.threeColRow}>
            <View style={styles.threeColItem}>{generalSection}</View>
            <View style={styles.threeColItem}>{gastoSection}</View>
            <View style={styles.threeColItem}>{ticketSection}</View>
          </View>
        ) : (
          <>
            {generalSection}
            {gastoSection}
            {ticketSection}
          </>
        )}

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.75 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>
            {saving ? "Guardando…" : editExpenseId ? "Actualizar gasto" : "Guardar gasto"}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={saving} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.saveOverlay}>
          <View style={styles.saveOverlayBox}>
            <ActivityIndicator size="large" color={theme.colors.accent || "#4f88bf"} />
            <Text style={styles.saveOverlayText}>{saveStatusMsg || "Guardando…"}</Text>
            <Text style={styles.saveOverlayHint}>No cierres la app hasta que termine.</Text>
          </View>
        </View>
      </Modal>

      <ExpenseVoiceFillWizard
        visible={voiceWizardVisible}
        tipo={form.tipo_gasto}
        editMode={!!editExpenseId}
        initialValues={voiceInitialValues}
        projectOptions={projectOptions}
        vehicleOptions={vehicleOptions}
        onClose={() => setVoiceWizardVisible(false)}
        onFieldApplied={handleVoiceFieldApplied}
        onFieldFocus={handleVoiceFieldFocus}
        onOdometerImagePicked={handleVoiceOdometerImagePicked}
        onTicketImagePicked={handleVoiceTicketImagePicked}
      />
    </ExpenseFieldVoiceProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  voiceAllBtn: {
    alignSelf: "center",
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: "#5fb7ff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
  },
  voiceAllBtnText: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  threeColRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  threeColItem: { flex: 1, minWidth: 0 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  metaHint: { color: theme.colors.subtext, fontSize: 12, marginBottom: 10, marginTop: -4 },
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
  saveOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  saveOverlayBox: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 12,
    minWidth: 240,
    maxWidth: 360,
  },
  saveOverlayText: { color: theme.colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  saveOverlayHint: { color: theme.colors.subtext, fontSize: 12, textAlign: "center" },
});

