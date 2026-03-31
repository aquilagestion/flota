import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/flotaApp/auth/AuthContext";
import AppNavigator from "./src/flotaApp/navigation/AppNavigator";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Root" component={AppNavigator} />
          </Stack.Navigator>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
