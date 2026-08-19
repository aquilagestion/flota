import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "./theme";
import { filledVoiceFieldsFromSnapshot } from "../lib/expenseVoiceApply";
import { enrichVoiceFieldsForForm, getVoiceFieldsForTipo, voiceSupportedTiposSummary, voiceTipoLabel } from "../lib/expenseVoiceFields";
import {
  VOICE_CONFIRM_TRANSFER_PROMPT,
  VOICE_ODOMETER_ASK_PROMPT,
  VOICE_TICKET_ASK_PROMPT,
  pickExpenseImageUri,
  promptExpenseImageSource,
  voiceSupportsOdometerImage,
  voiceSupportsTicketImage,
} from "../lib/expenseVoiceImage";
import {
  isVoiceConfirmNo,
  isVoiceConfirmYes,
  isVoiceSkipCommand,
  isVoiceNextCommand,
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
  fieldUsesFilterFirstVoiceSelect,
  filterVoiceSelectOptions,
  tryPickVoiceSelectOption,
  wizardSelectOptionsForField,
  VOICE_SELECT_CANDIDATE_CAP,
  VOICE_SELECT_FILTER_MIN_LEN,
} from "../lib/expenseVoiceFilterSelect";
import {
  ensureExpenseVoicePermissions,
  isExpenseVoiceAvailable,
  startExpenseVoiceListen,
  stopExpenseVoiceListen,
} from "../lib/expenseVoiceSpeech";
import { speakExpenseVoicePrompt, stopExpenseVoiceSpeak } from "../lib/expenseVoiceTts";
import VoiceSelectOptionList from "./VoiceSelectOptionList";
import { voiceRecordMaxMsForField, voiceSilenceMsForField } from "../../flotaWeb/lib/expenseVoiceTiming";
import {
  validateVoiceMatriculaForField,
  resolveVoiceMatriculaFromSpeech_,
  VOICE_MATRICULA_INVALID_PROMPT,
} from "../../flotaWeb/lib/expenseVoiceMatricula";

const FIELD_GAP_MS = 400;
const LISTEN_SETTLE_MS = 700;

