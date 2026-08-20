import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { sheetsApi } from "../../flotaApp/api/sheetsApi";

const XLSM_MIME =
  "application/vnd.ms-excel.sheet.macroEnabled.12";

const ATTACHMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf";

export function importLineKey_(linea) {
  const sec = String(linea?.seccion || "").trim();
  const fila = Number(linea?.fila_excel);
  return sec ? `${sec}:${fila}` : String(fila || "");
}

export function attachmentLabel_(file) {
  return String(file?.file_name || file?.name || "Adjunto").trim();
}

/** Familias de importación Excel. */
export const EXCEL_IMPORT_FAMILIAS = [
  {
    id: "GENERICA",
    label: "Proyecto estándar (no LIFE)",
    hint: "Pygargus/Rhodopes/Abilas fuera de LIFE, u otros proyectos GREFA",
  },
  {
    id: "LIFE",
    label: "Proyecto LIFE",
    hint: "Plantillas HHGG LIFE (Pygargus, Rhodopes, Abilas): cambian logo y datos EU",
  },
];

export const EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA = {
  GENERICA: [
    {
      id: "VEHICULO_PROPIO",
      label: "Viaje con Vehículo Propio",
      hint: "HOJA DE GASTOS CON VEHÍCULO PROPIO (.xlsm)",
    },
    {
      id: "VEHICULOS_GREFA",
      label: "Viaje con Vehículo Grefa (estándar)",
      hint: "Plantilla clásica HOJA GASTOS · no usar con Excel LIFE (VEHICULO PROYECTO)",
    },
    {
      id: "OTROS_COSTES",
      label: "Otros gastos",
      hint: "HOJA DE GASTOS OTROS COSTES (.xlsm)",
    },
  ],
  LIFE: [
    {
      id: "LIFE_VEHICULO_PROPIO",
      label: "LIFE · Vehículo propio",
      hint: "Parte dietas / vehículo ajeno al proyecto (TRAVEL AND SUBSISTENCE)",
    },
    {
      id: "LIFE_VEHICULO_GREFA",
      label: "LIFE · Vehículo Grefa / viaje",
      hint: "Desplazamientos por otros medios (combustible, peajes, dietas…)",
    },
    {
      id: "LIFE_OTROS_GASTOS",
      label: "LIFE · Otros gastos",
      hint: "Hoja de consumibles / otros costes LIFE",
    },
  ],
};

/** @deprecated Usar EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA */
export const EXCEL_IMPORT_PLANTILLAS = EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA.GENERICA;

export function plantillasForFamilia_(familia) {
  return EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA[familia] || EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA.GENERICA;
}

export function plantillaImportLabel_(id) {
  const all = Object.values(EXCEL_IMPORT_PLANTILLAS_BY_FAMILIA).flat();
  const found = all.find((t) => t.id === id);
  return found?.label || String(id || "").trim();
}

/** Si el usuario elige plantilla estándar pero el Excel es LIFE, aceptar e importar igual. */
export function importPlantillaAutoAcceptLife_(expected, detected) {
  const exp = String(expected || "").trim();
  const det = String(detected || "").trim();
  if (exp === "VEHICULOS_GREFA" && det === "LIFE_VEHICULO_GREFA") return true;
  if (exp === "VEHICULO_PROPIO" && det === "LIFE_VEHICULO_PROPIO") return true;
  if (exp === "OTROS_COSTES" && det === "LIFE_OTROS_GASTOS") return true;
  return false;
}

export function buildImportPlantillaMismatchMessage_(expected, detected) {
  const exp = String(expected || "").trim();
  const det = String(detected || "").trim();
  if (!exp) return "";
  if (!det) {
    return (
      `No se pudo identificar la plantilla del Excel.\n\n` +
      `Seleccionaste: ${plantillaImportLabel_(exp)}\n\n` +
      `Comprueba que el archivo sea la plantilla correcta.`
    );
  }
  if (exp === det) return "";
  if (importPlantillaAutoAcceptLife_(exp, det)) return "";
  let extra = "";
  if (exp === "VEHICULOS_GREFA" && det === "LIFE_VEHICULO_GREFA") {
    extra =
      `\n\nTu Excel es plantilla LIFE (hoja «VEHICULO PROYECTO»).\n` +
      `En el paso 1 elige «Proyecto LIFE» y en el paso 2 «LIFE · Vehículo Grefa / viaje».`;
  } else if (exp === "LIFE_VEHICULO_GREFA" && det === "VEHICULOS_GREFA") {
    extra =
      `\n\nEl archivo parece la plantilla estándar GREFA, no LIFE.\n` +
      `En el paso 1 elige «Proyecto estándar (no LIFE)» y «Viaje con Vehículo Grefa».`;
  }
  return (
    `El archivo no corresponde a la plantilla seleccionada.\n\n` +
    `Seleccionaste: ${plantillaImportLabel_(exp)}\n` +
    `Detectado en el archivo: ${plantillaImportLabel_(det)}\n\n` +
    `Elige la plantilla correcta o selecciona otro archivo.` +
    extra
  );
}

