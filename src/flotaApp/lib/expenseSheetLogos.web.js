import { Platform } from "react-native";
import {
  EXPENSE_SHEET_TEMPLATE,
  logoAssetKeyForTemplate,
} from "../../flotaWeb/lib/expenseSheetTemplates";

const LOGO_BASE = "/sheets/logos/";

const cache_ = {};

async function urlToDataUri_(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  if (cache_[u]) return cache_[u];
  const abs =
    u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")
      ? u
      : typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}${u.startsWith("/") ? "" : "/"}${u}`
        : u;
  try {
    const res = await fetch(abs, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer logo"));
      reader.readAsDataURL(blob);
    });
    if (dataUri.startsWith("data:")) {
      cache_[u] = dataUri;
      return dataUri;
    }
  } catch {
    // fallback URL absoluta
  }
  cache_[u] = abs;
  return abs;
}

export async function loadExpenseSheetLogosForTemplate(templateId) {
  const isLife = templateId !== EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
  const lifeKey = logoAssetKeyForTemplate(templateId);
  const grefa = await urlToDataUri_(`${LOGO_BASE}logo-grefa-header.png`);
  const grefaSello = await urlToDataUri_(`${LOGO_BASE}logo-grefa-sello.png`);
  if (!isLife) return { grefa, grefaSello, lifeProject: "", lifeNatura: "" };
  const lifeFile =
    lifeKey === "abilas"
      ? "logo-life-abilas.png"
      : lifeKey === "rhodopes"
        ? "logo-life-rhodopes.png"
        : "logo-life-pygargus.png";
  return {
    grefa,
    grefaSello,
    lifeProject: await urlToDataUri_(`${LOGO_BASE}${lifeFile}`),
    lifeNatura: await urlToDataUri_(`${LOGO_BASE}logo-life-natura2000.png`),
  };
}

export async function uriToDataUriIfLocal_(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  if (u.startsWith("blob:")) return u;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) {
    return urlToDataUri_(u);
  }
  return u;
}

export const readLocalTicketFileAsDataUri_ = uriToDataUriIfLocal_;

export function createTicketUriResolverForNative_(apiGet, userEmail, readLocalFile) {
  const reader = typeof readLocalFile === "function" ? readLocalFile : uriToDataUriIfLocal_;
  return (uri) => reader(uri);
}

void Platform;
