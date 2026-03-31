export function toNumber(input) {
  if (typeof input === "number") return input;
  if (!input) return 0;
  const parsed = Number(String(input).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateRecordTotals(record) {
  const liters = toNumber(record.liters);
  const totalCost = toNumber(record.totalCost);
  const km = toNumber(record.km);

  return {
    liters,
    totalCost,
    km,
    costPerKm: km > 0 ? totalCost / km : 0,
    litersPer100Km: km > 0 ? (liters / km) * 100 : 0,
  };
}

export function calculateFleetSummary(records) {
  return records.reduce(
    (acc, item) => {
      const row = calculateRecordTotals(item);
      acc.totalCost += row.totalCost;
      acc.totalKm += row.km;
      acc.totalLiters += row.liters;
      return acc;
    },
    { totalCost: 0, totalKm: 0, totalLiters: 0 }
  );
}

export function calculateExtraSummary(extraRecords) {
  return extraRecords.reduce(
    (acc, item) => {
      const amount = toNumber(item.amount);
      acc.totalExtra += amount;
      if (item.type === "maintenance") acc.maintenance += amount;
      if (item.type === "toll") acc.tolls += amount;
      if (item.type === "insurance") acc.insurance += amount;
      if (item.type === "repair") acc.repairs += amount;
      if (item.type === "spare_parts") acc.spareParts += amount;
      return acc;
    },
    { totalExtra: 0, maintenance: 0, tolls: 0, insurance: 0, repairs: 0, spareParts: 0 }
  );
}

export function buildMonthlyVehicleReport(fuelRecords, extraRecords) {
  const bucket = {};

  fuelRecords.forEach((item) => {
    const month = new Date(item.date).toISOString().slice(0, 7);
    const key = `${item.vehicle}__${month}`;
    if (!bucket[key]) {
      bucket[key] = {
        vehicle: item.vehicle,
        month,
        fuelCost: 0,
        km: 0,
        liters: 0,
        maintenance: 0,
        tolls: 0,
        insurance: 0,
      };
    }
    bucket[key].fuelCost += toNumber(item.totalCost);
    bucket[key].km += toNumber(item.km);
    bucket[key].liters += toNumber(item.liters);
  });

  extraRecords.forEach((item) => {
    const month = new Date(item.date).toISOString().slice(0, 7);
    const key = `${item.vehicle}__${month}`;
    if (!bucket[key]) {
      bucket[key] = {
        vehicle: item.vehicle,
        month,
        fuelCost: 0,
        km: 0,
        liters: 0,
        maintenance: 0,
        tolls: 0,
        insurance: 0,
      };
    }
    const amount = toNumber(item.amount);
    if (item.type === "maintenance") bucket[key].maintenance += amount;
    if (item.type === "toll") bucket[key].tolls += amount;
    if (item.type === "insurance") bucket[key].insurance += amount;
    if (item.type === "repair") bucket[key].maintenance += amount;
    if (item.type === "spare_parts") bucket[key].maintenance += amount;
  });

  return Object.values(bucket)
    .map((row) => {
      const extraCost = row.maintenance + row.tolls + row.insurance;
      const totalCost = row.fuelCost + extraCost;
      return {
        ...row,
        extraCost,
        totalCost,
        costPerKm: row.km > 0 ? totalCost / row.km : 0,
        litersPer100Km: row.km > 0 ? (row.liters / row.km) * 100 : 0,
      };
    })
    .sort((a, b) => `${b.month}-${b.vehicle}`.localeCompare(`${a.month}-${a.vehicle}`));
}
