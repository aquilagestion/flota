import { Platform, StyleSheet } from "react-native";

/** Ajuste tipográfico web para pantallas densas (vehículos, perfil, incidencias). */
export const WEB_UI_FS = Platform.OS === "web" ? 1.25 : 1;

export function webFs_(baseStyle, factor = WEB_UI_FS) {
  if (Platform.OS !== "web" || !factor || factor === 1) return null;
  const flat = StyleSheet.flatten(baseStyle) || {};
  const out = {};
  if (typeof flat.fontSize === "number") out.fontSize = flat.fontSize * factor;
  if (typeof flat.lineHeight === "number") out.lineHeight = flat.lineHeight * factor;
  return out;
}

/** Multiplica fontSize/lineHeight en un objeto de estilo (antes de StyleSheet.create). */
export function boostFonts_(style, factor = WEB_UI_FS) {
  if (Platform.OS !== "web" || !style || !factor || factor === 1) return style;
  const out = { ...style };
  if (typeof out.fontSize === "number") out.fontSize = Math.round(out.fontSize * factor);
  if (typeof out.lineHeight === "number") out.lineHeight = Math.round(out.lineHeight * factor);
  return out;
}
