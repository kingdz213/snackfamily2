import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/src/firebase';
import { resolveWorkerBaseUrl } from '@/lib/stripe';

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

export const requestPushPermissionAndRegister = async (firebaseIdToken: string): Promise<PushRegistrationResult> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { status: 'unsupported', message: 'Notifications non supportées.' };
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

  const response = await fetch(`${resolveWorkerBaseUrl()}/me/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firebaseIdToken}`,
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.message || 'Impossible de sauvegarder le token.';
    return { status: 'error', message };
  }

  setStoredPushToken(token);
  return { status: 'granted', message: 'Notifications activées ✅', token };
};

export const unregisterPushToken = async () => {
  const token = getStoredPushToken();
  if (!token) return;
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
