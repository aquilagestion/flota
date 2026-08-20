import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * Iconos del menú en web vía MDI (CSS). Más fiable que expo-font + TTF en hosting estático.
 * Requiere hoja mdi inyectada en index.html (web-postbuild).
 */
export default function MenuIcon({ name, size = 26, color = "#9ec4e9", warn = false }) {
  const fill = warn ? "#ffb4b4" : color;
  const cls = `mdi mdi-${String(name || "").trim()}`;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <span
        className={cls}
        style={{
          fontSize: size,
          color: fill,
          lineHeight: `${size}px`,
          display: "inline-block",
          width: size,
          height: size,
          textAlign: "center",
        }}
        aria-hidden="true"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
