import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatDate } from "../utils/format";

const TYPE_LABEL = {
  maintenance: "Mantenimiento",
  toll: "Peaje",
  insurance: "Seguro",
  repair: "Reparaciones",
  spare_parts: "Repuestos",
  parking: "Parking",
  washing: "Lavado",
  taxes: "Impuestos",
  other: "Otros",
};

export default function ExtraExpenseItem({ item, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.vehicle}>{item.vehicle}</Text>
          <Text style={styles.meta}>
            {formatDate(item.date)} - {TYPE_LABEL[item.type] || item.type}
          </Text>
        </View>
        <Pressable onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </Pressable>
      </View>
      <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
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
  amount: { color: "white", fontSize: 22, fontWeight: "800", marginBottom: 3 },
  notes: { color: "#d3e7fb", marginTop: 4, fontSize: 12 },
  deleteBtn: {
    alignSelf: "flex-start",
    borderColor: "#c96e6e",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteText: { color: "#ffadad", fontSize: 12, fontWeight: "700" },
});
