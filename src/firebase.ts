import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDWHgqF0bIVcyy14qROkGth-gUqCyug0AY",
  authDomain: "snackfamily2.firebaseapp.com",
  projectId: "snackfamily2",
  storageBucket: "snackfamily2.appspot.com",
  messagingSenderId: "749971984886",
  appId: "1:749971984886:web:9d9f262fe288178efb77d7",
  measurementId: "G-CLR14N1PER",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let analytics = null;

isSupported().then((yes) => {
  if (yes) analytics = getAnalytics(app);
});

export { app, db, analytics };
