import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/flotaApp/auth/AuthContext";
import AppNavigator from "./src/flotaApp/navigation/AppNavigator";
import AppNavigatorUso from "./src/flotaApp/navigation/AppNavigatorUso";
import { isUsoRuntime } from "./src/flotaApp/config/appMode";
import AppUpdateBanner from "./src/flotaApp/ui/AppUpdateBanner";
import { useApkUpdateCheck } from "./src/flotaApp/hooks/useApkUpdateCheck";
import { ApkUpdateContext } from "./src/flotaApp/context/ApkUpdateContext";
import { SyncProvider } from "./src/flotaApp/context/SyncContext";

const Stack = createNativeStackNavigator();

function NativeAppShell() {
  const { update, dismiss, installedVersion, forceRefresh } = useApkUpdateCheck({
    enabled: Platform.OS !== "web",
  });

  return (
    <ApkUpdateContext.Provider value={{ installedVersion, forceRefresh }}>
      <SyncProvider>
        <View style={styles.root}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Root" component={isUsoRuntime() ? AppNavigatorUso : AppNavigator} />
          </Stack.Navigator>
          {update ? (
            <AppUpdateBanner
              remoteVersion={update.version}
              downloadUrl={update.downloadUrl}
              releaseNotes={update.releaseNotes}
              onDismiss={dismiss}
            />
          ) : null}
        </View>
      </SyncProvider>
    </ApkUpdateContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <NativeAppShell />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
