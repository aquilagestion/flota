import {
  IVA_VOICE_MENU,
  numberedOptionLabelsForField,
  numberedOptionValuesForField,
} from "./expenseVoiceNumberedSelect";
import { stripNumberedSelectPrefix } from "../../flotaWeb/lib/numberedSelectOptions";
import {
  isPrimarilyVoiceIndexPick,
  normalizeVoiceMenuIndexUtterance,
  parseOptionIndex_,
  stripPromptEchoFromTranscript,
} from "./expenseVoiceParse";

/** Campos con listas largas: filtrar por voz/texto + lista en pantalla. */
export const FILTER_FIRST_VOICE_SELECT_KEYS = new Set(["departamento_o_proyecto", "marca_combustible"]);

/** Máximo de coincidencias mostradas/leídas sin pedir más detalle. */
export const VOICE_SELECT_CANDIDATE_CAP = 8;

/** Coincidencias únicas → confirmación sí/no. */
export const VOICE_SELECT_CONFIRM_SINGLE = true;

function norm_(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function fieldUsesFilterFirstVoiceSelect(field) {
  return !!field && FILTER_FIRST_VOICE_SELECT_KEYS.has(String(field.key || ""));
}

/** @returns {{ value: string, label: string }[]} */
export function voiceSelectOptionsForField(field) {
  if (!field) return [];
  const raw = Array.isArray(field.options) ? field.options : [];
  return raw
    .map((o) => {
      if (o && typeof o === "object") {
        const value = String(o.value ?? o.label ?? "").trim();
        const label = String(o.label ?? o.value ?? "").trim();
        return value ? { value, label: label || value } : null;
      }
      const s = String(o || "").trim();
      return s ? { value: s, label: s } : null;
    })
    .filter(Boolean);
}

function isVoiceMenuIndexOnlyUtterance_(raw, maxIndex = 99) {
  const t = normalizeVoiceMenuIndexUtterance(raw);
  if (!t) return false;
  if (!isPrimarilyVoiceIndexPick(t, maxIndex)) return false;
  const withoutIndexNoise = t
    .replace(/\b(opcion|numero|el|la|de|del)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const idx = parseOptionIndex_(t, maxIndex);
  if (idx == null) return false;
  const idxStr = String(idx);
  const spoken = SPOKEN_INDEX_[idx] || "";
  if (withoutIndexNoise === idxStr || withoutIndexNoise === spoken) return true;
  if (/^(\d\s*){1,2}$/.test(withoutIndexNoise)) return true;
  if (
    /^(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)(\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?$/.test(
      withoutIndexNoise
    )
  ) {
    return true;
  }
  if (/^veinti(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/.test(withoutIndexNoise)) return true;
  if (tokensAreOnlyIndexWords_(withoutIndexNoise)) return true;
  return withoutIndexNoise.length <= 14;
}

const SPOKEN_INDEX_ = {
  1: "uno",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
  13: "trece",
  14: "catorce",
  15: "quince",
  16: "dieciseis",
  17: "diecisiete",
  18: "dieciocho",
  19: "diecinueve",
  20: "veinte",
  21: "veintiuno",
  22: "veintidos",
  23: "veintitres",
  24: "veinticuatro",
  25: "veinticinco",
  26: "veintiseis",
  27: "veintisiete",
  28: "veintiocho",
  29: "veintinueve",
  30: "treinta",
};

function tokensAreOnlyIndexWords_(t) {
  const words = String(t || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 4) return false;
  const ok = new Set([
    "uno",
    "un",
    "una",
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
    "dieciseis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
    "veintiuno",
    "veintidos",
    "veintitres",
    "veinticuatro",
    "veinticinco",
    "veintiseis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
    "treinta",
    "y",
  ]);
  return words.every((w) => ok.has(w) || /^\d{1,2}$/.test(w));
}

/**
 * Filtra y ordena opciones por relevancia.
 * @param {{ value: string, label: string }[]} options
 * @param {string} query
 */
export function filterVoiceSelectOptions(options, query) {
  const list = Array.isArray(options) ? options : [];
  const q = norm_(query);
  if (!q) return list.slice();

  // No filtrar por enunciados que son solo un número de menú («21», «veintiuno», «2 1»).
  if (isVoiceMenuIndexOnlyUtterance_(q, Math.max(list.length, 40))) return [];

  const tokens = q.split(/\s+/).filter((t) => t.length > 0);

  return list
    .map((opt) => {
      const label = norm_(stripNumberedSelectPrefix(opt.label));
      const value = norm_(opt.value);
      let score = 0;

      if (label === q || value === q) score += 120;
      else if (label.startsWith(q) || value.startsWith(q)) score += 80;
      else if (label.includes(q) || value.includes(q)) score += 50;

      let tokenHits = 0;
      for (const tok of tokens) {
        if (tok.length < 2) continue; // evita que «2» o «1» marquen casi todo
        if (label.includes(tok) || value.includes(tok)) tokenHits += 1;
      }
      if (tokenHits > 0) score += tokenHits * 15;
      if (tokens.length > 1 && tokenHits === tokens.length) score += 25;

      return { opt, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.opt.label.localeCompare(b.opt.label, "es"))
    .map((x) => x.opt);
}

/**
 * Resolución inteligente para departamento/proyecto (y similares):
 * 1) número de lista («veintiuno», «2-1», «dos uno») sobre la lista completa
 * 2) filtro por nombre solo si no es un índice
 */
export function resolveFilterFirstVoiceSelect(transcript, options, field = null) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return { kind: "none", message: "No hay opciones cargadas." };

  const raw0 = String(transcript || "").trim();
  if (!raw0) return { kind: "none" };

  const cleaned = field ? stripPromptEchoFromTranscript(field, raw0) || raw0 : raw0;
  const candidates = [...new Set([cleaned, raw0].map((s) => normalizeVoiceMenuIndexUtterance(s)).filter(Boolean))];

  for (const cand of candidates) {
    const idx = parseOptionIndex_(cand, list.length);
    if (idx != null && idx >= 1 && idx <= list.length && isPrimarilyVoiceIndexPick(cand, list.length)) {
      const opt = list[idx - 1];
      if (opt && String(opt.value) !== "__OTRO__") {
        return {
          kind: "pick",
          option: opt,
          index: idx,
          heard: cand,
          message: `Número ${idx}: ${stripNumberedSelectPrefix(opt.label || opt.value)}`,
        };
      }
    }
  }

  const heard = candidates[0] || normalizeVoiceMenuIndexUtterance(cleaned);
  if (isVoiceMenuIndexOnlyUtterance_(heard, Math.max(list.length, 40))) {
    const idx = parseOptionIndex_(heard, list.length);
    return {
      kind: "miss_number",
      index: idx,
      heard,
      message:
        idx != null
          ? `El número ${idx} no está en la lista (hay ${list.length}).`
          : "No entendí el número. Pruebe «veintiuno» o «dos uno».",
    };
  }

  const filtered = filterVoiceSelectOptions(list, heard);
  if (filtered.length === 1) {
    return {
      kind: "pick",
      option: filtered[0],
      heard,
      message: stripNumberedSelectPrefix(filtered[0].label || filtered[0].value),
    };
  }
  if (filtered.length > 1) {
    const numPick = tryPickVoiceSelectOption(heard, filtered, field);
    if (numPick) {
      return {
        kind: "pick",
        option: numPick,
        heard,
        message: stripNumberedSelectPrefix(numPick.label || numPick.value),
      };
    }
    return {
      kind: "filter",
      options: filtered,
      heard,
      message:
        filtered.length > VOICE_SELECT_CANDIDATE_CAP
          ? `Hay ${filtered.length} coincidencias. Sea más concreto o diga el número.`
          : `${filtered.length} coincidencias. Diga el número de la lista filtrada.`,
    };
  }

  return {
    kind: "miss_name",
    heard,
    message: "No encuentro esa opción. Diga el número («veintiuno», «2 1») o parte del nombre.",
  };
}

/** Elige opción por índice 1-based sobre la lista filtrada actual. */
export function pickVoiceSelectByIndex(filteredOptions, rawTranscript) {
  const list = Array.isArray(filteredOptions) ? filteredOptions : [];
  if (!list.length) return null;
  const raw = normalizeVoiceMenuIndexUtterance(rawTranscript);
  if (!raw || !isPrimarilyVoiceIndexPick(raw, list.length)) return null;
  const idx = parseOptionIndex_(raw, list.length);
  if (idx == null || idx < 1 || idx > list.length) return null;
  return list[idx - 1];
}

/** Intenta elegir por número en lista filtrada (sin exigir frase ultra corta). */
export function tryPickVoiceSelectOption(transcript, filteredOptions, field = null) {
  const list = Array.isArray(filteredOptions) ? filteredOptions : [];
  if (!list.length) return null;
  const raw0 = String(transcript || "").trim();
  if (!raw0) return null;

  const candidates = [normalizeVoiceMenuIndexUtterance(raw0)];
  if (field) {
    const cleaned = stripPromptEchoFromTranscript(field, raw0);
    if (cleaned) candidates.unshift(normalizeVoiceMenuIndexUtterance(cleaned));
  }

  for (const cand of [...new Set(candidates.filter(Boolean))]) {
    const picked = pickVoiceSelectByIndex(list, cand);
    if (picked) return picked;
  }
  return null;
}

export function buildFilterFirstSelectIntro(field) {
  const label = String(field?.label || "valor").trim();
  const n = voiceSelectOptionsForField(field).length;
  if (n <= 1) {
    return `${label}. Diga el nombre o toque la opción en pantalla. «Salta» para omitir.`;
  }
  const numberHint =
    field?.key === "departamento_o_proyecto"
      ? " Para el número diga «veintiuno» o cifra a cifra «dos uno»."
      : " Diga el número de la lista en palabras o con dígitos.";
  return (
    `${label}. Hay ${n} opciones. ` +
    `Diga el número de la lista, parte del nombre, o toque en pantalla.` +
    numberHint +
    ` «Salta» para omitir.`
  );
}

/** Locución breve de candidatos (máx. maxSpeak). */
export function buildCandidateListSpeech(filteredOptions, maxSpeak = 5) {
  const list = (Array.isArray(filteredOptions) ? filteredOptions : []).slice(0, maxSpeak);
  if (!list.length) return "";
  const parts = list.map((opt, i) => `Número ${i + 1}: ${opt.label}.`);
  const extra = filteredOptions.length > maxSpeak ? ` Hay más en pantalla.` : "";
  return parts.join(" ") + extra;
}

export function buildConfirmOptionSpeech(option) {
  const label = String(option?.label || option?.value || "").trim();
  return label ? `¿${label}? Diga sí o no.` : "";
}

/** Mínimo de caracteres para filtrar por voz (evita eco del TTS). Los números no aplican este mínimo. */
export const VOICE_SELECT_FILTER_MIN_LEN = 2;

export function isVoiceSelectNumberUtterance(rawTranscript, filteredOptions) {
  const list = Array.isArray(filteredOptions) ? filteredOptions : [];
  if (!list.length) return false;
  return isVoiceMenuIndexOnlyUtterance_(rawTranscript, list.length);
}

/** Pistas para el reconocedor (mejora «veintiuno», «dos uno»…). */
export function voiceSelectContextualStrings(field, options = []) {
  const list = Array.isArray(options) && options.length ? options : voiceSelectOptionsForField(field);
  const n = Math.min(list.length, 45);
  const out = [
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
    "opción",
    "número",
    "salta",
  ];
  for (let i = 1; i <= n; i += 1) out.push(String(i));
  for (const opt of list.slice(0, 30)) {
    const name = stripNumberedSelectPrefix(opt.label || opt.value);
    if (name) out.push(name);
  }
  return [...new Set(out.filter(Boolean))];
}

/** Opciones visibles en el asistente de voz (desplegables, IVA, etc.). */
export function wizardSelectOptionsForField(field) {
  if (!field) return [];
  if (field.key === "iva_pct") {
    return IVA_VOICE_MENU.filter((o) => o.value !== "__OTRO__").map((o) => ({
      value: o.value,
      label: o.label,
    }));
  }
  const fromField = voiceSelectOptionsForField(field);
  if (fromField.length) return fromField;
  const labels = numberedOptionLabelsForField(field);
  const values = numberedOptionValuesForField(field);
  return labels.map((label, i) => ({ value: values[i] ?? label, label }));
}
