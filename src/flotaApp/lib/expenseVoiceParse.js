import { parseVoiceInvoiceNumber } from "../../flotaWeb/lib/expenseVoiceInvoice";
import { voiceFieldSpeakPrompt } from "./expenseVoicePrompts";
import { isValidSpanishPlateFormat, normalizeSpanishPlate } from "../../flotaWeb/lib/spanishPlate";
import { stripNumberedSelectPrefix } from "../../flotaWeb/lib/numberedSelectOptions";
import {
  fieldUsesNumberedVoiceMenu,
  IVA_VOICE_MENU,
  numberedOptionLabelsForField,
  numberedOptionValuesForField,
} from "./expenseVoiceNumberedSelect";

const NUMBERED_MENU_MAX_INDEX = 99;

const OPTION_INDEX_WORD =
  "uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cuarenta y uno|cuarenta y dos|cuarenta y tres|cuarenta y cuatro|cuarenta y cinco";

const MONTHS_ES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const WORD_NUM = {
  cero: 0,
  uno: 1,
  un: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintiséis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const SCALES = { mil: 1000 };

const LETTER_WORDS = {
  a: "A",
  be: "B",
  bi: "B",
  ce: "C",
  ci: "C",
  de: "D",
  di: "D",
  e: "E",
  efe: "F",
  ge: "G",
  hache: "H",
  i: "I",
  jota: "J",
  ka: "K",
  k: "K",
  ele: "L",
  eme: "M",
  ene: "N",
  enye: "Ñ",
  eñe: "Ñ",
  o: "O",
  pe: "P",
  cu: "Q",
  q: "Q",
  erre: "R",
  ese: "S",
  te: "T",
  u: "U",
  uve: "V",
  v: "V",
  "doble uve": "W",
  w: "W",
  equis: "X",
  x: "X",
  ye: "Y",
  y: "Y",
  "i griega": "Y",
  zeta: "Z",
  z: "Z",
};

const SPOKEN_LETTER_NAME =
  "a|be|b|ce|c|de|d|e|efe|f|ge|g|hache|h|i|jota|j|ka|k|ele|l|eme|m|ene|n|enye|eñe|o|pe|p|cu|q|erre|r|ese|s|te|t|u|uve|v|equis|x|ye|y|i griega|zeta|z|doble uve";

function expandSpokenPlateLetters_(raw) {
  let s = norm_(raw);
  s = s.replace(new RegExp(`\\b(${SPOKEN_LETTER_NAME})\\s+de\\s+[a-z]+\\b`, "gi"), " $1 ");
  s = s.replace(/\b(doble uve)\b/g, " w ");
  s = s.replace(/\b(i griega)\b/g, " y ");
  return s;
}

function letterFromToken_(token) {
  const t = norm_(token);
  if (!t) return null;
  if (LETTER_WORDS[t]) return LETTER_WORDS[t];
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  return null;
}

/** Bloque de 4 cifras: dígito a dígito, pares (once once) o compuesto (mil ciento once). */
function parseFourDigitBlock_(tokens, startIdx) {
  const tokensList = Array.isArray(tokens) ? tokens : [];
  const start = Number(startIdx) || 0;
  if (start >= tokensList.length) return null;

  const direct = String(tokensList[start] || "").trim();
  if (/^\d{4}$/.test(direct)) return { value: direct, next: start + 1 };

  let digitChars = "";
  let i = start;
  for (; i < tokensList.length && digitChars.length < 4; i += 1) {
    const d = singleDigitToken_(tokensList[i]);
    if (d == null) break;
    digitChars += d;
  }
  if (digitChars.length === 4) return { value: digitChars, next: i };

  if (start + 1 < tokensList.length) {
    const a = parseSpanishInteger_(tokensList[start]);
    const b = parseSpanishInteger_(tokensList[start + 1]);
    if (a != null && b != null && a >= 0 && a <= 99 && b >= 0 && b <= 99) {
      const value = `${String(a).padStart(2, "0")}${String(b).padStart(2, "0")}`;
      if (value.length === 4) return { value, next: start + 2 };
    }
  }

  for (let end = start + 1; end <= Math.min(tokensList.length, start + 7); end += 1) {
    const chunk = tokensList.slice(start, end).join(" ");
    const n = parseSpanishInteger_(chunk);
    if (n != null && n >= 0 && n <= 9999) {
      const value = String(n).padStart(4, "0");
      if (value.length === 4) return { value, next: end };
    }
  }

  return null;
}

function tryParsePlateBySpec_(tokens, { prefixLetters, suffixLetters }) {
  let i = 0;
  let prefix = "";
  for (let n = 0; n < prefixLetters; n += 1) {
    const l = letterFromToken_(tokens[i]);
    if (!l) return null;
    prefix += l;
    i += 1;
  }

  const digitBlock = parseFourDigitBlock_(tokens, i);
  if (!digitBlock) return null;
  i = digitBlock.next;

  let suffix = "";
  for (let n = 0; n < suffixLetters; n += 1) {
    const l = letterFromToken_(tokens[i]);
    if (!l) return null;
    suffix += l;
    i += 1;
  }

  const plate = normalizeSpanishPlate(`${prefix}${digitBlock.value}${suffix}`);
  return isValidSpanishPlateFormat(plate) ? plate : null;
}

function parsePlateLegacy_(raw) {
  const tokens = expandSpokenPlateLetters_(raw)
    .replace(/\bde\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  for (const tok of tokens) {
    out = appendSpokenToken_(out, tok);
  }
  out = normalizeSpanishPlate(out);
  return out.length >= 4 ? out : "";
}

function norm_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza enunciados de índice de menú para STT español:
 * «2-1» / «2/1» → «2 1», «veinte y uno» / «veinti uno» → «veintiuno».
 */
export function normalizeVoiceMenuIndexUtterance(raw) {
  let t = norm_(raw)
    .replace(/[–—−]/g, "-")
    .replace(/(\d)\s*[-/.,]\s*(\d)/g, "$1 $2")
    .replace(/\bveinte\s+y\s+uno\b/g, "veintiuno")
    .replace(/\bveinti\s*[- ]\s*uno\b/g, "veintiuno")
    .replace(/\bveinte\s+y\s+dos\b/g, "veintidos")
    .replace(/\bveinti\s*[- ]\s*dos\b/g, "veintidos")
    .replace(/\bveinte\s+y\s+tres\b/g, "veintitres")
    .replace(/\bveinti\s*[- ]\s*tres\b/g, "veintitres")
    .replace(/\bveinte\s+y\s+cuatro\b/g, "veinticuatro")
    .replace(/\bveinti\s*[- ]\s*cuatro\b/g, "veinticuatro")
    .replace(/\bveinte\s+y\s+cinco\b/g, "veinticinco")
    .replace(/\bveinti\s*[- ]\s*cinco\b/g, "veinticinco")
    .replace(/\bveinte\s+y\s+seis\b/g, "veintiseis")
    .replace(/\bveinti\s*[- ]\s*seis\b/g, "veintiseis")
    .replace(/\bveinte\s+y\s+siete\b/g, "veintisiete")
    .replace(/\bveinti\s*[- ]\s*siete\b/g, "veintisiete")
    .replace(/\bveinte\s+y\s+ocho\b/g, "veintiocho")
    .replace(/\bveinti\s*[- ]\s*ocho\b/g, "veintiocho")
    .replace(/\bveinte\s+y\s+nueve\b/g, "veintinueve")
    .replace(/\bveinti\s*[- ]\s*nueve\b/g, "veintinueve")
    .replace(/\btreinta\s+y\s+uno\b/g, "treinta y uno")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

function pad2_(n) {
  return String(n).padStart(2, "0");
}

/** Convierte «cuarenta y cinco», «ciento veinte», «mil doscientos»… a entero. */
function parseSpanishInteger_(raw) {
  const t = norm_(raw)
    .replace(/[,.]/g, " ")
    .replace(/\s+y\s+/g, " ")
    .replace(/centimos?|centesimas?|euros?|eur|€/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  const digitsOnly = t.replace(/\s/g, "");
  if (/^\d+$/.test(digitsOnly)) return Number(digitsOnly);

  const tokens = t.split(" ").filter((w) => w && w !== "y");
  if (!tokens.length) return null;

  let total = 0;
  let current = 0;

  for (const token of tokens) {
    if (SCALES[token] != null) {
      if (current === 0) current = 1;
      total += current * SCALES[token];
      current = 0;
      continue;
    }
    if (HUNDREDS[token] != null) {
      current += HUNDREDS[token];
      continue;
    }
    if (WORD_NUM[token] != null) {
      current += WORD_NUM[token];
      continue;
    }
    const digitRun = token.match(/^\d+$/);
    if (digitRun) {
      current = current * 10 + Number(token);
      continue;
    }
    return null;
  }
  total += current;
  return Number.isFinite(total) ? total : null;
}

function spokenTokenToDigitChar_(token) {
  const t = norm_(token);
  if (/^\d$/.test(t)) return t;
  if (/^\d{2}$/.test(t)) return t;
  if (WORD_NUM[t] != null && WORD_NUM[t] >= 0 && WORD_NUM[t] <= 9) return String(WORD_NUM[t]);
  return null;
}

/** Cifra única 0-9 (palabra o carácter); excluye «diez», «once»… */
function singleDigitToken_(token) {
  const t = norm_(token);
  if (/^\d$/.test(t)) return t;
  if (WORD_NUM[t] != null && WORD_NUM[t] >= 0 && WORD_NUM[t] <= 9) return String(WORD_NUM[t]);
  return null;
}

/**
 * «uno cuatro cinco» → «145», «1 45» con coma hablada → «1.45».
 * Solo tokens dígito a dígito (no «ciento veinte»).
 */
function parseDigitUtterance_(raw, { allowDecimal = false } = {}) {
  const tokens = norm_(raw)
    .replace(/\by\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;

  let out = "";
  let hadDecimal = false;
  for (const tok of tokens) {
    if (allowDecimal && (tok === "coma" || tok === "punto" || tok === "con")) {
      if (out && !hadDecimal) {
        out += ".";
        hadDecimal = true;
      }
      continue;
    }
    const single = singleDigitToken_(tok);
    if (single != null) {
      out += single;
      continue;
    }
    if (/^\d{2,}$/.test(tok)) {
      out += tok;
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

function isPrimarilyDigitByDigit_(raw) {
  const tokens = norm_(raw)
    .replace(/\by\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 2) return false;
  let digitish = 0;
  for (const tok of tokens) {
    if (singleDigitToken_(tok) != null || /^\d{2,}$/.test(tok)) digitish += 1;
    else if (tok === "coma" || tok === "punto" || tok === "con") digitish += 1;
  }
  return digitish >= 2 && digitish >= tokens.length - 1;
}

function parsePriceSpacedPattern_(raw) {
  const t = norm_(raw);
  let m = t.match(/^(\d{1,2})\s+(\d{2})$/);
  if (m) return `${Number(m[1])}.${m[2]}`;
  m = t.match(/^(uno|un|una)\s+(\d{2})$/);
  if (m) return `1.${m[2]}`;
  if (isPrimarilyDigitByDigit_(raw) || /\b(coma|punto|con)\b/.test(t)) {
    const seq = parseDigitUtterance_(raw, { allowDecimal: true });
    if (seq?.includes(".")) return seq;
    if (seq?.length === 3) {
      const price = Number(`${seq[0]}.${seq.slice(1)}`);
      if (price >= 0.5 && price <= 3.5) return `${seq[0]}.${seq.slice(1)}`;
    }
  }
  return null;
}

function parseFuelPriceHeuristic_(raw) {
  const compact = norm_(raw).replace(/\s+/g, "");
  if (/^\d{3}$/.test(compact)) {
    const price = Number(`${compact[0]}.${compact.slice(1)}`);
    if (price >= 0.5 && price <= 3.5) return `${compact[0]}.${compact.slice(1)}`;
  }
  return parsePriceSpacedPattern_(raw);
}

function formatDecimalSuffix_(decValue, maxDec = 2) {
  if (decValue == null || !Number.isFinite(decValue)) return "";
  const s = String(Math.abs(Math.round(decValue)));
  const max = Math.max(1, Math.min(3, Number(maxDec) || 2));
  if (max === 3) {
    if (s.length === 1) return `.00${s}`;
    if (s.length === 2) return `.0${s}`;
    if (s.length >= 3) return `.${s.slice(0, 3)}`;
  }
  if (s.length === 1) return `.0${s}`;
  if (s.length === 2) return `.${s}`;
  return `.${s.slice(0, 2)}`;
}

function splitAmountParts_(raw) {
  const t = norm_(raw).replace(/euros?|eur|€|centimos?|centesimas?/g, " ").trim();
  const m = t.match(/^(.+?)\s+(?:con|coma)\s+(.+)$/);
  if (m) return { intPart: m[1].trim(), decPart: m[2].trim() };
  return { intPart: t, decPart: "" };
}

function parseAmount_(raw, maxDecimals = 2) {
  const priceSpaced = parsePriceSpacedPattern_(raw);
  if (priceSpaced) return priceSpaced;

  const { intPart, decPart } = splitAmountParts_(raw);

  let euros = null;
  const intDigits = intPart.match(/(\d+[.,]?\d*)/);
  if (intDigits) {
    euros = Number(String(intDigits[1]).replace(",", "."));
  } else {
    euros = parseSpanishInteger_(intPart);
  }

  if (euros == null && !decPart) return "";

  let result = euros != null ? String(euros) : "0";
  const decLen = maxDecimals === 3 ? 3 : 2;

  if (decPart) {
    let cents = null;
    const decDigits = decPart.match(new RegExp(`(\\d{1,${decLen}})`));
    if (decDigits) {
      cents = Number(decDigits[1]);
    } else {
      cents = parseSpanishInteger_(decPart);
    }
    if (cents != null) {
      result += formatDecimalSuffix_(cents, maxDecimals);
    }
  } else {
    const spacedDec = norm_(raw).match(/\b(\d{1,5})\s+(\d{2,3})\b/);
    if (spacedDec) return `${spacedDec[1]}.${spacedDec[2]}`;
    const m = norm_(raw).match(new RegExp(`(\\d+[.,]\\d{1,${decLen}})`));
    if (m) return m[1].replace(",", ".");
  }

  return result.replace(/\.$/, "");
}

function parseNumber_(raw, fieldKey = null) {
  const preferDigits = fieldKey === "kilometros_actuales" || isPrimarilyDigitByDigit_(raw);
  if (preferDigits) {
    const digitRun = parseDigitUtterance_(raw);
    if (digitRun) {
      const plain = digitRun.replace(/\./g, "");
      if (plain.length >= 1) return plain;
    }
  }

  const n = parseSpanishInteger_(raw);
  if (n != null) return String(n);

  const amt = parseAmount_(raw);
  if (amt && amt.includes(".")) return String(Math.round(Number(amt)));
  if (amt) return String(Math.round(Number(amt)));

  if (!preferDigits) {
    const digitRun = parseDigitUtterance_(raw);
    if (digitRun) {
      const plain = digitRun.replace(/\./g, "");
      if (plain.length >= 2) return plain;
    }
  }

  const digits = norm_(raw).replace(/[^\d]/g, "");
  if (digits) return digits;

  const m = norm_(raw).match(/\d+/);
  return m ? m[0] : "";
}

function parsePercent_(raw) {
  const t = norm_(raw).replace(/por\s*ciento|porciento|%/g, " ").trim();
  const m = t.match(/\b(\d{1,2})\b/);
  if (m) return m[1];
  const n = parseSpanishInteger_(t);
  if (n != null && n >= 0 && n <= 100) return String(n);
  if (/\bveintiuno\b/.test(t)) return "21";
  if (/\bdiez\b/.test(t)) return "10";
  if (/\bcero\b/.test(t)) return "0";
  return "";
}

function groupToPadded_(group, len) {
  const g = norm_(group).trim();
  if (!g) return null;

  const tokens = g.split(/\s+/).filter(Boolean);
  let digitRun = "";
  for (const tok of tokens) {
    const d = spokenTokenToDigitChar_(tok);
    if (d != null) digitRun += d;
  }
  if (digitRun.length >= len) return digitRun.slice(0, len).padStart(len, "0");
  if (digitRun.length > 0) return digitRun.padStart(len, "0");

  const n = parseSpanishInteger_(g);
  if (n == null) return null;
  return String(n).padStart(len, "0").slice(-len);
}

function expandGluedSpanish_(s) {
  let t = norm_(s);
  t = t.replace(
    /^(dos|tres|cuatro|cinco|seis|siete|ocho|nueve)mil(veinti\w+|veinte|treinta\w*|cuarenta\w*|cincuenta\w*|sesenta\w*|setenta\w*|ochenta\w*|noventa\w*)$/i,
    "$1 mil $2"
  );
  t = t.replace(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve)mil\b/g, "$1 mil");
  t = t.replace(/\bmil(veinti\w+|veinte|treinta\w*|cuarenta\w*|cincuenta\w*|sesenta\w*|setenta\w*|ochenta\w*|noventa\w*)\b/g, "mil $1");
  return t.replace(/\s+/g, " ").trim();
}

function parseSpanishYear_(raw) {
  const expanded = expandGluedSpanish_(raw);
  const n = parseSpanishInteger_(expanded);
  if (n == null) return null;
  if (n >= 1900 && n <= 2100) return n;
  if (n >= 0 && n <= 99) return n < 50 ? 2000 + n : 1900 + n;
  return null;
}

function parseDateDigitGroups_(raw) {
  const t = expandGluedSpanish_(norm_(raw)).replace(/\bpausa\b/g, " | ");
  const groups = t
    .split(/\||\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (groups.length === 3) {
    const dd = groupToPadded_(groups[0], 2);
    const mm = groupToPadded_(groups[1], 2);
    const yyyy = groupToPadded_(groups[2], 4);
    if (dd && mm && yyyy && Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  const tokens = t.replace(/\|/g, " ").split(/\s+/).filter((w) => w && w !== "y" && w !== "de");
  let digits = "";
  let digitTokenEnd = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (/^\d+$/.test(tok)) {
      digits += tok;
      digitTokenEnd = i + 1;
      if (digits.length >= 8) break;
      continue;
    }
    const d = spokenTokenToDigitChar_(tok);
    if (d != null && d.length === 1) {
      digits += d;
      digitTokenEnd = i + 1;
      if (digits.length >= 8) break;
      continue;
    }
    break;
  }

  if (digits.length === 4 && digitTokenEnd < tokens.length) {
    const yearPhrase = tokens.slice(digitTokenEnd).join(" ");
    const year = parseSpanishYear_(yearPhrase);
    if (year != null) {
      const dd = digits.slice(0, 2);
      const mm = digits.slice(2, 4);
      if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
        return `${pad2_(dd)}/${pad2_(mm)}/${year}`;
      }
    }
  }

  for (let i = digitTokenEnd; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const year = parseSpanishYear_(tok);
    if (year != null && digits.length >= 4) {
      const dd = digits.slice(0, 2);
      const mm = digits.slice(2, 4);
      if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
        return `${pad2_(dd)}/${pad2_(mm)}/${year}`;
      }
    }
  }

  if (digits.length === 8) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4);
    if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  if (digits.length === 6) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yy = digits.slice(4);
    const yyyy = Number(yy) < 50 ? `20${yy}` : `19${yy}`;
    if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  return "";
}

function parseDateEs_(raw) {
  const t = expandGluedSpanish_(norm_(raw));
  if (!t) return "";

  let m = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m) {
    const dd = pad2_(m[1]);
    const mm = pad2_(m[2]);
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  m = t.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\b/);
  if (m) {
    const dd = pad2_(m[1]);
    const mm = pad2_(m[2]);
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  const digitDate = parseDateDigitGroups_(raw);
  if (digitDate) return digitDate;

  m = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(.+))?/);
  if (m) {
    const month = MONTHS_ES[m[2]];
    if (month) {
      const dd = pad2_(m[1]);
      const mm = pad2_(month);
      let yyyy = m[3] ? parseSpanishYear_(m[3]) : new Date().getFullYear();
      if (yyyy == null) yyyy = new Date().getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  m = t.match(/\b([a-z]+)\s+de\s+([a-z]+)(?:\s+de\s+(.+))?/);
  if (m) {
    const day = parseSpanishInteger_(m[1]);
    const month = MONTHS_ES[m[2]];
    if (day != null && month) {
      let yyyy = new Date().getFullYear();
      if (m[3]) {
        const y = parseSpanishYear_(m[3]);
        if (y != null) yyyy = y;
      }
      return `${pad2_(day)}/${pad2_(month)}/${yyyy}`;
    }
  }

  m = t.match(/\b([a-z]+)\s+(\d{1,2})(?:\s+de\s+(\d{2,4}))?/);
  if (m && MONTHS_ES[m[1]]) {
    const dd = pad2_(m[2]);
    const mm = pad2_(MONTHS_ES[m[1]]);
    let yyyy = m[3] ? parseSpanishYear_(m[3]) : new Date().getFullYear();
    if (yyyy == null) yyyy = new Date().getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return "";
}

function parseTime_(raw) {
  const t = norm_(raw);
  let m = t.match(/\b(\d{1,2})[:h](\d{2})\b/);
  if (m) return `${pad2_(m[1])}:${m[2]}`;
  m = t.match(/\b(\d{1,2})\s+y\s+media\b/);
  if (m) return `${pad2_(m[1])}:30`;
  m = t.match(/\b(\d{1,2})\s+y\s+cuarto\b/);
  if (m) return `${pad2_(m[1])}:15`;
  const hourWord = parseSpanishInteger_(t);
  if (hourWord != null && hourWord >= 0 && hourWord <= 23) return `${pad2_(hourWord)}:00`;
  m = t.match(/\b(\d{1,2})\b/);
  if (m) return `${pad2_(m[1])}:00`;
  return "";
}

function appendSpokenToken_(out, token) {
  const t = norm_(token);
  if (!t) return out;
  if (t === "/" || t === "barra" || t === "barra oblicua" || t === "oblicua" || t === "slash" || t === "diagonal") {
    return `${out}/`;
  }
  if (
    t === "-" ||
    t === "guion" ||
    t === "guion bajo" ||
    t === "guion corto" ||
    t === "raya" ||
    t === "menos" ||
    t === "union" ||
    t === "gui on"
  ) {
    return `${out}-`;
  }
  if (/^\d+$/.test(t)) return `${out}${t}`;
  const d = spokenTokenToDigitChar_(t);
  if (d != null) return `${out}${d}`;
  if (LETTER_WORDS[t]) return `${out}${LETTER_WORDS[t]}`;
  if (/^[a-z0-9]$/i.test(t)) return `${out}${t.toUpperCase()}`;
  if (/^[a-z0-9]+$/i.test(t)) return `${out}${t.toUpperCase()}`;
  return out;
}

function parsePlate_(raw) {
  const tokens = expandSpokenPlateLetters_(raw)
    .replace(/\bde\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return normalizeSpanishPlate(raw);

  const candidates = [
    tryParsePlateBySpec_(tokens, { prefixLetters: 0, suffixLetters: 3 }),
    tryParsePlateBySpec_(tokens, { prefixLetters: 1, suffixLetters: 2 }),
    tryParsePlateBySpec_(tokens, { prefixLetters: 2, suffixLetters: 2 }),
  ].filter(Boolean);

  if (candidates.length === 1) return candidates[0];

  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];

  const legacy = parsePlateLegacy_(raw);
  if (isValidSpanishPlateFormat(legacy)) return legacy;

  if (unique.length > 0) return unique[0];
  return legacy;
}

/** Índice de menú: cifras habladas una a una («dos uno» → 21). */
function parseOptionIndexFromDigitWords_(raw) {
  const tokens = norm_(raw)
    .replace(/\b(opcion|numero|el|la)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 4) return null;

  let digits = "";
  for (const tok of tokens) {
    if (/^\d{1,2}$/.test(tok)) {
      digits += tok;
      continue;
    }
    const d = singleDigitToken_(tok);
    if (d != null) {
      digits += d;
      continue;
    }
    return null;
  }
  if (!digits || digits.length > 2) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1 || n > NUMBERED_MENU_MAX_INDEX) return null;
  return n;
}

function clampMenuIndex_(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 1 || x > NUMBERED_MENU_MAX_INDEX) return null;
  return x;
}

/** Índice de menú numerado (1-based): «opción 3», «veintiuno», «dos uno», «2-1»… */
export function parseOptionIndex_(raw, maxIndex = NUMBERED_MENU_MAX_INDEX) {
  const cap = Math.min(NUMBERED_MENU_MAX_INDEX, Math.max(1, Number(maxIndex) || NUMBERED_MENU_MAX_INDEX));
  const t = normalizeVoiceMenuIndexUtterance(raw);
  if (!t) return null;

  let m = t.match(/\b(?:opcion|numero)\s*(\d+)\b/);
  if (m) return clampMenuIndex_(Number(m[1]));

  m = t.match(new RegExp(`\\b(?:opcion|numero)\\s+(${OPTION_INDEX_WORD})\\b`));
  if (m && WORD_NUM[m[1]] != null) return clampMenuIndex_(WORD_NUM[m[1]]);

  m = t.match(new RegExp(`\\b(?:el|la)\\s+(${OPTION_INDEX_WORD})\\b`));
  if (m && WORD_NUM[m[1]] != null) return clampMenuIndex_(WORD_NUM[m[1]]);

  const compact = t.replace(/\s+/g, "");
  if (/^\d{1,2}$/.test(compact)) return clampMenuIndex_(Number(compact));

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && WORD_NUM[tokens[0]] != null && WORD_NUM[tokens[0]] >= 1) {
    return clampMenuIndex_(WORD_NUM[tokens[0]]);
  }

  // «1 1» / «uno uno» / «2-1» → 11 / 21 (cifra a cifra) antes de tomar solo el primer dígito
  if (tokens.length >= 2) {
    const byDigits = parseOptionIndexFromDigitWords_(t);
    if (byDigits != null && byDigits <= cap) return byDigits;
  }

  if (tokens.length === 1) {
    m = t.match(/\b(\d{1,2})\b/);
    if (m) return clampMenuIndex_(Number(m[1]));
  }

  if (isPrimarilyDigitByDigit_(t)) {
    const byDigits = parseOptionIndexFromDigitWords_(t);
    if (byDigits != null && byDigits <= cap) return byDigits;
  }

  if (!isPrimarilyDigitByDigit_(t) && tokens.length <= 4) {
    const n = parseSpanishInteger_(t);
    if (n != null && n >= 1 && n <= cap) return n;
  }

  m = t.match(/\b(\d{1,2})\b/);
  if (m && tokens.length <= 4) return clampMenuIndex_(Number(m[1]));

  return null;
}

/** Respuesta corta por número («5», «número tres») para interrumpir el menú hablado. */
export function isShortNumberedPickUtterance(transcript, field = null) {
  const t = norm_(transcript);
  if (!t) return false;

  const labels = field ? numberedOptionLabelsForField(field) : [];
  const maxOpt = labels.length || 40;

  const digitMatches = [...t.matchAll(/\b(\d{1,2})\b/g)];
  if (digitMatches.length === 1) {
    const idx = Number(digitMatches[0][1]);
    if (idx >= 1 && idx <= maxOpt) return true;
  }

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 5) return false;

  const idx = parseOptionIndex_(t, maxOpt);
  if (idx == null || idx < 1 || idx > maxOpt) return false;

  if (tokens.length <= 2) return true;

  for (const lbl of labels) {
    const n = norm_(lbl);
    if (!n) continue;
    if (n.length > 4 && t.includes(n)) return false;
    const words = n.split(/\s+/).filter((w) => w.length > 4);
    if (words.some((w) => t.includes(w))) return false;
  }
  return true;
}

/** Selección inmediata por índice en menú numerado; null si no aplica. */
export function tryQuickNumberedMenuPick(field, transcript) {
  if (!fieldUsesNumberedVoiceMenu(field)) return null;
  const raw = String(transcript || "").trim();
  if (!raw || isVoiceSkipCommand(raw)) return null;

  const labels = numberedOptionLabelsForField(field);
  const values = numberedOptionValuesForField(field);
  if (!labels.length) return null;

  const cleaned = stripPromptEchoFromTranscript(field, raw);
  const candidates = [...new Set([cleaned, raw].filter(Boolean))];

  const digitOnly = norm_(raw).match(/\b(\d{1,2})\b/);
  if (digitOnly) {
    const di = Number(digitOnly[1]);
    if (di >= 1 && di <= labels.length) {
      candidates.unshift(String(di));
    }
  }

  for (const cand of candidates) {
    const idx = parseOptionIndex_(cand, labels.length);
    if (idx == null || idx < 1 || idx > labels.length) continue;

    if (field.key === "iva_pct") {
      const v = parseIvaPercent_(cand);
      if (v) return v;
      if (idx >= 1 && idx <= 4) return values[idx - 1];
      continue;
    }

    const v = values[idx - 1];
    if (v === "__OTRO__") continue;
    return String(v ?? labels[idx - 1]);
  }
  return null;
}

/** ¿La frase es sobre todo una elección por índice (número)? */
export function isPrimarilyVoiceIndexPick(raw, maxIndex = 40) {
  const t = normalizeVoiceMenuIndexUtterance(raw);
  if (!t) return false;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const idx = parseOptionIndex_(t, maxIndex);
    if (idx != null && idx >= 1 && idx <= maxIndex) return true;
  }
  const idx = parseOptionIndex_(t, maxIndex);
  if (idx == null || idx < 1 || idx > maxIndex) return false;
  if (tokens.length <= 4) return true;
  return /^(opcion|numero|el|la)\b/.test(t);
}

/**
 * Elige valor de listas paralelas por índice de voz (1-based).
 * @param {string[]} labels
 * @param {string[]} [values]
 */
export function tryPickByVoiceIndex(raw, labels, values = null) {
  const list = (Array.isArray(labels) ? labels : []).map((o) => String(o).trim()).filter(Boolean);
  if (!list.length) return null;
  const vals = Array.isArray(values) ? values : list;
  const raw0 = String(raw || "").trim();
  if (!raw0) return null;

  const synthField = { kind: "select", options: list };
  const cleaned = stripPromptEchoFromTranscript(synthField, raw0);
  const candidates = [...new Set([cleaned, raw0].filter(Boolean))];

  for (const cand of candidates) {
    if (!isPrimarilyVoiceIndexPick(cand, list.length)) continue;
    const idx = parseOptionIndex_(cand, list.length);
    if (idx == null || idx < 1 || idx > list.length) continue;
    const v = vals[idx - 1];
    if (v === "__OTRO__") continue;
    return String(v ?? list[idx - 1]);
  }
  return null;
}

function parseSelectByIndex_(raw, options = [], values = null) {
  const list = (Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean);
  const idx = parseOptionIndex_(raw);
  if (idx == null || idx < 1 || idx > list.length) return undefined;
  if (Array.isArray(values) && values[idx - 1] !== undefined) return values[idx - 1];
  return list[idx - 1];
}

function parseIvaPercent_(raw) {
  const values = IVA_VOICE_MENU.map((o) => o.value);
  const idx = parseOptionIndex_(raw);
  if (idx === 5) {
    const pct = parsePercent_(raw);
    return pct || "";
  }
  if (idx >= 1 && idx <= 4) return values[idx - 1];
  const t = norm_(raw);
  if (/\botro\b/.test(t)) return parsePercent_(raw) || "";
  return parsePercent_(raw) || "";
}

function selectOptionsNormalized_(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((o) => {
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const value = String(o.value ?? "").trim();
        const label = stripNumberedSelectPrefix(String(o.label ?? o.value ?? "").trim());
        return value ? { value, label: label || value } : null;
      }
      const s = String(o || "").trim();
      const label = stripNumberedSelectPrefix(s);
      return s ? { value: s, label: label || s } : null;
    })
    .filter(Boolean);
}

function scoreSelectTextMatch_(query, label, value) {
  const t = norm_(query);
  const nLabel = norm_(label);
  const nVal = norm_(value);
  if (!t) return 0;
  if (nLabel === t || nVal === t) return 120;
  if (nLabel.startsWith(t) || nVal.startsWith(t) || t.startsWith(nLabel)) return 80;
  if (nLabel.includes(t) || t.includes(nLabel) || nVal.includes(t) || t.includes(nVal)) return 50;
  const tokens = t.split(/\s+/).filter(Boolean);
  let hits = 0;
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    if (nLabel.includes(tok) || nVal.includes(tok)) hits += 1;
  }
  if (hits > 0) return 20 + hits * 15;
  return 0;
}

