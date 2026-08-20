import React, { useContext, useMemo, useState } from "react";
import { Alert, BackHandler, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { ROLES, registrationRoleOptions } from "../auth/roles";
import { theme } from "../ui/theme";
import { APP_BRAND, isUsoRuntime } from "../config/appMode";
import { SelectField, TextField } from "../ui/form/Fields";

/** Escala del menú de identificación: +100% (doble) proporcional. */
const ID_SCALE = 2;

export default function LoginScreen() {
  const { login, register } = useContext(AuthContext);
  const [mode, setMode] = useState("login"); // login | register
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState(ROLES.COLABORADOR);
  const [telefono, setTelefono] = useState("");
  const [nif, setNif] = useState("");
  const [iban, setIban] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Acceso" : "Crear cuenta"), [mode]);

  const exitApp = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const ok =
        typeof window.confirm === "function" ? window.confirm("¿Quieres salir?") : true;
      if (!ok) return;
      try {
        window.open("", "_self");
        window.close();
      } catch {
        // ignore
      }
      // Muchos navegadores bloquean window.close(); forzar salida de la app.
      try {
        window.location.replace("about:blank");
      } catch {
        try {
          window.location.href = "about:blank";
        } catch {
          // ignore
        }
      }
      return;
    }
    Alert.alert("Salir", "¿Quieres cerrar la aplicación?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => BackHandler.exitApp() },
    ]);
  };

  const submit = async () => {
    const e = email.trim();
    if (!e || !e.includes("@")) {
      Alert.alert("Email inválido", "Introduce un correo válido.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Contraseña inválida", "Debe tener al menos 6 caracteres.");
      return;
    }
    if (mode === "register") {
      if (!fullName.trim()) {
        Alert.alert("Nombre obligatorio", "Introduce tu nombre completo.");
        return;
      }
      if (!password2 || password2 !== password) {
        Alert.alert("Contraseñas no coinciden", "Debes escribir la misma contraseña en ambos campos.");
        return;
      }
    }
    try {
      setBusy(true);
      if (mode === "login") await login(e, password);
      else {
        const result = await register(e, password, {
          nombre: fullName.trim(),
          role: requestedRole,
          telefono: telefono.trim(),
          nif: nif.trim(),
          iban: iban.trim(),
        });
        if (
          requestedRole === ROLES.RESPONSABLE ||
          requestedRole === ROLES.GESTOR ||
          requestedRole === ROLES.ADMINISTRACION
        ) {
          Alert.alert("Solicitud enviada", "En breve recibirá un correo en la cuenta indicada informandole sobre la resolución. Gracias");
        } else {
          Alert.alert("Alta completada", `Usuario creado correctamente como ${requestedRole}.`);
        }
      }
    } catch (err) {
      Alert.alert("Error", err?.message || "No se pudo completar el acceso. Revisa credenciales o conexión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.safe}>
      <View style={styles.logoWrap}>
        <Image source={require("../../../assets/logo-grefa-45.png")} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{APP_BRAND}</Text>
        <Text style={styles.subtitle}>{isUsoRuntime() ? "Solicitudes, calendario y liberaciones" : title}</Text>
        {mode === "register" ? (
          <>
            <TextField textScale={ID_SCALE} label="Nombre completo" required value={fullName} onChangeText={setFullName} placeholder="Nombre y apellidos" />
            <SelectField
              textScale={ID_SCALE}
              label="Rol solicitado"
              required
              value={requestedRole}
              onChange={(v) => setRequestedRole(v)}
              options={registrationRoleOptions()}
            />
            {requestedRole === ROLES.COLABORADOR ? (
              <>
                <TextField textScale={ID_SCALE} label="Teléfono" required={false} value={telefono} onChangeText={setTelefono} placeholder="Teléfono" />
                <TextField textScale={ID_SCALE} label="NIF" required={false} value={nif} onChangeText={setNif} placeholder="NIF" />
                <TextField textScale={ID_SCALE} label="IBAN" required={false} value={iban} onChangeText={setIban} placeholder="IBAN" />
              </>
            ) : null}
          </>
        ) : null}

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Correo electrónico"
          placeholderTextColor={theme.colors.placeholder}
          value={email}
          onChangeText={setEmail}
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, minWidth: 0 }]}
            secureTextEntry={!showPwd}
            placeholder="Contraseña"
            placeholderTextColor={theme.colors.placeholder}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowPwd((v) => !v)}>
            <Text style={styles.eyeText}>{showPwd ? "Ocultar" : "Ver"}</Text>
          </Pressable>
        </View>

        {mode === "register" ? (
          <View style={[styles.passwordRow, { marginTop: 10 * ID_SCALE }]}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, minWidth: 0 }]}
              secureTextEntry={!showPwd2}
              placeholder="Confirmar contraseña"
              placeholderTextColor={theme.colors.placeholder}
              value={password2}
              onChangeText={setPassword2}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPwd2((v) => !v)}>
              <Text style={styles.eyeText}>{showPwd2 ? "Ocultar" : "Ver"}</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Procesando..." : mode === "login" ? "Entrar" : "Crear cuenta"}</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode((m) => (m === "login" ? "register" : "login"))}
          disabled={busy}
          style={styles.link}
        >
          <Text style={styles.linkText}>
            {mode === "login" ? "¿No tienes cuenta? Crear" : "Ya tengo cuenta: entrar"}
          </Text>
        </Pressable>
        <Pressable onPress={exitApp} disabled={busy} style={styles.exitBtn}>
          <Text style={styles.exitText}>Salir</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 16 * ID_SCALE,
    paddingTop: 28 * ID_SCALE,
  },
  logoWrap: { width: "100%", alignItems: "center", marginBottom: 10 * ID_SCALE },
  logo: {
    width: 92 * ID_SCALE,
    height: 92 * ID_SCALE,
    borderRadius: 18 * ID_SCALE,
    backgroundColor: "#ffffff",
  },
  card: {
    width: "100%",
    maxWidth: Math.round(440 * ID_SCALE * 1.15),
    backgroundColor: theme.colors.card,
    borderRadius: 14 * ID_SCALE,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16 * ID_SCALE,
  },
  title: { color: theme.colors.text, fontSize: 28 * ID_SCALE, fontWeight: "900", textAlign: "center" },
  subtitle: {
    color: theme.colors.subtext,
    textAlign: "center",
    marginTop: 6 * ID_SCALE,
    marginBottom: 12 * ID_SCALE,
    fontSize: (Platform.OS === "web" ? 14 : 13) * ID_SCALE,
  },
  input: {
    backgroundColor: theme.colors.input,
    borderRadius: 10 * ID_SCALE,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12 * ID_SCALE,
    paddingVertical: 10 * ID_SCALE,
    marginBottom: 10 * ID_SCALE,
    fontSize: 16 * ID_SCALE,
    minWidth: 0,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8 * ID_SCALE,
    width: "100%",
    flexWrap: "nowrap",
  },
  eyeBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    borderRadius: 10 * ID_SCALE,
    paddingHorizontal: 10 * ID_SCALE,
    paddingVertical: 10 * ID_SCALE,
    flexShrink: 0,
  },
  eyeText: { color: "#b7ddff", fontWeight: "700", fontSize: 14 * ID_SCALE },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10 * ID_SCALE,
    paddingVertical: 12 * ID_SCALE,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "800", fontSize: 16 * ID_SCALE },
  link: { marginTop: 12 * ID_SCALE, alignItems: "center" },
  linkText: { color: "#b7ddff", fontWeight: "700", fontSize: 14 * ID_SCALE },
  exitBtn: {
    marginTop: 12 * ID_SCALE,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c96e6e",
    borderRadius: 8 * ID_SCALE,
    paddingVertical: 8 * ID_SCALE,
  },
  exitText: { color: "#ffb6b6", fontWeight: "700", fontSize: 14 * ID_SCALE },
});
