import { EXPENSE_TYPES, FUEL_BRANDS, FUEL_TYPES, PARKING_ZONES, PAYMENT_METHODS } from "../domain/expenseSchema";
import { buildDepartmentProjectSelectOptions } from "../../flotaWeb/lib/departmentProjectSelectOptions";
import { withNumberedSelectLabels } from "../../flotaWeb/lib/numberedSelectOptions";
import { isKmActualesRequired, showsKmActualesField } from "../../flotaWeb/lib/expenseKmActuales";
import { buildExpenseMatriculaSelectOptions } from "../../flotaWeb/lib/spanishPlate";
import {
  VOICE_CONFIRM_PROMPT,
  VOICE_SESSION_INTRO,
  voiceFieldSpeakPrompt,
} from "./expenseVoicePrompts";

export { VOICE_CONFIRM_PROMPT, VOICE_SESSION_INTRO, voiceFieldSpeakPrompt };

/** @typedef {'text'|'date'|'amount'|'number'|'time'|'select'|'plate'|'invoice'|'percent'} VoiceFieldKind */

/**
 * @typedef {Object} VoiceFieldDef
 * @property {string} key
 * @property {string} label
 * @property {VoiceFieldKind} kind
 * @property {string[]} aliases
 * @property {boolean} [optional]
 * @property {string[]} [options]
 */

const TIPO_REPOSTAJE_OPTS = ["PARCIAL", "COMPLETO"];

const IVA_FIELD = {
  key: "iva_pct",
  label: "Porcentaje de IVA",
  kind: "percent",
  aliases: ["porcentaje de iva", "porcentaje iva", "iva", "por ciento iva"],
};

const KM_ACTUALES_FIELD = {
  key: "kilometros_actuales",
  label: "Kilómetros actuales",
  kind: "number",
  aliases: ["kilometros actuales", "kilómetros actuales", "kilometros", "kilómetros", "cuentakilometros"],
};

function kmActualesVoiceField_(tipo) {
  return {
    ...KM_ACTUALES_FIELD,
    optional: !isKmActualesRequired(tipo),
  };
}

function departamentoOptions_() {
  return [];
}

const MATRICULA_FIELD = {
  key: "matricula",
  label: "Matrícula",
  kind: "plate",
  aliases: ["matricula", "matrícula"],
};

const DEPT_FIELD = {
  key: "departamento_o_proyecto",
  label: "Departamento o proyecto",
  kind: "select",
  options: departamentoOptions_(),
  aliases: ["departamento", "proyecto", "departamento proyecto", "departamento o proyecto"],
};

const FORMA_PAGO_FIELD = {
  key: "forma_pago",
  label: "Usuario / forma de pago",
  kind: "select",
  options: PAYMENT_METHODS,
  aliases: ["usuario", "forma de pago", "forma pago", "pago"],
};

/** Cabecera común + campos del tipo + IVA (gastos frecuentes con orden fijo). */
function voiceFieldsWithHeader_(specificFields) {
  const hasOwnIva = specificFields.some((f) => f.key === "iva_porcentaje");
  const tail = hasOwnIva ? [] : [IVA_FIELD];
  return [FORMA_PAGO_FIELD, MATRICULA_FIELD, DEPT_FIELD, ...specificFields, ...tail];
}

const KM_COLAB_BODY = [
  { key: "fecha_viaje_colaborador", label: "Fecha viaje", kind: "date", aliases: ["fecha viaje", "fecha del viaje", "fecha"] },
  { key: "km_inicial_colaborador", label: "Km iniciales", kind: "number", aliases: ["km inicial", "kilometros iniciales", "kilómetros iniciales", "km iniciales"] },
  { key: "km_final_colaborador", label: "Km finales", kind: "number", aliases: ["km final", "kilometros finales", "kilómetros finales", "km finales"] },
  {
    key: "tarifa_eur_km_aplicada",
    label: "Tarifa euros por km",
    kind: "amount",
    aliases: ["tarifa", "tarifa kilometro", "tarifa kilómetro", "euros por kilometro", "euros por kilómetro"],
    optional: true,
  },
  { key: "origen_colaborador", label: "Origen", kind: "text", aliases: ["origen"] },
  { key: "destino_colaborador", label: "Destino", kind: "text", aliases: ["destino"] },
  {
    key: "proyecto_colaborador_id",
    label: "Proyecto a imputar",
    kind: "select",
    options: [],
    aliases: ["proyecto", "proyecto a imputar", "proyecto colaborador"],
    optional: true,
  },
  { key: "motivo_colaborador", label: "Motivo", kind: "text", aliases: ["motivo"], optional: true },
  { key: "accion_colaborador", label: "Acción", kind: "text", aliases: ["accion", "acción"], optional: true },
];

