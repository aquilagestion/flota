/** Textos TTS del asistente de voz (sin dependencias de expenseVoiceFields para evitar ciclos de import). */

export const VOICE_SESSION_INTRO =
  "Asistente de voz. Diga salta para omitir un campo. Decimales: con o coma.";

/** Texto TTS breve antes de escuchar cada campo. */
export function voiceFieldSpeakPrompt(field) {
  const label = String(field?.label || "valor").trim();
  switch (field?.kind) {
    case "date":
      return `${label}. Día, mes y año.`;
    case "amount":
      if (field?.decimals === 3) return "Precio por litro.";
      return label;
    case "time":
      return `${label}. Hora en formato veinticuatro horas.`;
    case "plate":
      return "Matrícula.";
    case "invoice":
      return "Número de factura o tiquet. Diga letra o cifra, una a una. Guion o barra si hace falta. Tiene tiempo para cadenas largas.";
    case "percent":
      return "I V A. Cero, diez o veintiuno.";
    default:
      if (field?.key === "forma_pago") return "Usuario o forma de pago.";
      if (field?.key === "kilometros_actuales") return "Kilómetros actuales del cuentakilómetros.";
      return label;
  }
}

export const VOICE_CONFIRM_PROMPT =
  "¿Acepta trasladar los datos al formulario? Diga sí para confirmar o no para revisar.";
