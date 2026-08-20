import React, { useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthContext } from "../auth/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import MenuScreen from "../screens/MenuScreen";
import VehiclesScreen from "../screens/VehiclesScreen";
import ExpenseFormScreen from "../screens/ExpenseFormScreen";
import ExpenseEditListScreen from "../screens/ExpenseEditListScreen";
import MaintenanceFormScreen from "../screens/MaintenanceFormScreen";
import HistoryScreen from "../screens/HistoryScreen";
import DestinationsScreen from "../screens/DestinationsScreen";
import UsersAdminScreen from "../screens/UsersAdminScreen";
import RequestsScreen from "../screens/RequestsScreen";
import ExpenseSheetsScreen from "../screens/ExpenseSheetsScreen";
import ApprovalsScreen from "../screens/ApprovalsScreen";
import WorkbenchScreen from "../screens/WorkbenchScreen";
import GobiernoMensualScreen from "../screens/GobiernoMensualScreen";
import InformeKmFlotaScreen from "../screens/InformeKmFlotaScreen";
import ResponsableSolicitudesScreen from "../screens/ResponsableSolicitudesScreen";
import HelpScreen from "../screens/HelpScreen";
import VehicleEditScreen from "../screens/VehicleEditScreen";
import VehicleCreateScreen from "../screens/VehicleCreateScreen";
import UserEditScreen from "../screens/UserEditScreen";
import CollaboratorProfileScreen from "../screens/CollaboratorProfileScreen";
import OwnVehicleTripsScreen from "../screens/OwnVehicleTripsScreen";
import ExpenseSheetImportScreen from "../screens/ExpenseSheetImportScreen";
import IncidenciaSugerenciaScreen from "../screens/IncidenciaSugerenciaScreen";
import {
  canAccessDestinos,
  canAccessFieldExpenseOps,
  canAccessMaintenance,
  canAccessTripsModule,
  canAccessUseVehicles,
  canAccessVehicleModule,
  canApproveExpenseSheets,
  canAccessWorkbench,
  canAccessManagementReports,
  canAccessKmFleetReport,
  canManageResponsableSolicitudes,
  canManageUsers,
} from "../auth/roles";

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
      <ActivityIndicator />
      <Text style={styles.credit}>Creada por Miguel Montero con soporte de Cursor IA</Text>
    </View>
  );
}

export default function AppNavigator({ skipInitialSplash = false }) {
  const { user, role, booting } = useContext(AuthContext);
  const [minSplashDone, setMinSplashDone] = useState(!!skipInitialSplash);

  useEffect(() => {
    if (skipInitialSplash) {
      setMinSplashDone(true);
      return;
    }
    const splashMs = Platform.OS === "web" ? 0 : 3000;
    const timer = setTimeout(() => setMinSplashDone(true), splashMs);
    return () => clearTimeout(timer);
  }, [skipInitialSplash]);

  if (booting || !minSplashDone) return <Splash />;

  return (
    <Stack.Navigator
      key={user ? `in-${user.email || user.uid || "user"}` : "out"}
      initialRouteName={user ? "Menu" : "Login"}
      screenOptions={{ headerShown: false }}
    >
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Menu" component={MenuScreen} />
          <Stack.Screen name="Ayuda" component={HelpScreen} />
          <Stack.Screen name="IncidenciaSugerencia" component={IncidenciaSugerenciaScreen} />
          {canAccessWorkbench(role) ? <Stack.Screen name="Bandeja" component={WorkbenchScreen} /> : null}
          {canAccessVehicleModule(role) ? <Stack.Screen name="Vehiculos" component={VehiclesScreen} /> : null}
          {canAccessVehicleModule(role) ? <Stack.Screen name="VehiculoNuevo" component={VehicleCreateScreen} /> : null}
          {canAccessVehicleModule(role) ? <Stack.Screen name="VehiculoEditar" component={VehicleEditScreen} /> : null}
          {canApproveExpenseSheets(role) ? <Stack.Screen name="Aprobaciones" component={ApprovalsScreen} /> : null}
          {canAccessManagementReports(role) ? (
            <Stack.Screen name="InformeMensual" component={GobiernoMensualScreen} />
          ) : null}
          {canAccessKmFleetReport(role) ? (
            <Stack.Screen name="InformeKmFlota" component={InformeKmFlotaScreen} />
          ) : null}
          {canManageResponsableSolicitudes(role) ? (
            <Stack.Screen name="SolicitudesResponsable" component={ResponsableSolicitudesScreen} />
          ) : null}
          {canManageUsers(role) ? <Stack.Screen name="Usuarios" component={UsersAdminScreen} /> : null}
          {canManageUsers(role) ? <Stack.Screen name="UsuarioEditar" component={UserEditScreen} /> : null}
          {canAccessTripsModule(role) ? <Stack.Screen name="VehiculoPropio" component={OwnVehicleTripsScreen} /> : null}
          <Stack.Screen name="PerfilColaborador" component={CollaboratorProfileScreen} />
          {canAccessFieldExpenseOps(role) ? <Stack.Screen name="Gasto" component={ExpenseFormScreen} /> : null}
          {canAccessFieldExpenseOps(role) ? <Stack.Screen name="GastosEditar" component={ExpenseEditListScreen} /> : null}
          {canAccessMaintenance(role) ? <Stack.Screen name="Mantenimiento" component={MaintenanceFormScreen} /> : null}
          {canAccessFieldExpenseOps(role) ? <Stack.Screen name="Historial" component={HistoryScreen} /> : null}
          {canAccessFieldExpenseOps(role) ? <Stack.Screen name="HojasGasto" component={ExpenseSheetsScreen} /> : null}
          {canAccessFieldExpenseOps(role) ? (
            <Stack.Screen name="ImportarHojaExcel" component={ExpenseSheetImportScreen} />
          ) : null}
          {canAccessDestinos(role) ? <Stack.Screen name="Destinos" component={DestinationsScreen} /> : null}
          <Stack.Screen name="Solicitudes" component={RequestsScreen} />
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

