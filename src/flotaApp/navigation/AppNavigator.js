import React, { useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from "react-native";
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
import ExpenseSheetsScreen from "../screens/ExpenseSheetsScreen";
import ApprovalsScreen from "../screens/ApprovalsScreen";
import ResponsableSolicitudesScreen from "../screens/ResponsableSolicitudesScreen";
import HelpScreen from "../screens/HelpScreen";
import VehicleEditScreen from "../screens/VehicleEditScreen";
import VehicleCreateScreen from "../screens/VehicleCreateScreen";
import UserEditScreen from "../screens/UserEditScreen";
import CollaboratorProfileScreen from "../screens/CollaboratorProfileScreen";
import OwnVehicleTripsScreen from "../screens/OwnVehicleTripsScreen";
import { isAdministracion, isColaborador } from "../auth/roles";

const Stack = createNativeStackNavigator();

function Splash() {
  const zoom = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, {
          toValue: 1.1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(zoom, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
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
      <ActivityIndicator />
      <Text style={styles.credit}>Creada por Miguel Montero con soporte de Cursor IA</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, role, booting } = useContext(AuthContext);
  const administracion = isAdministracion(role);
  const colaborador = isColaborador(role);
  const [minSplashDone, setMinSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashDone(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (booting || !minSplashDone) return <Splash />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Menu" component={MenuScreen} />
          <Stack.Screen name="Ayuda" component={HelpScreen} />
          {!colaborador ? <Stack.Screen name="Vehiculos" component={VehiclesScreen} /> : null}
          {!colaborador ? <Stack.Screen name="VehiculoNuevo" component={VehicleCreateScreen} /> : null}
          {!colaborador ? <Stack.Screen name="VehiculoEditar" component={VehicleEditScreen} /> : null}
          <Stack.Screen name="Aprobaciones" component={ApprovalsScreen} />
          <Stack.Screen name="SolicitudesResponsable" component={ResponsableSolicitudesScreen} />
          <Stack.Screen name="Usuarios" component={UsersAdminScreen} />
          <Stack.Screen name="UsuarioEditar" component={UserEditScreen} />
          <Stack.Screen name="VehiculoPropio" component={OwnVehicleTripsScreen} />
          {!administracion ? <Stack.Screen name="PerfilColaborador" component={CollaboratorProfileScreen} /> : null}
          <Stack.Screen name="Gasto" component={ExpenseFormScreen} />
          {!administracion && !colaborador ? <Stack.Screen name="Mantenimiento" component={MaintenanceFormScreen} /> : null}
          {!administracion ? <Stack.Screen name="Historial" component={HistoryScreen} /> : null}
          {!administracion ? <Stack.Screen name="HojasGasto" component={ExpenseSheetsScreen} /> : null}
          {!administracion && !colaborador ? <Stack.Screen name="Destinos" component={DestinationsScreen} /> : null}
          {!administracion && !colaborador ? <Stack.Screen name="Solicitudes" component={RequestsScreen} /> : null}
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#071423", paddingHorizontal: 18, gap: 14 },
  logo: { width: 110, height: 110, borderRadius: 24, marginBottom: 4, backgroundColor: "#ffffff" },
  brandText: { color: "#e8f5ff", fontSize: 20, fontWeight: "700", letterSpacing: 0.3, textAlign: "center", marginBottom: 2 },
  credit: { color: "#9ec4e9", fontWeight: "800", textAlign: "center", fontSize: 12 },
});

