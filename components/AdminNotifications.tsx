import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, BellRing } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, messaging } from '../firebase';
import { playNotificationFeedback, requestNotificationToken, subscribeToForegroundMessages } from '../lib/notifications';

export const AdminNotifications: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Prêt à activer les notifications.');
  const [loading, setLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const messagingSupported = useMemo(() => Boolean(messaging), []);

  useEffect(() => {
    if (!messaging) return;

    const unsubscribe = subscribeToForegroundMessages((payload) => {
      const title = payload.notification?.title ?? 'Notification';
      const body = payload.notification?.body ?? '';
      setLastMessage(`${title}: ${body}`);
      playNotificationFeedback();
    });

    return () => unsubscribe();
  }, []);

  const saveToken = async (fcmToken: string) => {
    const tokensCol = collection(db, 'admin_tokens');
    const tokenRef = doc(tokensCol, fcmToken);
    await setDoc(tokenRef, {
      token: fcmToken,
      platform: 'web-admin',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const enableNotifications = async () => {
    try {
      setLoading(true);
      setStatus('Demande de permission...');

      if (!messagingSupported) {
        throw new Error('Firebase Messaging non disponible sur ce navigateur.');
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        throw new Error('Permission refusée. Autorisez les notifications pour recevoir les commandes.');
      }

      setStatus('Obtention du token FCM...');
      const newToken = await requestNotificationToken();

      if (!newToken) {
        throw new Error('Token FCM introuvable.');
      }

      await saveToken(newToken);
      setToken(newToken);
      setStatus('Notifications activées. Vous recevrez les commandes en temps réel.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BellRing className="text-snack-gold" />
        <div>
          <h2 className="text-2xl font-display font-bold text-snack-black">Notifications admin</h2>
          <p className="text-gray-600 text-sm">Activez le push pour être alerté dès qu\'une commande est payée.</p>
        </div>
      </div>

      {!messagingSupported && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">
          Votre navigateur ne supporte pas les notifications push web.
        </div>
      )}

      <button
        onClick={enableNotifications}
        disabled={loading || !messagingSupported}
        className={`w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold uppercase tracking-wide transition-colors ${
          loading || !messagingSupported
            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-snack-gold text-snack-black hover:bg-snack-black hover:text-snack-gold'
        }`}
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
        <span>Activer les notifications</span>
      </button>

      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <p className="text-sm text-gray-700 font-medium">Statut</p>
        <p className="text-snack-black font-bold">{status}</p>
        <p className="text-xs text-gray-500 mt-1">Permission navigateur : {permission}</p>
      </div>

      {token && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-sm text-green-800 break-all">
          <p className="font-bold mb-1">Token enregistré</p>
          <p>{token}</p>
        </div>
      )}

      {lastMessage && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800">
          <p className="font-bold mb-1">Dernière notification reçue</p>
          <p>{lastMessage}</p>
        </div>
      )}
    </div>
  );
};
