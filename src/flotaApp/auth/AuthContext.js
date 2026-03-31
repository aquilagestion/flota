import React, { createContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAvailable, firebaseAuth, firestore } from "../firebase/firebase";
import { sheetsApi } from "../api/sheetsApi";
import { normalizeRole, ROLES } from "./roles";

const ROLE_KEY = "flota.role";
const LOCAL_USER_KEY = "@flota:localUser:v1";

export const AuthContext = createContext(null);

async function loadCachedRole() {
  try {
    return await SecureStore.getItemAsync(ROLE_KEY);
  } catch {
    return null;
  }
}

async function saveCachedRole(role) {
  try {
    if (!role) {
      await SecureStore.deleteItemAsync(ROLE_KEY);
      return;
    }
    await SecureStore.setItemAsync(ROLE_KEY, role);
  } catch {
    // silent
  }
}

async function fetchUserRole(uid) {
  const ref = doc(firestore, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data()?.role || null : null;
}

function parseUserRow_(raw) {
  if (!raw || typeof raw !== "object") return null;
  const email = String(raw.email || raw.user_email || "").trim().toLowerCase();
  if (!email) return null;
  const role = normalizeRole(raw.rol || raw.role || ROLES.OPERARIO);
  const activoRaw = String(raw.activo ?? "SI")
    .trim()
    .toUpperCase();
  const activo = activoRaw === "SI" || activoRaw === "TRUE" || activoRaw === "1";
  const nombre = String(raw.nombre || "").trim();
  const pwd = String(raw.pwd || raw.password || "").trim();
  return { email, role, activo, nombre, pwd };
}

async function fetchUserFromUsersSheetByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;

  try {
    const res = await sheetsApi.get("usuario_get", { email: e, user_email: e });
    const row = parseUserRow_(res?.data || res);
    if (row) return row;
  } catch {
    // fallback
  }

  try {
    const res = await sheetsApi.get("usuarios_list", { user_email: e });
    const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    const found = rows
      .map((r) => parseUserRow_(r))
      .find((r) => r && r.email === e);
    if (found) return found;
  } catch {
    // sin endpoint o sin conexion
  }
  return null;
}

