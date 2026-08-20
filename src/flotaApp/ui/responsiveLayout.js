import { Platform, useWindowDimensions } from "react-native";

/** Web: contenido centrado al 75%. APK/móvil: ancho completo adaptado a pantalla. */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isNative = !isWeb;
  const isNarrow = width < 480;
  const isMedium = width >= 480 && width < 900;

  const contentContainerStyle = isWeb
    ? { padding: 14, paddingBottom: 26, maxWidth: "75%", alignSelf: "center", width: "100%" }
    : { padding: Math.max(10, width * 0.03), paddingBottom: 24, width: "100%" };

  const cardWidthStyle = isWeb ? { maxWidth: "75%", width: "100%", alignSelf: "center" } : { width: "100%" };

  const narrowFieldStyle = isWeb ? { width: "25%", alignSelf: "flex-start" } : { flex: 1, minWidth: 0, width: "100%" };

  const inlineFieldFlexStyle = { flex: 1, minWidth: 0 };

  const dateFieldStyle = isWeb ? { width: "45%" } : { flex: 1, minWidth: 110 };

  const matriculaFieldStyle = isWeb ? { width: "25%" } : { flex: 1, minWidth: 0 };

  const calVehiculoStyle = isWeb
    ? { width: 340, maxWidth: "38%", flexShrink: 1 }
    : { flex: 1, minWidth: 0, width: "100%" };

  const modalCardStyle = isWeb
    ? { width: "70%", maxWidth: 820, height: "75%", alignSelf: "center" }
    : { width: width * 0.94, maxHeight: height * 0.82, alignSelf: "center" };

  const modalColumnsStyle = isWeb
    ? {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        maxWidth: "75%",
        alignSelf: "center",
        flexWrap: "wrap",
      }
    : {
        flexDirection: width >= 700 ? "row" : "column",
        gap: 12,
        width: "100%",
      };

  const modalColumnStyle = isWeb ? { flex: 1, minWidth: 220 } : { width: "100%", flex: width >= 700 ? 1 : undefined, minWidth: 0 };

  const menuGridStyle = isWeb
    ? { width: "75%", alignSelf: "center", flex: 0, justifyContent: "center" }
    : { width: "100%", flex: 1, alignContent: "flex-start" };

  const menuTileWidthStyle = isWeb ? { width: "75%" } : { width: "100%" };

  const fieldWrapStyle = isWeb ? { width: "75%", alignSelf: "flex-start" } : { width: "100%" };

  const actionsRowStyle = isWeb ? { flexDirection: "row", gap: 10, width: "75%", marginTop: 8 } : { flexDirection: "row", gap: 10, width: "100%", marginTop: 8 };

  const inlineLabelRowNative = isNative && isNarrow;

  return {
    width,
    height,
    isWeb,
    isNative,
    isNarrow,
    isMedium,
    contentContainerStyle,
    cardWidthStyle,
    narrowFieldStyle,
    inlineFieldFlexStyle,
    dateFieldStyle,
    matriculaFieldStyle,
    calVehiculoStyle,
    modalCardStyle,
    modalColumnsStyle,
    modalColumnStyle,
    menuGridStyle,
    menuTileWidthStyle,
    fieldWrapStyle,
    actionsRowStyle,
    inlineLabelRowNative,
    /** Columnas del menú USO: 2 en APK, 4 en web. */
    usoMenuCols: isNative ? 2 : 4,
  };
}
