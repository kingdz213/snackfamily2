import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyDWHgqFOblVcyy14qROkGth-gUqCyug0AY',
  authDomain: 'snackfamily2.firebaseapp.com',
  projectId: 'snackfamily2',
  storageBucket: 'snackfamily2.appspot.com',
  messagingSenderId: '749971984886',
  appId: '1:749971984886:web:9d9f262fe288178efb77d7',
  measurementId: 'G-CLR14N1PER',
};

// Works in Vite + React + TypeScript; reuse the app when HMR is active
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((error) => {
      console.warn('Analytics unavailable in this environment.', error);
    });
}
