import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatNumber } from "../utils/format";

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function SummaryCard({ summary, vehiclesCount }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Resumen de flota</Text>
      <View style={styles.row}>
        <Metric label="Vehiculos" value={String(vehiclesCount)} />
        <Metric label="Coste total" value={formatCurrency(summary.totalCost)} />
      </View>
      <View style={styles.row}>
        <Metric label="Mantenimiento" value={formatCurrency(summary.maintenance)} />
        <Metric label="Peajes" value={formatCurrency(summary.tolls)} />
      </View>
      <View style={styles.row}>
        <Metric label="Seguros" value={formatCurrency(summary.insurance)} />
        <Metric label="Total general" value={formatCurrency(summary.totalGeneral)} />
      </View>
      <View style={styles.row}>
        <Metric label="Kilometros" value={`${formatNumber(summary.totalKm, 0)} km`} />
        <Metric label="Litros" value={`${formatNumber(summary.totalLiters, 1)} L`} />
      </View>
      <View style={styles.row}>
        <Metric label="Coste / km" value={formatCurrency(summary.avgCostPerKm)} />
        <Metric label="Consumo medio" value={`${formatNumber(summary.avgLitersPer100Km)} L/100`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0d223a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f4f7f",
  },
  title: { color: "white", fontSize: 18, fontWeight: "700", marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  metric: {
    flex: 1,
    marginBottom: 8,
    backgroundColor: "#143456",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  metricLabel: { color: "#8fc8ff", fontSize: 12, marginBottom: 2 },
  metricValue: { color: "white", fontSize: 15, fontWeight: "700" },
});