function todayDmy_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function upsertUsuarioEnSheets_(payload, userEmailForMeta) {
  const actions = ["usuario_guardar", "usuarios_guardar", "usuario_upsert"];
  let lastErr = null;
  for (const action of actions) {
    try {
      await sheetsApi.post(action, payload, { user_email: userEmailForMeta || payload.email || "" });
      return true;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

async function createResponsableRequest_(payload, userEmailForMeta) {
  // Backends compatibles posibles (dependiendo de la version de Apps Script desplegada).
  const actions = ["solicitud_responsable_crear", "rol_responsable_solicitar", "usuario_solicitar_responsable"];
  for (const action of actions) {
    try {
      await sheetsApi.post(action, payload, { user_email: userEmailForMeta || payload.email || "" });
      return true;
    } catch {
      // probamos siguiente endpoint
    }
  }
  return false;
}

async function loadLocalUser_() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveLocalUser_(u) {
  try {
    if (!u) {
      await AsyncStorage.removeItem(LOCAL_USER_KEY);
      return;
    }
    await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u));
  } catch {
    // silent
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!firebaseAvailable || !firebaseAuth || !firestore) {
      // Modo Sheets/preview sin Firebase configurado: "login" local por email.
      (async () => {
        const local = await loadLocalUser_();
        if (local?.email) {
          const email = String(local.email || "").trim().toLowerCase();
          const fromSheet = await fetchUserFromUsersSheetByEmail_(email);
          if (fromSheet && !fromSheet.activo) {
            setUser(null);
            setRole(null);
            await saveLocalUser_(null);
            await saveCachedRole(null);
            setBooting(false);
            return;
          }
          const effectiveRole = normalizeRole(fromSheet?.role || local.role || ROLES.OPERARIO);
          setUser({ uid: local.uid || "local", email });
          setRole(effectiveRole);
          await saveLocalUser_({ uid: local.uid || `local-${email}`, email, role: effectiveRole });
          await saveCachedRole(effectiveRole);
        } else {
          setUser(null);
          setRole(null);
          await saveCachedRole(null);
        }
        setBooting(false);
      })();
      return;
    }

    let mounted = true;
    loadCachedRole().then((cached) => {
      if (mounted && cached) setRole(cached);
    });
    const unsub = onAuthStateChanged(firebaseAuth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        await saveCachedRole(null);
        setBooting(false);
        return;
      }
      try {
        const sheetUser = await fetchUserFromUsersSheetByEmail_(u.email || "");
        if (sheetUser && !sheetUser.activo) {
          await signOut(firebaseAuth);
          setRole(null);
          await saveCachedRole(null);
          setBooting(false);
          return;
        }

        const remoteRole = await fetchUserRole(u.uid);
        const effectiveRole = normalizeRole(sheetUser?.role || remoteRole || ROLES.OPERARIO);
        if (remoteRole) {
          setRole(effectiveRole);
          await saveCachedRole(effectiveRole);
        } else {
          await setDoc(
            doc(firestore, "users", u.uid),
            { email: u.email || "", role: effectiveRole, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
            { merge: true }
          );
          setRole(effectiveRole);
          await saveCachedRole(effectiveRole);
        }
      } catch {
        // Si falla Firestore/permisos, mantenemos rol operativo por defecto.
        setRole(ROLES.OPERARIO);
        await saveCachedRole(ROLES.OPERARIO);
      } finally {
        setBooting(false);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const api = useMemo(
    () => ({
      user,
      role,
      booting,
      firebaseAvailable,
      async login(email, password) {
        const e = email.trim().toLowerCase();
        if (!firebaseAvailable || !firebaseAuth) {
          const fromSheet = await fetchUserFromUsersSheetByEmail_(e);
          if (!fromSheet) {
            throw new Error("Usuario no encontrado. Regístrate primero.");
          }
          if (!fromSheet.activo) {
            throw new Error("Usuario inactivo. Contacta con el gestor.");
          }
          if (!String(fromSheet.pwd || "").trim()) {
            throw new Error("Usuario sin contraseña en USUARIOS. Contacta con el gestor.");
          }
          if (String(password || "") !== String(fromSheet.pwd || "")) {
            throw new Error("Contraseña incorrecta.");
          }
          const localUser = { uid: `local-${e}`, email: e, role: normalizeRole(fromSheet?.role || ROLES.OPERARIO) };
          setUser({ uid: localUser.uid, email: localUser.email });
          setRole(localUser.role);
          await saveLocalUser_(localUser);
          await saveCachedRole(localUser.role);
          return;
        }
        await signInWithEmailAndPassword(firebaseAuth, e, password);
      },
      async register(email, password, extra = {}) {
        const e = email.trim().toLowerCase();
        const nombre = String(extra?.nombre || "").trim();
        const roleRequested = normalizeRole(extra?.role || ROLES.OPERARIO);
        if (!nombre) throw new Error("El nombre completo es obligatorio.");

        if (!firebaseAvailable || !firebaseAuth) {
          const fromSheet = await fetchUserFromUsersSheetByEmail_(e);
          if (fromSheet) {
            if (!fromSheet.activo) throw new Error("Usuario inactivo. Contacta con el gestor.");
            throw new Error("El usuario ya existe. Usa 'Entrar'.");
          }

          // Si pide RESPONSABLE, entra como OPERARIO hasta aprobación de gestor.
          const effectiveRole = roleRequested === ROLES.RESPONSABLE ? ROLES.OPERARIO : ROLES.OPERARIO;
          await upsertUsuarioEnSheets_(
            {
              email: e,
              nombre,
              rol: effectiveRole,
              activo: "SI",
              pwd: String(password || ""),
              fecha_alta: todayDmy_(),
            },
            e
          );

          let requestSent = false;
          if (roleRequested === ROLES.RESPONSABLE) {
            requestSent = await createResponsableRequest_(
              {
                email: e,
                nombre,
                rol_solicitado: ROLES.RESPONSABLE,
                estado: "PENDIENTE",
                fecha_solicitud: todayDmy_(),
              },
              e
            );
          }

          const localUser = { uid: `local-${e}`, email: e, role: effectiveRole };
          setUser({ uid: localUser.uid, email: localUser.email });
          setRole(localUser.role);
          await saveLocalUser_(localUser);
          await saveCachedRole(localUser.role);
          return { requestedRole: roleRequested, requestSent };
        }
        await createUserWithEmailAndPassword(firebaseAuth, e, password);

        // Refleja también el alta en USUARIOS para flujos corporativos con Sheets.
        const effectiveRole = roleRequested === ROLES.RESPONSABLE ? ROLES.OPERARIO : ROLES.OPERARIO;
        try {
          await upsertUsuarioEnSheets_(
            {
              email: e,
              nombre,
              rol: effectiveRole,
              activo: "SI",
              pwd: String(password || ""),
              fecha_alta: todayDmy_(),
            },
            e
          );
        } catch {
          // no bloqueamos alta Firebase si falla el espejo en Sheets
        }
        let requestSent = false;
        if (roleRequested === ROLES.RESPONSABLE) {
          requestSent = await createResponsableRequest_(
            {
              email: e,
              nombre,
              rol_solicitado: ROLES.RESPONSABLE,
              estado: "PENDIENTE",
              fecha_solicitud: todayDmy_(),
            },
            e
          );
        }
        return { requestedRole: roleRequested, requestSent };
      },
      async logout() {
        if (!firebaseAvailable || !firebaseAuth) {
          setUser(null);
          setRole(null);
          await saveLocalUser_(null);
          await saveCachedRole(null);
          return;
        }
        await signOut(firebaseAuth);
      },
    }),
    [user, role, booting]
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

