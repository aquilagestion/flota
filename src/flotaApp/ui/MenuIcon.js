import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

/** Icono de tile del menú (APK / nativo). */
export default function MenuIcon({ name, size = 26, color = "#9ec4e9", warn = false }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={warn ? "#ffb4b4" : color}
    />
  );
}
