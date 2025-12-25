import React, { useCallback, useMemo, useState } from 'react';
import { AdminNotifications } from './AdminNotifications';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';

interface AdminPageProps {
  navigateTo: (page: Page) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ navigateTo }) => {
  const [pin, setPin] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem('adminPin') ?? '';
    } catch {
      return '';
    }
  });
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpointBase = useMemo(() => resolveWorkerBaseUrl(), []);

  const savePin = (value: string) => {
    setPin(value);
    try {
      window.localStorage.setItem('adminPin', value);
    } catch {
      // ignore
    }
  };

  const fetchOrders = useCallback(async () => {
    if (!pin) {
      setError('Merci de saisir votre PIN admin.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`${endpointBase}/admin/orders?pin=${encodeURIComponent(pin)}`);
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'PIN incorrect.' : 'Impossible de charger les commandes.');
      }
      const data = (await response.json()) as { orders: AdminOrder[] };
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setIsLoading(false);
    }
  }, [endpointBase, pin]);

  const updateFulfillment = useCallback(
    async (orderId: string, status: FulfillmentStatus) => {
      if (!pin) {
        setError('Merci de saisir votre PIN admin.');
        return;
      }
      setError(null);
      try {
        const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(orderId)}/fulfillment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, pin }),
        });
        if (!response.ok) {
          throw new Error(response.status === 401 ? 'PIN incorrect.' : 'Mise à jour impossible.');
        }
        const payload = (await response.json()) as {
          fulfillmentStatus: FulfillmentStatus;
          fulfillmentUpdatedAt: string;
        };
        setOrders((prev) =>
          prev.map((order) =>
            order.orderId === orderId
              ? {
                  ...order,
                  fulfillmentStatus: payload.fulfillmentStatus,
                  fulfillmentUpdatedAt: payload.fulfillmentUpdatedAt,
                }
              : order
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
      }
    },
    [endpointBase, pin]
  );

  return (
    <div className="min-h-screen bg-snack-light pt-28 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-display font-bold text-snack-black">Espace admin</h1>
          <p className="text-gray-600">Activez les notifications push pour être alerté dès qu\'une commande Stripe est payée.</p>
        </div>

        <AdminNotifications />

        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-snack-black uppercase">Commandes en cours</h2>
            <p className="text-sm text-gray-500">Mettez à jour le suivi en un clic.</p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-gray-700" htmlFor="admin-pin">
              PIN admin
            </label>
            <input
              id="admin-pin"
              type="password"
              value={pin}
              onChange={(event) => savePin(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
              placeholder="Saisir le PIN"
            />
            <button
              onClick={fetchOrders}
              className="w-full rounded-lg bg-snack-black text-white py-3 text-sm font-bold uppercase tracking-wide hover:bg-snack-gold hover:text-snack-black transition-colors"
            >
              {isLoading ? 'Chargement…' : 'Charger les commandes'}
            </button>
            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
          </div>

          <div className="space-y-4">
            {orders.length === 0 && !isLoading ? (
              <p className="text-sm text-gray-500">Aucune commande à afficher.</p>
            ) : (
              orders.map((order) => (
                <div key={order.orderId} className="border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex flex-col gap-1 text-sm text-gray-700">
                    <span className="font-bold text-snack-black">Commande #{order.orderId}</span>
                    <span className="text-xs text-gray-500">Créée le {new Date(order.createdAt).toLocaleString()}</span>
                    <span className="text-xs text-gray-500">{order.customer}</span>
                    <span className="text-xs text-gray-500">
                      Paiement : {paymentLabels[order.paymentMethod]} • {paymentStatusLabels[order.paymentStatus]}
                    </span>
                    <span className="text-xs font-semibold text-gray-700">
                      Suivi : {fulfillmentLabels[order.fulfillmentStatus]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold uppercase">
                    <button
                      onClick={() => updateFulfillment(order.orderId, 'IN_PREPARATION')}
                      className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold hover:text-snack-black transition-colors"
                    >
                      Préparation
                    </button>
                    <button
                      onClick={() => updateFulfillment(order.orderId, 'OUT_FOR_DELIVERY')}
                      className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold hover:text-snack-black transition-colors"
                    >
                      En livraison
                    </button>
                    <button
                      onClick={() => updateFulfillment(order.orderId, 'DELIVERED')}
                      className="rounded-lg border border-green-500 bg-green-50 px-2 py-3 text-green-700 hover:bg-green-500 hover:text-white transition-colors"
                    >
                      Livrée
                    </button>
                    <button
                      onClick={() => updateFulfillment(order.orderId, 'CANCELLED')}
                      className="rounded-lg border border-red-500 bg-red-50 px-2 py-3 text-red-600 hover:bg-red-500 hover:text-white transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2">
          <p className="font-bold">Fonctionnement</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Une notification « 🛎️ Nouvelle commande – XX€ » est envoyée dès le checkout Stripe terminé.</li>
            <li>Le corps reprend les items : « Nom xQté ».</li>
            <li>Cliquer ouvre automatiquement <span className="font-mono">/admin</span> pour traiter la commande.</li>
          </ul>
        </div>

        <button
          onClick={() => navigateTo('home')}
          className="px-4 py-3 rounded-lg bg-snack-black text-white font-bold uppercase tracking-wide hover:bg-snack-gold hover:text-snack-black transition-colors"
        >
          Retour au site
        </button>
      </div>
    </div>
  );
};

type FulfillmentStatus = 'RECEIVED' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

type AdminOrder = {
  orderId: string;
  createdAt: string;
  customer: string;
  paymentMethod: 'STRIPE' | 'CASH';
  paymentStatus: 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'CASH_ON_DELIVERY';
  fulfillmentStatus: FulfillmentStatus;
  fulfillmentUpdatedAt: string;
};

const paymentLabels: Record<AdminOrder['paymentMethod'], string> = {
  STRIPE: 'En ligne',
  CASH: 'Cash',
};

const paymentStatusLabels: Record<AdminOrder['paymentStatus'], string> = {
  PENDING_PAYMENT: 'En attente',
  PAID_ONLINE: 'Payé en ligne',
  CASH_ON_DELIVERY: 'À la livraison',
};

const fulfillmentLabels: Record<AdminOrder['fulfillmentStatus'], string> = {
  RECEIVED: 'Commande reçue',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};