function parseSelect_(raw, options = []) {
  const list = selectOptionsNormalized_(options);
  if (!list.length) return "";
  const t = norm_(raw);
  if (!t) return "";
  const labels = list.map((o) => o.label);
  const values = list.map((o) => o.value);
  const byIndex = parseSelectByIndex_(raw, labels, values);
  if (byIndex !== undefined) return byIndex;

  let best = null;
  let bestScore = 0;
  for (const opt of list) {
    const score = scoreSelectTextMatch_(raw, opt.label, opt.value);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  if (best && bestScore >= 40) return best.value;

  const pickLegacy_ = (pred) => {
    const idx = labels.findIndex(pred);
    return idx >= 0 ? values[idx] : "";
  };
  if (t.includes("usuario") || t.includes("efectivo")) return pickLegacy_((o) => norm_(o).includes("usuario"));
  if (t.includes("transfer")) return pickLegacy_((o) => norm_(o).includes("transfer"));
  if (t.includes("tarjeta") || t.includes("grefa")) return pickLegacy_((o) => norm_(o).includes("tarjeta"));
  if (t.includes("azul")) return pickLegacy_((o) => norm_(o).includes("azul"));
  if (t.includes("verde")) return pickLegacy_((o) => norm_(o).includes("verde"));
  if (t.includes("naranja")) return pickLegacy_((o) => norm_(o).includes("naranja"));
  if (t.includes("roja") || t.includes("rojo")) return pickLegacy_((o) => norm_(o).includes("roja"));
  if (t.includes("privad")) return pickLegacy_((o) => norm_(o).includes("privad"));
  if (t.includes("parcial")) return pickLegacy_((o) => norm_(o).includes("parcial"));
  if (t.includes("completo")) return pickLegacy_((o) => norm_(o).includes("completo"));
  if (t.includes("gasoleo mejorado") || t.includes("mejorado")) return pickLegacy_((o) => norm_(o).includes("mejorado"));
  if (t.includes("ecodiesel") || t.includes("eco diesel")) return pickLegacy_((o) => norm_(o).includes("ecodiesel"));
  if (t.includes("adblue")) return pickLegacy_((o) => norm_(o).includes("adblue"));
  if (t.includes("gasoleo") || t.includes("diesel")) return pickLegacy_((o) => norm_(o).includes("gasoleo"));
  if (t.includes("gasolina 98") || t.includes("noventa y ocho")) return pickLegacy_((o) => norm_(o).includes("98"));
  if (t.includes("gasolina 95") || t.includes("noventa y cinco")) return pickLegacy_((o) => norm_(o).includes("95"));
  if (t.includes("life")) {
    const lifeIdx = labels.findIndex((lbl) => {
      const n = norm_(lbl);
      return n.includes("life") && t.includes(n.replace(/\s+/g, " "));
    });
    if (lifeIdx >= 0) return values[lifeIdx];
  }
  for (const opt of list) {
    const words = norm_(opt.label).split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => t.includes(w))) return opt.value;
  }
  return "";
}

