/**
 * Familia LIFE «Otros» (consumibles): tipología, prefijos de numeración y anti-mezcla.
 * Viaje LIFE: Combustible/Peajes/Parking/Hospedaje/Manutención → prefijo T-
 * Otros LIFE: solo tipo OTROS → OG / O / AL / ED / VET
 */

export const LIFE_TRAVEL_TIPOS = new Set([
  "COMBUSTIBLES",
  "PEAJES",
  "PARKING",
  "HOSPEDAJE",
  "MANUTENCION",
  "DIETAS",
]);

export const LIFE_OTROS_TIPOS = new Set(["OTROS", "CONSUMIBLES"]);

/** Subtipos Abilas dentro de OTROS (no mezclables en la misma hoja). */
export const ABILAS_OTROS_SUBTIPOS = [
  { value: "ALIMENTACION", label: "Alimentación", prefix: "AL" },
  { value: "EDUCACION", label: "Educación", prefix: "ED" },
  { value: "VETERINARIOS", label: "Veterinarios", prefix: "VET" },
];

export const LIFE_OTROS_PREFIX = {
  PYGARGUS: "OG",
  RHODOPES: "O",
  ABILAS_ALIMENTACION: "AL",
  ABILAS_EDUCACION: "ED",
  ABILAS_VETERINARIOS: "VET",
};

const SHEET_NUM_LETTER_RE =
  /^(T|OG|O|AL|ED|VET|C)-(\d{2})-(\d{4})-([A-Z0-9]+)(\s-\s[IVXLCDM]+)?$/i;

export function normalizeExpenseTipo_(tipo) {
  return String(tipo || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeAbilasOtrosSubtipo_(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (!v) return "";
  if (v === "AL" || v.startsWith("ALIMENT")) return "ALIMENTACION";
  if (v === "ED" || v.startsWith("EDUC")) return "EDUCACION";
  if (v === "VET" || v.startsWith("VETERIN")) return "VETERINARIOS";
  if (v === "ALIMENTACION" || v === "EDUCACION" || v === "VETERINARIOS") return v;
  return "";
}

export function isLifeTravelTipo_(tipo) {
  return LIFE_TRAVEL_TIPOS.has(normalizeExpenseTipo_(tipo));
}

export function isLifeOtrosTipo_(tipo) {
  return LIFE_OTROS_TIPOS.has(normalizeExpenseTipo_(tipo));
}

function normProyectoText_(value) {
  return String(value || "")
    .trim()
    .replace(/^\d+\.\s*/, "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function lifeProjectKeyFromText_(proyectoNombre) {
  const p = normProyectoText_(proyectoNombre);
  if (!p) return "";
  if (p.includes("PYGARGUS")) return "PYGARGUS";
  if (p.includes("ABILAS")) return "ABILAS";
  if (p.includes("RHODOPE") || (p.includes("LIFE") && p.includes("VULTURE"))) return "RHODOPES";
  return "";
}

export function expenseRowProyecto_(row) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : row;
  const fromRow = String(row?.proyecto || row?.departamento_o_proyecto || row?.proyecto_nombre || "").trim();
  if (fromRow && fromRow !== "__OTRO__") return fromRow;
  const dept = String(raw?.departamento_o_proyecto || "").trim();
  if (dept === "__OTRO__") return String(raw?.departamento_o_proyecto_custom || "").trim();
  return String(dept || raw?.departamento_o_proyecto_custom || raw?.proyecto || "").trim();
}

export function expenseRowTipo_(row) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : row;
  return normalizeExpenseTipo_(row?.type || row?.tipo_gasto || raw?.tipo_gasto || "");
}

export function expenseRowOtrosSubtipo_(row) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : row;
  return normalizeAbilasOtrosSubtipo_(
    row?.subtipo_otros ||
      row?.otros_subtipo ||
      raw?.subtipo_otros ||
      raw?.otros_subtipo ||
      raw?.subtipo_otros_abilas ||
      ""
  );
}

/**
 * Familia de selección: "TRAVEL" | "OTROS" | "MIX" | "NONE"
 */
export function resolveLifeSheetFamilyFromRows_(rows) {
  let travel = false;
  let otros = false;
  for (const row of rows || []) {
    const tipo = expenseRowTipo_(row);
    if (isLifeTravelTipo_(tipo)) travel = true;
    if (isLifeOtrosTipo_(tipo)) otros = true;
  }
  if (travel && otros) return "MIX";
  if (otros) return "OTROS";
  if (travel) return "TRAVEL";
  return "NONE";
}

