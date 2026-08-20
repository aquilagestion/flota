import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { theme } from "../theme";
import { useExpenseFieldVoiceProps } from "../ExpenseFieldVoiceProvider";
import { registerVoiceFieldAnchor, voiceFieldAnchorProps } from "../../../flotaWeb/lib/expenseVoiceFieldScroll";
import { dateObjectToDmy, normalizeDateToDmy, parseDateFlexible } from "../../../flotaWeb/lib/format";

/** Solo para <input type="date"> (el valor HTML exige yyyy-mm-dd). */
function formatDateYmd(d) {
  if (!d || !Number.isFinite(d.getTime())) return "";
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

/** Acepta dd/mm/aaaa, yyyy-mm-dd, ISO o Date. */
function parseDateValue_(value) {
  return parseDateFlexible(value);
}

const DATE_MIN_ = new Date(2000, 0, 1);
const DATE_MAX_ = new Date(2100, 11, 31);

function parseTimeValue_(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(1970, 0, 1, Number(m[1]), Number(m[2]), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSelectSearch_(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function useVoiceFieldAnchor_(voiceKey) {
  const anchorRef = useRef(null);
  const key = String(voiceKey || "").trim();
  useEffect(() => {
    if (!key) return undefined;
    return registerVoiceFieldAnchor(key, anchorRef);
  }, [key]);
  return anchorRef;
}

/** Escala tipográfica opcional (p. ej. pantallas web de solicitudes). */
function textScaleStyle_(baseStyle, textScale) {
  const f = Number(textScale);
  if (!f || f === 1 || Number.isNaN(f)) return null;
  const flat = StyleSheet.flatten(baseStyle) || {};
  const out = {};
  if (typeof flat.fontSize === "number") out.fontSize = flat.fontSize * f;
  if (typeof flat.lineHeight === "number") out.lineHeight = flat.lineHeight * f;
  return out;
}

export function FieldLabel({ label, required, voice, textScale = 1 }) {
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, textScaleStyle_(styles.label, textScale)]}>
        {label} {required ? <Text style={{ color: "#ffadad" }}>*</Text> : null}
      </Text>
      {voice?.voiceEnabled ? (
        <Pressable
          onPress={voice.voiceOnPress}
          style={[styles.micBtn, voice.voiceActive && styles.micBtnActive]}
          accessibilityLabel={`Rellenar ${label} por voz`}
        >
          <Text style={[styles.micIcon, textScaleStyle_(styles.micIcon, textScale)]}>🎤</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline,
  voiceKey,
  textScale = 1,
  ...rest
}) {
  const shown = value === undefined || value === null ? "" : String(value);
  const voice = useExpenseFieldVoiceProps(voiceKey);
  const anchorRef = useVoiceFieldAnchor_(voiceKey);
  return (
    <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} voice={voice} textScale={textScale} />
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          rest.editable === false && styles.inputReadonly,
          textScaleStyle_(styles.input, textScale),
        ]}
        placeholder={placeholder || label}
        placeholderTextColor={theme.colors.placeholder}
        value={shown}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={!!multiline}
        {...rest}
      />
    </View>
  );
}

