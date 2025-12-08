import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDWHgqFOblVcyy14qROkGth-gUqCyug0AY',
  authDomain: 'snackfamily2.firebaseapp.com',
  projectId: 'snackfamily2',
  storageBucket: 'snackfamily2.firebasestorage.app',
  messagingSenderId: '749971984886',
  appId: '1:749971984886:web:9d9f262fe288178efb77d7',
  measurementId: 'G-CLR14N1PER',
};

// Reuse any existing Firebase app to avoid re-initialization in Vite HMR.
export const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const db = getFirestore(app);

let analytics: Analytics | undefined;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // getAnalytics can throw in non-browser contexts (SSR, tests); ignore gracefully.
    console.warn('Analytics unavailable in this environment.', error);
  }
}

export { analytics };
