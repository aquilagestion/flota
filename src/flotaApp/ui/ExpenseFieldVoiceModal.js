import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "./theme";
import {
  fieldUsesFilterFirstVoiceSelect,
  filterVoiceSelectOptions,
  tryPickVoiceSelectOption,
  voiceSelectOptionsForField,
  VOICE_SELECT_CANDIDATE_CAP,
  VOICE_SELECT_FILTER_MIN_LEN,
} from "../lib/expenseVoiceFilterSelect";
import {
  isVoiceNextCommand,
  isVoiceSkipCommand,
  parseVoiceTranscript,
  stripPromptEchoFromTranscript,
  tryPickByVoiceIndex,
  tryQuickNumberedMenuPick,
} from "../lib/expenseVoiceParse";
import {
  fieldUsesNumberedVoiceMenu,
  numberedOptionLabelsForField,
  numberedOptionValuesForField,
} from "../lib/expenseVoiceNumberedSelect";
import {
  ensureExpenseVoicePermissions,
  startExpenseVoiceListen,
  stopExpenseVoiceListen,
} from "../lib/expenseVoiceSpeech";
import { stopExpenseVoiceSpeak, speakExpenseVoicePrompt } from "../lib/expenseVoiceTts";
import VoiceSelectOptionList from "./VoiceSelectOptionList";
import { voiceRecordMaxMsForField, voiceSilenceMsForField } from "../../flotaWeb/lib/expenseVoiceTiming";
import {
  resolveVoiceMatriculaFromSpeech_,
  validateVoiceMatriculaForField,
  VOICE_MATRICULA_INVALID_PROMPT,
} from "../../flotaWeb/lib/expenseVoiceMatricula";

const LISTEN_SETTLE_MS = 700;

