import React, { createContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  deleteUser,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
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
  const telefono = String(raw.telefono || "").trim();
  const fecha_alta = String(raw.fecha_alta || "").trim();
  return { email, role, activo, nombre, pwd, telefono, fecha_alta };
}

async function fetchUserFromUsersSheetByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  let invalidGetDetected = false;

  try {
    const res = await sheetsApi.get("usuario_get", { email: e, user_email: e });
    const row = parseUserRow_(res?.data || res);
    if (row) return row;
  } catch (err) {
    if (String(err?.message || "").toLowerCase().includes("acci") && String(err?.message || "").toLowerCase().includes("no reconocida")) {
      invalidGetDetected = true;
    }
  }
  try {
    const res = await sheetsApi.get("usuario_get", { email: e });
    const row = parseUserRow_(res?.data || res);
    if (row) return row;
  } catch (err) {
    if (String(err?.message || "").toLowerCase().includes("acci") && String(err?.message || "").toLowerCase().includes("no reconocida")) {
      invalidGetDetected = true;
    }
  }

  try {
    const res = await sheetsApi.get("usuarios_list", { user_email: e });
    const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    const found = rows
      .map((r) => parseUserRow_(r))
      .find((r) => r && r.email === e);
    if (found) return found;
  } catch (err) {
    if (String(err?.message || "").toLowerCase().includes("acci") && String(err?.message || "").toLowerCase().includes("no reconocida")) {
      invalidGetDetected = true;
    }
  }
  try {
    const res = await sheetsApi.get("usuarios_list");
    const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    const found = rows
      .map((r) => parseUserRow_(r))
      .find((r) => r && r.email === e);
    if (found) return found;
  } catch (err) {
    if (String(err?.message || "").toLowerCase().includes("acci") && String(err?.message || "").toLowerCase().includes("no reconocida")) {
      invalidGetDetected = true;
    }
  }
  if (invalidGetDetected) {
    throw new Error("El backend Apps Script no tiene habilitado usuario_get/usuarios_list.");
  }
  return null;
}

