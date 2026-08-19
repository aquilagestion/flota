import { Platform } from "react-native";
import * as Speech from "expo-speech";

const VOICE_LANG = "es-ES";
const MAX_CHUNK_LEN = 180;

function splitTtsChunks_(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (t.length <= MAX_CHUNK_LEN) return [t];

  const parts = [];
  const sentences = t.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const sentence of sentences) {
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length > MAX_CHUNK_LEN && buf) {
      parts.push(buf.trim());
      buf = sentence;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [t];
}

function flattenSpeakParts_(parts) {
  const flat = [];
  for (const part of parts) {
    flat.push(...splitTtsChunks_(part));
  }
  return flat;
}

function speakWebMany_(parts, { shouldAbort } = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    const chunks = flattenSpeakParts_(parts);
    if (!chunks.length) {
      resolve();
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    let i = 0;
    const speakNext = () => {
      if (shouldAbort?.()) {
        resolve();
        return;
      }
      if (i >= chunks.length) {
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunks[i]);
      utter.lang = VOICE_LANG;
      utter.rate = 0.96;
      utter.onend = () => {
        i += 1;
        speakNext();
      };
      utter.onerror = () => {
        i += 1;
        speakNext();
      };
      synth.speak(utter);
    };
    speakNext();
  });
}

function speakNativeMany_(parts, { shouldAbort } = {}) {
  return new Promise((resolve) => {
    const chunks = flattenSpeakParts_(parts);
    if (!chunks.length) {
      resolve();
      return;
    }

    try {
      Speech.stop();
    } catch {
      /* ignore */
    }

    let i = 0;
    const speakNext = () => {
      if (shouldAbort?.()) {
        resolve();
        return;
      }
      if (i >= chunks.length) {
        resolve();
        return;
      }
      try {
        Speech.speak(chunks[i], {
          language: VOICE_LANG,
          rate: 0.96,
          onDone: () => {
            i += 1;
            speakNext();
          },
          onStopped: () => resolve(),
          onError: () => {
            i += 1;
            speakNext();
          },
        });
      } catch {
        resolve();
      }
    };
    speakNext();
  });
}

export function stopExpenseVoiceSpeak() {
  try {
    Speech.stop();
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function speakExpenseVoicePrompt(text) {
  const t = String(text || "").trim();
  if (!t) return Promise.resolve();
  return speakExpenseVoicePromptMany([t]);
}

/** Cola varios textos sin cancelar entre fragmentos (menús numerados, etc.). */
export function speakExpenseVoicePromptMany(parts, opts = {}) {
  const list = (Array.isArray(parts) ? parts : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (!list.length) return Promise.resolve();

  if (Platform.OS === "web") {
    return speakWebMany_(list, opts);
  }
  return speakNativeMany_(list, opts);
}
