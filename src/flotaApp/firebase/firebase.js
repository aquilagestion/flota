import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { env } from "../config/env";

function assertFirebaseConfig(cfg) {
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const missing = required.filter((k) => !cfg?.[k]);
  if (missing.length) {
    throw new Error(
      `Faltan variables Firebase: ${missing
        .map((k) => `EXPO_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`)
        .join(", ")}`
    );
  }
}

let firebaseAvailable = true;
try {
  assertFirebaseConfig(env.firebase);
} catch {
  firebaseAvailable = false;
}

export const firebaseApp = firebaseAvailable
  ? getApps().length
    ? getApps()[0]
    : initializeApp(env.firebase)
  : null;

export const firebaseAuth = firebaseAvailable ? getAuth(firebaseApp) : null;
export const firestore = firebaseAvailable ? getFirestore(firebaseApp) : null;
export const storage = firebaseAvailable ? getStorage(firebaseApp) : null;
export { firebaseAvailable };

