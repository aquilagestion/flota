/** Ventana máxima de grabación por campo (voz campo a campo y wizard). */
export const FIELD_RECORD_MAX_MS = 7000;

/** Silencio tras la última locución antes de pasar al siguiente campo. */
export const FIELD_SILENCE_MS = 3000;

/** Nº factura/tiquet: cadenas largas (25–30 caracteres). */
export const INVOICE_FIELD_RECORD_MAX_MS = 22000;

export const INVOICE_FIELD_SILENCE_MS = 5500;

export function voiceRecordMaxMsForField(field) {
  if (String(field?.kind || "").trim() === "invoice") return INVOICE_FIELD_RECORD_MAX_MS;
  return FIELD_RECORD_MAX_MS;
}

export function voiceSilenceMsForField(field) {
  if (String(field?.kind || "").trim() === "invoice") return INVOICE_FIELD_SILENCE_MS;
  return FIELD_SILENCE_MS;
}
