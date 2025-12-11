import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase initialization for Vite + React + TypeScript
const firebaseConfig = {
  apiKey: "AIzaSyDWHgqFOblVcyy14qROkGth-gUqCyug0AY",
  authDomain: "snackfamily2.firebaseapp.com",
  projectId: "snackfamily2",
  storageBucket: "snackfamily2.firebasestorage.app",
  messagingSenderId: "749971984886",
  appId: "1:749971984886:web:9d9f262fe288178efb77d7",
  measurementId: "G-CLR14N1PER"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let analytics: ReturnType<typeof getAnalytics> | null = null;

if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // ignore analytics init errors in unsupported environments
    });
}

export { app, db, analytics };
