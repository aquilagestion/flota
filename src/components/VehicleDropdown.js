import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function VehicleDropdown({
  options = [],
  value = "",
  onChange,
  placeholder = "Seleccionar vehiculo",
}) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => (value ? value : placeholder), [value, placeholder]);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.control} onPress={() => setOpen((v) => !v)}>
        <Text style={[styles.controlText, !value && styles.placeholder]} numberOfLines={1}>
          {shown}
        </Text>
        <Text style={styles.caret}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <ScrollView style={styles.menu} nestedScrollEnabled>
          {options.map((item) => (
            <Pressable
              key={item}
              style={[styles.option, value === item && styles.optionActive]}
              onPress={() => {
                onChange(item);
                setOpen(false);
              }}
            >
              <Text style={[styles.optionText, value === item && styles.optionTextActive]} numberOfLines={1}>
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  control: {
    backgroundColor: "#132f4b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f4f7f",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlText: { color: "white", flex: 1, marginRight: 8 },
  placeholder: { color: "#6f90af" },
  caret: { color: "#9ec4e9", fontSize: 12 },
  menu: {
    maxHeight: 180,
    marginTop: 6,
    backgroundColor: "#0f2740",
    borderWidth: 1,
    borderColor: "#1f4f7f",
    borderRadius: 10,
  },
  option: { paddingVertical: 10, paddingHorizontal: 12 },
  optionActive: { backgroundColor: "#2f6ba0" },
  optionText: { color: "#d6ebff" },
  optionTextActive: { color: "white", fontWeight: "700" },
});