async function authenticateWithUsersSheet_(email, password) {
  const e = String(email || "").trim().toLowerCase();
  const fromSheet = await fetchUserFromUsersSheetByEmail_(e);
  if (!fromSheet) {
    throw new Error("Usuario no encontrado. Regístrate primero.");
  }
  if (!fromSheet.activo) {
    throw new Error("Usuario inactivo. Contacta con el gestor.");
  }
  const pwdInSheet = String(fromSheet.pwd || "").trim();
  if (!pwdInSheet) {
    throw new Error("Usuario sin contraseña en USUARIOS. Contacta con el gestor.");
  }
  if (String(password || "") !== pwdInSheet) {
    throw new Error("Contraseña incorrecta.");
  }
  return {
    uid: `local-${e}`,
    email: e,
    role: normalizeRole(fromSheet?.role || ROLES.OPERARIO),
  };
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

async function registerUsuarioPublicoEnSheets_(payload) {
  const actions = ["usuario_registro_publico", "usuario_publico_guardar", "registro_usuario", "registro_publico_usuario", "usuario_guardar"];
  const metas = [{}, { user_email: "" }];
  let lastErr = null;
  for (const action of actions) {
    for (const meta of metas) {
      try {
        await sheetsApi.post(action, payload, meta);
        return true;
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("usuario no encontrado o inactivo")) {
          throw new Error("El backend bloquea altas públicas: requiere user_email activo para POST.");
        }
        if (msg.includes("acci") && msg.includes("no reconocida") && action !== "usuario_guardar") {
          continue;
        }
      }
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

async function updatePasswordInUsersSheet_(email, newPassword, userEmailForMeta) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) throw new Error("Email inválido para actualizar contraseña.");

  const existing = await fetchUserFromUsersSheetByEmail_(e);
  if (!existing) throw new Error("Usuario no encontrado en USUARIOS.");
  if (!existing.activo) throw new Error("Usuario inactivo. Contacta con el gestor.");

  const payload = {
    email: e,
    nombre: String(existing.nombre || "").trim(),
    rol: normalizeRole(existing.role || ROLES.OPERARIO),
    activo: existing.activo ? "SI" : "NO",
    telefono: String(existing.telefono || "").trim(),
    pwd: String(newPassword || ""),
    fecha_alta: String(existing.fecha_alta || "").trim() || todayDmy_(),
    actualizado_por_email: String(userEmailForMeta || e).trim().toLowerCase(),
  };

  await upsertUsuarioEnSheets_(payload, userEmailForMeta || e);
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
          setUser({ uid: local.uid || `local-${email}`, email });
          setRole(effectiveRole);
          await saveLocalUser_({ uid: local.uid || `local-${email}`, email, role: effectiveRole });
          await saveCachedRole(effectiveRole);
          setBooting(false);
          return;
        }

        setRole(null);
        await saveLocalUser_(null);
        await saveCachedRole(null);
        setBooting(false);
        return;
      }
      try {
        await saveLocalUser_(null);
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
          const localUser = await authenticateWithUsersSheet_(e, password);
          setUser({ uid: localUser.uid, email: localUser.email });
          setRole(localUser.role);
          await saveLocalUser_(localUser);
          await saveCachedRole(localUser.role);
          return;
        }
        try {
          await signInWithEmailAndPassword(firebaseAuth, e, password);
          return;
        } catch (firebaseErr) {
          const code = String(firebaseErr?.code || "");
          const canFallbackToSheet =
            code === "auth/invalid-credential" ||
            code === "auth/user-not-found" ||
            code === "auth/wrong-password";
          if (!canFallbackToSheet) {
            throw firebaseErr;
          }

          const localUser = await authenticateWithUsersSheet_(e, password);
          setUser({ uid: localUser.uid, email: localUser.email });
          setRole(localUser.role);
          await saveLocalUser_(localUser);
          await saveCachedRole(localUser.role);
        }
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
          try {
            await registerUsuarioPublicoEnSheets_({
              email: e,
              nombre,
              rol: effectiveRole,
              activo: "SI",
              pwd: String(password || ""),
              fecha_alta: todayDmy_(),
            });
          } catch (eReg) {
            const raw = String(eReg?.message || "");
            const low = raw.toLowerCase();
            if (low.includes("no encontrado o inactivo") || low.includes("inactivo")) {
              throw new Error(
                "El backend bloqueó el alta pública. Debes habilitar el registro de usuarios en Apps Script o usar un endpoint de registro público."
              );
            }
            throw eReg;
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

          const localUser = { uid: `local-${e}`, email: e, role: effectiveRole };
          setUser({ uid: localUser.uid, email: localUser.email });
          setRole(localUser.role);
          await saveLocalUser_(localUser);
          await saveCachedRole(localUser.role);
          return { requestedRole: roleRequested, requestSent };
        }
        await createUserWithEmailAndPassword(firebaseAuth, e, password);
        const createdFirebaseUser = firebaseAuth.currentUser;

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
            ""
          );
        } catch (eUpsert) {
          // Si falla espejo en USUARIOS, deshacemos el alta Firebase para no dejar inconsistencias.
          if (createdFirebaseUser) {
            try {
              await deleteUser(createdFirebaseUser);
            } catch {
              // si no se puede borrar, al menos cerramos sesión para evitar uso parcial.
              try {
                await signOut(firebaseAuth);
              } catch {
                // silent
              }
            }
          }
          throw new Error(eUpsert?.message || "No se pudo registrar el usuario en USUARIOS.");
        }

        const mirrored = await fetchUserFromUsersSheetByEmail_(e);
        if (!mirrored) {
          throw new Error("Alta incompleta: el usuario no aparece en USUARIOS.");
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
        if (firebaseAvailable && firebaseAuth) {
          try {
            await signOut(firebaseAuth);
          } catch {
            // si falla Firebase, igual limpiamos sesion local
          }
        }
        setUser(null);
        setRole(null);
        await saveLocalUser_(null);
        await saveCachedRole(null);
      },
      async changePassword(currentPassword, newPassword) {
        const currentPwd = String(currentPassword || "");
        const nextPwd = String(newPassword || "");
        if (!nextPwd || nextPwd.length < 6) {
          throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");
        }
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) throw new Error("No hay usuario autenticado.");

        // Validamos la contraseña actual contra USUARIOS para garantizar control en backend corporativo.
        const sheetUser = await fetchUserFromUsersSheetByEmail_(email);
        if (!sheetUser) throw new Error("Usuario no encontrado en USUARIOS.");
        if (!sheetUser.activo) throw new Error("Usuario inactivo. Contacta con el gestor.");
        if (String(sheetUser.pwd || "").trim() !== currentPwd) {
          throw new Error("La contraseña actual no coincide.");
        }

        // Si hay sesión Firebase real, mantenemos ambas credenciales en sincronía.
        const firebaseUser = firebaseAvailable && firebaseAuth ? firebaseAuth.currentUser : null;
        if (firebaseUser?.email && String(firebaseUser.email).trim().toLowerCase() === email) {
          try {
            const credential = EmailAuthProvider.credential(email, currentPwd);
            await reauthenticateWithCredential(firebaseUser, credential);
            await updatePassword(firebaseUser, nextPwd);
          } catch (e) {
            const code = String(e?.code || "");
            if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
              throw new Error("La contraseña actual de Firebase no coincide.");
            }
            throw new Error(e?.message || "No se pudo actualizar la contraseña en Firebase.");
          }
        }

        await updatePasswordInUsersSheet_(email, nextPwd, email);
      },
    }),
    [user, role, booting]
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

