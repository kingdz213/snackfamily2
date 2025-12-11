import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase config for Vite + React + TypeScript
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
const analytics = (await isSupported()) ? getAnalytics(app) : null;

export { app, db, analytics };
