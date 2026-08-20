import React, { useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthContext } from "../auth/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import MenuScreen from "../screens/MenuScreen";
import VehiclesScreen from "../screens/VehiclesScreen";
import RequestsScreen from "../screens/RequestsScreen";
import HelpScreen from "../screens/HelpScreen";
import VehicleEditScreen from "../screens/VehicleEditScreen";
import VehicleCreateScreen from "../screens/VehicleCreateScreen";
import CollaboratorProfileScreen from "../screens/CollaboratorProfileScreen";
import IncidenciaSugerenciaScreen from "../screens/IncidenciaSugerenciaScreen";
import AppSplash from "../ui/AppSplash";
import { canAccessVehicleModule } from "../auth/roles";

const Stack = createNativeStackNavigator();

/** App web/APK independiente: solicitudes, calendario, disponibilidades y flota. */
export default function AppNavigatorUso() {
  const { user, role, booting } = useContext(AuthContext);
  const [minSplashDone, setMinSplashDone] = useState(false);

  useEffect(() => {
    const splashMs = Platform.OS === "web" ? 0 : 3000;
    const timer = setTimeout(() => setMinSplashDone(true), splashMs);
    return () => clearTimeout(timer);
  }, []);

  if (booting || !minSplashDone) return <AppSplash />;

  // GESTOR mantiene permisos de aprobación/vista en este stack USO;
  // el menú propio de RESERVAS-AUTOS (no el de GESTIFLOTA completo).
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
          {canAccessVehicleModule(role) ? <Stack.Screen name="Vehiculos" component={VehiclesScreen} /> : null}
          {canAccessVehicleModule(role) ? <Stack.Screen name="VehiculoNuevo" component={VehicleCreateScreen} /> : null}
          {canAccessVehicleModule(role) ? <Stack.Screen name="VehiculoEditar" component={VehicleEditScreen} /> : null}
          <Stack.Screen name="PerfilColaborador" component={CollaboratorProfileScreen} />
          {/* En la app USO, cualquier usuario autenticado puede acceder a solicitudes (aprobaciones de uso incluidas). */}
          <Stack.Screen name="Solicitudes" component={RequestsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