export function SelectField({ label, required, value, onChange, options = [], placeholder = "Seleccionar...", voiceKey, textScale = 1 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const voice = useExpenseFieldVoiceProps(voiceKey);
  const anchorRef = useVoiceFieldAnchor_(voiceKey);
  const valueKey = value === undefined || value === null ? "" : String(value);
  const hasValue = valueKey !== "";
  const shown = useMemo(() => {
    if (!hasValue) return placeholder;
    const selected = options.find((opt) => String(opt?.value) === valueKey);
    return String(selected?.label || valueKey);
  }, [hasValue, valueKey, placeholder, options]);

  const filteredOptions = useMemo(() => {
    const q = normalizeSelectSearch_(query);
    if (!q) return options;
    return (Array.isArray(options) ? options : []).filter((opt) => {
      const label = normalizeSelectSearch_(opt?.label);
      const val = normalizeSelectSearch_(opt?.value);
      return label.includes(q) || val.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return undefined;
    }
    const t = setTimeout(() => {
      try {
        searchRef.current?.focus?.();
      } catch {
        /* focus opcional */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} voice={voice} textScale={textScale} />
      <Pressable onPress={() => setOpen(true)} style={styles.select}>
        <Text style={[styles.selectText, !hasValue && styles.placeholder, textScaleStyle_(styles.selectText, textScale)]} numberOfLines={1}>
          {shown}
        </Text>
        <Text style={[styles.caret, textScaleStyle_(styles.caret, textScale)]}>▼</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.modalBackdrop} onPress={close}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={[styles.modalTitle, textScaleStyle_(styles.modalTitle, textScale)]}>{label}</Text>
            <TextInput
              ref={searchRef}
              style={[styles.selectSearch, textScaleStyle_(styles.selectSearch, textScale)]}
              placeholder="Escribe para filtrar..."
              placeholderTextColor={theme.colors.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {filteredOptions.length ? (
                filteredOptions.map((opt, idx) => {
                  const optKey = String(opt?.value);
                  const active = valueKey === optKey;
                  return (
                    <Pressable
                      key={`${optKey}::${idx}`}
                      style={[styles.modalOption, active && styles.modalOptionActive]}
                      onPress={() => {
                        onChange(opt.value);
                        close();
                      }}
                    >
                      <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive, textScaleStyle_(styles.modalOptionText, textScale)]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.selectSearchEmpty}>Sin coincidencias</Text>
              )}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={close}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DateField({ label, required, value, onChange, voiceKey }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const voice = useExpenseFieldVoiceProps(voiceKey);
  const anchorRef = useVoiceFieldAnchor_(voiceKey);
  const fileRef = useRef(null);
  const parsed = parseDateValue_(value);
  const displayDmy = normalizeDateToDmy(value) || "";
  const ymdForPicker = parsed ? formatDateYmd(parsed) : "";

  useEffect(() => {
    setDraft(displayDmy);
  }, [displayDmy]);

  const commitDmy_ = (raw) => {
    const s = String(raw || "").trim();
    if (!s) {
      onChange?.("");
      setDraft("");
      return;
    }
    const normalized = normalizeDateToDmy(s);
    if (normalized && /^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
      onChange?.(normalized);
      setDraft(normalized);
      return;
    }
    // Mantener lo escrito si aún no es parseable (p. ej. mientras teclean).
    setDraft(s);
  };

  if (Platform.OS === "web") {
    return (
      <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
        <FieldLabel label={label} required={required} voice={voice} />
        <View style={styles.select}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }]}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={theme.colors.placeholder}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              const cleaned = String(t || "").trim();
              if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
                const n = normalizeDateToDmy(cleaned);
                if (n && /^\d{2}\/\d{2}\/\d{4}$/.test(n)) onChange?.(n);
              }
            }}
            onBlur={() => commitDmy_(draft)}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.datePickerHit}>
            <Text style={styles.caret}>📅</Text>
            {React.createElement("input", {
              ref: (el) => {
                fileRef.current = el;
              },
              type: "date",
              value: ymdForPicker || "",
              min: "2000-01-01",
              max: "2100-12-31",
              onChange: (e) => {
                const ymd = String(e?.target?.value || "").trim();
                if (!ymd) {
                  onChange?.("");
                  setDraft("");
                  return;
                }
                const d = parseDateValue_(ymd);
                const dmy = d ? dateObjectToDmy(d) : normalizeDateToDmy(ymd);
                if (dmy && /^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) {
                  onChange?.(dmy);
                  setDraft(dmy);
                }
              },
              style: {
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
                border: "none",
                padding: 0,
                margin: 0,
              },
              title: "Elegir fecha",
            })}
          </View>
        </View>
      </View>
    );
  }

  const pickerValue =
    parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() >= DATE_MIN_.getTime() && parsed.getTime() <= DATE_MAX_.getTime()
      ? parsed
      : new Date();

  return (
    <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} voice={voice} />
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !displayDmy && styles.placeholder]}>{displayDmy || "dd/mm/aaaa"}</Text>
        <Text style={styles.caret}>📅</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={DATE_MIN_}
          maximumDate={DATE_MAX_}
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange?.(dateObjectToDmy(d));
          }}
        />
      ) : null}
    </View>
  );
}

export function TimeField({ label, required, value, onChange, voiceKey }) {
  const [open, setOpen] = useState(false);
  const voice = useExpenseFieldVoiceProps(voiceKey);
  const anchorRef = useVoiceFieldAnchor_(voiceKey);
  const parsed = parseTimeValue_(value);
  const display = parsed ? formatTimeHm(parsed) : String(value || "").trim();

  if (Platform.OS === "web") {
    return (
      <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
        <FieldLabel label={label} required={required} voice={voice} />
        <View style={styles.select}>
          {React.createElement("input", {
            type: "time",
            value: display,
            onChange: (e) => {
              const next = String(e?.target?.value || "").trim();
              onChange?.(next);
            },
            style: {
              flex: 1,
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              color: theme.colors.text,
              fontSize: 14,
              fontWeight: 600,
              padding: 0,
              margin: 0,
              minHeight: 22,
              cursor: "pointer",
            },
          })}
          <Text style={styles.caret}>⏱</Text>
        </View>
      </View>
    );
  }

  return (
    <View ref={anchorRef} {...voiceFieldAnchorProps(voiceKey)} style={{ marginBottom: 10 }}>
      <FieldLabel label={label} required={required} voice={voice} />
      <Pressable style={styles.select} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !display && styles.placeholder]}>{display || "HH:mm"}</Text>
        <Text style={styles.caret}>⏱</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parsed || new Date()}
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
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label: { color: theme.colors.text, fontWeight: "800", fontSize: 14 },
  micBtn: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  micBtnActive: { backgroundColor: "#2f6ba0", borderColor: "#5fb7ff" },
  micIcon: { fontSize: 13 },
  input: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputReadonly: {
    color: theme.colors.text,
    opacity: 1,
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
  selectText: { color: theme.colors.text, flex: 1, marginRight: 10, fontSize: 15 },
  placeholder: { color: theme.colors.placeholder },
  caret: { color: theme.colors.subtext, fontSize: 14 },
  datePickerHit: { width: 28, height: 28, alignItems: "center", justifyContent: "center", position: "relative" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  selectSearch: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    fontSize: 15,
  },
  selectSearchEmpty: {
    color: theme.colors.subtext,
    fontWeight: "600",
    paddingVertical: 14,
    paddingHorizontal: 10,
    textAlign: "center",
    fontSize: 14,
  },
  modalOption: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  modalOptionActive: { backgroundColor: theme.colors.chipActive },
  modalOptionText: { color: "#d6ebff", fontWeight: "700", fontSize: 15 },
  modalOptionTextActive: { color: theme.colors.text },
  modalClose: { marginTop: 10, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  modalCloseText: { color: "#b7ddff", fontWeight: "800", fontSize: 14 },
});
