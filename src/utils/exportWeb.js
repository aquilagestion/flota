function escapeCsv(value) {
  const safe = String(value ?? "");
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getField(vehicle, field) {
  if (!vehicle) return "";
  const altMap = { "e-mail_de_notificaciones": "email_de_notificaciones" };
  const v = vehicle[field];
  if (v !== undefined && v !== null) return v;
  const alt = altMap[field];
  if (!alt) return "";
  const av = vehicle[alt];
  return av === undefined || av === null ? "" : av;
}

export function buildVehiclesCsvString(vehicles, fields) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const cols = Array.isArray(fields) && fields.length ? fields : [];
  const header = cols.join(",");
  const rows = list.map((v) => cols.map((f) => escapeCsv(getField(v, f))).join(","));
  return [header, ...rows].join("\n");
}

export function buildVehiclesHtml(vehicles, fields) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const cols = Array.isArray(fields) && fields.length ? fields : [];
  const headerCells = cols.map((f) => `<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">${escapeHtml(f)}</th>`).join("");
  const rowsHtml = list
    .map((v) => {
      const tds = cols.map((f) => `<td style="border:1px solid #eee;padding:5px">${escapeHtml(getField(v, f))}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Exportación flota</title>
  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:16px}table{border-collapse:collapse;width:100%}h2{margin:0 0 10px}</style>
  </head><body>
  <h2>Exportación de flota — ${list.length} vehículos</h2>
  <table><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table>
  </body></html>`;
}
