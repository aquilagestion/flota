import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatCurrency, formatNumber } from "./format";

function getUtf8Encoding_() {
  // expo-file-system en algunas builds no expone EncodingType
  return FileSystem.EncodingType && FileSystem.EncodingType.UTF8 ? FileSystem.EncodingType.UTF8 : null;
}

async function writeUtf8File_(fileUri, content) {
  const enc = getUtf8Encoding_();
  const opts = enc ? { encoding: enc } : undefined;
  return FileSystem.writeAsStringAsync(fileUri, content, opts);
}

function escapeCsv(value) {
  const safe = String(value ?? "");
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export async function exportReportAsCsv(rows) {
  const header = [
    "vehiculo",
    "mes",
    "combustible_eur",
    "mantenimiento_eur",
    "peajes_eur",
    "seguros_eur",
    "total_eur",
    "km",
    "coste_km_eur",
    "consumo_l_100",
  ];
  const lines = rows.map((row) =>
    [
      row.vehicle,
      row.month,
      formatNumber(row.fuelCost),
      formatNumber(row.maintenance),
      formatNumber(row.tolls),
      formatNumber(row.insurance),
      formatNumber(row.totalCost),
      formatNumber(row.km, 0),
      formatNumber(row.costPerKm),
      formatNumber(row.litersPer100Km),
    ]
      .map(escapeCsv)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const fileUri = `${FileSystem.cacheDirectory}reporte-flota-${Date.now()}.csv`;
  await writeUtf8File_(fileUri, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Exportar reporte CSV" });
  }
  return fileUri;
}

export async function exportReportAsPdf(rows) {
  const rowsHtml = rows
    .map(
      (row) => `
      <tr>
        <td>${row.vehicle}</td>
        <td>${row.month}</td>
        <td>${formatCurrency(row.fuelCost)}</td>
        <td>${formatCurrency(row.maintenance)}</td>
        <td>${formatCurrency(row.tolls)}</td>
        <td>${formatCurrency(row.insurance)}</td>
        <td>${formatCurrency(row.totalCost)}</td>
        <td>${formatNumber(row.km, 0)} km</td>
        <td>${formatCurrency(row.costPerKm)}</td>
      </tr>`
    )
    .join("");

  const html = `
    <html>
      <body style="font-family: Arial; padding: 20px;">
        <h2>Reporte mensual por vehiculo</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="border: 1px solid #ddd; padding: 8px;">Vehiculo</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Mes</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Combustible</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Mantenimiento</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Peajes</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Seguros</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Total</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Km</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Coste/km</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>`;

  // En algunos dispositivos/builds falla printToFileAsync al escribir el PDF.
  // Imprimimos directamente (diálogo del sistema) sin generar archivo.
  await Print.printAsync({ html });
  return null;
}

export async function exportVehicleTemplateCsv() {
  const header = [
    "matricula",
    "fecha_matriculacion",
    "marca",
    "modelo",
    "combustible",
    "propiedad",
    "departamento_o_proyecto",
    "responsable",
    "itv_desde",
    "itv_hasta",
    "aseguradora",
    "poliza",
    "email_de_notificaciones",
    "enlace_itv",
    "enlace_permiso",
    "activo",
    "observaciones",
    "seguro_desde",
    "seguro_hasta",
    "alerta_itv_enviada",
    "alerta_seguro_enviada",
    "alerta_enviada",
    "vencimiento_itv",
    "vencimiento_seguro",
    "kilometro_actual",
    "fecha_ultimo_mantenimiento",
  ];
  const sample = [
    "0000XXX",
    "2024-01-10",
    "Toyota",
    "Hilux",
    "DIESEL",
    "GREFA",
    "TOPILLOS",
    "Nombre Responsable",
    "2025-01-01",
    "2026-01-01",
    "MAPFRE",
    "POL-12345",
    "correo@dominio.com",
    "https://enlace-itv",
    "https://enlace-permiso",
    "SI",
    "Observaciones",
    "2025-01-01",
    "2026-01-01",
    "NO",
    "NO",
    "NO",
    "2026-01-01",
    "2026-01-01",
    "123456",
    "2025-02-20",
  ];
  const csv = [header.join(","), sample.map(escapeCsv).join(",")].join("\n");
  const fileUri = `${FileSystem.cacheDirectory}plantilla-vehiculos-${Date.now()}.csv`;
  await writeUtf8File_(fileUri, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Exportar plantilla CSV de vehiculos" });
  }
  return fileUri;
}

function getVehicleFieldValue_(vehicle, field) {
  if (!vehicle) return "";
  const altMap = {
    "e-mail_de_notificaciones": "email_de_notificaciones",
    "kilometro actual": "kilometro_actual",
    "fecha ultimo mantenimiento": "fecha_ultimo_mantenimiento",
  };
  const direct = vehicle[field];
  if (direct !== undefined && direct !== null) return direct;
  const altKey = altMap[field];
  if (!altKey) return "";
  const altVal = vehicle[altKey];
  return altVal === undefined || altVal === null ? "" : altVal;
}

export async function exportVehiclesAsCsv(vehicles, fields) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const exportFields = Array.isArray(fields) && fields.length ? fields : [];
  if (!exportFields.length) throw new Error("No hay campos seleccionados para exportar");

  const header = exportFields;
  const lines = list.map((v) =>
    exportFields
      .map((f) => escapeCsv(getVehicleFieldValue_(v, f)))
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const fileUri = `${FileSystem.cacheDirectory}flota-vehiculos-${Date.now()}.csv`;
  await writeUtf8File_(fileUri, csv);

  return fileUri;
}

function escapeHtml_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function exportVehiclesAsPdf(vehicles, fields) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const exportFields = Array.isArray(fields) && fields.length ? fields : [];
  if (!exportFields.length) throw new Error("No hay campos seleccionados para exportar");

  const headerCells = exportFields.map((f) => `<th>${escapeHtml_(f)}</th>`).join("");
  const rowsHtml = list
    .map((v) => {
      const tds = exportFields.map((f) => `<td>${escapeHtml_(getVehicleFieldValue_(v, f))}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const html = `
    <html>
      <body style="font-family: Arial; padding: 16px;">
        <h2 style="margin: 0 0 12px 0;">Exportación de flota</h2>
        <div style="margin-bottom: 12px; color: #666;">Filas: ${list.length}</div>
        <table style="border-collapse: collapse; width: 100%; font-size: 10px;">
          <thead>
            <tr style="background: #f2f2f2;">${headerCells}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `;

  await Print.printAsync({ html });
  return null;
}
