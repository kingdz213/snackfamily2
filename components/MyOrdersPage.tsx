import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useAuth } from '@/src/auth/AuthProvider';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { getStoredPushToken, requestPushPermissionAndRegister } from '@/src/lib/push';
import { db } from '@/src/firebase';

interface MyOrdersPageProps {
  navigateTo: (page: Page) => void;
}

type OrderStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

type PaymentMethod = 'STRIPE' | 'CASH';

type MyOrder = {
  id: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  deliveryAddress: string;
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
};

const statusLabels: Record<OrderStatus, string> = {
  RECEIVED: 'Commande reçue',
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Commande confirmée',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
};

const paymentLabels: Record<PaymentMethod, string> = {
  STRIPE: 'En ligne',
  CASH: 'Cash',
};

const formatCents = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;

const formatSchedule = (value?: string | null, label?: string | null) => {
  if (label) return label;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ navigateTo }) => {
  const { user, loading, getIdToken } = useAuth();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supportsPush, setSupportsPush] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);

  const endpointBase = resolveWorkerBaseUrl();

  useEffect(() => {
    setNotificationsEnabled(Boolean(getStoredPushToken()));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupportsPush('Notification' in window);
  }, []);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);
    const controller = new AbortController();

    const fetchOrders = async () => {
      try {
        const token = await getIdToken();
        if (!token) {
          setError('Connexion expirée. Merci de vous reconnecter.');
          setOrders([]);
          return;
        }
        const response = await fetch(`${endpointBase}/me/orders?limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || 'Impossible de charger vos commandes.';
          throw new Error(message);
        }
        const data = (await response.json()) as { orders: MyOrder[] };
        setOrders(data.orders ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Impossible de charger vos commandes.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchOrders();
    return () => controller.abort();
  }, [endpointBase, getIdToken, user]);

  const handlePushEnable = async () => {
    if (!user) return;
    setPushMessage(null);
    setPushLoading(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setPushMessage('Impossible de récupérer le token.');
        return;
      }
      const result = await requestPushPermissionAndRegister(token);
      if (result.status === 'granted') {
        setNotificationsEnabled(true);
      }
      setPushMessage(result.message ?? 'Notifications mises à jour');
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'Notifications impossibles.');
    } finally {
      setPushLoading(false);
      window.setTimeout(() => setPushMessage(null), 2200);
    }
  };

  if (!db) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <h1 className="text-2xl font-display font-bold text-snack-black">Mes commandes</h1>
          <p className="text-sm text-gray-600">Fonction indisponible pour le moment.</p>
          <button
            onClick={() => navigateTo('home')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (!loading && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <h1 className="text-2xl font-display font-bold text-snack-black">Mes commandes</h1>
          <p className="text-sm text-gray-600">Connectez-vous pour accéder à votre historique.</p>
          <button
            onClick={() => navigateTo('account')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Aller à Mon compte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-snack-black">Mes commandes</h1>
            <p className="text-sm text-gray-600">Historique et statuts en temps réel.</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="text-xs text-gray-500">Synchronisation automatique</div>
            <button
              type="button"
              onClick={handlePushEnable}
              disabled={!supportsPush || pushLoading || notificationsEnabled}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                notificationsEnabled
                  ? 'bg-snack-black text-snack-gold'
                  : 'border border-snack-gold bg-snack-gold/10 text-snack-black hover:bg-snack-gold'
              } ${!supportsPush || pushLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {notificationsEnabled ? 'Notifications activées' : pushLoading ? 'Activation...' : 'Activer notifications'}
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {pushMessage && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">{pushMessage}</div>}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner label="Chargement..." size={26} />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Aucune commande liée à votre compte pour le moment.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const scheduledLabel = formatSchedule(order.desiredDeliveryAt, order.desiredDeliverySlotLabel);
              return (
                <div key={order.id} className="border border-gray-200 rounded-2xl bg-white p-5 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Commande #{order.id}</div>
                      <div className="text-sm text-gray-600">{new Date(order.createdAt).toLocaleString('fr-BE')}</div>
                      <div className="text-sm text-gray-600">
                        {paymentLabels[order.paymentMethod]} • {formatCents(order.total)}
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span className="inline-flex items-center rounded-full bg-snack-gold/15 px-3 py-1 text-xs font-semibold text-snack-black">
                        {statusLabels[order.status]}
                      </span>
                      {scheduledLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          <CalendarClock size={14} />
                          Heure souhaitée : {scheduledLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">{order.deliveryAddress}</div>
                  <button
                    type="button"
                    onClick={() => {
                      window.history.pushState({}, '', `/order/${order.id}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-snack-black hover:text-snack-gold transition-colors"
                  >
                    Voir
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
