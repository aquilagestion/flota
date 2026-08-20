import { stripNumberedSelectPrefix } from "../../flotaWeb/lib/numberedSelectOptions";

/** Menú numerado de IVA por voz (todas las tipologías de gasto). */
export const IVA_VOICE_MENU = [
  { value: "4", label: "IVA cuatro" },
  { value: "10", label: "IVA diez" },
  { value: "21", label: "IVA veintiuno" },
  { value: "0", label: "IVA cero" },
  { value: "__OTRO__", label: "otro IVA" },
];

/** Campos con listas largas (proyecto, departamento, marca…). */
export const LONG_NUMBERED_MENU_KEYS = new Set([
  "departamento_o_proyecto",
  "proyecto_colaborador_id",
  "marca_combustible",
]);

export const NUMBERED_MENU_COMPACT_THRESHOLD = 6;

const SPOKEN_OPTION_NUM = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
  "treinta",
];

function spokenOptionNumber_(n) {
  const i = Number(n);
  if (i >= 1 && i < SPOKEN_OPTION_NUM.length) return SPOKEN_OPTION_NUM[i];
  return String(i);
}

export function fieldUsesNumberedVoiceMenu(field) {
  if (!field) return false;
  if (field.key === "iva_pct") return true;
  return String(field.kind || "") === "select";
}

export function isLongNumberedVoiceMenu(field) {
  if (!fieldUsesNumberedVoiceMenu(field)) return false;
  const n = numberedOptionLabelsForField(field).length;
  return LONG_NUMBERED_MENU_KEYS.has(field.key) || n > NUMBERED_MENU_COMPACT_THRESHOLD;
}

function optionLabelForVoice_(o) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    const value = String(o.value ?? "").trim();
    if (!value) return "";
    return stripNumberedSelectPrefix(o.label || o.value);
  }
  const s = String(o || "").trim();
  return s ? stripNumberedSelectPrefix(s) : "";
}

function optionValueForVoice_(o) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    const value = String(o.value ?? "").trim();
    const label = stripNumberedSelectPrefix(String(o.label || "").trim());
    // Ids tipo PRO-000009: devolver nombre visible (columna B) si hay label distinto.
    if (/^PRO[-_]?\d+/i.test(value) && label) return label;
    return value;
  }
  const s = String(o || "").trim();
  return s ? stripNumberedSelectPrefix(s) : "";
}

/** Etiquetas habladas para cada opción (todas, sin recortar). */
export function numberedOptionLabelsForField(field) {
  if (field?.key === "iva_pct") {
    return IVA_VOICE_MENU.map((o) => o.label);
  }
  const opts = Array.isArray(field?.options) ? field.options : [];
  return opts.map(optionLabelForVoice_).filter(Boolean);
}

/** Valores de formulario al elegir por número (paralelo a labels). */
export function numberedOptionValuesForField(field) {
  if (field?.key === "iva_pct") {
    return IVA_VOICE_MENU.map((o) => o.value);
  }
  const opts = Array.isArray(field?.options) ? field.options : [];
  return opts.map(optionValueForVoice_).filter(Boolean);
}

/**
 * @returns {{ intro: string, chunks: string[], longMenu: boolean }}
 */
export function buildNumberedSelectSpeechParts(field) {
  const label = String(field?.label || "valor").trim();
  const labels = numberedOptionLabelsForField(field);
  const n = labels.length;
  const longMenu = isLongNumberedVoiceMenu(field);
  const chunks = labels.map((optLabel, i) => {
    const num = spokenOptionNumber_(i + 1);
    return `Número ${num}: ${optLabel}.`;
  });

  const numN = spokenOptionNumber_(n);
  const intro =
    n > 1
      ? `${label}. Hay ${n} opciones, del número uno al ${numN}. Diga el número en cuanto lo sepa, o salta para omitir.`
      : `${label}. Diga el número o salta para omitir.`;

  return { intro, chunks, longMenu };
}