const BY_TIPO = {
  COMBUSTIBLES: [
    { key: "fecha_repostaje", label: "Fecha repostaje", kind: "date", aliases: ["fecha repostaje", "fecha del repostaje"] },
    { key: "entidad_combustible", label: "Entidad / gasolinera", kind: "text", aliases: ["entidad", "gasolinera", "establecimiento"] },
    { key: "lugar_repostaje", label: "Lugar repostaje", kind: "text", aliases: ["lugar repostaje", "lugar", "localidad"], optional: true },
    { key: "marca_combustible", label: "Marca combustible", kind: "select", options: FUEL_BRANDS, aliases: ["marca", "marca combustible"], optional: true },
    { key: "tipo_combustible", label: "Tipo combustible", kind: "select", options: FUEL_TYPES, aliases: ["tipo combustible", "combustible", "tipo de combustible"] },
    { key: "tipo_repostaje", label: "Tipo repostaje", kind: "select", options: TIPO_REPOSTAJE_OPTS, aliases: ["tipo repostaje", "tipo de repostaje", "repostaje parcial", "repostaje completo"] },
    { key: "litros_repostados", label: "Litros", kind: "amount", aliases: ["litros repostados", "litros"] },
    { key: "total_a_pagar", label: "Total a pagar", kind: "amount", aliases: ["total a pagar", "total pagado", "importe total", "total"] },
    {
      key: "iva_porcentaje",
      label: "IVA %",
      kind: "select",
      options: ["4", "10", "21", "0", "__OTRO__"],
      aliases: ["iva", "porcentaje de iva", "porcentaje iva", "iva por ciento", "por ciento de iva"],
    },
    {
      key: "numero_ticket",
      label: "Nº factura o tiquet",
      kind: "invoice",
      aliases: ["numero ticket", "número ticket", "numero factura", "número factura", "ticket", "factura"],
      optional: true,
    },
  ],
  PARKING: [
    { key: "fecha_aparcamiento", label: "Fecha aparcamiento", kind: "date", aliases: ["fecha aparcamiento", "fecha parking", "fecha"] },
    { key: "entidad_parking", label: "Entidad parking", kind: "text", aliases: ["entidad parking", "entidad", "parking"] },
    { key: "tipo_zona", label: "Tipo de zona", kind: "select", options: PARKING_ZONES, aliases: ["tipo zona", "tipo de zona", "zona"] },
    { key: "hora_inicio_aparcamiento", label: "Hora inicio", kind: "time", aliases: ["hora inicio", "inicio"] },
    { key: "hora_fin_aparcamiento", label: "Hora fin", kind: "time", aliases: ["hora fin", "fin"] },
    { key: "importe_aparcamiento", label: "Importe", kind: "amount", aliases: ["importe aparcamiento", "importe"] },
  ],
  PEAJES: [
    { key: "fecha_peaje", label: "Fecha peaje", kind: "date", aliases: ["fecha peaje", "fecha del peaje", "fecha"] },
    { key: "entidad_peaje", label: "Nombre establecimiento", kind: "text", aliases: ["entidad peaje", "entidad", "establecimiento", "nombre establecimiento"] },
    { key: "numero_factura_peaje", label: "Nº factura / tiquet", kind: "invoice", aliases: ["numero factura peaje", "numero factura", "número factura", "factura", "ticket", "tiquet"], optional: true },
    { key: "entrada_peaje", label: "Entrada peaje", kind: "text", aliases: ["entrada peaje", "entrada"], optional: true },
    { key: "salida_peaje", label: "Salida peaje", kind: "text", aliases: ["salida peaje", "salida"], optional: true },
    { key: "importe_peaje", label: "Importe peaje", kind: "amount", aliases: ["importe peaje", "importe"] },
  ],
  ITV: [
    { key: "estacion_itv", label: "Estación ITV", kind: "text", aliases: ["estacion itv", "estación itv", "itv"] },
    { key: "fecha_inspeccion", label: "Fecha inspección", kind: "date", aliases: ["fecha inspeccion", "fecha inspección", "fecha"] },
    { key: "fecha_proxima_inspeccion", label: "Próxima inspección", kind: "date", aliases: ["fecha proxima inspeccion", "fecha próxima inspección", "proxima inspeccion", "próxima inspección"] },
    { key: "numero_factura_itv", label: "Nº factura", kind: "invoice", aliases: ["numero factura", "número factura", "factura"], optional: true },
    { key: "importe_itv", label: "Importe", kind: "amount", aliases: ["importe itv", "importe"] },
  ],
  OTROS: [
    { key: "fecha_otros_gastos", label: "Fecha", kind: "date", aliases: ["fecha otros", "fecha gasto", "fecha"] },
    { key: "proveedor_otros_gastos", label: "Proveedor", kind: "text", aliases: ["proveedor"] },
    { key: "concepto_otros_gastos", label: "Concepto", kind: "text", aliases: ["concepto"] },
    { key: "numero_factura_otros", label: "Nº factura", kind: "invoice", aliases: ["numero factura", "número factura", "factura", "ticket", "tiquet"], optional: true },
    { key: "importe_otros_gastos", label: "Importe", kind: "amount", aliases: ["importe otros", "importe"] },
    { key: "observaciones", label: "Observaciones", kind: "text", aliases: ["observaciones", "anotaciones", "notas"] },
  ],
  HOSPEDAJE: [
    { key: "fecha_otros_gastos", label: "Fecha", kind: "date", aliases: ["fecha hospedaje", "fecha gasto", "fecha", "fecha entrada"] },
    { key: "proveedor_otros_gastos", label: "Entidad / establecimiento", kind: "text", aliases: ["proveedor", "hotel", "alojamiento", "entidad", "establecimiento"] },
    { key: "concepto_otros_gastos", label: "Concepto", kind: "text", aliases: ["concepto", "hospedaje"], optional: true },
    { key: "numero_factura_otros", label: "Nº factura / tiquet", kind: "invoice", aliases: ["numero factura", "número factura", "factura", "ticket", "tiquet"], optional: true },
    { key: "numero_personas_hospedaje", label: "Nº huéspedes", kind: "number", aliases: ["numero huespedes", "número huéspedes", "huespedes", "huéspedes", "numero personas", "número personas", "personas"] },
    { key: "importe_otros_gastos", label: "Importe", kind: "amount", aliases: ["importe hospedaje", "importe"] },
    { key: "observaciones", label: "Observaciones", kind: "text", aliases: ["observaciones", "anotaciones", "notas"], optional: true },
  ],
  MANUTENCION: [
    { key: "fecha_otros_gastos", label: "Fecha", kind: "date", aliases: ["fecha manutencion", "fecha manutención", "fecha gasto", "fecha"] },
    { key: "proveedor_otros_gastos", label: "Nombre establecimiento", kind: "text", aliases: ["proveedor", "restaurante", "establecimiento", "nombre establecimiento"] },
    { key: "concepto_otros_gastos", label: "Concepto", kind: "text", aliases: ["concepto", "manutencion", "manutención"], optional: true },
    { key: "numero_factura_otros", label: "Nº factura / tiquet", kind: "invoice", aliases: ["numero factura", "número factura", "factura", "ticket", "tiquet"], optional: true },
    { key: "numero_comensales_manutencion", label: "Nº comensales", kind: "number", aliases: ["numero comensales", "número comensales", "comensales", "numero de comensales"] },
    { key: "importe_otros_gastos", label: "Importe", kind: "amount", aliases: ["importe manutencion", "importe manutención", "importe"] },
    { key: "observaciones", label: "Observaciones", kind: "text", aliases: ["observaciones", "anotaciones", "notas"], optional: true },
  ],
  MULTAS_SANCIONES: [
    { key: "fecha_multa", label: "Fecha multa", kind: "date", aliases: ["fecha multa", "fecha"] },
    { key: "conductor_multa", label: "Conductor", kind: "text", aliases: ["conductor"] },
    { key: "lugar_multa", label: "Lugar", kind: "text", aliases: ["lugar multa", "lugar"] },
    { key: "organismo_denunciante", label: "Organismo", kind: "text", aliases: ["organismo denunciante", "organismo"] },
    { key: "tipo_infraccion", label: "Tipo infracción", kind: "text", aliases: ["tipo infraccion", "tipo infracción", "infraccion", "infracción"] },
    { key: "importe_multa", label: "Importe", kind: "amount", aliases: ["importe multa", "importe"] },
  ],
  SEGURO: [
    { key: "compania", label: "Compañía", kind: "text", aliases: ["compania", "compañía", "compañia", "aseguradora"] },
    { key: "numero_poliza", label: "Nº póliza", kind: "invoice", aliases: ["numero poliza", "número poliza", "numero de poliza", "número de poliza", "poliza", "póliza"] },
    { key: "cobertura", label: "Cobertura", kind: "text", aliases: ["cobertura"] },
    { key: "fecha_inicio_seguro", label: "Fecha inicio seguro", kind: "date", aliases: ["fecha inicio seguro", "fecha inicio", "inicio seguro"] },
    { key: "fecha_fin_seguro", label: "Fecha fin seguro", kind: "date", aliases: ["fecha fin seguro", "fecha fin", "fin seguro"] },
    { key: "prima", label: "Prima", kind: "amount", aliases: ["prima", "importe prima"] },
  ],
  IMPUESTOS: [
    { key: "periodo_ivm", label: "Periodo I.V.M.", kind: "date", aliases: ["periodo ivm", "periodo i v m", "periodo"] },
    { key: "importe_ivm", label: "Importe I.V.M.", kind: "amount", aliases: ["importe ivm", "importe i v m", "importe"] },
  ],
  OTROS_IMPUESTOS: [
    { key: "tipo_otro_impuesto", label: "Tipo impuesto", kind: "text", aliases: ["tipo impuesto", "tipo de impuesto"] },
    { key: "fecha_pago", label: "Fecha pago", kind: "date", aliases: ["fecha pago", "fecha de pago"] },
    { key: "fecha_proximo_pago", label: "Fecha próximo pago", kind: "date", aliases: ["fecha proximo pago", "fecha próximo pago", "proximo pago", "próximo pago"] },
    { key: "importe_otros_impuestos", label: "Importe", kind: "amount", aliases: ["importe otros impuestos", "importe"] },
  ],
  REPUESTOS_RECAMBIO: [
    { key: "fecha_compra_repuestos", label: "Fecha compra", kind: "date", aliases: ["fecha compra repuestos", "fecha compra", "fecha"] },
    { key: "proveedor_repuestos", label: "Proveedor / taller", kind: "text", aliases: ["proveedor repuestos", "proveedor", "taller"] },
    { key: "descripcion_repuestos", label: "Descripción", kind: "text", aliases: ["descripcion repuestos", "descripción repuestos", "descripcion", "descripción"] },
    { key: "numero_factura_repuestos", label: "Nº factura", kind: "invoice", aliases: ["numero factura repuestos", "numero factura", "número factura", "factura"], optional: true },
    { key: "importe_repuestos", label: "Importe", kind: "amount", aliases: ["importe repuestos", "importe"] },
  ],
  MANTENIMIENTO_REPARACIONES: [
    { key: "fecha_compra_mantenimiento", label: "Fecha compra", kind: "date", aliases: ["fecha compra mantenimiento", "fecha compra", "fecha"] },
    { key: "proveedor_mantenimiento", label: "Proveedor", kind: "text", aliases: ["proveedor mantenimiento", "proveedor", "taller"] },
    { key: "descripcion_mantenimiento", label: "Descripción", kind: "text", aliases: ["descripcion mantenimiento", "descripción mantenimiento", "descripcion", "descripción"] },
    { key: "numero_factura_mantenimiento", label: "Nº factura", kind: "invoice", aliases: ["numero factura mantenimiento", "numero factura", "número factura", "factura"], optional: true },
    { key: "importe_mantenimiento", label: "Importe", kind: "amount", aliases: ["importe mantenimiento", "importe"] },
    { key: "fecha_proximo_mantenimiento", label: "Próximo mantenimiento", kind: "date", aliases: ["fecha proximo mantenimiento", "fecha próximo mantenimiento", "proximo mantenimiento"] },
    { key: "kilometros_proximo_mantenimiento", label: "Km próximo mantenimiento", kind: "number", aliases: ["kilometros proximo mantenimiento", "kilómetros próximo mantenimiento", "km proximo"] },
  ],
};

