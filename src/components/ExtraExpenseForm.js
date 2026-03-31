import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toNumber } from "../utils/calculations";
import VehicleDropdown from "./VehicleDropdown";

const TYPES = [
  { id: "maintenance", label: "Mantenimiento" },
  { id: "toll", label: "Peaje" },
  { id: "insurance", label: "Seguro" },
  { id: "repair", label: "Reparaciones" },
  { id: "spare_parts", label: "Repuestos" },
  { id: "parking", label: "Parking" },
  { id: "washing", label: "Lavado" },
  { id: "taxes", label: "Impuestos" },
  { id: "other", label: "Otros" },
];

const initialState = {
  vehicle: "",
  type: "maintenance",
  amount: "",
  notes: "",
};

export default function ExtraExpenseForm({ onSubmit, vehicleOptions = [], fixedType = null }) {
  const [form, setForm] = useState(initialState);
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!form.vehicle.trim()) {
      Alert.alert("Falta vehiculo", "Escribe el nombre o matricula.");
      return;
    }
    if (toNumber(form.amount) <= 0) {
      Alert.alert("Importe invalido", "El importe debe ser mayor que 0.");
      return;
    }
    const payload = fixedType ? { ...form, type: fixedType } : form;
    onSubmit(payload);
    setForm((prev) => ({ ...initialState, type: fixedType || prev.type || "maintenance" }));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Mantenimiento / Peajes / Seguros</Text>
      <TextInput
        style={styles.input}
        placeholder="Vehiculo (matricula | marca modelo)"
        placeholderTextColor="#6f90af"
        value={form.vehicle}
        onChangeText={(v) => update("vehicle", v)}
      />
      {vehicleOptions.length > 0 ? (
        <VehicleDropdown
          options={vehicleOptions}
          value={form.vehicle}
          onChange={(v) => update("vehicle", v)}
          placeholder="Seleccionar vehiculo"
        />
      ) : null}
      {!fixedType ? (
        <View style={styles.typeRow}>
          {TYPES.map((type) => (
            <Pressable
              key={type.id}
              onPress={() => update("type", type.id)}
              style={[styles.chip, form.type === type.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, form.type === type.id && styles.chipTextActive]}>
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="Importe EUR"
        placeholderTextColor="#6f90af"
        value={form.amount}
        onChangeText={(v) => update("amount", v)}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Notas (opcional)"
        placeholderTextColor="#6f90af"
        value={form.notes}
        onChangeText={(v) => update("notes", v)}
        multiline
      />
      <Pressable style={styles.button} onPress={submit}>
        <Text style={styles.buttonText}>Guardar gasto adicional</Text>
      </Pressable>
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
  input: {
    backgroundColor: "#132f4b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f4f7f",
    color: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  multiline: { minHeight: 74, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
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
  button: {
    marginTop: 6,
    backgroundColor: "#1f7ae0",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  buttonText: { color: "white", fontWeight: "700" },
});
