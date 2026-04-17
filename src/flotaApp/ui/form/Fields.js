import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { theme } from "../theme";

function formatDateYmd(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeHm(d) {
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function FieldLabel({ label, required }) {
  return (
    <Text style={styles.label}>
      {label} {required ? <Text style={{ color: "#ffadad" }}>*</Text> : null}
    </Text>
  );
}

export function TextField({ label, required, value, onChangeText, placeholder, keyboardType = "default", multiline, ...rest }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} />
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        placeholder={placeholder || label}
        placeholderTextColor={theme.colors.placeholder}
        value={value || ""}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={!!multiline}
        {...rest}
      />
    </View>
  );
}

export function SelectField({ label, required, value, onChange, options = [], placeholder = "Seleccionar..." }) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    if (!value) return placeholder;
    const selected = options.find((opt) => String(opt?.value) === String(value));
    return String(selected?.label || value);
  }, [value, placeholder, options]);

  return (
    <View style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} />
      <Pressable onPress={() => setOpen(true)} style={styles.select}>
        <Text style={[styles.selectText, !value && styles.placeholder]} numberOfLines={1}>
          {shown}
        </Text>
        <Text style={styles.caret}>▼</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  style={[styles.modalOption, value === opt.value && styles.modalOptionActive]}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, value === opt.value && styles.modalOptionTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setOpen(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DateField({ label, required, value, onChange }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value) : null;
  const display = parsed && !Number.isNaN(parsed.getTime()) ? formatDateYmd(parsed) : "";

  return (
    <View style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} />
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !display && styles.placeholder]}>{display || "YYYY-MM-DD"}</Text>
        <Text style={styles.caret}>📅</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()}
          mode="date"
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange(formatDateYmd(d));
          }}
        />
      ) : null}
    </View>
  );
}

export function TimeField({ label, required, value, onChange }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(`1970-01-01T${value}:00`) : null;
  const display = parsed && !Number.isNaN(parsed.getTime()) ? formatTimeHm(parsed) : value || "";

  return (
    <View style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} />
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !display && styles.placeholder]}>{display || "HH:mm"}</Text>
        <Text style={styles.caret}>⏱</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()}
          mode="time"
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange(formatTimeHm(d));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 86, textAlignVertical: "top" },
  select: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectText: { color: theme.colors.text, flex: 1, marginRight: 10 },
  placeholder: { color: theme.colors.placeholder },
  caret: { color: theme.colors.subtext },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  modalOption: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  modalOptionActive: { backgroundColor: theme.colors.chipActive },
  modalOptionText: { color: "#d6ebff", fontWeight: "700" },
  modalOptionTextActive: { color: theme.colors.text },
  modalClose: { marginTop: 10, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  modalCloseText: { color: "#b7ddff", fontWeight: "800" },
});

