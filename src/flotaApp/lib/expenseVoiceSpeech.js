import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

const VOICE_LANG = "es-ES";

/** @type {SpeechRecognition | null} */
let webRecActive_ = null;

function getWebSpeechRecognition_() {
  if (typeof window === "undefined") return null;
  const W = window;
  return W.SpeechRecognition || W.webkitSpeechRecognition || null;
}

export async function isExpenseVoiceAvailable() {
  try {
    if (Platform.OS === "web") {
      return !!getWebSpeechRecognition_();
    }
    if (typeof ExpoSpeechRecognitionModule?.isRecognitionAvailable === "function") {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

export async function ensureExpenseVoicePermissions() {
  try {
    if (Platform.OS === "web") {
      return !!getWebSpeechRecognition_();
    }
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return Boolean(result?.granted);
  } catch {
    return false;
  }
}

function transcriptFromEvent_(event) {
  const list = Array.isArray(event?.results) ? event.results : [];
  if (!list.length) return "";
  let best = "";
  for (const item of list) {
    const t = String(item?.transcript || "").trim();
    if (t.length > best.length) best = t;
  }
  return best || String(list[list.length - 1]?.transcript || "").trim();
}

function transcriptFromWebResult_(event) {
  const list = event?.results;
  if (!list?.length) return "";
  let stable = "";
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part?.isFinal) continue;
    stable += String(part?.[0]?.transcript || part?.transcript || "");
  }
  const last = list[list.length - 1];
  const lastChunk = String(last?.[0]?.transcript || last?.transcript || "");
  if (!last?.isFinal) {
    return (stable + lastChunk).replace(/\s+/g, " ").trim();
  }
  return (stable || lastChunk).replace(/\s+/g, " ").trim();
}

function startWebExpenseVoiceListen_({ onResult, onError, onEnd, continuous = true, autoRestart = true }) {
  const SR = getWebSpeechRecognition_();
  if (!SR) {
    onError?.({ error: "not-available" });
    return () => {};
  }

  const rec = new SR();
  webRecActive_ = rec;
  let active = true;

  rec.lang = VOICE_LANG;
  rec.interimResults = true;
  rec.continuous = continuous;

  rec.onresult = (event) => {
    const transcript = transcriptFromWebResult_(event);
    const idx = Math.max(0, (event?.results?.length || 1) - 1);
    const isFinal = Boolean(event?.results?.[idx]?.isFinal);
    if (transcript && onResult) onResult({ transcript, isFinal });
  };
  rec.onerror = (event) => {
    if (onError) onError(event);
  };
  rec.onend = () => {
    if (active && autoRestart && continuous) {
      try {
        rec.start();
        return;
      } catch {
        /* fall through */
      }
    }
    if (webRecActive_ === rec) webRecActive_ = null;
    if (onEnd) onEnd();
  };

  try {
    rec.start();
  } catch (e) {
    if (webRecActive_ === rec) webRecActive_ = null;
    onError?.(e);
  }

  return () => {
    active = false;
    if (webRecActive_ === rec) webRecActive_ = null;
    try {
      rec.abort();
    } catch {
      /* ignore */
    }
  };
}

function startNativeExpenseVoiceListen_({
  onResult,
  onError,
  onEnd,
  continuous = true,
  autoRestart = true,
  contextualStrings = null,
}) {
  const handlers = [];
  let active = true;

  const add = (event, fn) => {
    const sub = ExpoSpeechRecognitionModule.addListener(event, fn);
    handlers.push(sub);
    return sub;
  };

  const startOnce = () => {
    const hints = Array.isArray(contextualStrings)
      ? contextualStrings.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 80)
      : [];
    const opts = {
      lang: VOICE_LANG,
      interimResults: true,
      continuous,
    };
    if (hints.length) opts.contextualStrings = hints;
    ExpoSpeechRecognitionModule.start(opts);
  };

  add("result", (event) => {
    const transcript = transcriptFromEvent_(event);
    const isFinal = Boolean(event?.isFinal);
    if (transcript && onResult) onResult({ transcript, isFinal });
  });
  add("error", (event) => {
    if (onError) onError(event);
  });
  add("end", () => {
    if (active && autoRestart && continuous) {
      try {
        startOnce();
        return;
      } catch {
        /* fall through */
      }
    }
    if (onEnd) onEnd();
  });

  startOnce();

  return () => {
    active = false;
    handlers.forEach((h) => {
      try {
        h?.remove?.();
      } catch {
        /* ignore */
      }
    });
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* ignore */
    }
  };
}

export function startExpenseVoiceListen(opts) {
  if (Platform.OS === "web") {
    return startWebExpenseVoiceListen_(opts);
  }
  return startNativeExpenseVoiceListen_(opts);
}

export function stopExpenseVoiceListen() {
  if (Platform.OS === "web") {
    if (webRecActive_) {
      try {
        webRecActive_.abort();
      } catch {
        /* ignore */
      }
      webRecActive_ = null;
    }
    return;
  }
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    /* ignore */
  }
}
