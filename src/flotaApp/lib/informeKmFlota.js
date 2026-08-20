import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { sheetsApi } from "../api/sheetsApi";
import { loadExpenseSheetLogosForTemplate, uriToDataUriIfLocal_ } from "./expenseSheetLogos";
import {
  groupViajesForRegistroKm_,
  resolveRegistroKmTemplateId_,
} from "../../flotaWeb/lib/registroKmLifeTemplate";
import { EXPENSE_SHEET_TEMPLATE } from "../../flotaWeb/lib/expenseSheetTemplates";

// pdf-lib NO se importa aquí de forma estática: en web Metro rompe tslib (__extends)
// y deja la app en pantalla en blanco. Se carga solo al exportar.

export const MESES_ES_KM = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

export const INFORME_KM_CSV_HEADERS = [
  "Fecha",
  "Matricula",
  "Desplazamiento",
  "Conductor",
  "Email",
  "Km inicial",
  "Km final",
  "Km recorridos",
  "Proyecto",
  "Accion",
];

export function buildYearOptionsKm_(yearsBack = 4) {
  const now = new Date().getFullYear();
  const out = [];
  for (let y = now; y >= now - yearsBack; y--) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

export function currentPeriodKm_() {
  const now = new Date();
  return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
}

export function parseInformeKmFlota_(res) {
  const data = res?.data || res || {};
  const viajes = Array.isArray(data.viajes) ? data.viajes : [];
  const filtros = data.filtros_disponibles || {};
  return {
    rango: data.rango || {},
    viajes,
    totales: {
      viajes_count: Number(data.totales?.viajes_count || 0) || 0,
      km_recorridos: Number(data.totales?.km_recorridos || 0) || 0,
    },
    filtros_disponibles: {
      matriculas: Array.isArray(filtros.matriculas) ? filtros.matriculas : [],
      conductores: Array.isArray(filtros.conductores) ? filtros.conductores : [],
      proyectos: Array.isArray(filtros.proyectos) ? filtros.proyectos : [],
    },
    alcance: String(data.alcance || "").trim(),
    meta: data.meta && typeof data.meta === "object" ? data.meta : null,
    generado_en: String(data.generado_en || "").trim(),
  };
}

export function formatKm_(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

function escapeCsvCell_(value) {
  const safe = String(value ?? "");
  if (/[",\n\r;]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function buildInformeKmCsv_(viajes) {
  const lines = [INFORME_KM_CSV_HEADERS.map(escapeCsvCell_).join(";")];
  for (const v of viajes || []) {
    lines.push(
      [
        v.fecha_viaje || "",
        v.matricula || "",
        v.desplazamiento || `${v.origen || ""} → ${v.destino || ""}`,
        v.usuario_nombre || "",
        v.usuario_email || "",
        v.km_inicial === "" || v.km_inicial == null ? "" : String(v.km_inicial).replace(".", ","),
        v.km_final === "" || v.km_final == null ? "" : String(v.km_final).replace(".", ","),
        v.km_recorridos === "" || v.km_recorridos == null
          ? ""
          : String(v.km_recorridos).replace(".", ","),
        v.proyecto_nombre || "",
        v.accion || "",
      ]
        .map(escapeCsvCell_)
        .join(";")
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function downloadCsvWeb_(csv, filename) {
  if (typeof document === "undefined") throw new Error("Descarga web no disponible");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportInformeKmFlotaCsv(viajes, opts = {}) {
  const list = Array.isArray(viajes) ? viajes : [];
  if (!list.length) throw new Error("No hay filas para exportar");
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = String(opts.filename || `informe_km_flota_${stamp}.csv`).trim();
  const csv = buildInformeKmCsv_(list);

  if (Platform.OS === "web") {
    downloadCsvWeb_(csv, filename);
    return { mode: "download", filename };
  }

  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) throw new Error("No hay directorio temporal para guardar el CSV");
  const fileUri = `${base}${filename}`;
  const enc =
    FileSystem.EncodingType && FileSystem.EncodingType.UTF8 ? FileSystem.EncodingType.UTF8 : null;
  await FileSystem.writeAsStringAsync(fileUri, csv, enc ? { encoding: enc } : undefined);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "text/csv",
      dialogTitle: "Exportar informe km flota",
      UTI: "public.comma-separated-values-text",
    });
  }
  return { mode: "share", filename, fileUri };
}

async function hydrateLogosDataUris_(logos) {
  const out = { ...(logos || {}) };
  const keys = ["grefa", "grefaSello", "lifeProject", "lifeNatura"];
  for (const k of keys) {
    const u = String(out[k] || "").trim();
    if (!u || u.startsWith("data:")) continue;
    try {
      out[k] = (await uriToDataUriIfLocal_(u)) || u;
    } catch {
      // keep url
    }
  }
  return out;
}

function safePdfFilename_(title) {
  const safe = String(title || "registro_km")
    .replace(/[^\w\-áéíóúñÁÉÍÓÚÑ .]+/gi, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const base = safe || "registro_km";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function uint8ToBase64_(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(u8).toString("base64");
}

function downloadPdfWeb_(bytes, filename) {
  if (typeof document === "undefined") throw new Error("Descarga PDF no disponible");
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 2000);
  return { mode: "download-pdf", filename };
}

async function sharePdfNative_(bytes, filename, documentTitle) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) throw new Error("No hay directorio temporal para guardar el PDF");
  const uri = `${dir}${filename}`;
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  await FileSystem.writeAsStringAsync(uri, uint8ToBase64_(bytes), { encoding: enc });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: documentTitle,
      UTI: "com.adobe.pdf",
    });
  }
  return { mode: "share-pdf", uri, filename };
}

