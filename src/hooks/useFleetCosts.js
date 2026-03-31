import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  buildMonthlyVehicleReport,
  calculateExtraSummary,
  calculateFleetSummary,
  calculateRecordTotals,
  toNumber,
} from "../utils/calculations";
import { normalizeHeader } from "../utils/vehicles";

const STORAGE_KEY = "@flota:costes:v1";
const EXTRA_STORAGE_KEY = "@flota:extras:v1";
const VEHICLES_STORAGE_KEY = "@flota:vehiculos:v1";

export function useFleetCosts() {
  const [records, setRecords] = useState([]);
  const [extraRecords, setExtraRecords] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const savedExtra = await AsyncStorage.getItem(EXTRA_STORAGE_KEY);
        const savedVehicles = await AsyncStorage.getItem(VEHICLES_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRecords(parsed);
        }
        if (savedExtra) {
          const parsedExtra = JSON.parse(savedExtra);
          if (Array.isArray(parsedExtra)) setExtraRecords(parsedExtra);
        }
        if (savedVehicles) {
          const parsedVehicles = JSON.parse(savedVehicles);
          if (Array.isArray(parsedVehicles)) setVehiclesData(parsedVehicles);
        }
      } catch (error) {
        console.error("No se pudo cargar la flota", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    AsyncStorage.multiSet([
      [STORAGE_KEY, JSON.stringify(records)],
      [EXTRA_STORAGE_KEY, JSON.stringify(extraRecords)],
      [VEHICLES_STORAGE_KEY, JSON.stringify(vehiclesData)],
    ]).catch((error) => console.error("No se pudo guardar la flota", error));
  }, [records, extraRecords, vehiclesData, loading]);

  const summary = useMemo(() => {
    const totals = calculateFleetSummary(records);
    const extra = calculateExtraSummary(extraRecords);
    const avgCostPerKm = totals.totalKm > 0 ? totals.totalCost / totals.totalKm : 0;
    const avgLitersPer100Km = totals.totalKm > 0 ? (totals.totalLiters / totals.totalKm) * 100 : 0;
    return {
      ...totals,
      ...extra,
      totalGeneral: totals.totalCost + extra.totalExtra,
      avgCostPerKm,
      avgLitersPer100Km,
    };
  }, [records, extraRecords]);

  const monthlyReport = useMemo(
    () => buildMonthlyVehicleReport(records, extraRecords),
    [records, extraRecords]
  );

  const addRecord = (draft) => {
    const totals = calculateRecordTotals(draft);
    const newRecord = {
      id: Date.now().toString(),
      vehicle: draft.vehicle?.trim() || "Sin nombre",
      fuelType: draft.fuelType || "diesel",
      date: draft.date || new Date().toISOString(),
      notes: draft.notes?.trim() || "",
      ...totals,
    };
    setRecords((prev) => [newRecord, ...prev]);
  };

  const removeRecord = (id) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const addExtraRecord = (draft) => {
    const newRecord = {
      id: Date.now().toString(),
      vehicle: draft.vehicle?.trim() || "Sin nombre",
      type: draft.type || "maintenance",
      amount: toNumber(draft.amount),
      date: draft.date || new Date().toISOString(),
      notes: draft.notes?.trim() || "",
    };
    setExtraRecords((prev) => [newRecord, ...prev]);
  };

  const removeExtraRecord = (id) => {
    setExtraRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const saveVehicle = (draft, editingId) => {
    const vehiclePayload = {
      ...draft,
      id: editingId || Date.now().toString(),
      updatedAt: new Date().toISOString(),
    };
    setVehiclesData((prev) => {
      if (editingId) {
        return prev.map((v) => (v.id === editingId ? vehiclePayload : v));
      }
      return [vehiclePayload, ...prev];
    });
  };

  const removeVehicle = (id) => {
    setVehiclesData((prev) => prev.filter((v) => v.id !== id));
  };

  const importVehicles = (rows) => {
    const mapped = rows
      .map((row) => {
        const normalized = {};
        Object.keys(row || {}).forEach((key) => {
          normalized[normalizeHeader(key)] = row[key];
        });
        return {
          id: Date.now().toString() + Math.random().toString(16).slice(2, 8),
          matricula: normalized.matricula || "",
          fecha_matriculacion: normalized.fecha_matriculacion || "",
          marca: normalized.marca || "",
          modelo: normalized.modelo || "",
          combustible: normalized.combustible || "",
          propiedad: normalized.propiedad || "",
          departamento_o_proyecto: normalized.departamento_o_proyecto || "",
          responsable: normalized.responsable || "",
          itv_desde: normalized.itv_desde || "",
          itv_hasta: normalized.itv_hasta || "",
          aseguradora: normalized.aseguradora || "",
          poliza: normalized.poliza || "",
          email_de_notificaciones: normalized.e_mail_de_notificaciones || normalized.email_de_notificaciones || "",
          enlace_itv: normalized.enlace_itv || "",
          enlace_permiso: normalized.enlace_permiso || "",
          activo: normalized.activo || "SI",
          observaciones: normalized.observaciones || "",
          seguro_desde: normalized.seguro_desde || "",
          seguro_hasta: normalized.seguro_hasta || "",
          alerta_itv_enviada: normalized.alerta_itv_enviada || "",
          alerta_seguro_enviada: normalized.alerta_seguro_enviada || "",
          alerta_enviada: normalized.alerta_enviada || "",
          vencimiento_itv: normalized.vencimiento_itv || "",
          vencimiento_seguro: normalized.vencimiento_seguro || "",
          kilometro_actual: normalized.kilometro_actual || normalized.kilometro_actual || "",
          fecha_ultimo_mantenimiento: normalized.fecha_ultimo_mantenimiento || "",
          updatedAt: new Date().toISOString(),
        };
      })
      .filter((v) => v.matricula);

    setVehiclesData((prev) => {
      const byPlate = new Map(prev.map((v) => [v.matricula, v]));
      mapped.forEach((v) => byPlate.set(v.matricula, { ...byPlate.get(v.matricula), ...v }));
      return Array.from(byPlate.values());
    });
  };

  const clearAll = () => {
    setRecords([]);
    setExtraRecords([]);
    setVehiclesData([]);
  };

  return {
    records,
    extraRecords,
    vehiclesData,
    summary,
    monthlyReport,
    loading,
    addRecord,
    removeRecord,
    addExtraRecord,
    removeExtraRecord,
    saveVehicle,
    removeVehicle,
    importVehicles,
    clearAll,
  };
}
