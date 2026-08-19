import React, { useEffect, useRef } from "react";
import { Platform, View, findNodeHandle } from "react-native";

/** @type {Map<string, import('react').RefObject<View>>} */
const anchorRefs = new Map();

export function voiceFieldDomId(key) {
  return `voice-field-${String(key || "").trim()}`;
}

export function voiceFieldAnchorProps(voiceKey) {
  const k = String(voiceKey || "").trim();
  if (!k) return {};
  const id = voiceFieldDomId(k);
  if (Platform.OS === "web") return { id, nativeID: id };
  return { nativeID: id };
}

/** Registra el ancla de un campo de voz para scroll en nativo. */
export function registerVoiceFieldAnchor(key, ref) {
  const k = String(key || "").trim();
  if (!k) return () => {};
  anchorRefs.set(k, ref);
  return () => {
    if (anchorRefs.get(k) === ref) anchorRefs.delete(k);
  };
}

function scrollWebToField_(key) {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(voiceFieldDomId(key));
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function scrollNativeToField_(key, scrollRef) {
  const anchorRef = anchorRefs.get(key);
  const scrollNode = scrollRef?.current;
  if (!anchorRef?.current || !scrollNode) return false;

  const handle = findNodeHandle(anchorRef.current);
  if (!handle) return false;

  const responder = scrollNode.getScrollResponder?.();
  if (responder?.scrollResponderScrollNativeHandleToKeyboard) {
    try {
      responder.scrollResponderScrollNativeHandleToKeyboard(handle, 120, true);
      return true;
    } catch {
      /* fallback below */
    }
  }

  const scrollTag = findNodeHandle(scrollNode);
  if (!scrollTag) return false;

  let scrolled = false;
  try {
    anchorRef.current.measureLayout(
      scrollTag,
      (_x, y) => {
        scrollNode.scrollTo?.({ y: Math.max(0, y - 48), animated: true });
        scrolled = true;
      },
      () => {
        try {
          anchorRef.current.measureInWindow((_ax, ay) => {
            scrollNode.measureInWindow((_sx, sy) => {
              scrollNode.scrollTo?.({ y: Math.max(0, ay - sy - 48), animated: true });
              scrolled = true;
            });
          });
        } catch {
          /* ignore */
        }
      }
    );
  } catch {
    return false;
  }
  return scrolled;
}

/**
 * Desplaza el formulario hasta el campo indicado (sin ir al final).
 * @param {string} key voiceKey del campo
 * @param {{ current?: object }} [scrollRef]
 */
export function scrollToVoiceField(key, scrollRef) {
  const k = String(key || "").trim();
  if (!k) return false;
  if (Platform.OS === "web") return scrollWebToField_(k);
  return scrollNativeToField_(k, scrollRef);
}

/** Reintenta el scroll tras re-render del formulario (p. ej. al aplicar un valor). */
export function scrollToVoiceFieldWithRetry(key, scrollRef) {
  const k = String(key || "").trim();
  if (!k) return;
  [0, 80, 200, 450, 800].forEach((ms) => {
    setTimeout(() => scrollToVoiceField(k, scrollRef), ms);
  });
}

/** Envuelve un bloque del formulario para poder hacer scroll hasta él por voiceKey. */
export function VoiceFieldAnchor({ voiceKey, children, style }) {
  const k = String(voiceKey || "").trim();
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!k) return undefined;
    return registerVoiceFieldAnchor(k, anchorRef);
  }, [k]);
  if (!k) return children;
  return (
    <View ref={anchorRef} {...voiceFieldAnchorProps(k)} style={style}>
      {children}
    </View>
  );
}