export default function ExpenseFieldVoiceModal({ visible, field, onClose, onApply }) {
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [filterText, setFilterText] = useState("");
  const [confirmOption, setConfirmOption] = useState(null);
  const [permError, setPermError] = useState("");

  const runIdRef = useRef(0);
  const stopListenRef = useRef(null);
  const cycleRef = useRef(null);
  const activeModalKeyRef = useRef("");
  const transcriptRef = useRef("");

  const isSelect = String(field?.kind || "") === "select" || field?.key === "iva_pct";
  const useFilterSelect = fieldUsesFilterFirstVoiceSelect(field);
  const allOptions = useMemo(() => voiceSelectOptionsForField(field), [field]);
  const filteredOptions = useMemo(
    () => filterVoiceSelectOptions(allOptions, filterText),
    [allOptions, filterText]
  );

  const cleanupListen_ = useCallback(() => {
    if (stopListenRef.current) {
      stopListenRef.current();
      stopListenRef.current = null;
    }
    stopExpenseVoiceListen();
    stopExpenseVoiceSpeak();
  }, []);

  const finishApply_ = useCallback(
    (value, raw) => {
      const v = String(value || "").trim();
      if (!v || !field) return;
      cleanupListen_();
      onApply?.(field.key, v);
      setTranscript(String(raw || v));
    },
    [cleanupListen_, field, onApply]
  );

  useEffect(() => {
    if (!visible || !field) return undefined;
    const fieldKey = String(field.key || "");
    if (!fieldKey) return undefined;
    if (activeModalKeyRef.current === fieldKey) return undefined;
    activeModalKeyRef.current = fieldKey;

    let cancelled = false;
    const runId = ++runIdRef.current;

    const cycle = {
      runId,
      resolved: false,
      hadSpeech: false,
      pendingValue: "",
      lastTranscript: "",
      fieldTimer: null,
      silenceTimer: null,
    };
    cycleRef.current = cycle;

    const clearFieldTimers_ = () => {
      if (cycle.fieldTimer) {
        clearTimeout(cycle.fieldTimer);
        cycle.fieldTimer = null;
      }
      if (cycle.silenceTimer) {
        clearTimeout(cycle.silenceTimer);
        cycle.silenceTimer = null;
      }
    };

    const resolveCycle_ = () => cycle.resolved || cancelled || runIdRef.current !== runId;

    const finishFromTimers_ = () => {
      if (resolveCycle_()) return;
      const raw = String(cycle.lastTranscript || transcriptRef.current || "").trim();
      let v = String(cycle.pendingValue || "").trim();
      if (!v && raw) v = trySelectPick_(raw);
      void commitValue_(v, raw);
    };

    const scheduleSilenceTimer_ = () => {
      if (!cycle.hadSpeech || resolveCycle_()) return;
      if (cycle.silenceTimer) clearTimeout(cycle.silenceTimer);
      cycle.silenceTimer = setTimeout(() => {
        cycle.silenceTimer = null;
        finishFromTimers_();
      }, voiceSilenceMsForField(field));
    };

    const trySelectPick_ = (txt) => {
      if (String(field?.key || "") === "matricula" && field?.options?.length) {
        const fromList = resolveVoiceMatriculaFromSpeech_(txt, txt, field.options);
        if (fromList) return fromList;
      }
      if (useFilterSelect) {
        const list = filterVoiceSelectOptions(allOptions, filterText);
        if (field?.key === "departamento_o_proyecto") {
          const byFull = tryQuickNumberedMenuPick(field, txt);
          if (byFull) return byFull;
        }
        const pick = tryPickVoiceSelectOption(txt, list, field);
        if (pick) return pick.value;
      }
      if (fieldUsesNumberedVoiceMenu(field)) {
        const quick = tryQuickNumberedMenuPick(field, txt);
        if (quick) return quick;
        const relaxed = tryPickByVoiceIndex(txt, numberedOptionLabelsForField(field), numberedOptionValuesForField(field));
        if (relaxed) return relaxed;
      }
      return parseVoiceTranscript(field, txt) || "";
    };

    const finishApplyOrClose_ = (value, raw) => {
      if (resolveCycle_()) return;
      cycle.resolved = true;
      clearFieldTimers_();
      cleanupListen_();
      setPhase("idle");
      const v = String(value || "").trim();
      if (v) finishApply_(v, raw);
      else onClose?.();
    };

    const commitValue_ = async (value, raw) => {
      if (resolveCycle_()) return;
      const v = String(value || "").trim();
      if (!v) {
        finishApplyOrClose_("", raw);
        return;
      }
      const check = validateVoiceMatriculaForField(field, v, raw);
      if (!check.ok) {
        if (String(field?.key || "") === "matricula") {
          setErrorMsg("La matrícula no está en la lista de vehículos.");
          await retryMatriculaListen_();
        } else {
          setErrorMsg("No reconozco ese valor. Prueba de nuevo.");
        }
        return;
      }
      finishApplyOrClose_(check.value, raw);
    };

    const beginListening_ = () => {
      if (resolveCycle_()) return;
      setPhase("listening");
      stopListenRef.current = startExpenseVoiceListen({
        continuous: true,
        autoRestart: true,
        onResult: ({ transcript: tr, isFinal }) => {
          const t = String(tr || "").trim();
          if (!t || resolveCycle_()) return;
          if (tryStandardCommand_(t)) return;
          cycle.hadSpeech = true;
          transcriptRef.current = t;
          if (!isFinal) {
            setTranscript(t);
            scheduleSilenceTimer_();
            return;
          }
          onFieldSpeech_(t);
        },
        onError: (ev) => {
          const code = String(ev?.error || "").trim();
          if (code && code !== "aborted" && code !== "no-speech") {
            setErrorMsg(`Error de reconocimiento: ${code}`);
          }
        },
      });

      cycle.fieldTimer = setTimeout(() => {
        cycle.fieldTimer = null;
        if (resolveCycle_()) return;
        if (!cycle.hadSpeech) finishApplyOrClose_("", "");
        else finishFromTimers_();
      }, voiceRecordMaxMsForField(field));
    };

    const retryMatriculaListen_ = async () => {
      if (resolveCycle_()) return;
      clearFieldTimers_();
      if (stopListenRef.current) {
        stopListenRef.current();
        stopListenRef.current = null;
      }
      stopExpenseVoiceListen();
      cycle.hadSpeech = false;
      cycle.pendingValue = "";
      cycle.lastTranscript = "";
      transcriptRef.current = "";
      setTranscript("");
      setFilterText("");
      setConfirmOption(null);

      setPhase("speaking");
      stopExpenseVoiceSpeak();
      await speakExpenseVoicePrompt(VOICE_MATRICULA_INVALID_PROMPT);
      if (resolveCycle_()) return;
      await new Promise((resolve) => setTimeout(resolve, LISTEN_SETTLE_MS));
      if (resolveCycle_()) return;
      beginListening_();
    };

    const tryStandardCommand_ = (txt) => {
      const t = String(txt || "").trim();
      if (!t) return false;
      if (isVoiceSkipCommand(t)) {
        finishApplyOrClose_("", t);
        return true;
      }
      if (isVoiceNextCommand(t)) {
        const v = String(cycle.pendingValue || "").trim() || trySelectPick_(t);
        void commitValue_(v, t);
        return true;
      }
      return false;
    };

    const onFieldSpeech_ = (txt) => {
      if (resolveCycle_()) return;
      const rawTxt = String(txt || "").trim();
      if (!rawTxt) return;
      if (tryStandardCommand_(rawTxt)) return;

      const cleaned = stripPromptEchoFromTranscript(field, rawTxt) || rawTxt;
      cycle.hadSpeech = true;
      cycle.lastTranscript = cleaned;
      transcriptRef.current = cleaned;
      setTranscript(cleaned);

      if (isSelect && useFilterSelect) {
        if (cleaned.length >= VOICE_SELECT_FILTER_MIN_LEN) {
          setFilterText(cleaned);
          const filtered = filterVoiceSelectOptions(allOptions, cleaned);
          if (filtered.length === 1) {
            cycle.pendingValue = filtered[0].value;
            setConfirmOption(filtered[0]);
            setErrorMsg("");
          } else if (!filtered.length) {
            cycle.pendingValue = "";
            setErrorMsg("No encuentro esa opción. Prueba otra palabra o toque la lista.");
          } else {
            const numPick = tryPickVoiceSelectOption(cleaned, filtered, field);
            cycle.pendingValue = numPick ? numPick.value : "";
            setErrorMsg(
              filtered.length > VOICE_SELECT_CANDIDATE_CAP
                ? `Hay ${filtered.length} coincidencias. Sea más concreto o toque en la lista.`
                : ""
            );
          }
        } else {
          const numPick = tryPickVoiceSelectOption(cleaned, allOptions, field);
          if (numPick) cycle.pendingValue = numPick.value;
        }
      } else {
        let resolved = trySelectPick_(rawTxt);
        if (!resolved && String(field?.key || "") === "matricula") {
          resolved = resolveVoiceMatriculaFromSpeech_(cleaned, rawTxt, field.options) || "";
        }
        if (resolved) cycle.pendingValue = resolved;
      }
      scheduleSilenceTimer_();
    };

    const startListen_ = () => {
      beginListening_();
    };

    (async () => {
      setPhase("idle");
      setTranscript("");
      setErrorMsg("");
      setFilterText("");
      setConfirmOption(null);
      setPermError("");

      const ok = await ensureExpenseVoicePermissions();
      if (!ok) {
        setPermError("Permiso de micrófono denegado.");
        return;
      }
      if (resolveCycle_()) return;
      startListen_();
    })();

    return () => {
      cancelled = true;
      cycle.resolved = true;
      clearFieldTimers_();
      if (activeModalKeyRef.current === fieldKey) activeModalKeyRef.current = "";
      cleanupListen_();
      cycleRef.current = null;
    };
  }, [visible, field, allOptions, useFilterSelect, cleanupListen_, finishApply_, onClose]);

  const handlePickOption = useCallback(
    (opt) => {
      if (!opt?.value) return;
      finishApply_(opt.value, opt.label);
    },
    [finishApply_]
  );

  if (!visible || !field) return null;

  const label = String(field.label || field.key || "").trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Voz · {label}</Text>
          <Text style={styles.hint}>
            {isSelect
              ? "Escuchando… Hasta 7 s. Tras 3 s de silencio se aplica. «Siguiente» o «Saltar»."
              : "Escuchando… Hasta 7 s. Tras 3 s de silencio se aplica. «Siguiente» aplica; «Saltar» cancela."}
          </Text>

          {permError ? <Text style={styles.error}>{permError}</Text> : null}
          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

          {phase === "listening" ? (
            <View style={styles.listeningRow}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text style={styles.listeningText}>Escuchando: {label}</Text>
            </View>
          ) : null}

          {transcript ? (
            <Text style={styles.transcript} numberOfLines={2}>
              Escuchado: «{transcript}»
            </Text>
          ) : null}

          {isSelect ? (
            <>
              {useFilterSelect ? (
                <TextInput
                  value={filterText}
                  onChangeText={setFilterText}
                  style={styles.input}
                  placeholder="Filtrar opciones…"
                  placeholderTextColor={theme.colors.placeholder}
                />
              ) : null}
              {confirmOption ? (
                <Text style={styles.confirmHint}>¿Confirmar «{confirmOption.label}»? Diga sí o toque la opción.</Text>
              ) : null}
              <VoiceSelectOptionList
                options={filteredOptions}
                onPick={handlePickOption}
                maxHeight={Platform.OS === "web" ? (field?.key === "departamento_o_proyecto" ? 340 : 220) : 200}
              />
            </>
          ) : null}

          <View style={styles.actions}>
            <Pressable style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    alignSelf: "center",
    width: "100%",
  },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: "900", marginBottom: 4 },
  hint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  listeningRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  listeningText: { color: theme.colors.subtext, fontSize: 12, flex: 1 },
  transcript: { color: theme.colors.subtext, fontSize: 11, fontStyle: "italic", marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 14,
  },
  confirmHint: { color: "#b7ddff", fontSize: 12, marginBottom: 6, fontWeight: "700" },
  error: { color: "#ff9f9f", fontSize: 12, marginBottom: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, gap: 8 },
  btnGhost: { paddingVertical: 8, paddingHorizontal: 12 },
  btnGhostText: { color: theme.colors.subtext, fontWeight: "800" },
});
