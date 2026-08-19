import { OTRO_DEPARTAMENTO } from "../../flotaWeb/lib/constants";
import {
  departamentoProyectoLabelForSave,
  departamentoSelectFromProyectoNombre,
} from "../../flotaWeb/lib/proyectoResolve";
import { getVoiceFieldsForTipo } from "./expenseVoiceFields";
import { resolveVoiceMatricula_, voiceMatriculaOptionsFromVehicles } from "../../flotaWeb/lib/expenseVoiceMatricula";

/** Mapeo clave de voz → setter del formulario web (ExpenseModulePage). */
const WEB_APPLY = {
  matricula: "setMatricula",
  departamento_o_proyecto: "setDepartamentoProyecto",
  forma_pago: "setFormaPago",
  fecha_viaje_colaborador: "setFechaKm",
  km_inicial_colaborador: "setKmInicial",
  km_final_colaborador: "setKmFinal",
  tarifa_eur_km_aplicada: "setTarifaKm",
  origen_colaborador: "setOrigen",
  destino_colaborador: "setDestino",
  proyecto_colaborador_id: "setProyectoColaboradorId",
  motivo_colaborador: "setMotivo",
  accion_colaborador: "setAccion",
  fecha_repostaje: "setFechaRepostaje",
  entidad_combustible: "setEntidadCombustible",
  marca_combustible: "setMarcaCombustible",
  tipo_combustible: "setTipoCombustible",
  tipo_repostaje: "setTipoRepostaje",
  litros_repostados: "setLitrosRepostados",
  precio_por_litro: "setPrecioPorLitro",
  lugar_repostaje: "setLugarRepostaje",
  numero_ticket: "setNumeroTicket",
  kilometros_actuales: "setKilometrosActuales",
  iva_pct: "setIvaPct",
  fecha_aparcamiento: "setFechaParking",
  entidad_parking: "setEntidadParking",
  tipo_zona: "setTipoZonaParking",
  hora_inicio_aparcamiento: "setHoraInicioParking",
  hora_fin_aparcamiento: "setHoraFinParking",
  importe_aparcamiento: "setImporteParking",
  fecha_peaje: "setFechaPeaje",
  entidad_peaje: "setEntidadPeaje",
  numero_factura_peaje: "setNumeroFacturaPeaje",
  entrada_peaje: "setEntradaPeaje",
  salida_peaje: "setSalidaPeaje",
  importe_peaje: "setImportePeaje",
  fecha_entrada_hospedaje: "setFechaEntradaHospedaje",
  fecha_salida_hospedaje: "setFechaSalidaHospedaje",
  entidad_hospedaje: "setEntidadHospedaje",
  numero_factura_hospedaje: "setNumeroFacturaHospedaje",
  numero_personas_hospedaje: "setNumeroPersonasHospedaje",
  importe_hospedaje: "setImporteHospedaje",
  fecha_manutencion: "setFechaManutencion",
  establecimiento_manutencion: "setEstablecimientoManutencion",
  numero_factura_manutencion: "setNumeroFacturaManutencion",
  numero_comensales_manutencion: "setNumeroComensalesManutencion",
  importe_manutencion: "setImporteManutencion",
  estacion_itv: "setEstacionItv",
  fecha_inspeccion: "setFechaInspeccionItv",
  fecha_proxima_inspeccion: "setFechaProximaInspeccionItv",
  numero_factura_itv: "setNumeroFacturaItv",
  importe_itv: "setImporteItv",
  fecha_otros_gastos: "setFechaOtros",
  proveedor_otros_gastos: "setProveedorOtros",
  concepto_otros_gastos: "setConceptoOtros",
  numero_factura_otros: "setNumeroFacturaOtros",
  importe_otros_gastos: "setImporteOtros",
  observaciones: "setObservacionesOtros",
  fecha_multa: "setFechaMulta",
  conductor_multa: "setConductorMulta",
  lugar_multa: "setLugarMulta",
  organismo_denunciante: "setOrganismoDenunciante",
  tipo_infraccion: "setTipoInfraccion",
  importe_multa: "setImporteMulta",
  compania: "setCompaniaSeguro",
  numero_poliza: "setNumeroPolizaSeguro",
  cobertura: "setCoberturaSeguro",
  fecha_inicio_seguro: "setFechaInicioSeguro",
  fecha_fin_seguro: "setFechaFinSeguro",
  prima: "setPrimaSeguro",
  periodo_ivm: "setPeriodoIvm",
  importe_ivm: "setImporteIvm",
  tipo_otro_impuesto: "setTipoOtroImpuesto",
  fecha_pago: "setFechaPagoImpuesto",
  fecha_proximo_pago: "setFechaProximoPagoImpuesto",
  importe_otros_impuestos: "setImporteOtrosImpuestos",
  fecha_compra_repuestos: "setFechaCompraRepuestos",
  proveedor_repuestos: "setProveedorRepuestos",
  descripcion_repuestos: "setDescripcionRepuestos",
  numero_factura_repuestos: "setNumeroFacturaRepuestos",
  importe_repuestos: "setImporteRepuestos",
  fecha_compra_mantenimiento: "setFechaCompraMantenimiento",
  proveedor_mantenimiento: "setProveedorMantenimiento",
  descripcion_mantenimiento: "setDescripcionMantenimiento",
  numero_factura_mantenimiento: "setNumeroFacturaMantenimiento",
  importe_mantenimiento: "setImporteMantenimiento",
  fecha_proximo_mantenimiento: "setFechaProximoMantenimiento",
  kilometros_proximo_mantenimiento: "setKilometrosProximoMantenimiento",
};