function sleep_(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {'odometer_ask'|'odometer_pick'|'ticket_ask'|'ticket_pick'|'confirm'} PostPhase
 */

export default function ExpenseVoiceFillWizard({
  visible,
  tipo,
  editMode = false,
  initialValues = null,
  projectOptions = [],
  vehicleOptions = [],
  onClose,
  onFieldApplied,
  onFieldFocus,
  onOdometerImagePicked,
  onTicketImagePicked,
}) {
  const fields = useMemo(() => enrichVoiceFieldsForForm(tipo, projectOptions, vehicleOptions), [tipo, projectOptions, vehicleOptions]);
  const [uiMode, setUiMode] = useState("idle");
  const [step, setStep] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [postPhase, setPostPhase] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [fieldValues, setFieldValues] = useState({});
  const [filled, setFilled] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [available, setAvailable] = useState(null);
  const [confirmAnswered, setConfirmAnswered] = useState(false);
  const [imagePicking, setImagePicking] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [selectFilterText, setSelectFilterText] = useState("");
  const [selectConfirmOption, setSelectConfirmOption] = useState(null);
  const [selectListOptions, setSelectListOptions] = useState([]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const stopListenRef = useRef(null);
  const transcriptRef = useRef("");
  const runIdRef = useRef(0);
  const cycleKeyRef = useRef("");
  const spokenStepRef = useRef(-1);
  const appliedFieldRef = useRef(-1);
  const runFieldCycleRef = useRef(null);
  const fieldCycleRef = useRef(null);
  const singleFieldModeRef = useRef(false);
  const initialValuesRef = useRef(initialValues);
  const prevVisibleRef = useRef(false);
  const prevTipoRef = useRef(tipo);

  initialValuesRef.current = initialValues;

  const filledScrollRef = useRef(null);

  const scrollFilledToEnd_ = useCallback(() => {
    requestAnimationFrame(() => {
      filledScrollRef.current?.scrollToEnd?.({ animated: true });
    });
  }, []);

  const showPicker = uiMode === "picker";
  const tipoLabel = useMemo(() => voiceTipoLabel(tipo), [tipo]);
  const tiposSummary = useMemo(() => voiceSupportedTiposSummary(), []);

  const inPostFlow = step >= fields.length && !!postPhase;
  const current = !inPostFlow && step < fields.length ? fields[step] : null;
  const progress = fields.length ? `${Math.min(step + 1, fields.length)} / ${fields.length}` : "0 / 0";
  const currentUsesFilterSelect = !!(current && fieldUsesFilterFirstVoiceSelect(current));
  const savedCurrentValue = String(current && fieldValues[current.key] ? fieldValues[current.key] : "").trim();
  const currentShowsOptionList = !!(
    current &&
    (fieldUsesFilterFirstVoiceSelect(current) || fieldUsesNumberedVoiceMenu(current)) &&
    !(savedCurrentValue && editMode)
  );
  const selectFilteredOptions = useMemo(() => {
    if (!currentShowsOptionList || !current) return [];
    const base = selectListOptions.length ? selectListOptions : wizardSelectOptionsForField(current);
    if (fieldUsesFilterFirstVoiceSelect(current)) {
      return filterVoiceSelectOptions(base, selectFilterText);
    }
    return base;
  }, [current, currentShowsOptionList, selectFilterText, selectListOptions]);

  const startPostFlow = useCallback(() => {
    if (voiceSupportsOdometerImage(tipo)) {
      setPostPhase("odometer_ask");
      return;
    }
    if (voiceSupportsTicketImage(tipo)) {
      setPostPhase("ticket_ask");
      return;
    }
    setPostPhase("confirm");
  }, [tipo]);

  const goToTicketAsk = useCallback(() => {
    if (voiceSupportsTicketImage(tipo)) {
      setPostPhase("ticket_ask");
    } else {
      setPostPhase("confirm");
    }
  }, [tipo]);

  const cleanup = useCallback(() => {
    runIdRef.current += 1;
    cycleKeyRef.current = "";
    const cycle = fieldCycleRef.current;
    if (cycle?.silenceTimer) {
      clearTimeout(cycle.silenceTimer);
      cycle.silenceTimer = null;
    }
    if (cycle?.fieldTimer) {
      clearTimeout(cycle.fieldTimer);
      cycle.fieldTimer = null;
    }
    fieldCycleRef.current = null;
    if (stopListenRef.current) {
      stopListenRef.current();
      stopListenRef.current = null;
    }
    stopExpenseVoiceListen();
    stopExpenseVoiceSpeak();
    setPhase("idle");
    setSessionActive(false);
    setPostPhase(null);
    setConfirmAnswered(false);
    setImagePicking(false);
  }, []);

  const resetAll = useCallback(() => {
    cleanup();
    spokenStepRef.current = -1;
    appliedFieldRef.current = -1;
    singleFieldModeRef.current = false;
    setStep(0);
    setTranscript("");
    setDraftValue("");
    setFilled([]);
    setFieldValues({});
    setErrorMsg("");
    setUiMode("idle");
    setAwaitingConfirm(false);
    transcriptRef.current = "";
    setSelectFilterText("");
    setSelectConfirmOption(null);
    setSelectListOptions([]);
  }, [cleanup]);

  const openWithInitialValues = useCallback(() => {
    const snapshot = { ...(initialValuesRef.current || {}) };
    setFieldValues(snapshot);
    setFilled(filledVoiceFieldsFromSnapshot(fields, snapshot));
    setUiMode(editMode ? "picker" : "idle");
  }, [editMode, fields]);

  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    const tipoChanged = visible && prevTipoRef.current !== tipo;
    prevVisibleRef.current = visible;
    prevTipoRef.current = tipo;

    if (!visible) return;

    if (!justOpened && !tipoChanged) return;

    resetAll();
    openWithInitialValues();
    isExpenseVoiceAvailable().then(setAvailable);
  }, [visible, tipo, resetAll, openWithInitialValues]);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    if (!visible || !sessionActive || !current?.key) return;
    onFieldFocus?.(current.key);
  }, [visible, sessionActive, current?.key, onFieldFocus, step]);

  const stopListening_ = useCallback(() => {
    if (stopListenRef.current) {
      stopListenRef.current();
      stopListenRef.current = null;
    }
    stopExpenseVoiceListen();
    stopExpenseVoiceSpeak();
  }, []);

  const applyFieldValue_ = useCallback(
    (field, value) => {
      const v = String(value || "").trim();
      if (!v || !field) return;
      onFieldApplied?.(field.key, v);
      setFieldValues((prev) => ({ ...prev, [field.key]: v }));
      setFilled((prev) => [...prev.filter((x) => x.key !== field.key), { key: field.key, label: field.label, value: v }]);
      scrollFilledToEnd_();
    },
    [onFieldApplied, scrollFilledToEnd_]
  );

  const advanceAfterField_ = useCallback(() => {
    setAwaitingConfirm(false);
    setErrorMsg("");
    spokenStepRef.current = -1;
    appliedFieldRef.current = -1;
    if (singleFieldModeRef.current) {
      setSessionActive(false);
      singleFieldModeRef.current = false;
      setUiMode("picker");
      return;
    }
    setStep((s) => s + 1);
  }, []);

  const confirmAndNextField = useCallback(() => {
    if (!current) return;
    const cycle = fieldCycleRef.current;
    if (cycle && !cycle.resolved && cycle.field?.key === current.key) {
      const raw = String(transcriptRef.current || draftValue || transcript || "").trim();
      if (raw && isVoiceSkipCommand(raw)) {
        cycle.resolved = true;
        if (cycle.silenceTimer) clearTimeout(cycle.silenceTimer);
        if (cycle.fieldTimer) clearTimeout(cycle.fieldTimer);
        fieldCycleRef.current = null;
        stopListening_();
        setPhase("idle");
        setTranscript(raw);
        setDraftValue("");
        setSelectFilterText("");
        setSelectConfirmOption(null);
        advanceAfterField_();
        return;
      }

      let value = String(cycle?.pendingValue || draftValue || "").trim();
      if (!value && raw) {
        if (fieldUsesNumberedVoiceMenu(current) && !fieldUsesFilterFirstVoiceSelect(current)) {
          value =
            tryQuickNumberedMenuPick(current, raw) ||
            tryPickByVoiceIndex(
              raw,
              numberedOptionLabelsForField(current),
              numberedOptionValuesForField(current)
            ) ||
            "";
        }
        if (!value && currentUsesFilterSelect) {
          const all = wizardSelectOptionsForField(current);
          const filtered = filterVoiceSelectOptions(all, selectFilterText);
          const pick = tryPickVoiceSelectOption(raw, filtered, current);
          if (pick) value = pick.value;
          else if (filtered.length === 1) value = filtered[0].value;
        }
        if (!value) value = String(parseVoiceTranscript(current, raw) || raw).trim();
      }

      if (value) {
        const rawForCheck = String(transcriptRef.current || transcript || "").trim();
        const check = validateVoiceMatriculaForField(current, value, rawForCheck);
        if (!check.ok) {
          if (String(current?.key || "") === "matricula") {
            setErrorMsg("La matrícula no está en la lista de vehículos.");
            void (async () => {
              if (cycle.silenceTimer) clearTimeout(cycle.silenceTimer);
              if (cycle.fieldTimer) clearTimeout(cycle.fieldTimer);
              stopListening_();
              setPhase("speaking");
              await speakExpenseVoicePrompt(VOICE_MATRICULA_INVALID_PROMPT);
              if (!sessionActive || !current) return;
              await sleep_(LISTEN_SETTLE_MS);
              spokenStepRef.current = -1;
              appliedFieldRef.current = -1;
              runIdRef.current += 1;
              cycleKeyRef.current = "";
              runFieldCycleRef.current?.(current, runIdRef.current, step);
            })();
          } else {
            setErrorMsg("No reconozco ese valor. Prueba de nuevo.");
          }
          return;
        }
        value = check.value;
      }

      cycle.resolved = true;
      if (cycle.silenceTimer) {
        clearTimeout(cycle.silenceTimer);
        cycle.silenceTimer = null;
      }
      if (cycle.fieldTimer) {
        clearTimeout(cycle.fieldTimer);
        cycle.fieldTimer = null;
      }
      fieldCycleRef.current = null;
      stopListening_();
      setPhase("idle");
      if (value) {
        setDraftValue(value);
        applyFieldValue_(current, value);
      }
      setSelectFilterText("");
      setSelectConfirmOption(null);
      advanceAfterField_();
      return;
    }
    stopListening_();
    let value = String(draftValue || "").trim();
    if (!value) {
      const raw = String(transcriptRef.current || transcript || "").trim();
      if (raw) value = String(parseVoiceTranscript(current, raw) || raw).trim();
    }
    if (value) {
      const rawForCheck = String(transcriptRef.current || transcript || "").trim();
      const check = validateVoiceMatriculaForField(current, value, rawForCheck);
      if (!check.ok) {
        if (String(current?.key || "") === "matricula") {
          setErrorMsg("La matrícula no está en la lista de vehículos.");
          void (async () => {
            setPhase("speaking");
            await speakExpenseVoicePrompt(VOICE_MATRICULA_INVALID_PROMPT);
            if (!sessionActive) return;
            await sleep_(LISTEN_SETTLE_MS);
            spokenStepRef.current = -1;
            appliedFieldRef.current = -1;
            runIdRef.current += 1;
            cycleKeyRef.current = "";
            runFieldCycleRef.current?.(current, runIdRef.current, step);
          })();
        } else {
          setErrorMsg("No reconozco ese valor. Prueba de nuevo.");
        }
        return;
      }
      value = check.value;
      setDraftValue(value);
      applyFieldValue_(current, value);
    }
    setSelectFilterText("");
    setSelectConfirmOption(null);
    advanceAfterField_();
  }, [
    advanceAfterField_,
    applyFieldValue_,
    current,
    currentUsesFilterSelect,
    draftValue,
    stopListening_,
    transcript,
    sessionActive,
    selectFilterText,
    step,
  ]);

  const handleSelectOptionPick = useCallback(
    (opt) => {
      if (!opt?.value) return;
      const cycle = fieldCycleRef.current;
      if (cycle?.pickOption && !cycle.resolved) {
        cycle.pickOption(opt);
        return;
      }
      if (current) {
        applyFieldValue_(current, opt.value);
        setDraftValue(opt.value);
        setSelectFilterText("");
        setSelectConfirmOption(null);
      }
    },
    [applyFieldValue_, current]
  );

  const runListenCycle = useCallback((runId, { prompt, onMatch }) => {
    const stopCycleListen_ = () => {
      if (stopListenRef.current) {
        stopListenRef.current();
        stopListenRef.current = null;
      }
      stopExpenseVoiceListen();
    };

    const startListening_ = () => {
      if (runIdRef.current !== runId) return;
      setPhase("listening");
      stopCycleListen_();
      stopListenRef.current = startExpenseVoiceListen({
        continuous: true,
        autoRestart: true,
        onResult: ({ transcript: t, isFinal }) => {
          if (runIdRef.current !== runId) return;
          const txt = String(t || "").trim();
          if (!txt) return;
          transcriptRef.current = txt;
          setTranscript(txt);
          if (onMatch?.(txt, isFinal)) {
            stopCycleListen_();
            setPhase("idle");
          }
        },
        onError: (ev) => {
          const code = String(ev?.error || "").trim();
          if (code && code !== "aborted" && code !== "no-speech") {
            setErrorMsg(`Error de reconocimiento: ${code}`);
          }
        },
      });
    };

    const p = String(prompt || "").trim();
    if (!p) {
      startListening_();
      return Promise.resolve();
    }

    setPhase("speaking");
    stopExpenseVoiceSpeak();
    return speakExpenseVoicePrompt(p).then(() => {
      if (runIdRef.current !== runId) return;
      return sleep_(LISTEN_SETTLE_MS).then(() => startListening_());
    });
  }, []);

  const runYesNoAsk = useCallback(
    async (runId, cycleKey, prompt, onYes, onNo) => {
      if (cycleKeyRef.current === cycleKey) return;
      cycleKeyRef.current = cycleKey;
      setErrorMsg("");
      setTranscript("");
      transcriptRef.current = "";

      await runListenCycle(runId, {
        prompt,
        onMatch: (raw) => {
          const t = String(raw || "").trim();
          if (!t) return false;
          if (isVoiceConfirmYes(t)) {
            cycleKeyRef.current = "";
            onYes();
            return true;
          }
          if (isVoiceConfirmNo(t) || isVoiceSkipCommand(t)) {
            cycleKeyRef.current = "";
            onNo();
            return true;
          }
          return false;
        },
      });
    },
    [runListenCycle]
  );

  const runFieldCycle = useCallback(
    async (field, runId, stepIndex) => {
      if (!field) return;
      if (spokenStepRef.current === stepIndex) return;
      spokenStepRef.current = stepIndex;

      setErrorMsg("");
      setTranscript("");
      setDraftValue("");
      setSelectFilterText("");
      setSelectConfirmOption(null);
      setSelectListOptions([]);
      transcriptRef.current = "";
      setAwaitingConfirm(false);

      if (stepIndex > 0) {
        await sleep_(FIELD_GAP_MS);
        if (runIdRef.current !== runId) return;
      }

      const cycle = {
        runId,
        field,
        resolved: false,
        hadSpeech: false,
        pendingValue: "",
        silenceTimer: null,
        allOptions: [],
        selectFilter: "",
      };
      fieldCycleRef.current = cycle;

      const cleanupCycleListen = () => {
        if (cycle.silenceTimer) {
          clearTimeout(cycle.silenceTimer);
          cycle.silenceTimer = null;
        }
        if (cycle.fieldTimer) {
          clearTimeout(cycle.fieldTimer);
          cycle.fieldTimer = null;
        }
        if (stopListenRef.current) {
          stopListenRef.current();
          stopListenRef.current = null;
        }
        stopExpenseVoiceListen();
      };

      const scheduleSilenceTimer_ = () => {
        if (!cycle.hadSpeech || cycle.resolved || runIdRef.current !== runId) return;
        if (cycle.silenceTimer) clearTimeout(cycle.silenceTimer);
        cycle.silenceTimer = setTimeout(() => {
          cycle.silenceTimer = null;
          if (cycle.resolved || runIdRef.current !== runId) return;
          void finishWithNext_();
        }, voiceSilenceMsForField(field));
      };

      const saved = String(fieldValues[field.key] || "").trim();
      const useFilterSelect = fieldUsesFilterFirstVoiceSelect(field) && !(saved && editMode);
      const useNumberedMenu =
        fieldUsesNumberedVoiceMenu(field) && !useFilterSelect && !(saved && editMode);

      const tryNumberedMenuPick_ = (txt) => {
        const quick = tryQuickNumberedMenuPick(field, txt);
        if (quick) return quick;
        return tryPickByVoiceIndex(
          txt,
          numberedOptionLabelsForField(field),
          numberedOptionValuesForField(field)
        );
      };

      function normFilterQuery_(s) {
        return String(s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      }

      const resolveVoiceValue_ = (txt) => {
        const raw = String(txt || "").trim();
        if (!raw) return "";
        const cleaned = stripPromptEchoFromTranscript(field, raw) || raw;

        if (String(field?.key || "") === "matricula" && field?.options?.length) {
          const fromList =
            resolveVoiceMatriculaFromSpeech_(cleaned, raw, field.options) ||
            resolveVoiceMatriculaFromSpeech_(parseVoiceTranscript(field, cleaned), raw, field.options);
          if (fromList) return fromList;
        }

      if (useFilterSelect) {
        const allOptions = cycle.allOptions.length ? cycle.allOptions : wizardSelectOptionsForField(field);
        const filterQ = cycle.selectFilter || cleaned;
        const filtered = filterVoiceSelectOptions(allOptions, filterQ);
        if (field?.key === "departamento_o_proyecto") {
          const byFullList = tryNumberedMenuPick_(cleaned) || tryNumberedMenuPick_(raw);
          if (byFullList) return byFullList;
        }
        const numPick =
            tryPickVoiceSelectOption(cleaned, filtered, field) ||
            tryPickVoiceSelectOption(raw, filtered, field) ||
            tryPickVoiceSelectOption(cleaned, allOptions, field) ||
            tryPickVoiceSelectOption(raw, allOptions, field);
          if (numPick) return numPick.value;
          const byName = filterVoiceSelectOptions(allOptions, cleaned);
          if (byName.length === 1) return byName[0].value;
          const parsed = parseVoiceTranscript(field, cleaned);
          if (parsed) return parsed;
          return "";
        }

        if (useNumberedMenu) {
          const picked = tryNumberedMenuPick_(cleaned) || tryNumberedMenuPick_(raw);
          if (picked) return picked;
        }

        return parseVoiceTranscript(field, cleaned) || parseVoiceTranscript(field, raw) || "";
      };

      const finishWithNext_ = async () => {
        if (cycle.resolved || runIdRef.current !== runId) return;

        const trimmed = String(transcriptRef.current || "").trim();
        let value = String(cycle.pendingValue || "").trim();
        if (!value && trimmed && !isVoiceNextCommand(trimmed) && !isVoiceSkipCommand(trimmed)) {
          value = resolveVoiceValue_(trimmed);
        }

        setTranscript(trimmed);
        setDraftValue(value);
        await commitResolvedValue_(value, trimmed);
      };

      const tryStandardVoiceCommand_ = (txt) => {
        const t = String(txt || "").trim();
        if (!t) return false;
        if (isVoiceSkipCommand(t)) {
          void finishField(t);
          return true;
        }
        if (isVoiceNextCommand(t)) {
          void finishWithNext_();
          return true;
        }
        return false;
      };

      const finishField = async (raw) => {
        if (cycle.resolved || runIdRef.current !== runId) return;

        const trimmed = String(raw || "").trim();
        if (isVoiceSkipCommand(trimmed)) {
          cycle.resolved = true;
          cleanupCycleListen();
          stopExpenseVoiceSpeak();
          setPhase("idle");
          setTranscript(trimmed);
          setDraftValue("");
          fieldCycleRef.current = null;
          advanceAfterField_();
          return;
        }

        let value = String(cycle.pendingValue || "").trim();
        if (!value) value = resolveVoiceValue_(trimmed);
        if (!value && trimmed) value = String(trimmed).trim();

        setTranscript(trimmed);
        setDraftValue(value);
        await commitResolvedValue_(value, trimmed);
      };

      const retryMatriculaFieldListen_ = async () => {
        if (cycle.resolved || runIdRef.current !== runId) return;
        cleanupCycleListen();
        cycle.hadSpeech = false;
        cycle.pendingValue = "";
        transcriptRef.current = "";
        setTranscript("");
        setDraftValue("");
        setSelectFilterText("");
        setSelectConfirmOption(null);
        setErrorMsg("La matrícula no está en la lista de vehículos.");

        setPhase("speaking");
        stopExpenseVoiceSpeak();
        await speakExpenseVoicePrompt(VOICE_MATRICULA_INVALID_PROMPT);
        if (cycle.resolved || runIdRef.current !== runId) return;
        await sleep_(LISTEN_SETTLE_MS);
        if (cycle.resolved || runIdRef.current !== runId) return;
        beginFieldListening_();
      };

      const commitResolvedValue_ = async (value, raw) => {
        let v = String(value || "").trim();
        if (!v) {
          cycle.resolved = true;
          cleanupCycleListen();
          stopExpenseVoiceSpeak();
          setPhase("idle");
          fieldCycleRef.current = null;
          advanceAfterField_();
          return;
        }
        const check = validateVoiceMatriculaForField(field, v, raw);
        if (!check.ok) {
          if (String(field?.key || "") === "matricula") {
            await retryMatriculaFieldListen_();
          } else {
            setErrorMsg("No reconozco ese valor. Prueba de nuevo.");
          }
          return;
        }
        v = check.value;
        cycle.resolved = true;
        cleanupCycleListen();
        stopExpenseVoiceSpeak();
        setPhase("idle");
        setTranscript(String(raw || v).trim());
        setDraftValue(v);
        applyFieldValue_(field, v);
        fieldCycleRef.current = null;
        advanceAfterField_();
      };

      const beginFieldListening_ = () => {
        setPhase("listening");
        cycle.fieldTimer = setTimeout(() => {
          cycle.fieldTimer = null;
          if (cycle.resolved || runIdRef.current !== runId) return;
          if (!cycle.hadSpeech) void finishField("");
          else void finishWithNext_();
        }, voiceRecordMaxMsForField(field));

        stopListenRef.current = startExpenseVoiceListen({
          continuous: true,
          autoRestart: true,
          onResult: ({ transcript: tr, isFinal }) => {
            const t = String(tr || "").trim();
            if (!t || cycle.resolved || runIdRef.current !== runId) return;

            transcriptRef.current = t;
            setTranscript(t);

            if (tryStandardVoiceCommand_(t)) return;

            cycle.hadSpeech = true;
            if (!isFinal) {
              scheduleSilenceTimer_();
              return;
            }

            onFieldSpeech(t);
          },
          onError: (ev) => {
            const code = String(ev?.error || "").trim();
            if (code && code !== "aborted" && code !== "no-speech") {
              setErrorMsg(`Error de reconocimiento: ${code}`);
            }
          },
        });
      };

      const onFieldSpeech = (txt) => {
        if (cycle.resolved || runIdRef.current !== runId) return;
        const rawTxt = String(txt || "").trim();
        if (!rawTxt) return;

        if (tryStandardVoiceCommand_(rawTxt)) return;

        cycle.hadSpeech = true;
        const cleaned = stripPromptEchoFromTranscript(field, rawTxt) || rawTxt;
        transcriptRef.current = cleaned;
        setTranscript(cleaned);

        if (useFilterSelect) {
          const allOptions = cycle.allOptions || [];
          if (normFilterQuery_(cleaned).length >= VOICE_SELECT_FILTER_MIN_LEN) {
            cycle.selectFilter = cleaned;
            setSelectFilterText(cleaned);
            const filtered = filterVoiceSelectOptions(allOptions, cleaned);
            if (filtered.length === 1) {
              cycle.pendingValue = filtered[0].value;
              setDraftValue(filtered[0].value);
              setErrorMsg("");
            } else if (!filtered.length) {
              cycle.pendingValue = "";
              setDraftValue("");
              setErrorMsg("No encuentro esa opción. Prueba con otras palabras o toca en la lista.");
            } else {
              const numPick = tryPickVoiceSelectOption(cleaned, filtered, field);
              if (numPick) {
                cycle.pendingValue = numPick.value;
                setDraftValue(numPick.value);
                setErrorMsg("");
              } else {
                cycle.pendingValue = "";
                setDraftValue("");
                setErrorMsg(
                  filtered.length > VOICE_SELECT_CANDIDATE_CAP
                    ? `Hay ${filtered.length} coincidencias. Sea más concreto o toque en la lista.`
                    : ""
                );
              }
            }
          } else {
            const filteredCurrent = filterVoiceSelectOptions(allOptions, cycle.selectFilter || "");
            const numPick =
              tryPickVoiceSelectOption(cleaned, filteredCurrent, field) ||
              tryPickVoiceSelectOption(cleaned, allOptions, field);
            if (numPick) {
              cycle.pendingValue = numPick.value;
              setDraftValue(numPick.value);
              setErrorMsg("");
            }
          }
        } else {
          const resolved = resolveVoiceValue_(rawTxt);
          if (resolved) {
            cycle.pendingValue = resolved;
            setDraftValue(resolved);
          } else {
            setDraftValue(cleaned);
          }
          setErrorMsg("");
        }
        scheduleSilenceTimer_();
      };

      if (useFilterSelect) {
        const allOptions = wizardSelectOptionsForField(field);
        cycle.allOptions = allOptions;
        cycle.selectFilter = "";
        cycle.pickOption = (opt) => {
          cycle.pendingValue = opt.value;
          cycle.hadSpeech = true;
          setDraftValue(opt.value);
          setTranscript(opt.label);
          transcriptRef.current = opt.label;
          setErrorMsg("");
        };
        setSelectFilterText("");
        setSelectConfirmOption(null);
        setSelectListOptions(allOptions);
      } else if (useNumberedMenu) {
        cycle.pickOption = (opt) => {
          cycle.pendingValue = opt.value;
          cycle.hadSpeech = true;
          setDraftValue(opt.value);
          setTranscript(opt.label);
          transcriptRef.current = opt.label;
          setErrorMsg("");
        };
      }

      beginFieldListening_();

      while (!cycle.resolved && runIdRef.current === runId) {
        await sleep_(150);
      }
    },
    [advanceAfterField_, applyFieldValue_, editMode, fieldValues]
  );
  runFieldCycleRef.current = runFieldCycle;

  const runConfirmCycle = useCallback(
    async (runId) => {
      await runYesNoAsk(runId, "confirm", VOICE_CONFIRM_TRANSFER_PROMPT, () => {
        setConfirmAnswered(true);
        cleanup();
        onClose?.();
      }, () => {
        setConfirmAnswered(true);
        setSessionActive(false);
        setPostPhase(null);
        setPhase("idle");
      });
    },
    [cleanup, onClose, runYesNoAsk]
  );

  const runPostPhaseCycle = useCallback(
    async (runId, phaseName) => {
      if (phaseName === "odometer_ask") {
        await runYesNoAsk(
          runId,
          "odometer_ask",
          VOICE_ODOMETER_ASK_PROMPT,
          () => setPostPhase("odometer_pick"),
          () => goToTicketAsk()
        );
        return;
      }
      if (phaseName === "ticket_ask") {
        await runYesNoAsk(
          runId,
          "ticket_ask",
          VOICE_TICKET_ASK_PROMPT,
          () => setPostPhase("ticket_pick"),
          () => setPostPhase("confirm")
        );
        return;
      }
      if (phaseName === "confirm") {
        await runConfirmCycle(runId);
      }
    },
    [goToTicketAsk, runConfirmCycle, runYesNoAsk]
  );

  const activeFieldCycleKeyRef = useRef("");
  const activePostPhaseRef = useRef("");

  const currentFieldKey = current?.key ?? "";

  useEffect(() => {
    if (!visible || !sessionActive || inPostFlow) return undefined;
    const field = fieldsRef.current[step];
    if (!field) return undefined;
    const cycleKey = `${step}:${field.key}`;
    if (activeFieldCycleKeyRef.current === cycleKey) return undefined;

    activeFieldCycleKeyRef.current = cycleKey;
    const runId = ++runIdRef.current;
    const stepIndex = step;
    if (stopListenRef.current) {
      stopListenRef.current();
      stopListenRef.current = null;
    }
    stopExpenseVoiceListen();
    stopExpenseVoiceSpeak();
    runFieldCycleRef.current?.(field, runId, stepIndex);
    return () => {
      if (activeFieldCycleKeyRef.current === cycleKey) {
        activeFieldCycleKeyRef.current = "";
      }
      if (runIdRef.current === runId) {
        if (stopListenRef.current) {
          stopListenRef.current();
          stopListenRef.current = null;
        }
        stopExpenseVoiceListen();
        stopExpenseVoiceSpeak();
      }
    };
  }, [visible, sessionActive, inPostFlow, step, currentFieldKey]);

  useEffect(() => {
    if (!sessionActive || singleFieldModeRef.current || step < fields.length || postPhase || confirmAnswered) return;
    startPostFlow();
  }, [sessionActive, step, fields.length, postPhase, confirmAnswered, startPostFlow]);

  useEffect(() => {
    if (!sessionActive || !postPhase) return;
    if (postPhase === "odometer_pick" || postPhase === "ticket_pick") return;
    if (activePostPhaseRef.current === postPhase) return;
    activePostPhaseRef.current = postPhase;
    const runId = ++runIdRef.current;
    runPostPhaseCycle(runId, postPhase);
    return () => {
      if (activePostPhaseRef.current === postPhase) activePostPhaseRef.current = "";
    };
  }, [sessionActive, postPhase, runPostPhaseCycle]);

  const markImageFilled = useCallback((key, label) => {
    setFilled((prev) => [...prev.filter((x) => x.key !== key), { key, label, value: "Imagen adjuntada" }]);
    scrollFilledToEnd_();
  }, [scrollFilledToEnd_]);

  const openWebTicketFilePicker = useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*,application/pdf";
    el.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      setImagePicking(true);
      try {
        const ok = await onTicketImagePicked?.(file);
        if (ok !== false) {
          markImageFilled("ticket_imagen", "Imagen tiquet/factura");
          setPostPhase("confirm");
        }
      } finally {
        setImagePicking(false);
      }
    };
    el.click();
  }, [markImageFilled, onTicketImagePicked]);

  const openWebOdometerFilePicker = useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      setImagePicking(true);
      try {
        const ok = await onOdometerImagePicked?.(file);
        if (ok !== false) {
          markImageFilled("odometro_imagen", "Foto cuentakilómetros");
          goToTicketAsk();
        }
      } finally {
        setImagePicking(false);
      }
    };
    el.click();
  }, [goToTicketAsk, markImageFilled, onOdometerImagePicked]);

  const handleNativeImagePick = useCallback(
    async (source) => {
      if (imagePicking) return;
      setImagePicking(true);
      setErrorMsg("");
      try {
        const uri = await pickExpenseImageUri(source);
        if (!uri) return;
        if (postPhase === "odometer_pick") {
          const ok = await onOdometerImagePicked?.(uri);
          if (ok !== false) {
            markImageFilled("odometro_imagen", "Foto cuentakilómetros");
            goToTicketAsk();
          }
        } else if (postPhase === "ticket_pick") {
          const ok = await onTicketImagePicked?.(uri);
          if (ok !== false) {
            markImageFilled("ticket_imagen", "Imagen tiquet/factura");
            setPostPhase("confirm");
          }
        }
      } finally {
        setImagePicking(false);
      }
    },
    [goToTicketAsk, imagePicking, markImageFilled, onOdometerImagePicked, onTicketImagePicked, postPhase]
  );

  const handleAutoImagePick = useCallback(async () => {
    if (imagePicking || Platform.OS === "web") return;
    setImagePicking(true);
    try {
      const uri = await promptExpenseImageSource();
      if (!uri) return;
      if (postPhase === "odometer_pick") {
        const ok = await onOdometerImagePicked?.(uri);
        if (ok !== false) {
          markImageFilled("odometro_imagen", "Foto cuentakilómetros");
          goToTicketAsk();
        }
      } else if (postPhase === "ticket_pick") {
        const ok = await onTicketImagePicked?.(uri);
        if (ok !== false) {
          markImageFilled("ticket_imagen", "Imagen tiquet/factura");
          setPostPhase("confirm");
        }
      }
    } finally {
      setImagePicking(false);
    }
  }, [goToTicketAsk, imagePicking, markImageFilled, onOdometerImagePicked, onTicketImagePicked, postPhase]);

  useEffect(() => {
    if (postPhase !== "odometer_pick" && postPhase !== "ticket_pick") return;
    if (Platform.OS === "web") {
      const t = setTimeout(() => {
        if (postPhase === "odometer_pick") openWebOdometerFilePicker();
        else if (postPhase === "ticket_pick") openWebTicketFilePicker();
      }, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      handleAutoImagePick();
    }, 400);
    return () => clearTimeout(t);
  }, [postPhase, handleAutoImagePick, openWebOdometerFilePicker, openWebTicketFilePicker]);

  const skipImagePick = useCallback(() => {
    if (postPhase === "odometer_pick") goToTicketAsk();
    else if (postPhase === "ticket_pick") setPostPhase("confirm");
  }, [goToTicketAsk, postPhase]);

  const beginSession = useCallback(async () => {
    if (!fields.length) return;
    const ok = await ensureExpenseVoicePermissions();
    if (!ok) {
      setErrorMsg("Permiso de micrófono denegado. Actívalo en ajustes del dispositivo o del navegador.");
      return;
    }
    runIdRef.current += 1;
    spokenStepRef.current = -1;
    appliedFieldRef.current = -1;
    singleFieldModeRef.current = false;
    setStep(0);
    setErrorMsg("");
    setPostPhase(null);
    setConfirmAnswered(false);
    setAwaitingConfirm(false);
    setUiMode("session");
    stopExpenseVoiceSpeak();
    setSessionActive(true);
  }, [fields.length]);

  const selectFieldForEdit = useCallback(
    async (index) => {
      if (!fields[index]) return;
      const ok = await ensureExpenseVoicePermissions();
      if (!ok) {
        setErrorMsg("Permiso de micrófono denegado. Actívalo en ajustes del dispositivo o del navegador.");
        return;
      }
      runIdRef.current += 1;
      spokenStepRef.current = -1;
      appliedFieldRef.current = -1;
      singleFieldModeRef.current = true;
      setStep(index);
      setErrorMsg("");
      setPostPhase(null);
      setConfirmAnswered(false);
      setAwaitingConfirm(false);
      setTranscript("");
      setDraftValue("");
      transcriptRef.current = "";
      setUiMode("session");
      setSessionActive(true);
    },
    [fields]
  );

  const skipField = useCallback(() => {
    if (!current) return;
    const cycle = fieldCycleRef.current;
    if (cycle && !cycle.resolved) {
      cycle.resolved = true;
      if (cycle.silenceTimer) {
        clearTimeout(cycle.silenceTimer);
        cycle.silenceTimer = null;
      }
      if (cycle.fieldTimer) {
        clearTimeout(cycle.fieldTimer);
        cycle.fieldTimer = null;
      }
      fieldCycleRef.current = null;
    }
    stopListening_();
    setAwaitingConfirm(false);
    setSelectFilterText("");
    setSelectConfirmOption(null);
    setDraftValue("");
    setTranscript("");
    advanceAfterField_();
  }, [advanceAfterField_, current, stopListening_]);

  const repeatField = useCallback(() => {
    if (!current || !sessionActive) return;
    const cycle = fieldCycleRef.current;
    if (cycle && !cycle.resolved) {
      cycle.resolved = true;
      if (cycle.silenceTimer) {
        clearTimeout(cycle.silenceTimer);
        cycle.silenceTimer = null;
      }
      if (cycle.fieldTimer) {
        clearTimeout(cycle.fieldTimer);
        cycle.fieldTimer = null;
      }
      fieldCycleRef.current = null;
    }
    stopListening_();
    setAwaitingConfirm(false);
    setSelectFilterText("");
    setSelectConfirmOption(null);
    spokenStepRef.current = -1;
    appliedFieldRef.current = -1;
    runIdRef.current += 1;
    cycleKeyRef.current = "";
    const runId = runIdRef.current;
    runFieldCycle(current, runId, step);
  }, [current, sessionActive, runFieldCycle, step, stopListening_]);

  const stopListenForReview = useCallback(() => {
    if (!current) return;
    const cycle = fieldCycleRef.current;
    if (cycle && !cycle.resolved && cycle.hadSpeech) {
      confirmAndNextField();
    }
  }, [confirmAndNextField, current]);

  const handleClose = useCallback(() => {
    cleanup();
    resetAll();
    onClose?.();
  }, [cleanup, onClose, resetAll]);

  const confirmAndClose = useCallback(() => {
    cleanup();
    onClose?.();
  }, [cleanup, onClose]);

  const postPhaseLabel = useMemo(() => {
    if (postPhase === "odometer_ask") return "¿Subir foto del cuentakilómetros?";
    if (postPhase === "odometer_pick") return "Seleccione imagen del cuentakilómetros";
    if (postPhase === "ticket_ask") return "¿Subir imagen del tiquet o factura?";
    if (postPhase === "ticket_pick") return "Seleccione imagen del tiquet o factura";
    if (postPhase === "confirm") return "Confirmación de traslado al formulario";
    return "";
  }, [postPhase]);

  if (!visible) return null;

  const showVoiceHints = !(sessionActive && phase === "listening");
  const phaseLabel =
    phase === "listening"
      ? currentShowsOptionList
        ? "Escuchando… Hasta 7 s por campo; 3 s de silencio pasa al siguiente. «Siguiente» / «Saltar». Toque la lista si quiere."
        : "Escuchando… Hasta 7 s por campo; 3 s de silencio pasa al siguiente. «Siguiente» o «Saltar»."
      : phase === "speaking"
        ? "La aplicación está indicando el campo…"
        : postPhase === "confirm"
          ? "Confirme el traslado de datos al formulario."
          : postPhase?.endsWith("_ask")
            ? "Responda sí o no por voz, o use los botones. «Saltar» para omitir."
            : "";

  const showSummary = !sessionActive && step >= fields.length && confirmAnswered;
  const showImagePick = postPhase === "odometer_pick" || postPhase === "ticket_pick";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Asistente de voz · {tipoLabel}</Text>
          {showVoiceHints ? (
            <>
              <Text style={styles.hint}>
                En desplegables largos (departamento, marca) filtre por voz o toque la lista. En el resto se leen opciones numeradas.
              </Text>
              <Text style={styles.tiposHint}>Tipos de gasto con voz: {tiposSummary}.</Text>
            </>
          ) : null}

          {available === false ? (
            <Text style={styles.error}>El reconocimiento de voz no está disponible en este dispositivo o navegador.</Text>
          ) : null}

          {!fields.length ? (
            <Text style={styles.error}>Este tipo de gasto aún no admite relleno por voz.</Text>
          ) : showPicker ? (
            <>
              <Text style={styles.hint}>
                {editMode
                  ? "Gasto ya grabado. Toque un campo para modificarlo o completarlo por voz."
                  : "Seleccione un campo o inicie el asistente completo."}
              </Text>
              <ScrollView style={styles.fieldList} nestedScrollEnabled>
                {fields.map((field, index) => {
                  const value = String(fieldValues[field.key] || "").trim();
                  return (
                    <Pressable
                      key={field.key}
                      style={[styles.fieldPickRow, value ? styles.fieldPickRowFilled : null]}
                      onPress={() => selectFieldForEdit(index)}
                    >
                      <View style={styles.fieldPickMain}>
                        <Text style={styles.fieldPickLabel}>{field.label}</Text>
                        <Text style={[styles.fieldPickValue, !value && styles.fieldPickEmpty]}>
                          {value || "(vacío)"}
                        </Text>
                      </View>
                      <Text style={styles.fieldPickAction}>Voz</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.btnPrimary} onPress={beginSession}>
                  <Text style={styles.btnPrimaryText}>Rellenar todo con voz</Text>
                </Pressable>
                <Pressable style={styles.btnGhost} onPress={handleClose}>
                  <Text style={styles.btnGhostText}>Cerrar</Text>
                </Pressable>
              </View>
            </>
          ) : showSummary ? (
            <>
              <Text style={styles.hint}>Revise los datos en el formulario. Las imágenes pueden añadirse al editar el gasto.</Text>
              {filled.length ? (
                <ScrollView ref={filledScrollRef} style={styles.filledScroll} nestedScrollEnabled>
                  <View style={styles.filledBox}>
                    {filled.map((item) => (
                      <View key={item.key} style={styles.filledRow}>
                        <Text style={styles.filledCheck}>✓</Text>
                        <Text style={styles.filledLabel}>{item.label}:</Text>
                        <Text style={styles.filledValue}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : null}
              <Pressable style={styles.btnPrimary} onPress={confirmAndClose}>
                <Text style={styles.btnPrimaryText}>Volver al formulario</Text>
              </Pressable>
            </>
          ) : current || inPostFlow ? (
            <>
              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyScrollContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {current ? (
                  <>
                    <Text style={styles.progress}>Campo {progress}</Text>
                    <Text style={styles.fieldLabel}>{current.label}</Text>
                    {String(fieldValues[current.key] || "").trim() ? (
                      <Text style={styles.currentSaved}>Valor actual: {fieldValues[current.key]}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.fieldLabel}>{postPhaseLabel}</Text>
                )}

                {phaseLabel ? (
                  <View style={styles.listeningRow}>
                    {phase === "listening" || phase === "speaking" || imagePicking ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : null}
                    <Text style={styles.listeningText}>{imagePicking ? "Abriendo selector de imagen…" : phaseLabel}</Text>
                  </View>
                ) : null}

                {transcript ? (
                  <Text style={styles.transcript} numberOfLines={2} ellipsizeMode="tail">
                    Escuchado: «{transcript}»
                  </Text>
                ) : null}

                {current ? (
                  currentShowsOptionList ? (
                    <>
                      {currentUsesFilterSelect ? (
                        <>
                          <Text style={styles.selectFilterHint}>
                            {selectFilteredOptions.length
                              ? `${selectFilteredOptions.length} opción${selectFilteredOptions.length === 1 ? "" : "es"}`
                              : "Sin coincidencias"}
                            {selectFilterText ? ` · filtro: «${selectFilterText}»` : " · todas las opciones"}
                          </Text>
                          <TextInput
                            value={selectFilterText}
                            onChangeText={(t) => {
                              setSelectFilterText(t);
                              setSelectConfirmOption(null);
                              const cycle = fieldCycleRef.current;
                              if (cycle) {
                                cycle.selectFilter = t;
                              }
                            }}
                            style={styles.input}
                            placeholder="Escriba para filtrar opciones…"
                            placeholderTextColor={theme.colors.placeholder}
                            autoCapitalize="sentences"
                          />
                        </>
                      ) : (
                        <Text style={styles.selectFilterHint}>
                          {selectFilteredOptions.length
                            ? `${selectFilteredOptions.length} opción${selectFilteredOptions.length === 1 ? "" : "es"} · diga el número o el nombre`
                            : "Sin opciones"}
                        </Text>
                      )}
                      <VoiceSelectOptionList
                        options={selectFilteredOptions}
                        onPick={handleSelectOptionPick}
                        disabled={false}
                        maxHeight={Platform.OS === "web" ? 220 : 180}
                      />
                    </>
                  ) : (
                    <TextInput
                      value={draftValue}
                      onChangeText={setDraftValue}
                      style={styles.input}
                      placeholder="Escriba o corrija el valor"
                      placeholderTextColor={theme.colors.placeholder}
                      autoCapitalize={current.kind === "plate" || current.kind === "invoice" ? "characters" : "sentences"}
                    />
                  )
                ) : null}

                {showImagePick ? (
                  <View style={styles.imagePickBox}>
                    <Text style={styles.imagePickHint}>
                      También podrá subir esta imagen más tarde editando el gasto.
                    </Text>
                    {Platform.OS === "web" ? (
                      <>
                        {postPhase === "odometer_pick" ? (
                          <Pressable
                            style={styles.btnSecondary}
                            onPress={openWebOdometerFilePicker}
                            disabled={imagePicking}
                          >
                            <Text style={styles.btnSecondaryText}>Seleccionar foto cuentakilómetros</Text>
                          </Pressable>
                        ) : null}
                        {postPhase === "ticket_pick" ? (
                          <Pressable
                            style={styles.btnSecondary}
                            onPress={openWebTicketFilePicker}
                            disabled={imagePicking}
                          >
                            <Text style={styles.btnSecondaryText}>Seleccionar archivo</Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : (
                      <View style={styles.imagePickActions}>
                        <Pressable style={styles.btnSecondary} onPress={() => handleNativeImagePick("camera")} disabled={imagePicking}>
                          <Text style={styles.btnSecondaryText}>Cámara</Text>
                        </Pressable>
                        <Pressable style={styles.btnSecondary} onPress={() => handleNativeImagePick("library")} disabled={imagePicking}>
                          <Text style={styles.btnSecondaryText}>Galería</Text>
                        </Pressable>
                      </View>
                    )}
                    <Pressable style={styles.btnGhost} onPress={skipImagePick}>
                      <Text style={styles.btnGhostText}>Omitir imagen</Text>
                    </Pressable>
                  </View>
                ) : null}

                {filled.length ? (
                  <ScrollView ref={filledScrollRef} style={styles.filledScroll} nestedScrollEnabled>
                    <View style={styles.filledBox}>
                      {filled.map((item) => (
                        <View key={item.key} style={styles.filledRow}>
                          <Text style={styles.filledCheck}>✓</Text>
                          <Text style={styles.filledLabel}>{item.label}:</Text>
                          <Text style={styles.filledValue} numberOfLines={1} ellipsizeMode="tail">
                            {item.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}

                {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
              </ScrollView>

              <View style={styles.actionsSticky}>
                {!sessionActive ? (
                  <Pressable style={styles.btnPrimary} onPress={beginSession}>
                    <Text style={styles.btnPrimaryText}>Iniciar asistente</Text>
                  </Pressable>
                ) : (
                  <>
                    {current ? (
                      <>
                        <Pressable style={styles.btnPrimary} onPress={confirmAndNextField}>
                          <Text style={styles.btnPrimaryText}>Siguiente campo</Text>
                        </Pressable>
                        <Pressable style={styles.btnSecondary} onPress={repeatField}>
                          <Text style={styles.btnSecondaryText}>Repetir pregunta</Text>
                        </Pressable>
                        <Pressable style={styles.btnGhost} onPress={skipField}>
                          <Text style={styles.btnGhostText}>Saltar</Text>
                        </Pressable>
                        {phase === "listening" ? (
                          <Pressable style={styles.btnGhost} onPress={stopListenForReview}>
                            <Text style={styles.btnGhostText}>Parar escucha</Text>
                          </Pressable>
                        ) : null}
                        {editMode ? (
                          <Pressable
                            style={styles.btnGhost}
                            onPress={() => {
                              cleanup();
                              setSessionActive(false);
                              setAwaitingConfirm(false);
                              singleFieldModeRef.current = false;
                              setUiMode("picker");
                            }}
                          >
                            <Text style={styles.btnGhostText}>Volver a lista</Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : postPhase === "confirm" ? (
                      <Pressable style={styles.btnPrimary} onPress={confirmAndClose}>
                        <Text style={styles.btnPrimaryText}>Aceptar y cerrar</Text>
                      </Pressable>
                    ) : postPhase?.endsWith("_ask") ? (
                      <>
                        <Pressable
                          style={styles.btnSecondary}
                          onPress={() => {
                            runIdRef.current += 1;
                            cycleKeyRef.current = "";
                            stopExpenseVoiceListen();
                            stopExpenseVoiceSpeak();
                            if (postPhase === "odometer_ask") setPostPhase("odometer_pick");
                            else if (postPhase === "ticket_ask") setPostPhase("ticket_pick");
                          }}
                        >
                          <Text style={styles.btnSecondaryText}>Sí</Text>
                        </Pressable>
                        <Pressable
                          style={styles.btnGhost}
                          onPress={() => {
                            runIdRef.current += 1;
                            cycleKeyRef.current = "";
                            stopExpenseVoiceListen();
                            stopExpenseVoiceSpeak();
                            if (postPhase === "odometer_ask") goToTicketAsk();
                            else if (postPhase === "ticket_ask") setPostPhase("confirm");
                          }}
                        >
                          <Text style={styles.btnGhostText}>No</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </>
                )}
                <Pressable style={styles.btnGhost} onPress={handleClose}>
                  <Text style={styles.btnGhostText}>Cerrar</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={styles.btnPrimary} onPress={beginSession}>
              <Text style={styles.btnPrimaryText}>Iniciar asistente</Text>
            </Pressable>
          )}
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
    maxWidth: Platform.OS === "web" ? 560 : undefined,
    maxHeight: Platform.OS === "web" ? "85vh" : "90%",
    alignSelf: "center",
    width: "100%",
    overflow: "hidden",
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: Platform.OS === "web" ? 380 : 320,
  },
  bodyScrollContent: { paddingBottom: 4 },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  hint: { color: theme.colors.subtext, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  tiposHint: { color: theme.colors.subtext, fontSize: 11, marginBottom: 8, lineHeight: 16, fontStyle: "italic" },
  progress: { color: theme.colors.subtext, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  fieldLabel: { color: theme.colors.text, fontSize: 16, fontWeight: "900", marginBottom: 8 },
  currentSaved: { color: theme.colors.subtext, fontSize: 12, marginBottom: 6, fontStyle: "italic" },
  fieldList: { maxHeight: Platform.OS === "web" ? 360 : 320, marginBottom: 10 },
  fieldPickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.card2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  fieldPickRowFilled: { borderColor: "#3d8fd4" },
  fieldPickMain: { flex: 1, minWidth: 0 },
  fieldPickLabel: { color: theme.colors.text, fontWeight: "800", fontSize: 13 },
  fieldPickValue: { color: theme.colors.subtext, fontSize: 12, marginTop: 2 },
  fieldPickEmpty: { fontStyle: "italic", opacity: 0.75 },
  fieldPickAction: { color: "#b7ddff", fontWeight: "900", fontSize: 12 },
  listeningRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  listeningText: { color: theme.colors.subtext, fontSize: 12, flex: 1 },
  transcript: {
    color: theme.colors.subtext,
    fontSize: 11,
    marginBottom: 6,
    fontStyle: "italic",
    lineHeight: 15,
    maxHeight: 34,
  },
  input: {
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.text,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "web" ? 7 : 6,
    marginBottom: 6,
    fontSize: 14,
    minHeight: Platform.OS === "web" ? 36 : 34,
  },
  selectFilterHint: { color: theme.colors.subtext, fontSize: 11, marginBottom: 4, lineHeight: 15 },
  confirmHint: { color: "#b7ddff", fontSize: 12, marginBottom: 6, fontWeight: "700", lineHeight: 17 },
  imagePickBox: { marginBottom: 10, gap: 8 },
  imagePickHint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  imagePickActions: { flexDirection: "row", gap: 8 },
  filledBox: { marginBottom: 4, gap: 2 },
  filledScroll: { maxHeight: Platform.OS === "web" ? 72 : 64, marginBottom: 4 },
  filledRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  filledCheck: { color: "#7dffb0", fontWeight: "900", fontSize: 11 },
  filledLabel: { color: theme.colors.text, fontWeight: "800", fontSize: 11 },
  filledValue: { color: theme.colors.subtext, fontSize: 11, flex: 1, flexShrink: 1 },
  error: { color: "#ff9f9f", fontSize: 12, marginBottom: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, justifyContent: "flex-end" },
  actionsSticky: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    justifyContent: "flex-end",
  },
  btnPrimary: { backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnSecondaryText: { color: theme.colors.text, fontWeight: "800", fontSize: 14 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 10 },
  btnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 14 },
});
