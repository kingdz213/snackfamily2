// src/firebase.ts
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from "firebase/messaging";

/**
 * IMPORTANT:
 * - En front (Vite), SEULES les variables import.meta.env.VITE_* existent.
 * - On ne doit JAMAIS dépendre de FIREBASE_* côté navigateur.
 */
type ViteEnv = Record<string, string | boolean | undefined>;

const read = (key: string): string | undefined => {
  const env = import.meta.env as ViteEnv;
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  return v.length ? v : undefined;
};

const KEYS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID", // optionnel
} as const;

const firebaseConfig = {
  apiKey: read(KEYS.apiKey),
  authDomain: read(KEYS.authDomain),
  projectId: read(KEYS.projectId),
  storageBucket: read(KEYS.storageBucket),
  messagingSenderId: read(KEYS.messagingSenderId),
  appId: read(KEYS.appId),
  measurementId: read(KEYS.measurementId),
};

const REQUIRED: Array<keyof typeof firebaseConfig> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

export const missingFirebaseEnvKeys: string[] = REQUIRED
  .filter((k) => {
    const v = firebaseConfig[k];
    return typeof v !== "string" || v.trim().length === 0;
  })
  .map((k) => {
    // map le champ -> la variable VITE correspondante
    switch (k) {
      case "apiKey":
        return KEYS.apiKey;
      case "authDomain":
        return KEYS.authDomain;
      case "projectId":
        return KEYS.projectId;
      case "storageBucket":
        return KEYS.storageBucket;
      case "messagingSenderId":
        return KEYS.messagingSenderId;
      case "appId":
        return KEYS.appId;
      default:
        return "VITE_FIREBASE_*";
    }
  });

export const firebaseInitError: string | null =
  missingFirebaseEnvKeys.length === 0
    ? null
    : missingFirebaseEnvKeys.length === 1
      ? `${missingFirebaseEnvKeys[0]} manquant.`
      : `Variables Firebase manquantes: ${missingFirebaseEnvKeys.join(", ")}.`;

let appInstance: FirebaseApp | null = null;

if (!firebaseInitError) {
  try {
    // évite "Firebase App named '[DEFAULT]' already exists" en HMR / multi-init
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  } catch (e) {
    appInstance = null;
  }
}

export const app = appInstance;

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

export const initAnalytics = async (): Promise<Analytics | null> => {
  if (!app) return null;
  if (typeof window === "undefined") return null;

  try {
    const ok = await isAnalyticsSupported();
    return ok ? getAnalytics(app) : null;
  } catch {
    return null;
  }
};

export const analyticsPromise = initAnalytics();

let messagingPromise: Promise<Messaging | null> | null = null;

export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (!app) return null;
  if (typeof window === "undefined") return null;

  if (!messagingPromise) {
    messagingPromise = isMessagingSupported()
      .then((ok) => (ok ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
};

/**
 * Debug safe: ne leak pas les valeurs, seulement "présent / absent".
 * Utile pour vérifier si le build a bien reçu les env vars.
 */
export const getFirebaseEnvPresence = () => {
  const env = import.meta.env as ViteEnv;
  const has = (k: string) => typeof env[k] === "string" && String(env[k]).trim().length > 0;
  return {
    [KEYS.apiKey]: has(KEYS.apiKey),
    [KEYS.authDomain]: has(KEYS.authDomain),
    [KEYS.projectId]: has(KEYS.projectId),
    [KEYS.storageBucket]: has(KEYS.storageBucket),
    [KEYS.messagingSenderId]: has(KEYS.messagingSenderId),
    [KEYS.appId]: has(KEYS.appId),
    [KEYS.measurementId]: has(KEYS.measurementId),
  };
};
