import AsyncStorage from "@react-native-async-storage/async-storage";

const memory = {
  vehicles: null,
};

const KEYS = {
  vehicles: "@flota:vehicles:v2",
  expenses: "@flota:expenses:v2",
  maint: "@flota:maint:v2",
  expenseSheets: "@flota:expenseSheets:v1",
  outbox: "@flota:outbox:v1",
  expensesDraft: "@flota:expensesDraft:v1",
  syncTargets: "@flota:syncTargets:v1",
};

async function getJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function setJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function sortVehiclesByMatricula_(list) {
  const rows = Array.isArray(list) ? list.slice() : [];
  rows.sort((a, b) => {
    const av = String(a?.matricula || "").trim().toUpperCase();
    const bv = String(b?.matricula || "").trim().toUpperCase();
    return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
  });
  return rows;
}

export const localDb = {
  getVehiclesMemory() {
    return Array.isArray(memory.vehicles) ? memory.vehicles : [];
  },
  async getVehicles() {
    if (Array.isArray(memory.vehicles)) return memory.vehicles;
    const list = await getJson(KEYS.vehicles, []);
    memory.vehicles = sortVehiclesByMatricula_(list);
    return memory.vehicles;
  },
  async setVehicles(list) {
    memory.vehicles = sortVehiclesByMatricula_(list);
    await setJson(KEYS.vehicles, memory.vehicles);
  },
  async getExpenses() {
    return await getJson(KEYS.expenses, []);
  },
  async setExpenses(list) {
    await setJson(KEYS.expenses, list);
  },
  async getMaintenances() {
    return await getJson(KEYS.maint, []);
  },
  async setMaintenances(list) {
    await setJson(KEYS.maint, list);
  },
  async getExpenseSheets() {
    return await getJson(KEYS.expenseSheets, []);
  },
  async setExpenseSheets(list) {
    await setJson(KEYS.expenseSheets, list);
  },
  async getOutbox() {
    return await getJson(KEYS.outbox, []);
  },
  async setOutbox(list) {
    await setJson(KEYS.outbox, list);
  },
  async getExpensesDraft() {
    return await getJson(KEYS.expensesDraft, null);
  },
  async setExpensesDraft(draft) {
    await setJson(KEYS.expensesDraft, draft);
  },
  async getSyncTargets() {
    return await getJson(KEYS.syncTargets, null);
  },
  async setSyncTargets(targets) {
    await setJson(KEYS.syncTargets, targets);
  },
};

