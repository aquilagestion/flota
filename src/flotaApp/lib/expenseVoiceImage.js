import { Platform, Alert, ActionSheetIOS } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { prepareTicketImageUriForA4 } from "./expenseTicketImageNative";

export function voiceSupportsOdometerImage(tipo) {
  return String(tipo || "").trim().toUpperCase() !== "KILOMETRAJE_COLABORADOR";
}

export function voiceSupportsTicketImage(tipo) {
  return String(tipo || "").trim().toUpperCase() !== "KILOMETRAJE_COLABORADOR";
}

export const VOICE_ODOMETER_ASK_PROMPT =
  "¿Desea subir una imagen del cuentakilómetros? Diga sí o no. También podrá hacerlo más tarde editando el gasto.";

export const VOICE_TICKET_ASK_PROMPT =
  "¿Desea subir imagen del tiquet o factura? Diga sí o no. También podrá hacerlo más tarde editando el gasto.";

export const VOICE_CONFIRM_TRANSFER_PROMPT =
  "¿Acepta trasladar los datos al formulario? Diga sí para confirmar o no para revisar.";

async function ensureImagePermission_(source) {
  if (Platform.OS === "web") return true;
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}

/** @returns {Promise<string|null>} URI local de la imagen elegida. */
export async function pickExpenseImageUri(source = "library") {
  if (Platform.OS === "web") return null;
  const ok = await ensureImagePermission_(source);
  if (!ok) {
    Alert.alert("Permiso denegado", "Necesito permiso para acceder a la cámara o galería.");
    return null;
  }
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: false });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  const rawUri = String(asset?.uri || "").trim();
  if (!rawUri) return null;
  return prepareTicketImageUriForA4(rawUri, asset?.width, asset?.height);
}

/** Muestra selector nativo cámara/galería. @returns {Promise<string|null>} */
export function promptExpenseImageSource() {
  if (Platform.OS === "web") return Promise.resolve(null);
  return new Promise((resolve) => {
    const onPick = async (source) => {
      const uri = await pickExpenseImageUri(source);
      resolve(uri);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancelar", "Cámara", "Galería"],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) onPick("camera");
          else if (idx === 2) onPick("library");
          else resolve(null);
        }
      );
      return;
    }
    Alert.alert("Seleccionar imagen", "Elija el origen de la foto", [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
      { text: "Cámara", onPress: () => onPick("camera") },
      { text: "Galería", onPress: () => onPick("library") },
    ]);
  });
}
