import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatNumber } from "../utils/format";

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function MonthlyReportCard({ row }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {row.vehicle} - {row.month}
      </Text>
      <View style={styles.grid}>
        <Stat label="Combustible" value={formatCurrency(row.fuelCost)} />
        <Stat label="Mantenimiento" value={formatCurrency(row.maintenance)} />
        <Stat label="Peajes" value={formatCurrency(row.tolls)} />
        <Stat label="Seguros" value={formatCurrency(row.insurance)} />
        <Stat label="Total mes" value={formatCurrency(row.totalCost)} />
        <Stat label="Coste / km" value={formatCurrency(row.costPerKm)} />
        <Stat label="Km" value={`${formatNumber(row.km, 0)} km`} />
        <Stat label="Consumo" value={`${formatNumber(row.litersPer100Km)} L/100`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0c1f34",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f4f7f",
    padding: 12,
    marginBottom: 10,
  },
  title: { color: "white", fontWeight: "800", fontSize: 16, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48%", backgroundColor: "#12304e", borderRadius: 8, padding: 8 },
  statLabel: { color: "#8ab9e2", fontSize: 11 },
  statValue: { color: "white", fontWeight: "700", marginTop: 1, fontSize: 13 },
});
