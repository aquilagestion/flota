import React, { useContext, useMemo, useState } from "react";
import { Alert, BackHandler, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { ROLES } from "../auth/roles";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";

export default function LoginScreen() {
  const { login, register } = useContext(AuthContext);
  const [mode, setMode] = useState("login"); // login | register
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState(ROLES.OPERARIO);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Acceso" : "Crear cuenta"), [mode]);

  const exitApp = () => {
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
        });
        if (requestedRole === ROLES.RESPONSABLE) {
          Alert.alert("Solicitud enviada", "En breve recibirá un correo en la cuenta indicada informandole sobre la resolución. Gracias");
        } else {
          Alert.alert("Alta completada", "Usuario creado correctamente como OPERARIO.");
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
        <Text style={styles.title}>FLOTA</Text>
        <Text style={styles.subtitle}>{title}</Text>
        {mode === "register" ? (
          <>
            <TextField label="Nombre completo" required value={fullName} onChangeText={setFullName} placeholder="Nombre y apellidos" />
            <SelectField
              label="Rol solicitado"
              required
              value={requestedRole}
              onChange={(v) => setRequestedRole(v)}
              options={[
                { value: ROLES.OPERARIO, label: "OPERARIO" },
                { value: ROLES.RESPONSABLE, label: "RESPONSABLE (requiere aprobación de GESTOR)" },
              ]}
            />
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
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
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
          <View style={[styles.passwordRow, { marginTop: 10 }]}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
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
  safe: { flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "flex-start", padding: 16, paddingTop: 28 },
  logoWrap: { width: "100%", alignItems: "center", marginBottom: 10 },
  logo: { width: 92, height: 92, borderRadius: 18 },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: "900", textAlign: "center" },
  subtitle: { color: theme.colors.subtext, textAlign: "center", marginTop: 6, marginBottom: 12 },
  input: {
    backgroundColor: theme.colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyeBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  eyeText: { color: "#b7ddff", fontWeight: "700" },
  button: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.text, fontWeight: "800" },
  link: { marginTop: 12, alignItems: "center" },
  linkText: { color: "#b7ddff", fontWeight: "700" },
  exitBtn: { marginTop: 12, alignItems: "center", borderWidth: 1, borderColor: "#c96e6e", borderRadius: 8, paddingVertical: 8 },
  exitText: { color: "#ffb6b6", fontWeight: "700" },
});

