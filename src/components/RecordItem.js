import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatDate, formatNumber } from "../utils/format";

function Mini({ label, value }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

export default function RecordItem({ item, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.vehicle}>{item.vehicle}</Text>
          <Text style={styles.meta}>
            {formatDate(item.date)} - {item.fuelType}
          </Text>
        </View>
        <Pressable onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Mini label="Coste total" value={formatCurrency(item.totalCost)} />
        <Mini label="Kilometros" value={`${formatNumber(item.km, 0)} km`} />
      </View>
      <View style={styles.row}>
        <Mini label="Coste/km" value={formatCurrency(item.costPerKm)} />
        <Mini label="Consumo" value={`${formatNumber(item.litersPer100Km)} L/100`} />
      </View>
      {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
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
  header: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  vehicle: { color: "white", fontWeight: "700", fontSize: 16 },
  meta: { color: "#9ac8ef", fontSize: 12, marginTop: 2 },
  deleteBtn: {
    alignSelf: "flex-start",
    borderColor: "#c96e6e",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteText: { color: "#ffadad", fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8, marginBottom: 6 },
  mini: { flex: 1, backgroundColor: "#12304e", borderRadius: 8, padding: 8 },
  miniLabel: { color: "#8ab9e2", fontSize: 11 },
  miniValue: { color: "white", fontWeight: "700", marginTop: 1, fontSize: 13 },
  notes: { color: "#d3e7fb", marginTop: 4, fontSize: 12 },
});
