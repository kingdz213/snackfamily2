import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { getStoredAdminPin, resolvePublicOrigin, storeAdminPin } from '../lib/whatsapp';

type AdminOrder = {
  orderId: string;
  createdAt: string;
  customer: string;
  paymentMethod: 'STRIPE' | 'CASH';
  paymentStatus: 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'CASH_ON_DELIVERY';
  fulfillmentStatus: 'RECEIVED' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
};

const fulfillmentLabels: Record<AdminOrder['fulfillmentStatus'], string> = {
  RECEIVED: 'Commande reçue',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

const paymentLabels: Record<AdminOrder['paymentStatus'], string> = {
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Payé en ligne',
  CASH_ON_DELIVERY: 'Cash à la livraison',
};

interface AdminOrdersPageProps {
  navigateTo: (page: Page) => void;
}

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({ navigateTo }) => {
  const [pinInput, setPinInput] = useState('');
  const [pin, setPin] = useState('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredAdminPin();
    if (stored) {
      setPinInput(stored);
      setPin(stored);
    }
  }, []);

  const publicOrigin = useMemo(() => resolvePublicOrigin(), []);

  const fetchOrders = useCallback(async (activePin: string) => {
    if (!activePin) {
      setError('PIN admin requis.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const endpoint = `${resolveWorkerBaseUrl()}/admin/orders?pin=${encodeURIComponent(activePin)}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Accès refusé ou erreur serveur.');
      }
      const data = (await response.json()) as { orders: AdminOrder[] };
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pin) {
      fetchOrders(pin);
    }
  }, [fetchOrders, pin]);

  const handleSavePin = () => {
    const trimmed = pinInput.trim();
    setPin(trimmed);
    storeAdminPin(trimmed);
    if (trimmed) {
      fetchOrders(trimmed);
    }
  };

  const updateFulfillment = async (orderId: string, status: AdminOrder['fulfillmentStatus']) => {
    if (!pin) {
      setError('PIN admin requis.');
      return;
    }
    setActionId(orderId);
    setError(null);
    try {
      const endpoint = `${resolveWorkerBaseUrl()}/admin/orders/${orderId}/fulfillment`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, pin }),
      });
      if (!response.ok) {
        throw new Error('Mise à jour refusée.');
      }
      await fetchOrders(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de mettre à jour la commande.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-snack-light pt-28 pb-16 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-display font-bold text-snack-black">Commandes en cours</h1>
          <p className="text-gray-600">Mettez à jour le suivi en un clic. Le client ne peut pas modifier le statut.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">PIN admin</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-snack-gold focus:outline-none"
                placeholder="Entrez le PIN"
              />
              <button
                onClick={handleSavePin}
                className="rounded-lg bg-snack-black px-6 py-3 text-white font-bold uppercase tracking-wide hover:bg-snack-gold hover:text-snack-black transition-colors"
              >
                Valider
              </button>
              <button
                onClick={() => fetchOrders(pin)}
                className="rounded-lg border border-gray-300 px-6 py-3 font-bold uppercase tracking-wide text-gray-700 hover:border-snack-gold hover:text-snack-black transition-colors"
              >
                Rafraîchir
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="space-y-4">
          {loading && <p className="text-gray-500">Chargement des commandes…</p>}
          {!loading && orders.length === 0 && (
            <p className="text-gray-500">Aucune commande récente.</p>
          )}

          {orders.map((order) => {
            const isUpdating = actionId === order.orderId;
            return (
              <div key={order.orderId} className="bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-gray-400">{new Date(order.createdAt).toLocaleString()}</p>
                  <h2 className="text-xl font-bold text-snack-black">Commande #{order.orderId}</h2>
                  <p className="text-sm text-gray-600">{order.customer}</p>
                  <p className="text-sm text-gray-600">
                    Paiement : {paymentLabels[order.paymentStatus]} ({order.paymentMethod})
                  </p>
                  <p className="text-sm font-semibold text-snack-black">
                    Suivi : {fulfillmentLabels[order.fulfillmentStatus]}
                  </p>
                  {publicOrigin && (
                    <a
                      className="text-sm text-snack-gold font-semibold underline"
                      href={`${publicOrigin}/order/${order.orderId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir la page client
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <button
                    disabled={isUpdating}
                    onClick={() => updateFulfillment(order.orderId, 'IN_PREPARATION')}
                    className="rounded-lg bg-snack-gold/90 px-3 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:bg-snack-gold disabled:opacity-60"
                  >
                    Préparation
                  </button>
                  <button
                    disabled={isUpdating}
                    onClick={() => updateFulfillment(order.orderId, 'OUT_FOR_DELIVERY')}
                    className="rounded-lg bg-snack-black px-3 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-snack-gold hover:text-snack-black disabled:opacity-60"
                  >
                    En livraison
                  </button>
                  <button
                    disabled={isUpdating}
                    onClick={() => updateFulfillment(order.orderId, 'DELIVERED')}
                    className="rounded-lg bg-green-600 px-3 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    Livrée
                  </button>
                  <button
                    disabled={isUpdating}
                    onClick={() => updateFulfillment(order.orderId, 'CANCELLED')}
                    className="rounded-lg bg-red-600 px-3 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            );
          })}
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
