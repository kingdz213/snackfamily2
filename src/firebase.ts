// src/firebase.ts
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  getMessaging,
  isSupported as isMessagingSupported,
  type Messaging,
} from "firebase/messaging";

/**
 * Vite n’expose au navigateur QUE les variables préfixées par VITE_.
 * Donc en production, FIREBASE_API_KEY (sans VITE_) sera toujours undefined.
 */
type ViteEnv = Record<string, string | boolean | undefined>;

const readViteEnv = (key: string): string | undefined => {
  const env = import.meta.env as ViteEnv;
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  return v.length ? v : undefined;
};

const FIREBASE_ENV_KEYS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID", // optionnel
} as const;

const firebaseConfig = {
  apiKey: readViteEnv(FIREBASE_ENV_KEYS.apiKey),
  authDomain: readViteEnv(FIREBASE_ENV_KEYS.authDomain),
  projectId: readViteEnv(FIREBASE_ENV_KEYS.projectId),
  storageBucket: readViteEnv(FIREBASE_ENV_KEYS.storageBucket),
  messagingSenderId: readViteEnv(FIREBASE_ENV_KEYS.messagingSenderId),
  appId: readViteEnv(FIREBASE_ENV_KEYS.appId),
  measurementId: readViteEnv(FIREBASE_ENV_KEYS.measurementId),
};

const REQUIRED_CONFIG: Array<{ key: keyof typeof firebaseConfig; envKey: string }> = [
  { key: "apiKey", envKey: FIREBASE_ENV_KEYS.apiKey },
  { key: "authDomain", envKey: FIREBASE_ENV_KEYS.authDomain },
  { key: "projectId", envKey: FIREBASE_ENV_KEYS.projectId },
  { key: "storageBucket", envKey: FIREBASE_ENV_KEYS.storageBucket },
  { key: "messagingSenderId", envKey: FIREBASE_ENV_KEYS.messagingSenderId },
  { key: "appId", envKey: FIREBASE_ENV_KEYS.appId },
];

export const missingFirebaseEnvKeys: string[] = REQUIRED_CONFIG
  .filter(({ key }) => {
    const v = firebaseConfig[key];
    return typeof v !== "string" || v.trim().length === 0;
  })
  .map(({ envKey }) => envKey);

export const firebaseInitError: string | null =
  missingFirebaseEnvKeys.length > 0
    ? `${missingFirebaseEnvKeys.join(", ")} manquant.`
    : null;

let appInstance: FirebaseApp | null = null;

if (!firebaseInitError) {
  try {
    appInstance = initializeApp(firebaseConfig);
  } catch (e) {
    // Si init échoue (config invalide / double init / etc.)
    appInstance = null;
  }
}

export const app = appInstance;

// Services (null si Firebase non initialisé)
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

// Analytics (optionnel, support variable selon environnement)
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

// Messaging (optionnel, support variable selon navigateur)
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
