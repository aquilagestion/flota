import {
  EXPENSE_SHEET_TEMPLATE,
  logoAssetKeyForTemplate,
} from "./expenseSheetTemplates";
import { ticketFetchUrlForEmbed, ticketUrlToDataUri_ } from "./expenseTicketResolve";

const LOGO_BASE = "/sheets/logos/";

export async function loadExpenseSheetLogosForTemplate(templateId) {
  const isLife = templateId !== EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
  const lifeKey = logoAssetKeyForTemplate(templateId);
  const grefa = `${LOGO_BASE}logo-grefa-header.png`;
  if (!isLife) return { grefa, lifeProject: "", lifeNatura: "" };
  const lifeFile =
    lifeKey === "abilas"
      ? "logo-life-abilas.png"
      : lifeKey === "rhodopes"
        ? "logo-life-rhodopes.png"
        : "logo-life-pygargus.png";
  return {
    grefa,
    lifeProject: `${LOGO_BASE}${lifeFile}`,
    lifeNatura: `${LOGO_BASE}logo-life-natura2000.png`,
  };
}

export function createTicketUriResolverForWeb_(apiGet, userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  return (uri) =>
    ticketUrlToDataUri_(uri, {
      apiGet: typeof apiGet === "function" ? apiGet : undefined,
      userEmail: email,
    });
}

/** Resolver con API Drive + ficheros locales (APK). */
export function createTicketUriResolverForNative_(apiGet, userEmail, readLocalFile) {
  const email = String(userEmail || "").trim().toLowerCase();
  return (uri) =>
    ticketUrlToDataUri_(uri, {
      apiGet: typeof apiGet === "function" ? apiGet : undefined,
      userEmail: email,
      readLocalFile: typeof readLocalFile === "function" ? readLocalFile : undefined,
    });
}

export async function uriToDataUriIfLocal_(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  if (u.startsWith("blob:")) return u;
  const fetchUrl = u.startsWith("http://") || u.startsWith("https://") ? ticketFetchUrlForEmbed(u) : u;
  if (fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://")) {
    return ticketUrlToDataUri_(fetchUrl);
  }
  return u;
}
