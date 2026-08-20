import { Alert } from "react-native";
import { localDb } from "../storage/localDb";
import { formatSyncResultMessage } from "./outboxSummary";

/** Muestra el resultado de sincronizar con detalle de pendientes en cola. */
export async function showSyncResultAlert(res) {
  if (!res) return;
  if (res.online === false) {
    Alert.alert("Sin conexión", "No hay red disponible. Los pendientes se conservan en el dispositivo.");
    return;
  }
  const outbox = await localDb.getOutbox();
  const remaining = Number(res.remainingCount || 0);
  if (remaining > 0) {
    const errs = Array.isArray(res.errors) ? res.errors.filter(Boolean) : [];
    const title = errs.length ? "Sincronización con errores" : "Sincronización parcial";
    Alert.alert(title, formatSyncResultMessage(res, outbox));
    return;
  }
  Alert.alert("Sincronización OK", `Enviados: ${res?.pushed || 0}. Sin pendientes.`);
}
