import React, { createContext, useCallback, useContext, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { syncService } from "../sync/syncService";
import { localDb } from "../storage/localDb";
import { theme } from "../ui/theme";

export const SyncContext = createContext({
  syncing: false,
  syncNow: async () => ({ pushed: 0, remainingCount: 0 }),
});

export function SyncProvider({ children }) {
  const [syncing, setSyncing] = useState(false);

  const syncNow = useCallback(async (opts = {}) => {
    if (syncing) return null;
    setSyncing(true);
    try {
      const res = await syncService.flushIfOnline();
      if (typeof opts.onComplete === "function") {
        await opts.onComplete(res);
      }
      return res;
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const refreshOutboxCount = useCallback(async () => {
    const outbox = await localDb.getOutbox();
    return outbox.length;
  }, []);

  return (
    <SyncContext.Provider value={{ syncing, syncNow, refreshOutboxCount }}>
      {children}
      <Modal visible={syncing} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.box}>
            <ActivityIndicator size="large" color={theme.colors.accent || "#4f88bf"} />
            <Text style={styles.text}>Actualizando</Text>
          </View>
        </View>
      </Modal>
    </SyncContext.Provider>
  );
}

export function useSyncActions() {
  return useContext(SyncContext);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  box: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: "center",
    gap: 14,
    minWidth: 200,
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
});
