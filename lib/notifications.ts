import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { messaging } from "../firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let swRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

async function ensureServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error("Service worker non disponible dans ce navigateur.");
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker.register("/firebase-messaging-sw.js");
  }

  return swRegistrationPromise;
}

export async function requestNotificationToken() {
  if (!messaging) {
    throw new Error("Firebase Messaging n'est pas disponible dans ce contexte.");
  }

  if (!VAPID_KEY) {
    throw new Error("Clé VAPID manquante (VITE_FIREBASE_VAPID_KEY).");
  }

  const registration = await ensureServiceWorkerRegistration();
  return getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}

export function subscribeToForegroundMessages(handler: (payload: MessagePayload) => void) {
  if (!messaging) {
    return () => {};
  }

  const unsubscribe = onMessage(messaging, (payload) => {
    handler(payload);
  });

  return unsubscribe;
}

export function playNotificationFeedback() {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    if (typeof AudioContext !== "undefined") {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = 880;
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      oscillator.start(now);
      oscillator.stop(now + 0.6);
    }
  } catch (error) {
    console.warn("Impossible de jouer le feedback audio:", error);
  }
}