const WEB_STATE_KEYS = Object.fromEntries(
  Object.entries(WEB_APPLY).map(([voiceKey, setter]) => {
    const raw = String(setter || "").replace(/^set/, "");
    const stateKey = raw ? raw.charAt(0).toLowerCase() + raw.slice(1) : "";
    return [voiceKey, stateKey];
  })
);

function normDept_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function str_(v) {
  return v == null ? "" : String(v).trim();
}

/** Desplegable Departamento/Proyecto a partir de texto guardado (nombre, id o valor). */
export function resolveDepartamentoSelectForForm(rawValue, projectOptions = []) {
  return departamentoSelectFromProyectoNombre(rawValue, projectOptions, []);
}

function findDepartamentoMatch_(value, projectOptions = []) {
  const v = String(value || "").trim();
  if (!v) return null;
  const vn = normDept_(v);

  const allOpts = Array.isArray(projectOptions) ? projectOptions : [];
  const projByValue = allOpts.find((o) => String(o?.value || "").trim() === v);
  if (projByValue) return { value: String(projByValue.value).trim(), custom: "" };

  const match = allOpts.find((o) => {
    const label = normDept_(String(o.label || o.value || ""));
    const val = normDept_(String(o.value || ""));
    return label === vn || val === vn || label.includes(vn) || vn.includes(label) || vn.includes(val);
  });
  if (match) return { value: String(match.value || "").trim(), custom: "" };

  return null;
}

function applyDepartamento_(value, setters, projectOptions = []) {
  const v = String(value || "").trim();
  if (!v) return false;
  const match = findDepartamentoMatch_(v, projectOptions);
  if (match) {
    setters.setDepartamentoProyecto?.(match.value);
    setters.setDepartamentoProyectoCustom?.("");
    return true;
  }
  setters.setDepartamentoProyecto?.(OTRO_DEPARTAMENTO);
  setters.setDepartamentoProyectoCustom?.(v);
  return true;
}

function applyDepartamentoNative_(value, setForm, projectOptions = []) {
  const v = String(value || "").trim();
  if (!v) return false;
  const match = findDepartamentoMatch_(v, projectOptions);
  if (match) {
    setForm((p) => ({ ...p, departamento_o_proyecto: match.value, departamento_o_proyecto_custom: "" }));
    return true;
  }
  setForm((p) => ({ ...p, departamento_o_proyecto: OTRO_DEPARTAMENTO, departamento_o_proyecto_custom: v }));
  return true;
}

function readDepartamentoVoiceValue_(source, projectOptions = [], platform = "web") {
  const value =
    platform === "web"
      ? str_(source.departamentoProyecto || source.departamento_o_proyecto)
      : str_(source.departamento_o_proyecto);
  const custom =
    platform === "web"
      ? str_(source.departamentoProyectoCustom || source.departamento_o_proyecto_custom)
      : str_(source.departamento_o_proyecto_custom);

  if (value === OTRO_DEPARTAMENTO || value === "__OTRO__") return custom;

  const resolved = value || custom;
  if (!resolved) return "";

  return (
    departamentoProyectoLabelForSave(value || resolved, custom, projectOptions, []) || resolved
  );
}

function findProyectoMatch_(value, projectOptions = []) {
  const v = String(value || "").trim();
  if (!v) return null;
  const vn = normDept_(v);
  const list = Array.isArray(projectOptions) ? projectOptions : [];
  const byId = list.find((o) => String(o?.value || "").trim() === v);
  if (byId) return String(byId.value).trim();
  const byLabel = list.find((o) => {
    const label = normDept_(String(o?.label || ""));
    const val = normDept_(String(o?.value || ""));
    return label === vn || val === vn || label.includes(vn) || vn.includes(label);
  });
  return byLabel ? String(byLabel.value || "").trim() : null;
}

