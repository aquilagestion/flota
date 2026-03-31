import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import RecordForm from "./RecordForm";
import RecordItem from "./RecordItem";
import ExtraExpenseForm from "./ExtraExpenseForm";
import ExtraExpenseItem from "./ExtraExpenseItem";
import MonthlyReportCard from "./MonthlyReportCard";
import SummaryCard from "./SummaryCard";
import VehiclesModule from "./VehiclesModule";
import { useFleetCosts } from "../hooks/useFleetCosts";
import { exportReportAsCsv, exportReportAsPdf } from "../utils/export";
import { calculateExtraSummary, calculateFleetSummary } from "../utils/calculations";
import { vehicleLabel } from "../utils/vehicles";

const SCREENS = {
  MENU: "MENU",
  VEHICULOS: "VEHICULOS",
  GASTOS_MENU: "GASTOS_MENU",
  GASTOS_TIPO: "GASTOS_TIPO",
};

export default function FleetCostApp() {
  const [screen, setScreen] = useState(SCREENS.MENU);
  const [monthFilter, setMonthFilter] = useState("TODOS");
  const [vehicleFilter, setVehicleFilter] = useState("TODOS");
  const {
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
  } = useFleetCosts();

  const vehicleOptions = useMemo(() => vehiclesData.map((v) => vehicleLabel(v)), [vehiclesData]);
  const vehicles = useMemo(() => ["TODOS", ...vehicleOptions], [vehicleOptions]);
  const months = useMemo(() => ["TODOS", ...Array.from(new Set(monthlyReport.map((r) => r.month))).sort().reverse()], [monthlyReport]);
  const [reportVehicleFilter, setReportVehicleFilter] = useState("TODOS");
  const [expenseTypeScreen, setExpenseTypeScreen] = useState("maintenance");
  const EXPENSE_TYPES = [
    { id: "fuel", title: "Combustible" },
    { id: "maintenance", title: "Mantenimiento" },
    { id: "toll", title: "Peajes" },
    { id: "repair", title: "Reparaciones" },
    { id: "spare_parts", title: "Repuestos" },
    { id: "insurance", title: "Seguros" },
    { id: "parking", title: "Parking" },
    { id: "washing", title: "Lavado" },
    { id: "taxes", title: "Impuestos" },
    { id: "other", title: "Otros" },
  ];
  const filteredReport = useMemo(
    () =>
      monthlyReport.filter(
        (r) =>
          (monthFilter === "TODOS" || r.month === monthFilter) &&
          (reportVehicleFilter === "TODOS" || r.vehicle === reportVehicleFilter)
      ),
    [monthlyReport, monthFilter, reportVehicleFilter]
  );
  const filteredFuelRecords = useMemo(() => records, [records]);
  const filteredExtraRecords = useMemo(() => extraRecords, [extraRecords]);
  const filteredSummary = useMemo(() => {
    const totals = calculateFleetSummary(filteredFuelRecords);
    const extra = calculateExtraSummary(filteredExtraRecords);
    return {
      ...totals,
      ...extra,
      totalGeneral: totals.totalCost + extra.totalExtra,
      avgCostPerKm: totals.totalKm > 0 ? totals.totalCost / totals.totalKm : 0,
      avgLitersPer100Km: totals.totalKm > 0 ? (totals.totalLiters / totals.totalKm) * 100 : 0,
    };
  }, [filteredFuelRecords, filteredExtraRecords]);

  const confirmClearAll = () => {
    Alert.alert("Borrar todo", "Se eliminaran todos los registros de costes.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: clearAll },
    ]);
  };

  const exportCsv = async () => {
    try {
      await exportReportAsCsv(filteredReport);
    } catch (error) {
      Alert.alert("Error", "No se pudo exportar CSV.");
    }
  };

  const exportPdf = async () => {
    try {
      await exportReportAsPdf(filteredReport);
    } catch (error) {
      Alert.alert("Error", "No se pudo exportar PDF.");
    }
  };

  const Header = ({ title, actionLabel = "Menu", onAction = () => setScreen(SCREENS.MENU) }) => (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.backBtn} onPress={onAction}>
        <Text style={styles.backText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );

  const MenuCard = ({ title, subtitle, onPress }) => (
    <Pressable onPress={onPress} style={styles.menuCard}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </Pressable>
  );

  const FilterChips = ({ label, values, selected, onSelect }) => (
    <View style={styles.filterWrap}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {values.map((value) => (
            <Pressable
              key={`${label}-${value}`}
              onPress={() => onSelect(value)}
              style={[styles.chip, selected === value && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected === value && styles.chipTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  if (screen === SCREENS.MENU) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Costes de Flota</Text>
          </View>
          <Pressable style={styles.clearBtn} onPress={confirmClearAll}>
            <Text style={styles.clearText}>Limpiar datos</Text>
          </Pressable>
          <Text style={styles.subtitle}>Menu principal para acceder a todos los modulos.</Text>
          <MenuCard
            title="Vehiculos"
            subtitle="Consultar ficha de vehiculos y actualizar sus datos."
            onPress={() => setScreen(SCREENS.VEHICULOS)}
          />
          <MenuCard
            title="Gastos del vehiculo"
            subtitle="Submenu por tipo: peajes, reparaciones, repuestos y mas."
            onPress={() => setScreen(SCREENS.GASTOS_MENU)}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === SCREENS.VEHICULOS) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <VehiclesModule
          vehiclesData={vehiclesData}
          onSaveVehicle={saveVehicle}
          onRemoveVehicle={removeVehicle}
          onImportVehicles={importVehicles}
          onBackToMenu={() => setScreen(SCREENS.MENU)}
        />
      </SafeAreaView>
    );
  }

  if (screen === SCREENS.GASTOS_MENU) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <Header title="Gastos del vehiculo" actionLabel="Menu" onAction={() => setScreen(SCREENS.MENU)} />
          {EXPENSE_TYPES.map((type) => (
            <MenuCard
              key={type.id}
              title={type.title}
              subtitle={`Abrir modulo de ${type.title.toLowerCase()}.`}
              onPress={() => {
                setExpenseTypeScreen(type.id);
                setScreen(SCREENS.GASTOS_TIPO);
              }}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === SCREENS.GASTOS_TIPO) {
    const currentType = EXPENSE_TYPES.find((t) => t.id === expenseTypeScreen);
    const typedRecords = filteredExtraRecords.filter((r) => r.type === expenseTypeScreen);
    if (expenseTypeScreen === "fuel") {
      return (
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" />
          <FlatList
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              <>
                <Header title="Combustible" actionLabel="Submenu" onAction={() => setScreen(SCREENS.GASTOS_MENU)} />
                <SummaryCard summary={filteredSummary} vehiclesCount={filteredFuelRecords.length} />
                <RecordForm onSubmit={addRecord} vehicleOptions={vehicleOptions} />
                <Text style={styles.sectionTitle}>Registros</Text>
                {loading && <Text style={styles.message}>Cargando datos...</Text>}
                {!loading && records.length === 0 && (
                  <Text style={styles.message}>No hay registros. Crea el primero en el formulario.</Text>
                )}
                <Text style={styles.sectionTitle}>Reporte mensual por vehiculos</Text>
                <FilterChips label="Mes" values={months} selected={monthFilter} onSelect={setMonthFilter} />
                <FilterChips
                  label="Vehiculo (matricula | marca | modelo)"
                  values={vehicles}
                  selected={reportVehicleFilter}
                  onSelect={setReportVehicleFilter}
                />
                <View style={styles.exportRow}>
                  <Pressable style={styles.exportBtn} onPress={exportCsv}>
                    <Text style={styles.exportText}>Exportar CSV</Text>
                  </Pressable>
                  <Pressable style={styles.exportBtn} onPress={exportPdf}>
                    <Text style={styles.exportText}>Exportar PDF</Text>
                  </Pressable>
                </View>
                {filteredReport.map((row) => (
                  <MonthlyReportCard key={`${row.vehicle}-${row.month}`} row={row} />
                ))}
              </>
            }
            data={filteredFuelRecords}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RecordItem item={item} onDelete={removeRecord} />}
          />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <Header
            title={currentType?.title || "Gastos"}
            actionLabel="Submenu"
            onAction={() => setScreen(SCREENS.GASTOS_MENU)}
          />
          <ExtraExpenseForm onSubmit={addExtraRecord} vehicleOptions={vehicleOptions} fixedType={expenseTypeScreen} />
          <Text style={styles.sectionTitle}>Registros</Text>
          {typedRecords.map((item) => (
            <ExtraExpenseItem key={item.id} item={item} onDelete={removeExtraRecord} />
          ))}
          {typedRecords.length === 0 && <Text style={styles.message}>No hay registros para este tipo de gasto.</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071423" },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: "white", fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  subtitle: { color: "#9ec4e9", marginBottom: 14 },
  clearBtn: { borderColor: "#c96e6e", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  clearText: { color: "#ffadad", fontWeight: "700", fontSize: 12 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "700", fontSize: 12 },
  sectionTitle: { color: "white", fontWeight: "700", fontSize: 17, marginBottom: 8 },
  message: { color: "#9ec4e9", marginBottom: 8 },
  menuCard: {
    backgroundColor: "#0d223a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1f4f7f",
  },
  menuTitle: { color: "white", fontWeight: "800", fontSize: 17, marginBottom: 3 },
  menuSubtitle: { color: "#9ec4e9", fontSize: 13 },
  filterWrap: { marginBottom: 10 },
  filterLabel: { color: "white", fontWeight: "700", marginBottom: 6 },
  chipsRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderColor: "#376895",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipActive: { backgroundColor: "#2f6ba0", borderColor: "#5fb7ff" },
  chipText: { color: "#a8cae8", fontSize: 12 },
  chipTextActive: { color: "white", fontWeight: "700" },
  exportRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  exportBtn: {
    flex: 1,
    backgroundColor: "#1f7ae0",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  exportText: { color: "white", fontWeight: "700" },
});
