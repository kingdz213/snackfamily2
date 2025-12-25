import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from "firebase/messaging";

type EnvRecord = Record<string, string | boolean | undefined>;

const readFirebaseEnv = (primaryKey: string, fallbackKey: string) => {
  const env = import.meta.env as EnvRecord;
  const rawValue = env[primaryKey] ?? env[fallbackKey];
  if (typeof rawValue !== "string") return undefined;
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : undefined;
};

const firebaseConfig: FirebaseOptions = {
  apiKey: readFirebaseEnv("VITE_FIREBASE_API_KEY", "FIREBASE_API_KEY"),
  authDomain: readFirebaseEnv("VITE_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN"),
  projectId: readFirebaseEnv("VITE_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"),
  storageBucket: readFirebaseEnv("VITE_FIREBASE_STORAGE_BUCKET", "FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readFirebaseEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_MESSAGING_SENDER_ID"),
  appId: readFirebaseEnv("VITE_FIREBASE_APP_ID", "FIREBASE_APP_ID"),
  measurementId: readFirebaseEnv("VITE_FIREBASE_MEASUREMENT_ID", "FIREBASE_MEASUREMENT_ID"),
};

const requiredEnvPairs: Array<{ configKey: keyof FirebaseOptions; envKeys: [string, string] }> = [
  { configKey: "apiKey", envKeys: ["VITE_FIREBASE_API_KEY", "FIREBASE_API_KEY"] },
  { configKey: "authDomain", envKeys: ["VITE_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN"] },
  { configKey: "projectId", envKeys: ["VITE_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"] },
  { configKey: "storageBucket", envKeys: ["VITE_FIREBASE_STORAGE_BUCKET", "FIREBASE_STORAGE_BUCKET"] },
  { configKey: "messagingSenderId", envKeys: ["VITE_FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_MESSAGING_SENDER_ID"] },
  { configKey: "appId", envKeys: ["VITE_FIREBASE_APP_ID", "FIREBASE_APP_ID"] },
];

export const missingFirebaseEnvKeys = requiredEnvPairs
  .filter(({ configKey }) => {
    const value = firebaseConfig[configKey];
    return typeof value !== "string" || value.trim().length === 0;
  })
  .map(({ envKeys }) => `${envKeys[0]} (ou ${envKeys[1]})`);

let firebaseInitError: string | null =
  missingFirebaseEnvKeys.length > 0
    ? `Configuration Firebase incomplète. Variables manquantes: ${missingFirebaseEnvKeys.join(", ")}`
    : null;

if (firebaseInitError && import.meta.env.DEV) {
  console.error("[Firebase] Configuration manquante:", missingFirebaseEnvKeys);
}

let appInstance: ReturnType<typeof initializeApp> | null = null;

if (!firebaseInitError) {
  try {
    appInstance = initializeApp(firebaseConfig);
  } catch (error) {
    firebaseInitError = "Impossible d'initialiser Firebase. Vérifiez la configuration.";
    if (import.meta.env.DEV) {
      console.error("[Firebase] Échec d'initialisation:", error);
    }
  }
}

export const app = appInstance;
export { firebaseInitError };
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

export const initAnalytics = async () => {
  if (!app) return null;
  try {
    const supported = await isSupported();
    return supported ? getAnalytics(app) : null;
  } catch {
    return null;
  }
};

export const analyticsPromise = initAnalytics();

let messagingPromise: Promise<Messaging | null> | null = null;

export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (!app) return null;
  if (!messagingPromise) {
    messagingPromise = isMessagingSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
};
