const NUMBERED_PREFIX_RE = /^\d+\.\s+/;

/** Quita el prefijo «N. » de una etiqueta numerada. */
export function stripNumberedSelectPrefix(label) {
  return String(label || "")
    .replace(NUMBERED_PREFIX_RE, "")
    .trim();
}

/**
 * Añade prefijo numérico a las opciones de un desplegable (p. ej. «3. LIFE Rhodopes»).
 * Las opciones con value vacío no se numeran (p. ej. «Selecciona...»).
 */
export function withNumberedSelectLabels(options, { skipEmptyValues = true } = {}) {
  const list = Array.isArray(options) ? options : [];
  let n = 1;
  return list.map((opt) => {
    const value = typeof opt === "string" ? opt : String(opt?.value ?? "");
    const rawLabel = typeof opt === "string" ? opt : String(opt?.label ?? opt?.value ?? "").trim();
    const baseLabel = stripNumberedSelectPrefix(rawLabel);
    if (skipEmptyValues && !value) {
      return { value, label: baseLabel || rawLabel };
    }
    const label = baseLabel ? `${n}. ${baseLabel}` : baseLabel;
    n += 1;
    return { value, label };
  });
}