function escapeRegex_(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quita eco de la locución (pregunta, menú numerado) del texto reconocido. */
export function stripPromptEchoFromTranscript(field, raw) {
  let t = norm_(raw);
  if (!t) return "";

  const labels = numberedOptionLabelsForField(field);
  for (let i = 0; i < labels.length; i += 1) {
    const lbl = norm_(labels[i]);
    if (!lbl) continue;
    const n = i + 1;
    t = t.replace(new RegExp(`(?:opcion|numero)\\s*${n}\\s*:?\\s*${escapeRegex_(lbl)}`, "gi"), " ");
    if (lbl.length > 6) {
      t = t.replace(new RegExp(escapeRegex_(lbl), "gi"), " ");
    }
  }

  t = t.replace(/\b(?:opcion|numero)\s+(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta)\s*:?/gi, " ");
  t = t.replace(/\bdiga parte del nombre\b[^.]*\.?/gi, " ");
  t = t.replace(/\btoque en (la )?pantalla\b/gi, " ");
  t = t.replace(/\btambien puede escribir para filtrar\b/gi, " ");
  t = t.replace(/\bhay \d+ opciones\b/gi, " ");
  t = t.replace(/\bpuede decir el numero\b[^.]*\.?/gi, " ");
  t = t.replace(/\belija diciendo el numero de la opcion\b[^.]*\.?/gi, " ");
  t = t.replace(/\bnumero de factura o tiquet\b/gi, " ");
  t = t.replace(/\bdiga letra o cifra\b[^.]*\.?/gi, " ");
  t = t.replace(/\buno a uno\b/gi, " ");
  t = t.replace(/\bguion o barra\b/gi, " ");
  t = t.replace(/\bhora en formato veinticuatro horas\b/gi, " ");

  const fieldLabel = norm_(field?.label || "");
  if (fieldLabel) {
    t = t.replace(new RegExp(`^${escapeRegex_(fieldLabel)}[.:,]?\\s*`, "i"), "");
  }

  const prompt = norm_(voiceFieldSpeakPrompt(field));
  if (prompt && t.includes(prompt)) {
    t = t.replace(prompt, " ").trim();
  }

  return t.replace(/\s+/g, " ").trim();
}

export function isVoiceSkipCommand(transcript) {
  const t = norm_(transcript);
  if (!t) return false;
  if (isVoiceNextCommand(transcript)) return false;
  return (
    /^(salta|saltar|omitir|omitir campo|pasar|paso|ninguno)$/.test(t) ||
    /\b(salta|saltar|omitir)\b/.test(t)
  );
}

/** Comando estándar para aplicar el valor grabado y pasar al siguiente campo. */
export function isVoiceNextCommand(transcript) {
  const t = norm_(transcript);
  if (!t) return false;
  return (
    /^(siguiente|siguiente campo|adelante|continuar|listo|hecho|terminado|ok)$/.test(t) ||
    /\b(siguiente|adelante|continuar)\b/.test(t)
  );
}

export function isVoiceConfirmYes(transcript) {
  const t = norm_(transcript);
  return /\b(si|sí|confirmo|confirmar|correcto|vale|ok|de acuerdo|acepto)\b/.test(t);
}

export function isVoiceConfirmNo(transcript) {
  const t = norm_(transcript);
  return /\b(no|cancelar|revisar|corregir|volver)\b/.test(t) && !/\bconfirmo\b/.test(t);
}

export function parseVoiceTranscript(field, transcript) {
  const kind = String(field?.kind || "text").trim();
  const raw0 = String(transcript || "").trim();
  if (!raw0 || isVoiceSkipCommand(raw0) || isVoiceNextCommand(raw0)) return "";

  let raw = stripPromptEchoFromTranscript(field, raw0);
  if (!raw) {
    if (kind === "select" || field?.key === "iva_pct") {
      const idx = parseOptionIndex_(raw0);
      if (idx != null) raw = String(idx);
    }
    if (!raw) raw = raw0;
  }

  switch (kind) {
    case "date":
      return parseDateEs_(raw) || "";
    case "amount": {
      const maxDec = field?.decimals === 3 ? 3 : 2;
      if (field?.key === "precio_por_litro") {
        const fuel = parseFuelPriceHeuristic_(raw);
        if (fuel) return fuel;
      }
      return parseAmount_(raw, maxDec) || "";
    }
    case "number":
      return parseNumber_(raw, field?.key) || "";
    case "percent":
      if (field?.key === "iva_pct") return parseIvaPercent_(raw);
      return parsePercent_(raw) || "";
    case "time":
      return parseTime_(raw) || "";
    case "plate":
      return parsePlate_(raw);
    case "invoice":
      return parseVoiceInvoiceNumber(raw);
    case "select": {
      const picked = parseSelect_(raw, field?.options);
      if (picked) return picked;
      if (field?.key === "departamento_o_proyecto") return String(raw || "").trim();
      return "";
    }
    default:
      return raw;
  }
}
