/** Matrículas españolas admitidas en el formulario de gastos. */

const RE_OLD = /^\d{4}[A-Z]{3}$/;
const RE_CURRENT_A = /^[A-Z]\d{4}[A-Z]{2}$/;
const RE_CURRENT_AA = /^[A-Z]{2}\d{4}[A-Z]{2}$/;

/** Mayúsculas, sin espacios ni signos. */
export function normalizeSpanishPlate(raw) {
  return String(raw || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function isValidSpanishPlateFormat(plate) {
  const p = normalizeSpanishPlate(plate);
  if (!p) return false;
  return RE_OLD.test(p) || RE_CURRENT_A.test(p) || RE_CURRENT_AA.test(p);
}

/**
 * Opciones { value, label } solo con matrícula válida (sin marca/modelo).
 * @param {Array<{ matricula?: string, value?: string } | string>} vehicles
 */
export function buildExpenseMatriculaSelectOptions(
  vehicles,
  { includePlaceholder = false, placeholderLabel = "Selecciona matrícula..." } = {}
) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const seen = new Set();
  const plates = [];
  for (const item of list) {
    const raw = item && typeof item === "object" ? item.matricula ?? item.value ?? item.label : item;
    const plate = normalizeSpanishPlate(raw);
    if (!plate || !isValidSpanishPlateFormat(plate) || seen.has(plate)) continue;
    seen.add(plate);
    plates.push(plate);
  }
  plates.sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  const opts = plates.map((p) => ({ value: p, label: p }));
  if (includePlaceholder) return [{ value: "", label: placeholderLabel }, ...opts];
  return opts;
}
