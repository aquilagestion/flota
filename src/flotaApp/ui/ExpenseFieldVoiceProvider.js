import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { enrichVoiceFieldsForForm } from "../lib/expenseVoiceFields";
import ExpenseFieldVoiceModal from "./ExpenseFieldVoiceModal";

const ExpenseFieldVoiceContext = createContext(null);

export function ExpenseFieldVoiceProvider({ tipo, projectOptions = [], vehicleOptions = [], onApply, children }) {
  const [activeKey, setActiveKey] = useState(null);
  const fields = useMemo(
    () => enrichVoiceFieldsForForm(tipo, projectOptions, vehicleOptions),
    [tipo, projectOptions, vehicleOptions]
  );
  const keySet = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);
  const activeField = useMemo(() => fields.find((f) => f.key === activeKey) || null, [fields, activeKey]);

  const start = useCallback(
    (key) => {
      const k = String(key || "").trim();
      if (!k || !keySet.has(k)) return;
      setActiveKey(k);
    },
    [keySet]
  );

  const stop = useCallback(() => setActiveKey(null), []);

  const handleApply = useCallback(
    (key, value) => {
      onApply?.(key, value);
      setActiveKey(null);
    },
    [onApply]
  );

  const value = useMemo(
    () => ({
      start,
      stop,
      activeKey,
      hasKey: (key) => keySet.has(String(key || "").trim()),
    }),
    [start, stop, activeKey, keySet]
  );

  return (
    <ExpenseFieldVoiceContext.Provider value={value}>
      {children}
      <ExpenseFieldVoiceModal visible={!!activeField} field={activeField} onClose={stop} onApply={handleApply} />
    </ExpenseFieldVoiceContext.Provider>
  );
}

export function useExpenseFieldVoiceProps(voiceKey) {
  const ctx = useContext(ExpenseFieldVoiceContext);
  const key = String(voiceKey || "").trim();
  if (!ctx || !key || !ctx.hasKey(key)) {
    return { voiceOnPress: undefined, voiceActive: false, voiceEnabled: false };
  }
  return {
    voiceOnPress: () => ctx.start(key),
    voiceActive: ctx.activeKey === key,
    voiceEnabled: true,
  };
}