/**
 * Documento REGISTRO Km en PDF (plantilla tipo Excel LIFE).
 * Logo LIFE según proyecto; GREFA + Natura 2000 fijos.
 */
export async function exportRegistroKmLifeDocument({
  viajes,
  fleetByMatricula = {},
  periodLabel = "",
  documentTitle = "Registro Km LIFE",
} = {}) {
  const list = Array.isArray(viajes) ? viajes : [];
  if (!list.length) throw new Error("No hay viajes para generar el registro");

  const rawGroups = groupViajesForRegistroKm_(list);
  const templateIds = new Set();
  const groups = rawGroups.map((g) => {
    const templateId =
      resolveRegistroKmTemplateId_(g.proyecto_nombre) || EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
    templateIds.add(templateId);
    const veh = fleetByMatricula[g.matricula] || {};
    return {
      ...g,
      templateId,
      marca: String(veh.marca || "").trim(),
      modelo: String(veh.modelo || "").trim(),
    };
  });

  const logosByTemplate = {};
  let logosFallback = null;
  for (const tid of templateIds) {
    const logos = await hydrateLogosDataUris_(await loadExpenseSheetLogosForTemplate(tid));
    logosByTemplate[tid] = logos;
    if (!logosFallback) logosFallback = logos;
  }
  if (!logosFallback) {
    logosFallback = await hydrateLogosDataUris_(
      await loadExpenseSheetLogosForTemplate(EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS)
    );
  }

  const bytes = await (
    await import("../../flotaWeb/lib/registroKmLifePdf")
  ).buildRegistroKmLifePdfBytes({
    groups,
    logosByTemplate,
    logosFallback,
    periodLabel,
  });
  const filename = safePdfFilename_(documentTitle);

  if (Platform.OS === "web") {
    return downloadPdfWeb_(bytes, filename);
  }
  return sharePdfNative_(bytes, filename, documentTitle);
}

export async function fetchInformeKmFlota(userEmail, params = {}) {
  return sheetsApi.informeKmFlota(userEmail, params);
}

export async function setAccionInformeKmFlota(userEmail, idViaje, accion) {
  return sheetsApi.informeKmFlotaSetAccion(userEmail, idViaje, accion);
}