export function assertImportPlantillaMatch_(expected, detected) {
  const msg = buildImportPlantillaMismatchMessage_(expected, detected);
  if (msg) {
    const err = new Error(msg);
    err.code = "PLANTILLA_MISMATCH";
    throw err;
  }
}

export function isImportPlantillaMismatchError_(err) {
  if (!err) return false;
  if (String(err.code || "").trim() === "PLANTILLA_MISMATCH") return true;
  const msg = String(err.message || err || "").toLowerCase();
  return msg.includes("no corresponde a la plantilla") || msg.includes("plantilla seleccionada");
}

async function uriToBase64_(uri) {
  const safe = String(uri || "").trim();
  if (!safe) throw new Error("URI de archivo vacía");
  if (Platform.OS === "web") {
    const res = await fetch(safe);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const idx = dataUrl.indexOf(";base64,");
        resolve(idx >= 0 ? dataUrl.slice(idx + 8) : dataUrl);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(blob);
    });
  }
  const encoding = FileSystem.EncodingType?.Base64 || "base64";
  return FileSystem.readAsStringAsync(safe, { encoding });
}

/**
 * Sube un .xlsm/.xlsx a Drive vía adjunto_subir y devuelve file_id.
 */
export async function uploadExpenseSheetExcelFile({ uri, fileName, userEmail }) {
  const name = String(fileName || "hoja_gasto.xlsm").trim();
  const base64 = await uriToBase64_(uri);
  if (!base64 || base64.length < 32) throw new Error("Archivo Excel vacío o ilegible");
  const up = await sheetsApi.post(
    "adjunto_subir",
    {
      base64,
      mime_type: XLSM_MIME,
      file_name: name.endsWith(".xlsm") || name.endsWith(".xlsx") ? name : `${name}.xlsm`,
      folder_hint: "GESTIFLOTA_EXCEL_IMPORT",
    },
    { user_email: userEmail },
    { timeoutMs: 120000 }
  );
  const data = up?.data || up;
  const fileId = String(data?.file_id || "").trim();
  if (!fileId) throw new Error("No se recibió file_id tras subir el Excel");
  return {
    file_id: fileId,
    file_name: String(data?.file_name || name).trim(),
    url: String(data?.url || "").trim(),
  };
}

