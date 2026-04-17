import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../ui/theme";
import { HELP_BODY } from "../content/helpGestiflotaText";

export default function HelpScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.navigate("Menu")}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver al menú"
        >
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
        <Text style={styles.topTitle} maxFontSizeMultiplier={2}>
          Ayuda
        </Text>
        <View style={styles.backSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.body} selectable maxFontSizeMultiplier={2}>
          {HELP_BODY}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 16 },
  topTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 18 },
  backSpacer: { minWidth: 72 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  body: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "justify",
    width: "100%",
    alignSelf: "stretch",
  },
});
