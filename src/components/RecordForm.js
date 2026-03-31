import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FUEL_TYPES } from "../constants/fuel";
import { toNumber } from "../utils/calculations";
import VehicleDropdown from "./VehicleDropdown";

const initialState = {
  vehicle: "",
  fuelType: "diesel",
  liters: "",
  totalCost: "",
  km: "",
  notes: "",
};

export default function RecordForm({ onSubmit, vehicleOptions = [] }) {
  const [form, setForm] = useState(initialState);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!form.vehicle.trim()) {
      Alert.alert("Falta vehiculo", "Escribe el nombre o matricula.");
      return;
    }
    if (toNumber(form.km) <= 0 || toNumber(form.totalCost) <= 0) {
      Alert.alert("Datos invalidos", "Kilometros y coste deben ser mayores que 0.");
      return;
    }
    onSubmit(form);
    setForm(initialState);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Nuevo registro</Text>
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
      <View style={styles.fuelRow}>
        {FUEL_TYPES.map((fuel) => (
          <Pressable
            key={fuel.id}
            onPress={() => update("fuelType", fuel.id)}
            style={[styles.fuelChip, form.fuelType === fuel.id && styles.fuelChipActive]}
          >
            <Text style={[styles.fuelChipText, form.fuelType === fuel.id && styles.fuelChipTextActive]}>
              {fuel.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          keyboardType="decimal-pad"
          placeholder="Litros"
          placeholderTextColor="#6f90af"
          value={form.liters}
          onChangeText={(v) => update("liters", v)}
        />
        <TextInput
          style={[styles.input, styles.half]}
          keyboardType="decimal-pad"
          placeholder="Coste total EUR"
          placeholderTextColor="#6f90af"
          value={form.totalCost}
          onChangeText={(v) => update("totalCost", v)}
        />
      </View>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="Kilometros recorridos"
        placeholderTextColor="#6f90af"
        value={form.km}
        onChangeText={(v) => update("km", v)}
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
        <Text style={styles.buttonText}>Guardar registro</Text>
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
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  multiline: { minHeight: 74, textAlignVertical: "top" },
  fuelRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  fuelChip: {
    borderColor: "#376895",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  fuelChipActive: { backgroundColor: "#2f6ba0", borderColor: "#5fb7ff" },
  fuelChipText: { color: "#a8cae8", fontSize: 12 },
  fuelChipTextActive: { color: "white", fontWeight: "700" },
  button: {
    marginTop: 6,
    backgroundColor: "#1f7ae0",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  buttonText: { color: "white", fontWeight: "700" },
});
