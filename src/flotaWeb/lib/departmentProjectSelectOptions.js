import { OTRO_DEPARTAMENTO } from "./constants";
import { stripNumberedSelectPrefix, withNumberedSelectLabels } from "./numberedSelectOptions";

/**
 * Opciones Departamento/Proyecto para gastos: nombres de la columna B de PROYECTOS
 * (mismo orden que el Sheet) + «Añadir otro». El value guardado es el nombre visible.
 */
export function buildDepartmentProjectSelectOptions(projectOptions = [], { includePlaceholder = false } = {}) {
  const out = [];
  const seenValues = new Set();
  const add = (opt) => {
    const rawValue = String(opt?.value ?? "").trim();
    const label = stripNumberedSelectPrefix(String(opt?.label || opt?.value || "").trim());
    if (!label && rawValue !== OTRO_DEPARTAMENTO) return;
    // «Añadir otro» mantiene el sentinel; el resto usa el nombre de columna B.
    const value = rawValue === OTRO_DEPARTAMENTO ? OTRO_DEPARTAMENTO : label || rawValue;
    if (!value) return;
    if (seenValues.has(value)) return;
    seenValues.add(value);
    out.push({ value, label: label || value });
  };
  if (includePlaceholder) {
    out.push({ value: "", label: "Selecciona..." });
    seenValues.add("");
  }
  for (const p of projectOptions) add(p);
  add({ value: OTRO_DEPARTAMENTO, label: "Añadir otro (escribir)" });
  return withNumberedSelectLabels(out);
}
