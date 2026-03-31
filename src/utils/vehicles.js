export function vehicleLabel(vehicle) {
  const plate = vehicle?.matricula || "SIN-MATRICULA";
  const brand = vehicle?.marca || "";
  const model = vehicle?.modelo || "";
  return `${plate} | ${brand} ${model}`.trim();
}

export function normalizeHeader(header) {
  return String(header || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
