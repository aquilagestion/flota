const moneyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function formatCurrency(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return moneyFormatter.format(numeric);
}

export function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("es-ES");
}

export function formatNumber(value, decimals = 2) {
  const numeric = Number.isFinite(value) ? value : 0;
  return numeric.toFixed(decimals);
}