function withKmAfterDepartamentoIfNeeded_(tipo, fields) {
  const t = String(tipo || "").trim().toUpperCase();
  if (!showsKmActualesField(t)) return fields;
  if (fields.some((f) => f.key === "kilometros_actuales")) return fields;
  const idx = fields.findIndex((f) => f.key === "departamento_o_proyecto");
  if (idx < 0) return fields;
  const out = [...fields];
  out.splice(idx + 1, 0, kmActualesVoiceField_(t));
  return out;
}

/** Enriquece campos con opciones dinámicas (proyectos, vehículos). */
export function enrichVoiceFieldsForForm(tipo, projectOptions = [], vehicleOptions = []) {
  const base = getVoiceFieldsForTipo(tipo);
  const numberedProjects = withNumberedSelectLabels(
    (Array.isArray(projectOptions) ? projectOptions : []).filter((p) => String(p?.value || "").trim())
  );
  const deptOpts = buildDepartmentProjectSelectOptions(projectOptions);
  const plateOpts = buildExpenseMatriculaSelectOptions(vehicleOptions);
  return base.map((field) => {
    if (field.key === "proyecto_colaborador_id") {
      return { ...field, options: numberedProjects, kind: "select" };
    }
    if (field.key === "departamento_o_proyecto") {
      return { ...field, options: deptOpts, kind: "select" };
    }
    if (field.key === "matricula" && plateOpts.length) {
      return { ...field, options: plateOpts };
    }
    return field;
  });
}

