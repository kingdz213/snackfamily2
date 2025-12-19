import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDWHgqFOblVcyy14qROkGth-gUqCyug0AY",
  authDomain: "snackfamily2.firebaseapp.com",
  projectId: "snackfamily2",
  storageBucket: "snackfamily2.firebasestorage.app",
  messagingSenderId: "749971984886",
  appId: "1:749971984886:web:9d9f262fe288178efb77d7",
  measurementId: "G-CLR14N1PER"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Firestore DB
export const db = getFirestore(app);

// Analytics (optional)
export const analytics = await isSupported().then(s => s ? getAnalytics(app) : null);

// Messaging (guarded for browsers that do not support it)
export const messaging: Messaging | null = await isMessagingSupported()
  .then((supported) => supported ? getMessaging(app) : null)
  .catch(() => null);
