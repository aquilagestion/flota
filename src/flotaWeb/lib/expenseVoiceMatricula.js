import {
  isValidSpanishPlateFormat,
  normalizeSpanishPlate,
} from "./spanishPlate";

/** Locución cuando la matrícula dictada no está en la lista de vehículos. */
export const VOICE_MATRICULA_INVALID_PROMPT =
  "No reconozco esa matrícula. Repítala o elija de la lista.";

const PLATE_CONFUSABLES = {
  O: "0",
  0: "0",
  Q: "0",
  I: "1",
  1: "1",
  L: "1",
  B: "8",
  8: "8",
  S: "5",
  5: "5",
  Z: "2",
  2: "2",
  G: "6",
  6: "6",
  D: "0",
};

export function normalizeVoicePlate_(raw) {
  return normalizeSpanishPlate(raw);
}

function normalizePlateForMatch_(raw) {
  return normalizeVoicePlate_(raw)
    .split("")
    .map((ch) => PLATE_CONFUSABLES[ch] ?? ch)
    .join("");
}

function levenshtein_(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function plateMatchScore_(spokenNorm, candidateNorm) {
  if (!spokenNorm || !candidateNorm) return 0;
  if (spokenNorm === candidateNorm) return 200;

  const spokenAlt = normalizePlateForMatch_(spokenNorm);
  const candidateAlt = normalizePlateForMatch_(candidateNorm);
  if (spokenAlt === candidateAlt) return 190;

  const maxLen = Math.max(spokenNorm.length, candidateNorm.length);
  const dist = levenshtein_(spokenAlt, candidateAlt);
  const allowed = maxLen <= 5 ? 1 : maxLen <= 7 ? 2 : 3;
  if (dist > allowed) return 0;

  let score = 140 - dist * 25;
  if (spokenNorm.length === candidateNorm.length) score += 10;
  if (candidateNorm.startsWith(spokenNorm) || spokenNorm.startsWith(candidateNorm)) score += 15;
  if (candidateNorm.endsWith(spokenNorm) || spokenNorm.endsWith(candidateNorm)) score += 10;
  return score;
}

/** @returns {{ value: string, label: string }[]} */
export function voiceMatriculaOptionsFromVehicles(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const raw = item && typeof item === "object" ? item.value ?? item.matricula ?? item.label : item;
    const plate = normalizeVoicePlate_(raw);
    if (!plate || !isValidSpanishPlateFormat(plate) || seen.has(plate)) continue;
    seen.add(plate);
    out.push({ value: plate, label: plate });
  }
  return out;
}

function plateCandidatesFromSpeech_(value, rawTranscript = "") {
  const out = [];
  const add = (s) => {
    const p = normalizeVoicePlate_(s);
    if (p && !out.includes(p)) out.push(p);
  };
  add(value);
  add(rawTranscript);
  add(`${value} ${rawTranscript}`.trim());
  const blob = `${value} ${rawTranscript}`;
  const chunks = blob.match(/[a-z0-9][a-z0-9\s-]*/gi) || [];
  for (const chunk of chunks) add(chunk);
  return out;
}

/** Devuelve la matrícula canónica de la lista (coincidencia exacta o aproximada). */
export function resolveVoiceMatricula_(raw, options) {
  const opts = voiceMatriculaOptionsFromVehicles(options);
  if (!opts.length) return null;

  const candidates = plateCandidatesFromSpeech_(raw, "");
  for (const cand of candidates) {
    if (!isValidSpanishPlateFormat(cand)) continue;
    for (const opt of opts) {
      if (normalizeVoicePlate_(opt.value) === cand) return opt.value;
    }
  }

  const spokenNorm = normalizeVoicePlate_(raw);
  if (spokenNorm) {
    for (const opt of opts) {
      const p = normalizeVoicePlate_(opt.value);
      if (p && spokenNorm.includes(p)) return opt.value;
    }
  }

  let best = null;
  let bestScore = 0;
  const norm = normalizeVoicePlate_(raw);
  if (!norm) return null;

  for (const opt of opts) {
    const candidateNorm = normalizeVoicePlate_(opt.value);
    const score = plateMatchScore_(norm, candidateNorm);
    if (score > bestScore) {
      bestScore = score;
      best = opt.value;
    }
  }
  if (spokenNorm && spokenNorm !== norm) {
    for (const opt of opts) {
      const candidateNorm = normalizeVoicePlate_(opt.value);
      const score = plateMatchScore_(spokenNorm, candidateNorm);
      if (score > bestScore) {
        bestScore = score;
        best = opt.value;
      }
    }
  }
  if (best && bestScore >= 80) return best;
  return null;
}

/** Intenta resolver matrícula a partir del valor parseado y/o la transcripción cruda. */
export function resolveVoiceMatriculaFromSpeech_(value, rawTranscript, options) {
  const opts = voiceMatriculaOptionsFromVehicles(options);
  if (!opts.length) return null;

  const candidates = plateCandidatesFromSpeech_(value, rawTranscript);
  for (const cand of candidates) {
    if (!isValidSpanishPlateFormat(cand)) continue;
    for (const opt of opts) {
      if (normalizeVoicePlate_(opt.value) === cand) return opt.value;
    }
    const resolved = resolveVoiceMatricula_(cand, opts);
    if (resolved) return resolved;
  }

  const spokenNorm = normalizeVoicePlate_(rawTranscript || value);
  if (spokenNorm) {
    for (const opt of opts) {
      const p = normalizeVoicePlate_(opt.value);
      if (p && spokenNorm.includes(p)) return opt.value;
    }
  }

  return resolveVoiceMatricula_(rawTranscript || value, opts);
}

export function fieldRequiresMatriculaListValidation(field) {
  return (
    String(field?.key || "") === "matricula" &&
    Array.isArray(field?.options) &&
    field.options.length > 0
  );
}

/** @returns {{ ok: boolean, value: string }} */
export function validateVoiceMatriculaForField(field, value, rawTranscript = "") {
  const raw = String(value ?? "").trim();
  const spoken = String(rawTranscript ?? "").trim();

  if (!raw && !spoken) return { ok: true, value: "" };

  if (!fieldRequiresMatriculaListValidation(field)) {
    return { ok: true, value: raw || spoken };
  }

  const resolved = resolveVoiceMatriculaFromSpeech_(raw, spoken, field.options);
  if (resolved) return { ok: true, value: resolved };

  return { ok: false, value: "" };
}
