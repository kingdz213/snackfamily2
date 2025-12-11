import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDWHgqFOblVcyy14qROkGth-gUqCyug0AY",
  authDomain: "snackfamily2.firebaseapp.com",
  projectId: "snackfamily2",
  storageBucket: "snackfamily2.firebasestorage.app",
  messagingSenderId: "749971984886",
  appId: "1:749971984886:web:9d9f262fe288178efb77d7",
  measurementId: "G-CLR14N1PER"
};

// Initialize core Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore database
const db = getFirestore(app);

// Initialize Analytics (guarded for SSR + unsupported environments)
let analytics: ReturnType<typeof getAnalytics> | null = null;

isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { app, db, analytics };
