/**
 * Escala UI solo en web (no afecta APK):
 * - Zoom de página 75%
 * - Fuentes ×2 (fontSize / lineHeight en StyleSheet.create)
 *
 * Debe importarse como primer import de App.web.js.
 */
import { Platform, StyleSheet } from "react-native";

export const WEB_PAGE_ZOOM = 0.75;
export const WEB_FONT_SCALE = 2;

function scaleFontDeep_(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scaleFontDeep_);
  const out = { ...value };
  if (typeof out.fontSize === "number") out.fontSize = out.fontSize * WEB_FONT_SCALE;
  if (typeof out.lineHeight === "number") out.lineHeight = out.lineHeight * WEB_FONT_SCALE;
  return out;
}

function injectPageZoom_() {
  if (typeof document === "undefined") return;
  if (document.getElementById("gestiflota-web-zoom")) return;
  const el = document.createElement("style");
  el.id = "gestiflota-web-zoom";
  el.textContent = `html, body { zoom: ${WEB_PAGE_ZOOM}; }`;
  document.head.appendChild(el);
}

if (Platform.OS === "web") {
  injectPageZoom_();
  if (!globalThis.__FLOTA_WEB_FONT_SCALE_PATCH__) {
    globalThis.__FLOTA_WEB_FONT_SCALE_PATCH__ = true;
    const origCreate = StyleSheet.create.bind(StyleSheet);
    StyleSheet.create = (styles) => {
      const scaled = {};
      for (const key of Object.keys(styles || {})) {
        scaled[key] = scaleFontDeep_(styles[key]);
      }
      return origCreate(scaled);
    };
  }
}
