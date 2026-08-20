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
import { normalizeRole, preferHigherRole, roleRank, ROLES } from "./roles";
import { resetLocalFromSheet_ } from "../lib/localExpenseReconcile";
import { syncService } from "../sync/syncService";
import { localDb } from "../storage/localDb";

const ROLE_KEY = "flota.role";
const LOCAL_USER_KEY = "@flota:localUser:v1";

export const AuthContext = createContext(null);

async function loadCachedRole() {
  try {
    const fromSecure = await SecureStore.getItemAsync(ROLE_KEY);
    if (fromSecure) return fromSecure;
  } catch {
    // SecureStore no disponible (p. ej. web)
  }
  try {
    return await AsyncStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

async function saveCachedRole(role) {
  try {
    if (!role) {
      await SecureStore.deleteItemAsync(ROLE_KEY);
    } else {
      await SecureStore.setItemAsync(ROLE_KEY, role);
    }
  } catch {
    // SecureStore no disponible (p. ej. web)
  }
  try {
    if (!role) {
      await AsyncStorage.removeItem(ROLE_KEY);
    } else {
      await AsyncStorage.setItem(ROLE_KEY, role);
    }
  } catch {
    // silent
  }
}

async function fetchUserRole(uid) {
  const ref = doc(firestore, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data()?.role || null : null;
}

function pickFieldCI_(raw, names) {
  if (!raw || typeof raw !== "object") return undefined;
  const map = {};
  for (const k of Object.keys(raw)) {
    map[String(k).trim().toLowerCase()] = raw[k];
  }
  for (const name of names) {
    const key = String(name).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return undefined;
}

function parseUserRow_(raw) {
  if (!raw || typeof raw !== "object") return null;
  const email = String(pickFieldCI_(raw, ["email", "user_email"]) || "").trim().toLowerCase();
  if (!email) return null;
  // Puede haber "Rol" (GESTOR) y "rol" (USUARIO erróneo del API antiguo): elegir el de mayor privilegio.
  const roleCandidates = [];
  for (const k of Object.keys(raw)) {
    const lk = String(k).trim().toLowerCase();
    if (lk === "rol" || lk === "role") roleCandidates.push(normalizeRole(raw[k]));
  }
  let role = preferHigherRole(...roleCandidates);
  if (!roleCandidates.length) role = normalizeRole(ROLES.USUARIO);
  const activoRaw = String(pickFieldCI_(raw, ["activo"]) ?? "SI")
    .trim()
    .toUpperCase();
  const activo = activoRaw === "SI" || activoRaw === "TRUE" || activoRaw === "1";
  const nombre = String(pickFieldCI_(raw, ["nombre", "name"]) || "").trim();
  const pwd = String(pickFieldCI_(raw, ["pwd", "password"]) || "").trim();
  const telefono = String(pickFieldCI_(raw, ["telefono", "tel", "phone"]) || "").trim();
  const fecha_alta = String(pickFieldCI_(raw, ["fecha_alta", "fecha alta"]) || "").trim();
  const nif = String(pickFieldCI_(raw, ["nif"]) || "").trim();
  const iban = String(pickFieldCI_(raw, ["iban"]) || "").trim();
  return { email, role, activo, nombre, pwd, telefono, fecha_alta, nif, iban };
}

function parseColaboradorRow_(raw) {
  if (!raw || typeof raw !== "object") return null;
  const email = String(raw.email || "").trim().toLowerCase();
  if (!email) return null;
  return {
    id_colaborador: String(raw.id_colaborador || "").trim(),
    email,
    nombre: String(raw.nombre || "").trim(),
    nif: String(raw.nif || "").trim(),
    iban: String(raw.iban || "").trim(),
    telefono: String(raw.telefono || "").trim(),
    activo: String(raw.activo ?? "SI")
      .trim()
      .toUpperCase(),
  };
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
  const resolved = await resolveEffectiveRoleForEmail_(e, { localRole: fromSheet.role });
  return {
    uid: `local-${e}`,
    email: e,
    role: resolved.role,
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
    rol: normalizeRole(existing.role || ROLES.USUARIO),
    activo: existing.activo ? "SI" : "NO",
    telefono: String(existing.telefono || "").trim(),
    pwd: String(newPassword || ""),
    fecha_alta: String(existing.fecha_alta || "").trim() || todayDmy_(),
    actualizado_por_email: String(userEmailForMeta || e).trim().toLowerCase(),
  };

  await upsertUsuarioEnSheets_(payload, userEmailForMeta || e);
}

async function upsertColaboradorEnSheets_(payload, userEmailForMeta) {
  const actions = ["colaborador_guardar", "colaborador_upsert", "colaborador_crear"];
  let lastErr = null;
  for (const action of actions) {
    try {
      await sheetsApi.post(action, payload, {
        user_email: userEmailForMeta || payload.email_colaborador || payload.email || "",
      });
      return true;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

async function fetchColaboradorByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const actions = ["colaborador_get", "colaborador_list"];
  for (const action of actions) {
    try {
      const res = await sheetsApi.get(action, { email: e, user_email: e });
      if (action === "colaborador_get") {
        const c = parseColaboradorRow_(res?.data || res);
        if (c) return c;
      } else {
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const found = rows.map(parseColaboradorRow_).find((c) => c && c.email === e);
        if (found) return found;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function colaboradorActivo_(colab) {
  const activo = String(colab?.activo ?? "SI")
    .trim()
    .toUpperCase();
  return activo === "SI" || activo === "TRUE" || activo === "1";
}

/** Rol efectivo: USUARIOS (Sheet) > Firebase > caché > local; enriquece COLABORADOR vía tabla colaboradores. */
async function resolveEffectiveRoleForEmail_(email, opts = {}) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return { role: ROLES.USUARIO, inactive: false, sheetUser: null };

  const { localRole, cachedRole, remoteRole } = opts;
  let sheetUser = null;
  try {
    sheetUser = await fetchUserFromUsersSheetByEmail_(e);
  } catch {
    // sin red o backend no disponible
  }

  if (sheetUser && !sheetUser.activo) {
    return { role: null, inactive: true, sheetUser };
  }

  let role = preferHigherRole(sheetUser?.role, remoteRole, cachedRole, localRole);
  if (!role || roleRank(role) < 1) role = ROLES.USUARIO;

  if (role === ROLES.USUARIO || role === ROLES.COLABORADOR) {
    try {
      const colab = await fetchColaboradorByEmail_(e);
      if (colab?.email && colaboradorActivo_(colab)) {
        role = ROLES.COLABORADOR;
      } else if (role === ROLES.COLABORADOR && !colab) {
        role = ROLES.USUARIO;
      }
    } catch {
      // mantener rol de USUARIOS
    }
  }

  // No degradar GESTOR/ADMIN/RESPONSABLE si Sheet devolvió USUARIO por error de lectura
  // pero la sesión/caché ya tenían un rol superior.
  role = preferHigherRole(role, sheetUser?.role, remoteRole, cachedRole, localRole);

  return { role, inactive: false, sheetUser };
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

async function applySheetAsSourceAfterAuth_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return;
  try {
    await resetLocalFromSheet_(e);
  } catch {
    // Si falla el pull, se mantiene lo local; el usuario puede sincronizar luego.
  }
}

/** Lee usuario cacheado síncronamente de localStorage (web) o devuelve null. */
function readLocalUserSync_() {
  try {
    // En web AsyncStorage usa localStorage internamente y el item está disponible síncronamente.
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Si hay sesión cacheada arrancamos con booting=false para mostrar la app inmediatamente.
  // Firebase confirmará (o denegará) la sesión en background y actualizará el estado.
  const hasCachedSession = readLocalUserSync_() !== null;
  const [user, setUser] = useState(() => {
    const lu = readLocalUserSync_();
    return lu ? { uid: lu.uid || "local", email: lu.email } : null;
  });
  const [role, setRole] = useState(() => {
    const lu = readLocalUserSync_();
    return lu?.role ? lu.role : null;
  });
  const [booting, setBooting] = useState(!hasCachedSession);

  useEffect(() => {
    if (!firebaseAvailable || !firebaseAuth || !firestore) {
      // Modo Sheets/preview sin Firebase configurado: "login" local por email.
      (async () => {
        const local = await loadLocalUser_();
        if (local?.email) {
          const email = String(local.email || "").trim().toLowerCase();
          const cached = await loadCachedRole();
          const resolved = await resolveEffectiveRoleForEmail_(email, {
            localRole: local.role,
            cachedRole: cached,
          });
          if (resolved.inactive) {
            setUser(null);
            setRole(null);
            await saveLocalUser_(null);
            await saveCachedRole(null);
            setBooting(false);
            return;
          }
          const effectiveRole = resolved.role;
          setUser({ uid: local.uid || "local", email });
          setRole(effectiveRole);
          await saveLocalUser_({ uid: local.uid || `local-${email}`, email, role: effectiveRole });
          await saveCachedRole(effectiveRole);
          await applySheetAsSourceAfterAuth_(email);
        } else {
          setUser(null);
          setRole(null);
          await saveCachedRole(null);
        }
        setBooting(false);
      })();
      return;
    }

    const unsub = onAuthStateChanged(firebaseAuth, async (u) => {
      setUser(u);
      if (!u) {
        const local = await loadLocalUser_();
        if (local?.email) {
          const email = String(local.email || "").trim().toLowerCase();
          const cached = await loadCachedRole();
          const resolved = await resolveEffectiveRoleForEmail_(email, {
            localRole: local.role,
            cachedRole: cached,
          });
          if (resolved.inactive) {
            setUser(null);
            setRole(null);
            await saveLocalUser_(null);
            await saveCachedRole(null);
            setBooting(false);
            return;
          }
          const effectiveRole = resolved.role;
          setUser({ uid: local.uid || `local-${email}`, email });
          setRole(effectiveRole);
          await saveLocalUser_({ uid: local.uid || `local-${email}`, email, role: effectiveRole });
          await saveCachedRole(effectiveRole);
          await applySheetAsSourceAfterAuth_(email);
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
        const cached = await loadCachedRole();
        let remoteRole = null;
        try {
          remoteRole = await fetchUserRole(u.uid);
        } catch {
          // Firestore no disponible
        }
        const resolved = await resolveEffectiveRoleForEmail_(u.email || "", {
          cachedRole: cached,
          remoteRole,
        });
        if (resolved.inactive) {
          await signOut(firebaseAuth);
          setRole(null);
          await saveCachedRole(null);
          setBooting(false);
          return;
        }

        const effectiveRole = resolved.role;
        setRole(effectiveRole);
        await saveCachedRole(effectiveRole);
        if (firestore) {
          try {
            await setDoc(
              doc(firestore, "users", u.uid),
              { email: u.email || "", role: effectiveRole, updatedAt: serverTimestamp() },
              { merge: true }
            );
          } catch {
            // silent
          }
        }
        await applySheetAsSourceAfterAuth_(u.email || "");
      } catch {
        const cached = await loadCachedRole();
        const resolved = await resolveEffectiveRoleForEmail_(u.email || "", { cachedRole: cached });
        const effectiveRole = resolved.inactive ? ROLES.USUARIO : resolved.role;
        setRole(effectiveRole);
        await saveCachedRole(effectiveRole);
      } finally {
        setBooting(false);
      }
    });
    return () => {
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
          await applySheetAsSourceAfterAuth_(localUser.email);
          return;
        }
        try {
          await signInWithEmailAndPassword(firebaseAuth, e, password);
          // onAuthStateChanged aplicará Sheet como fuente.
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
          await applySheetAsSourceAfterAuth_(localUser.email);
        }
      },
      async register(email, password, extra = {}) {
        const e = email.trim().toLowerCase();
        const nombre = String(extra?.nombre || "").trim();
        const roleRequested = normalizeRole(extra?.role || ROLES.USUARIO);
        const colaboradorExtra = {
          nombre_colaborador: String(extra?.nombre || "").trim(),
          telefono: String(extra?.telefono || "").trim(),
          nif: String(extra?.nif || "").trim(),
          iban: String(extra?.iban || "").trim(),
          email_colaborador: e,
          activo_colaborador: "SI",
        };
        if (!nombre) throw new Error("El nombre completo es obligatorio.");

        if (!firebaseAvailable || !firebaseAuth) {
          const fromSheet = await fetchUserFromUsersSheetByEmail_(e);
          if (fromSheet) {
            if (!fromSheet.activo) throw new Error("Usuario inactivo. Contacta con el gestor.");
            throw new Error("El usuario ya existe. Usa 'Entrar'.");
          }

          // Si pide RESPONSABLE, entra como USUARIO hasta aprobación de gestor.
          const effectiveRole =
            roleRequested === ROLES.COLABORADOR
              ? ROLES.COLABORADOR
              : roleRequested === ROLES.RESPONSABLE
              ? ROLES.USUARIO
              : ROLES.USUARIO;
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

          if (effectiveRole === ROLES.COLABORADOR) {
            await upsertColaboradorEnSheets_(colaboradorExtra, e);
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
          await applySheetAsSourceAfterAuth_(e);
          return { requestedRole: roleRequested, requestSent };
        }
        await createUserWithEmailAndPassword(firebaseAuth, e, password);
        const createdFirebaseUser = firebaseAuth.currentUser;

        // Refleja también el alta en USUARIOS para flujos corporativos con Sheets.
          const effectiveRole =
            roleRequested === ROLES.COLABORADOR
              ? ROLES.COLABORADOR
              : roleRequested === ROLES.RESPONSABLE
              ? ROLES.USUARIO
              : ROLES.USUARIO;
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
        if (effectiveRole === ROLES.COLABORADOR) {
          await upsertColaboradorEnSheets_(colaboradorExtra, e);
        }
        return { requestedRole: roleRequested, requestSent };
      },
      async logout(opts = {}) {
        const force = !!opts?.force;
        if (!force) {
          try {
            const res = await syncService.flushIfOnline();
            const outbox = await localDb.getOutbox();
            const pendingKinds = (Array.isArray(outbox) ? outbox : []).filter((j) => {
              const k = String(j?.kind || "");
              return k === "expense" || k === "expense_sheet";
            }).length;
            const remaining = Math.max(Number(res?.remainingCount || 0) || 0, pendingKinds);
            if (remaining > 0) {
              return { ok: false, needsConfirm: true, remaining };
            }
          } catch (e) {
            const outbox = await localDb.getOutbox();
            const remaining = (Array.isArray(outbox) ? outbox : []).length;
            if (remaining > 0) {
              return {
                ok: false,
                needsConfirm: true,
                remaining,
                syncError: e?.message || "No se pudo sincronizar",
              };
            }
          }
        }

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
        return { ok: true };
      },
      /** Relee USUARIOS (útil tras aprobación de rol RESPONSABLE sin cerrar sesión). */
      async syncRoleFromUsersSheet() {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) return;
        try {
          const resolved = await resolveEffectiveRoleForEmail_(email, { cachedRole: role });
          if (resolved.inactive || !resolved.role) return;
          const next = resolved.role;
          if (next === normalizeRole(role)) return;
          setRole(next);
          await saveCachedRole(next);
          const lu = await loadLocalUser_();
          if (lu && String(lu.email || "").trim().toLowerCase() === email) {
            await saveLocalUser_({ ...lu, role: next, uid: lu.uid || `local-${email}` });
          }
          if (firebaseAvailable && firebaseAuth?.currentUser) {
            const fu = firebaseAuth.currentUser;
            if (String(fu.email || "").trim().toLowerCase() === email && firestore) {
              try {
                await setDoc(doc(firestore, "users", fu.uid), { role: next, updatedAt: serverTimestamp() }, { merge: true });
              } catch {
                // silent
              }
            }
          }
        } catch {
          // silent
        }
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
      async getColaboradorProfile() {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) return null;
        const sheetUser = await fetchUserFromUsersSheetByEmail_(email);
        let colab = null;
        try {
          colab = await fetchColaboradorByEmail_(email);
        } catch {
          colab = null;
        }
        return {
          email,
          nombre: String(colab?.nombre || sheetUser?.nombre || "").trim(),
          telefono: String(colab?.telefono || sheetUser?.telefono || "").trim(),
          nif: String(colab?.nif || sheetUser?.nif || "").trim(),
          iban: String(colab?.iban || sheetUser?.iban || "").trim(),
        };
      },
      async updateColaboradorProfile(data = {}) {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) throw new Error("No hay usuario autenticado.");
        const sheetUser = await fetchUserFromUsersSheetByEmail_(email);
        if (!sheetUser) throw new Error("Usuario no encontrado en USUARIOS.");
        // Nunca degradar GESTOR (u otro rol alto) al guardar "Mis datos".
        const keptRole = preferHigherRole(sheetUser.role, role);
        const nombre = String(data.nombre || sheetUser.nombre || "").trim();
        const telefono = String(data.telefono || sheetUser.telefono || "").trim();
        const nif = String(data.nif || "").trim();
        const iban = String(data.iban || "").trim();
        const userPayload = {
          email,
          nombre,
          rol: keptRole,
          role: keptRole,
          activo: sheetUser.activo ? "SI" : "NO",
          telefono,
          nif,
          iban,
          pwd: String(sheetUser.pwd || ""),
          fecha_alta: String(sheetUser.fecha_alta || "").trim() || todayDmy_(),
          actor_email: email,
          actualizado_por_email: email,
          preserve_role_if_usuario: "1",
          preserve_higher_role: "1",
        };
        let savedUser = false;
        try {
          await registerUsuarioPublicoEnSheets_(userPayload);
          savedUser = true;
        } catch {
          try {
            await upsertUsuarioEnSheets_(userPayload, email);
            savedUser = true;
          } catch (e2) {
            throw new Error(e2?.message || "No se pudo guardar en USUARIOS.");
          }
        }
        // COLABORADORES es opcional (puede no existir endpoint en el backend).
        try {
          await upsertColaboradorEnSheets_(
            {
              email_colaborador: email,
              nombre_colaborador: nombre,
              telefono,
              nif,
              iban,
              activo_colaborador: "SI",
            },
            email
          );
        } catch {
          if (!savedUser) throw new Error("No se pudieron guardar los datos.");
        }
        return { ok: true, email, nombre, telefono, nif, iban };
      },
    }),
    [user, role, booting]
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

