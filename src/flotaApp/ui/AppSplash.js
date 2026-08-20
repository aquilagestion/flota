import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { APP_BRAND, isUsoRuntime } from "../config/appMode";

export default function AppSplash() {
  const zoom = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, {
          toValue: 1.1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(zoom, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [zoom]);

  return (
    <View style={styles.safe}>
      <Animated.Image
        source={require("../../../assets/logo-grefa-45.png")}
        style={[styles.logo, { transform: [{ scale: zoom }] }]}
        resizeMode="contain"
      />
      <Text style={styles.brandText}>GREFA 45 años generando Biodiversidad</Text>
      <Text style={styles.appName}>{isUsoRuntime() ? "Módulo de uso de vehículos" : APP_BRAND}</Text>
      <ActivityIndicator />
      <Text style={styles.credit}>Creada por Miguel Montero con soporte de Cursor IA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#071423",
    paddingHorizontal: 18,
    gap: 14,
  },
  logo: { width: 110, height: 110, borderRadius: 24, marginBottom: 4, backgroundColor: "#ffffff" },
  brandText: { color: "#e8f5ff", fontSize: 20, fontWeight: "700", letterSpacing: 0.3, textAlign: "center", marginBottom: 2 },
  appName: { color: "#9ec4e9", fontSize: 14, fontWeight: "700", textAlign: "center" },
  credit: { color: "#9ec4e9", fontWeight: "800", textAlign: "center", fontSize: 12 },
});