function guessAttachmentMime_(fileName, fallback = "application/octet-stream") {
  const n = String(fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

/**
 * Sube factura/ticket (PDF o imagen) para asociar a una línea importada.
 */
export async function uploadExpenseSheetAttachmentFile({ uri, fileName, userEmail, mimeType }) {
  const name = String(fileName || "factura.pdf").trim();
  const base64 = await uriToBase64_(uri);
  if (!base64 || base64.length < 32) throw new Error("Archivo vacío o ilegible");
  if (String(base64).length > 6.5 * 1024 * 1024) {
    throw new Error("El archivo es demasiado grande (máx. ~5 MB). Comprímalo o usa otra copia.");
  }
  const up = await sheetsApi.post(
    "adjunto_subir",
    {
      base64,
      mime_type: String(mimeType || guessAttachmentMime_(name)).trim(),
      file_name: name,
      folder_hint: "GESTIFLOTA_EXCEL_IMPORT_TICKETS",
    },
    { user_email: userEmail },
    { timeoutMs: 120000 }
  );
  const data = up?.data || up;
  const url = String(data?.url || "").trim();
  if (!url) throw new Error("No se recibió URL tras subir el adjunto");
  return {
    file_id: String(data?.file_id || "").trim(),
    file_name: String(data?.file_name || name).trim(),
    url,
  };
}

export async function pickExpenseSheetAttachmentFiles() {
  if (Platform.OS === "web") {
    return await new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ATTACHMENT_ACCEPT;
      input.onchange = async () => {
        const files = input.files ? Array.from(input.files) : [];
        if (!files.length) {
          resolve([]);
          return;
        }
        try {
          resolve(
            files.map((file) => ({
              uri: URL.createObjectURL(file),
              name: file.name,
              mimeType: file.type || guessAttachmentMime_(file.name),
            }))
          );
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled) return [];
  const assets = Array.isArray(res.assets) ? res.assets : res.uri ? [res] : [];
  return assets
    .map((asset) => ({
      uri: String(asset?.uri || "").trim(),
      name: String(asset?.name || "factura").trim(),
      mimeType: String(asset?.mimeType || guessAttachmentMime_(asset?.name)).trim(),
    }))
    .filter((a) => a.uri);
}

export function buildAdjuntosPorLineaPayload_(lineAttachments) {
  const out = [];
  const map = lineAttachments && typeof lineAttachments === "object" ? lineAttachments : {};
  for (const [key, files] of Object.entries(map)) {
    const list = Array.isArray(files) ? files : [];
    const urls = list.map((f) => String(f?.url || "").trim()).filter(Boolean);
    if (!urls.length) continue;
    const names = list.map((f, i) => String(f?.file_name || f?.name || `adjunto-${i + 1}`).trim());
    const parts = String(key).split(":");
    const fila = Number(parts[parts.length - 1]);
    const seccion = parts.length > 1 ? parts.slice(0, -1).join(":") : "";
    if (!fila) continue;
    out.push({
      seccion,
      fila_excel: fila,
      ticket_drive_urls: urls,
      ticket_drive_file_names: names,
    });
  }
  return out;
}

export async function previewExpenseSheetExcelImport({ fileId, userEmail, plantillaEsperada }) {
  try {
    const res = await sheetsApi.postWebSafe(
      "hoja_gasto_excel_preview",
      {
        file_id: String(fileId || "").trim(),
        plantilla_esperada: String(plantillaEsperada || "").trim(),
      },
      { user_email: userEmail },
      { timeoutMs: 120000 }
    );
    const data = res?.data || res;
    if (plantillaEsperada) {
      assertImportPlantillaMatch_(plantillaEsperada, data?.plantilla);
    }
    return data;
  } catch (e) {
    if (isImportPlantillaMismatchError_(e)) {
      const err = new Error(e?.message || "Plantilla incorrecta");
      err.code = "PLANTILLA_MISMATCH";
      throw err;
    }
    throw e;
  }
}

export async function importExpenseSheetExcel({
  fileId,
  userEmail,
  validarDni = true,
  plantillaEsperada,
  adjuntosPorLinea = [],
}) {
  const res = await sheetsApi.postWebSafe(
    "hoja_gasto_excel_import",
    {
      file_id: String(fileId || "").trim(),
      validar_dni: validarDni ? "true" : "false",
      plantilla_esperada: String(plantillaEsperada || "").trim(),
      adjuntos_por_linea: Array.isArray(adjuntosPorLinea) ? adjuntosPorLinea : [],
    },
    { user_email: userEmail },
    { timeoutMs: 180000 }
  );
  return res?.data || res;
}

export async function pickExpenseSheetExcelFile() {
  if (Platform.OS === "web") {
    return await new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const uri = URL.createObjectURL(file);
          resolve({ uri, name: file.name, mimeType: file.type || XLSM_MIME });
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = Array.isArray(res.assets) ? res.assets[0] : res;
  const uri = String(asset?.uri || "").trim();
  if (!uri) return null;
  return {
    uri,
    name: String(asset?.name || "hoja_gasto.xlsm").trim(),
    mimeType: String(asset?.mimeType || XLSM_MIME).trim(),
  };
}

export function formatImportPreviewSummary(preview) {
  const t = preview?.trabajador || {};
  const r = preview?.resumen || {};
  const plantilla = preview?.plantilla || "";
  let secciones;
  if (plantilla === "VEHICULOS_GREFA" || plantilla === "LIFE_VEHICULO_GREFA") {
    secciones = `viaje: ${r.lineas_viaje || r.combustibles || r.total_lineas || 0}`;
  } else if (plantilla === "OTROS_COSTES" || plantilla === "LIFE_OTROS_GASTOS") {
    secciones = `gastos: ${r.gastos || r.total_lineas || 0}`;
  } else if (plantilla === "LIFE_VEHICULO_PROPIO") {
    secciones = `rejilla: ${r.lineas_viaje || r.total_lineas || 0}`;
  } else {
    secciones = `4.1: ${r.desplazamientos || 0}, 4.2: ${r.dietas || 0}, 4.3: ${r.otros || 0}`;
  }
  const lines = [
    `Archivo: ${preview?.source_file_name || ""}`,
    `Plantilla: ${plantilla}`,
    `Trabajador: ${t.nombre || ""} (${t.dni || ""})`,
    t.puesto ? `Puesto: ${t.puesto}` : "",
    `Proyecto: ${t.proyecto_nombre || t.proyecto_texto || ""}`,
    `Líneas: ${r.total_lineas || 0} (${secciones})`,
    `Total estimado: ${Number(r.total_importe || 0).toFixed(2)} €`,
  ];
  const v = preview?.viaje || {};
  if (v.fecha_inicio || v.origen || v.motivo) {
    lines.push(
      `Viaje: ${v.fecha_inicio || "?"} → ${v.fecha_fin || "?"}` +
        (v.origen ? ` · ${v.origen}` : "") +
        (v.destino1 ? ` → ${v.destino1}` : "") +
        (v.destino2 ? ` → ${v.destino2}` : "") +
        (v.destino3 ? ` → ${v.destino3}` : "") +
        (v.destino4 ? ` → ${v.destino4}` : "") +
        (v.matricula ? ` · ${v.matricula}` : "") +
        (v.id_viaje ? ` · id ${v.id_viaje}` : "")
    );
  }
  if (preview?.titular_email) {
    lines.push(`Titular importación: ${preview.titular_email}`);
  }
  return lines.filter(Boolean).join("\n");
}
