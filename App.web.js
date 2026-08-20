import "./src/flotaApp/ui/webScalePatch";
import React from "react";
import { StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/flotaApp/auth/AuthContext";
import AppNavigator from "./src/flotaApp/navigation/AppNavigator";
import AppNavigatorUso from "./src/flotaApp/navigation/AppNavigatorUso";
import { SyncProvider } from "./src/flotaApp/context/SyncContext";
import { isUsoRuntime } from "./src/flotaApp/config/appMode";

const Stack = createNativeStackNavigator();

/** Entrada web: misma app sin banner ni descarga APK (solo Android). */
export default function App() {
  return (
    <View style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthProvider>
            <SyncProvider>
              <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Root">
                <Stack.Screen name="Root" component={isUsoRuntime() ? AppNavigatorUso : AppNavigator} />
              </Stack.Navigator>
            </SyncProvider>
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
