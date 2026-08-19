/**
 * Nº factura / tiquet por voz: alfanumérico, cifra a cifra y letra a letra.
 * Reconoce «guion» (-) y «barra» (/).
 */

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

const DIGIT_WORDS = {
  cero: "0",
  uno: "1",
  un: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9",
};

function norm_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandSpokenLetters_(raw) {
  let s = norm_(raw);
  const letterForDe =
    "a|be|b|ce|c|e|efe|f|ge|g|hache|h|i|jota|j|ka|k|ele|l|eme|m|ene|n|enye|ene|o|pe|p|cu|q|erre|r|ese|s|te|t|u|uve|v|equis|x|ye|y|zeta|z|doble uve|i griega";
  s = s.replace(new RegExp(`\\b(${letterForDe})\\s+de\\s+[a-z]+\\b`, "gi"), " $1 ");
  s = s.replace(/\b(doble uve)\b/g, " w ");
  s = s.replace(/\b(i griega)\b/g, " y ");
  return s;
}

function separatorChar_(token) {
  const t = norm_(token);
  if (!t) return null;
  if (t === "-") return "-";
  if (t === "/") return "/";
  if (
    t === "guion" ||
    t === "guion corto" ||
    t === "guion medio" ||
    t === "raya" ||
    t === "trazo" ||
    t === "menos" ||
    t === "signo menos" ||
    t === "union" ||
    t === "gui on"
  ) {
    return "-";
  }
  if (t === "barra" || t === "barra oblicua" || t === "barra inclinada" || t === "oblicua" || t === "slash" || t === "diagonal") {
    return "/";
  }
  return null;
}

function singleDigitChar_(token) {
  const t = norm_(token);
  if (/^\d$/.test(t)) return t;
  if (DIGIT_WORDS[t] != null) return DIGIT_WORDS[t];
  return null;
}

function letterChar_(token) {
  const t = norm_(token);
  if (!t || t === "de" || t === "del") return null;
  if (LETTER_WORDS[t]) return LETTER_WORDS[t];
  if (/^[a-zñ]$/i.test(t)) return t.toUpperCase();
  return null;
}

function appendInvoiceChars_(out, chunk) {
  const s = String(chunk || "").toUpperCase();
  if (!s) return out;
  return `${out}${s.replace(/[^A-Z0-9\/\-]/g, "")}`;
}

function isCompoundNumberWord_(token) {
  const t = norm_(token);
  if (!t || DIGIT_WORDS[t] != null) return false;
  return /^(diez|once|doce|trece|catorce|quince|dieci|veinti|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|mil)/.test(t);
}

function appendInvoiceToken_(out, token) {
  const t = norm_(token);
  if (!t) return out;
  if (t === "de" || t === "del" || t === "la" || t === "el") return out;

  const sep = separatorChar_(t);
  if (sep) return `${out}${sep}`;

  if (isCompoundNumberWord_(t)) return out;

  const digit = singleDigitChar_(t);
  if (digit != null) return `${out}${digit}`;

  const letter = letterChar_(t);
  if (letter) return `${out}${letter}`;

  if (/^\d{2,}$/.test(t)) return `${out}${t}`;

  if (/^[a-z0-9]{1,4}$/i.test(t)) return appendInvoiceChars_(out, t);

  return out;
}

function splitGluedInvoiceTokens_(text) {
  let s = String(text || "");
  s = s.replace(/([\/\-\._])/g, " $1 ");
  s = s.replace(/([a-zñ])(\d)/gi, "$1 $2");
  s = s.replace(/(\d)([a-zñ])/gi, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

function stripInvoiceNoise_(text) {
  let t = norm_(text);
  t = t.replace(/\bnumeros?\s+de\s+factura\b/g, " ");
  t = t.replace(/\bnumero\s+de\s+factura\s+o\s+tiquet\b/g, " ");
  t = t.replace(/\bnumero\s+de\s+factura\b/g, " ");
  t = t.replace(/\bnumero\s+factura\b/g, " ");
  t = t.replace(/\bn\s+de\s+factura\b/g, " ");
  t = t.replace(/\b(numero|numero de|n de|ticket|tiquet|factura|poliza|poliza numero)\b/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function preprocessInvoiceSpeech_(raw) {
  let s = expandSpokenLetters_(raw);
  s = stripInvoiceNoise_(s);
  s = s.replace(/\bbarra oblicua\b/g, " / ");
  s = s.replace(/\bbarra inclinada\b/g, " / ");
  s = s.replace(/\b(oblicua|slash|diagonal)\b/g, " / ");
  s = s.replace(/\bbarra\b/g, " / ");
  s = s.replace(/\b(guion corto|guion medio|guion|raya|trazo|signo menos|menos|union|gui on)\b/g, " - ");
  s = splitGluedInvoiceTokens_(s);
  return s.replace(/\s+/g, " ").trim();
}

function finalizeInvoiceNumber_(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\/\-]/g, "");
}

/**
 * @param {string} raw Transcripción de voz (o texto escrito).
 * @returns {string}
 */
export function parseVoiceInvoiceNumber(raw) {
  const pre = preprocessInvoiceSpeech_(raw);
  if (!pre) {
    return finalizeInvoiceNumber_(raw);
  }

  const tokens = pre.split(/\s+/).filter(Boolean);
  let out = "";
  for (const tok of tokens) {
    out = appendInvoiceToken_(out, tok);
  }

  return finalizeInvoiceNumber_(out);
}
