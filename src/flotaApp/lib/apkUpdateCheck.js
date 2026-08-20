import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { HELP_APP_VERSION } from "../content/helpGestiflotaText";
import { env } from "../config/env";
import { isRemoteVersionNewer } from "./versionCompare";

const DISMISS_KEY = "gestiflota_apk_update_dismissed_version";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let lastCheckAt = 0;
let cachedRemote = null;
/** «Más tarde» solo oculta hasta cerrar la app. */
let sessionDismissedVersion = "";

export function getInstalledAppVersion() {
  try {
    const native = String(Application.nativeApplicationVersion || "").trim();
    if (Platform.OS !== "web" && native) return native;
  } catch {
    // ignore
  }
  return String(HELP_APP_VERSION || "").trim();
}

export async function fetchRemoteApkVersion() {
  const url = String(env.apkUpdateManifestUrl || "").trim();
  if (!url) return null;
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const json = await res.json();
  const version = String(json?.version || "").trim();
  if (!version) throw new Error("Manifest sin version");
  const downloadUrl = String(json?.downloadUrl || "").trim();
  return {
    version,
    downloadUrl,
    builtAt: String(json?.builtAt || "").trim(),
    releaseNotes: String(json?.releaseNotes || "").trim(),
  };
}

function shouldSkipAutoCheck_(force) {
  return typeof __DEV__ !== "undefined" && __DEV__ && !force;
}

export async function checkApkUpdate({ force = false, ignoreDismiss = false } = {}) {
  if (shouldSkipAutoCheck_(force)) return null;
  const now = Date.now();
  if (!force && cachedRemote && now - lastCheckAt < CHECK_INTERVAL_MS) {
    return evaluateUpdate_(cachedRemote, { ignoreDismiss });
  }
  try {
    const remote = await fetchRemoteApkVersion();
    cachedRemote = remote;
    lastCheckAt = now;
    return evaluateUpdate_(remote, { ignoreDismiss });
  } catch {
    if (!force) lastCheckAt = 0;
    return null;
  }
}

async function evaluateUpdate_(remote, { ignoreDismiss = false } = {}) {
  if (!remote?.version) return null;
  const local = getInstalledAppVersion();
  if (!local || !isRemoteVersionNewer(local, remote.version)) return null;
  if (!ignoreDismiss) {
    const sessionDismissed = String(sessionDismissedVersion || "").trim();
    if (sessionDismissed && sessionDismissed === remote.version) return null;
  }
  return remote;
}

export async function clearApkUpdateDismissal() {
  sessionDismissedVersion = "";
  try {
    await AsyncStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
}

export async function dismissApkUpdate(version) {
  const v = String(version || "").trim();
  if (!v) return;
  sessionDismissedVersion = v;
  try {
    await AsyncStorage.setItem(DISMISS_KEY, v);
  } catch {
    // ignore
  }
}
