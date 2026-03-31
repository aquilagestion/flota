import React, { useContext } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthContext } from "../auth/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import MenuScreen from "../screens/MenuScreen";
import VehiclesScreen from "../screens/VehiclesScreen";
import ExpenseFormScreen from "../screens/ExpenseFormScreen";
import MaintenanceFormScreen from "../screens/MaintenanceFormScreen";
import HistoryScreen from "../screens/HistoryScreen";
import DestinationsScreen from "../screens/DestinationsScreen";
import UsersAdminScreen from "../screens/UsersAdminScreen";
import RequestsScreen from "../screens/RequestsScreen";

const Stack = createNativeStackNavigator();

function Splash() {
  return (
    <View style={styles.safe}>
      <ActivityIndicator />
      <Text style={styles.credit}>Creada por Miguel Montero con soporte de Cursor IA</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, booting } = useContext(AuthContext);

  if (booting) return <Splash />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Menu" component={MenuScreen} />
          <Stack.Screen name="Vehiculos" component={VehiclesScreen} />
          <Stack.Screen name="Gasto" component={ExpenseFormScreen} />
          <Stack.Screen name="Mantenimiento" component={MaintenanceFormScreen} />
          <Stack.Screen name="Historial" component={HistoryScreen} />
          <Stack.Screen name="Destinos" component={DestinationsScreen} />
          <Stack.Screen name="Usuarios" component={UsersAdminScreen} />
          <Stack.Screen name="Solicitudes" component={RequestsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#071423", paddingHorizontal: 18, gap: 14 },
  credit: { color: "#9ec4e9", fontWeight: "800", textAlign: "center", fontSize: 12 },
});

