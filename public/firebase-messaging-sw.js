importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

const DEFAULT_WORKER_BASE_URL = 'https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev';

async function fetchFirebaseConfig() {
  const candidates = [self.location.origin, DEFAULT_WORKER_BASE_URL];
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/firebase-config`);
      if (!response.ok) continue;
      return await response.json();
    } catch (error) {
      // try next base
    }
  }
  return null;
}

async function initMessaging() {
  const config = await fetchFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    return;
  }

  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Snack Family 2';
    const body = payload.notification?.body || 'Mise à jour de commande.';

    const notificationOptions = {
      body,
      tag: payload?.data?.orderId || 'order-status',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: {
        url: payload?.data?.url || '/',
      },
    };

    self.registration.showNotification(title, notificationOptions);
  });
}

void initMessaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});
