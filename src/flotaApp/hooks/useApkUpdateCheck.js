import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  checkApkUpdate,
  clearApkUpdateDismissal,
  dismissApkUpdate,
  getInstalledAppVersion,
} from "../lib/apkUpdateCheck";

const MOUNT_RETRY_MS = [0, 2000, 8000, 20000];
const FOREGROUND_RECHECK_MS = 15 * 60 * 1000;

export function useApkUpdateCheck({ enabled = true } = {}) {
  const [update, setUpdate] = useState(null);
  const installedVersion = getInstalledAppVersion();
  const timersRef = useRef([]);

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled || Platform.OS === "web") {
        setUpdate(null);
        return null;
      }
      const next = await checkApkUpdate({ force });
      setUpdate(next);
      return next;
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return undefined;
    let cancelled = false;
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];

    MOUNT_RETRY_MS.forEach((delay) => {
      const id = setTimeout(() => {
        if (cancelled) return;
        refresh(true).catch(() => {});
      }, delay);
      timersRef.current.push(id);
    });

    return () => {
      cancelled = true;
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return undefined;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(true);
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return undefined;
    const id = setInterval(() => {
      if (AppState.currentState === "active") refresh(true);
    }, FOREGROUND_RECHECK_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return undefined;
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        refresh(true);
      }
    });
    return () => unsub();
  }, [enabled, refresh]);

  const dismiss = useCallback(async () => {
    if (!update?.version) {
      setUpdate(null);
      return;
    }
    await dismissApkUpdate(update.version);
    setUpdate(null);
  }, [update?.version]);

  const forceRefresh = useCallback(async () => {
    if (!enabled || Platform.OS === "web") {
      setUpdate(null);
      return null;
    }
    await clearApkUpdateDismissal();
    const next = await checkApkUpdate({ force: true, ignoreDismiss: true });
    setUpdate(next);
    return next;
  }, [enabled]);

  return { update, installedVersion, refresh, forceRefresh, dismiss };
}
