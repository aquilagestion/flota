import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

/** Casilla de selección visible en móvil (evita ○/✓ que a veces no se ven). */
export function ExpenseSelectMark({ selected, onPress, disabled, size = 24 }) {
  const boxStyle = { width: size, height: size, borderRadius: Math.max(4, size / 6) };
  return (
    <Pressable
      style={[styles.wrap, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
    >
      <View style={[styles.box, boxStyle, selected && styles.boxOn]}>
        {selected ? <Text style={[styles.tick, { fontSize: size * 0.62 }]}>X</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    minHeight: 36,
  },
  box: {
    borderWidth: 2,
    borderColor: theme.colors.primary || "#1b7f4e",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: {
    backgroundColor: theme.colors.primary || "#1b7f4e",
    borderColor: theme.colors.primary || "#1b7f4e",
  },
  tick: {
    color: "#fff",
    fontWeight: "900",
    lineHeight: 18,
  },
  disabled: { opacity: 0.45 },
});

/** Barra fija inferior cuando hay gastos seleccionados. */
export function ExpenseSelectionBar({ count, onClear, onDelete, deleteLabel = "Eliminar" }) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return (
    <View style={selectionBarStyles.bar}>
      <Text style={selectionBarStyles.count}>{n} seleccionado{n === 1 ? "" : "s"}</Text>
      <View style={selectionBarStyles.actions}>
        <Pressable style={selectionBarStyles.ghostBtn} onPress={onClear}>
          <Text style={selectionBarStyles.ghostText}>Limpiar</Text>
        </Pressable>
        <Pressable style={selectionBarStyles.deleteBtn} onPress={onDelete}>
          <Text style={selectionBarStyles.deleteText}>{deleteLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const expenseSelectionBarPadding = 92;

const selectionBarStyles = StyleSheet.create({
  bar: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    backgroundColor: theme.colors.card,
    borderTopWidth: 2,
    borderTopColor: theme.colors.primary || "#1b7f4e",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: Platform.OS === "web" ? 10000 : 20,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -4px 16px rgba(0,0,0,0.35)", cursor: "default" }
      : null),
  },
  count: { color: theme.colors.text, fontWeight: "800", fontSize: 15, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  ghostText: { color: theme.colors.subtext, fontWeight: "700", fontSize: 14 },
  deleteBtn: {
    backgroundColor: "#9b2c2c",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  deleteText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