export function voiceTipoLabel(tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  const hit = EXPENSE_TYPES.find((x) => String(x.value || "").trim().toUpperCase() === t);
  return hit?.label || t.replace(/_/g, " ");
}

/** Lista legible de todos los tipos de gasto con asistente de voz. */
export function voiceSupportedTiposSummary() {
  return EXPENSE_TYPES.filter((x) => getVoiceFieldsForTipo(x.value).length > 0)
    .map((x) => x.label)
    .join(", ");
}

export function getVoiceFieldsForTipo(tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  if (t === "KILOMETRAJE_COLABORADOR") {
    return [FORMA_PAGO_FIELD, ...KM_COLAB_BODY];
  }

  const specific = BY_TIPO[t];
  if (!specific) return [];

  let fields = voiceFieldsWithHeader_(specific);
  fields = withKmAfterDepartamentoIfNeeded_(t, fields);
  return fields;
}

export function buildVoiceExamplePhrase(tipo) {
  const fields = getVoiceFieldsForTipo(tipo);
  if (!fields.length) return "";
  const parts = fields.slice(0, 6).map((f) => {
    const alias = String(f.aliases?.[0] || f.label || "").trim();
    return `${alias} …`;
  });
  const rest = fields.length > 6 ? " …" : "";
  return parts.join(", ") + rest;
}

export function voiceFieldAliases(field) {
  const list = Array.isArray(field?.aliases) ? field.aliases : [];
  const label = String(field?.label || "").trim();
  const fromKey = String(field?.key || "").replace(/_/g, " ").trim();
  return [...new Set([...list, label, fromKey].map((s) => String(s || "").trim()).filter(Boolean))];
}