function readProyectoVoiceValue_(source, projectOptions = [], platform = "web") {
  const id =
    platform === "web"
      ? str_(source.proyectoColaboradorId || source.proyecto_colaborador_id)
      : str_(source.proyecto_colaborador_id);
  if (!id) return "";
  const label = (Array.isArray(projectOptions) ? projectOptions : []).find(
    (o) => String(o?.value || "").trim() === id
  )?.label;
  return str_(label || id);
}

function readVoiceFieldValue_(key, source, { projectOptions = [], platform = "web" } = {}) {
  const k = String(key || "").trim();
  if (k === "departamento_o_proyecto") {
    return readDepartamentoVoiceValue_(source, projectOptions, platform);
  }
  if (k === "proyecto_colaborador_id") {
    return readProyectoVoiceValue_(source, projectOptions, platform);
  }
  if (platform === "web") {
    const stateKey = WEB_STATE_KEYS[k];
    if (k === "observaciones") return str_(source.observacionesOtros || source.observaciones);
    if (k === "accion_colaborador") return str_(source.accion || source.accionColaborador);
    return stateKey ? str_(source[stateKey]) : "";
  }
  if (k === "accion_colaborador") return str_(source.accion_colaborador || source.accion);
  return str_(source[k]);
}

/** Valores actuales del formulario mapeados a claves del asistente de voz. */
export function buildVoiceFieldSnapshot(tipo, source, { projectOptions = [], platform = "web" } = {}) {
  const fields = getVoiceFieldsForTipo(tipo);
  const out = {};
  for (const field of fields) {
    out[field.key] = readVoiceFieldValue_(field.key, source || {}, { projectOptions, platform });
  }
  return out;
}

export function filledVoiceFieldsFromSnapshot(fields, snapshot = {}) {
  return fields
    .map((field) => {
      const value = str_(snapshot[field.key]);
      if (!value) return null;
      return { key: field.key, label: field.label, value };
    })
    .filter(Boolean);
}

export function applyVoiceFieldWeb(key, value, setters, projectOptions = [], vehicleOptions = []) {
  const k = String(key || "").trim();
  const v = String(value ?? "").trim();
  if (!v) return false;

  if (k === "departamento_o_proyecto") {
    return applyDepartamento_(v, setters, projectOptions);
  }

  if (k === "proyecto_colaborador_id") {
    const id = findProyectoMatch_(v, projectOptions);
    if (id) {
      setters.setProyectoColaboradorId?.(id);
      return true;
    }
    return false;
  }

  const setterName = WEB_APPLY[k];
  if (!setterName || typeof setters[setterName] !== "function") return false;

  if (k === "matricula") {
    const plates = voiceMatriculaOptionsFromVehicles(vehicleOptions);
    const resolved = plates.length ? resolveVoiceMatricula_(v, plates) : null;
    if (plates.length && !resolved) return false;
    setters[setterName]((resolved || v).toUpperCase());
  } else {
    setters[setterName](v);
  }
  return true;
}

export function applyVoiceFieldNative(key, value, setForm, projectOptions = [], vehicleOptions = []) {
  const k = String(key || "").trim();
  const v = String(value ?? "").trim();
  if (!v || typeof setForm !== "function") return false;

  if (k === "departamento_o_proyecto") {
    return applyDepartamentoNative_(v, setForm, projectOptions);
  }

  if (k === "proyecto_colaborador_id") {
    const id = findProyectoMatch_(v, projectOptions);
    if (!id) return false;
    const label =
      (Array.isArray(projectOptions) ? projectOptions : []).find((o) => String(o?.value || "").trim() === id)?.label ||
      "";
    setForm((p) => ({
      ...p,
      proyecto_colaborador_id: id,
      proyecto_colaborador_nombre: String(label || "").trim(),
    }));
    return true;
  }

  if (k === "iva_pct") {
    setForm((p) => ({ ...p, iva_pct: v }));
    return true;
  }

  if (k === "matricula") {
    const plates = voiceMatriculaOptionsFromVehicles(vehicleOptions);
    const resolved = plates.length ? resolveVoiceMatricula_(v, plates) : null;
    if (plates.length && !resolved) return false;
    setForm((p) => ({ ...p, matricula: (resolved || v).toUpperCase() }));
    return true;
  }

  setForm((p) => ({ ...p, [k]: v }));
  return true;
}

export function voiceFieldsSupportedForTipo(tipo) {
  return getVoiceFieldsForTipo(tipo).length > 0;
}
