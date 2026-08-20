import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const UPDATE_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}gestiflota-updates/`;
const MIN_APK_BYTES = 40 * 1024 * 1024;
const FLAG_GRANT_READ_URI = 1;
const APK_MIME = "application/vnd.android.package-archive";

async function ensureUpdateDir_() {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error("Almacenamiento no disponible en el dispositivo.");
  const info = await FileSystem.getInfoAsync(UPDATE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(UPDATE_DIR, { intermediates: true });
  }
}

function safeVersionSegment_(version) {
  return String(version || "update").replace(/[^\w.-]/g, "_");
}

async function launchApkInstall_(apkUri) {
  const getContentUri = FileSystem.getContentUriAsync;
  if (typeof getContentUri !== "function") {
    throw new Error("No se puede abrir el instalador en este dispositivo.");
  }
  const contentUri = await getContentUri(apkUri);
  const IntentLauncher = await import("expo-intent-launcher");
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI,
      type: APK_MIME,
    });
    return { method: "intent" };
  } catch {
    const available = await Sharing.isAvailableAsync();
    if (!available) throw new Error("Compartir no disponible en este dispositivo.");
    await Sharing.shareAsync(apkUri, {
      mimeType: APK_MIME,
      dialogTitle: "Instalar GESTIFLOTA",
    });
    return { method: "share" };
  }
}

/** Descarga el APK del manifiesto e inicia la instalación. */
export async function downloadAndInstallApkUpdate({ downloadUrl, version, onProgress }) {
  if (Platform.OS !== "android") {
    throw new Error("La actualización APK solo está disponible en Android.");
  }
  const url = String(downloadUrl || "").trim();
  if (!url) throw new Error("URL de descarga no disponible.");

  await ensureUpdateDir_();
  const ver = safeVersionSegment_(version);
  const apkUri = `${UPDATE_DIR}GESTIFLOTA_${ver}.apk`;
  await FileSystem.deleteAsync(apkUri, { idempotent: true });

  onProgress?.("downloading", 0);
  const result = await FileSystem.downloadAsync(url, apkUri);
  if (!result?.uri || Number(result?.status || 0) !== 200) {
    throw new Error(`Descarga fallida (HTTP ${result?.status || "?"})`);
  }

  const info = await FileSystem.getInfoAsync(apkUri);
  const size = Number(info?.size || 0);
  if (!info.exists || size < MIN_APK_BYTES) {
    throw new Error("El archivo descargado no es un APK válido. Prueba de nuevo o descarga desde el navegador.");
  }

  onProgress?.("installing", 1);
  await launchApkInstall_(apkUri);
  return { apkUri };
}

export async function openApkDownloadInBrowser(downloadUrl) {
  const url = String(downloadUrl || "").trim();
  if (!url) throw new Error("URL de descarga no disponible.");
  await Linking.openURL(url);
}