/**
 * Prefijo de numeración para hoja LIFE Otros.
 * @returns {string} OG | O | AL | ED | VET | ""
 */
export function resolveLifeOtrosNumberPrefix_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let projectKey = "";
  for (const row of list) {
    projectKey = lifeProjectKeyFromText_(expenseRowProyecto_(row));
    if (projectKey) break;
  }
  if (projectKey === "PYGARGUS") return LIFE_OTROS_PREFIX.PYGARGUS;
  if (projectKey === "RHODOPES") return LIFE_OTROS_PREFIX.RHODOPES;
  if (projectKey === "ABILAS") {
    const subtypes = new Set();
    for (const row of list) {
      if (!isLifeOtrosTipo_(expenseRowTipo_(row))) continue;
      const st = expenseRowOtrosSubtipo_(row);
      if (st) subtypes.add(st);
    }
    if (subtypes.size !== 1) return "";
    const only = [...subtypes][0];
    if (only === "ALIMENTACION") return LIFE_OTROS_PREFIX.ABILAS_ALIMENTACION;
    if (only === "EDUCACION") return LIFE_OTROS_PREFIX.ABILAS_EDUCACION;
    if (only === "VETERINARIOS") return LIFE_OTROS_PREFIX.ABILAS_VETERINARIOS;
    return "";
  }
  return "";
}

/**
 * Bloqueos específicos LIFE Otros / viaje.
 * @returns {{ id: string, label: string, reasons: string[] }[]}
 */
export function collectLifeSheetMixBlocks_(selectedRows) {
  const rows = Array.isArray(selectedRows) ? selectedRows : [];
  const blocks = [];
  const hasLifeProject = rows.some((r) => Boolean(lifeProjectKeyFromText_(expenseRowProyecto_(r))));
  // Anti-mezcla y subtipos Abilas solo aplican en proyectos LIFE.
  if (!hasLifeProject) return blocks;
  const family = resolveLifeSheetFamilyFromRows_(rows);
  if (family === "MIX") {
    blocks.push({
      id: "__mix_travel_otros__",
      label: "Mezcla de tipologías",
      reasons: [
        "No se pueden mezclar gastos de viaje (combustible, peajes, parking, hospedaje, manutención) con gastos «Otros» en la misma hoja.",
      ],
    });
  }

  if (family === "OTROS") {
    const projectKeys = new Set();
    const subtypes = new Set();
    let missingSubtype = false;
    for (const row of rows) {
      if (!isLifeOtrosTipo_(expenseRowTipo_(row))) continue;
      const pk = lifeProjectKeyFromText_(expenseRowProyecto_(row));
      if (pk) projectKeys.add(pk);
      if (pk === "ABILAS") {
        const st = expenseRowOtrosSubtipo_(row);
        if (!st) missingSubtype = true;
        else subtypes.add(st);
      }
    }
    if (projectKeys.size > 1) {
      blocks.push({
        id: "__mix_life_projects__",
        label: "Proyectos LIFE distintos",
        reasons: ["Selecciona gastos de un solo proyecto LIFE (Pygargus, Rhodopes o Abilas)."],
      });
    }
    if (projectKeys.has("ABILAS")) {
      if (missingSubtype) {
        blocks.push({
          id: "__abilas_subtipo_missing__",
          label: "Subtipo Abilas",
          reasons: [
            "En Life Abilas, cada gasto «Otros» debe tener subtipo: Alimentación, Educación o Veterinarios.",
          ],
        });
      }
      if (subtypes.size > 1) {
        blocks.push({
          id: "__abilas_subtipo_mix__",
          label: "Subtipos Abilas mezclados",
          reasons: [
            "No se pueden mezclar subtipos Abilas (Alimentación / Educación / Veterinarios) en la misma hoja.",
          ],
        });
      }
    }
  }

  return blocks;
}

export function isValidMultiPrefixExpenseSheetNumber(num) {
  return SHEET_NUM_LETTER_RE.test(String(num || "").trim());
}

export function sheetNumberLetterPrefix_(num) {
  const m = String(num || "")
    .trim()
    .match(SHEET_NUM_LETTER_RE);
  return m ? String(m[1]).toUpperCase() : "";
}
