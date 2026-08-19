import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

/**
 * Lista numerada de opciones para el asistente de voz (toque o número por voz).
 * @param {{ value: string, label: string }[]} options
 * @param {(opt: { value: string, label: string }) => void} onPick
 * @param {boolean} [disabled]
 * @param {number} [maxHeight]
 */
export default function VoiceSelectOptionList({ options = [], onPick, disabled = false, maxHeight = 200 }) {
  const rows = useMemo(
    () =>
      (Array.isArray(options) ? options : []).map((opt, i) => ({
        ...opt,
        num: i + 1,
      })),
    [options]
  );

  if (!rows.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Sin coincidencias. Prueba otra palabra o borra el filtro.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.list, { maxHeight }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {rows.map((row) => (
        <Pressable
          key={`${row.value}-${row.num}`}
          style={[styles.row, disabled && styles.rowDisabled]}
          onPress={() => !disabled && onPick?.({ value: row.value, label: row.label })}
          disabled={disabled}
        >
          <Text style={styles.num}>{row.num}</Text>
          <Text style={styles.label} numberOfLines={2} ellipsizeMode="tail">
            {row.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.card2,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowDisabled: { opacity: 0.55 },
  num: {
    color: "#b7ddff",
    fontWeight: "900",
    fontSize: 13,
    minWidth: 22,
    textAlign: "center",
  },
  label: { color: theme.colors.text, fontSize: 13, flex: 1, flexShrink: 1 },
  emptyBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.card2,
    padding: 10,
    marginBottom: 6,
  },
  emptyText: { color: theme.colors.subtext, fontSize: 12, fontStyle: "italic", lineHeight: 17 },
});
