import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { db, getFirebaseMessaging } from '@/src/firebase';

const PUSH_TOKEN_STORAGE_KEY = 'sf2_push_token';

export const getStoredPushToken = () => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

const setStoredPushToken = (token: string) => {
  try {
    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
};

type PushRegistrationResult = {
  status: 'granted' | 'denied' | 'unsupported' | 'error';
  message?: string;
  token?: string;
};

export const requestPushPermissionAndRegister = async (uid: string): Promise<PushRegistrationResult> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { status: 'unsupported', message: 'Notifications non supportées.' };
  }
  if (!db) {
    return { status: 'error', message: 'Configuration Firebase incomplète.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { status: 'denied', message: 'Notifications refusées.' };
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return { status: 'unsupported', message: 'Messaging indisponible.' };
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    return { status: 'error', message: 'Clé VAPID manquante.' };
  }

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { status: 'error', message: 'Impossible de récupérer le token.' };
  }
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', token),
    {
      createdAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent,
    },
    { merge: true }
  );

  setStoredPushToken(token);
  return { status: 'granted', message: 'Notifications activées ✅', token };
};

export const unregisterPushToken = async (uid: string) => {
  if (!db) return;
  const token = getStoredPushToken();
  if (!token) return;
  await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token));
  try {
    localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export const testLocalNotificationUI = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  new Notification('Snack Family 2', {
    body: 'Test notification locale.',
  });
};
