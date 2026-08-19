import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import {
  EXPENSE_SHEET_TEMPLATE,
  logoAssetKeyForTemplate,
} from "../../flotaWeb/lib/expenseSheetTemplates";
import { ticketFetchUrlForEmbed, ticketUrlToDataUri_ } from "../../flotaWeb/lib/expenseTicketResolve";

const LOGO_MODULES = {
  grefa: require("../../../assets/expense-sheets/logo-grefa-header.png"),
  pygargus: require("../../../assets/expense-sheets/logo-life-pygargus.png"),
  abilas: require("../../../assets/expense-sheets/logo-life-abilas.png"),
  rhodopes: require("../../../assets/expense-sheets/logo-life-rhodopes.png"),
  natura2000: require("../../../assets/expense-sheets/logo-life-natura2000.png"),
};

const cache_ = {};

async function moduleToDataUri_(mod) {
  const cacheKey = String(mod);
  if (cache_[cacheKey]) return cache_[cacheKey];
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const candidates = [String(asset.localUri || "").trim(), String(asset.uri || "").trim()].filter(Boolean);
  for (let i = 0; i < candidates.length; i += 1) {
    const source = candidates[i];
    if (source.startsWith("data:")) {
      cache_[cacheKey] = source;
      return source;
    }
    try {
      const dest = `${FileSystem.cacheDirectory}sheet_logo_${Date.now()}_${i}.png`;
      await FileSystem.copyAsync({ from: source, to: dest });
      const b64 = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 });
      if (b64) {
        cache_[cacheKey] = `data:image/png;base64,${b64}`;
        return cache_[cacheKey];
      }
    } catch {
      // try next
    }
  }
  cache_[cacheKey] = candidates[0] || "";
  return cache_[cacheKey];
}

export async function loadExpenseSheetLogosForTemplate(templateId) {
  const isLife = templateId !== EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
  const lifeKey = logoAssetKeyForTemplate(templateId);
  const grefa = await moduleToDataUri_(LOGO_MODULES.grefa);
  if (!isLife) return { grefa, lifeProject: "", lifeNatura: "" };
  const lifeMod = LOGO_MODULES[lifeKey] || LOGO_MODULES.pygargus;
  return {
    grefa,
    lifeProject: await moduleToDataUri_(lifeMod),
    lifeNatura: await moduleToDataUri_(LOGO_MODULES.natura2000),
  };
}

async function readLocalFileAsDataUri_(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  try {
    const b64 = await FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 });
    const mime = u.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return b64 ? `data:${mime};base64,${b64}` : u;
  } catch {
    return u;
  }
}

export const readLocalTicketFileAsDataUri_ = readLocalFileAsDataUri_;

export async function uriToDataUriIfLocal_(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  if (u.startsWith("file:") || u.startsWith("content:")) {
    return readLocalFileAsDataUri_(u);
  }
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const fetchUrl = ticketFetchUrlForEmbed(u);
    try {
      const dest = `${FileSystem.cacheDirectory}ticket_${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(fetchUrl, dest);
      const localUri = String(dl?.uri || dest).trim();
      return (await readLocalFileAsDataUri_(localUri)) || fetchUrl;
    } catch {
      return ticketUrlToDataUri_(fetchUrl, { readLocalFile: readLocalFileAsDataUri_ });
    }
  }
  return readLocalFileAsDataUri_(u);
}
