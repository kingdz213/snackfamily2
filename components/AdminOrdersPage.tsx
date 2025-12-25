import React, { useCallback, useMemo, useState } from 'react';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';

interface AdminOrdersPageProps {
  navigateTo: (page: Page) => void;
}

type OrderStatus = 'RECEIVED' | 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

type AdminOrder = {
  orderId: string;
  createdAt: string;
  paymentMethod: 'STRIPE' | 'CASH';
  status: OrderStatus;
  total: number;
};

const statusLabels: Record<OrderStatus, string> = {
  RECEIVED: 'Commande enregistrée',
  PENDING_PAYMENT: 'Paiement en cours',
  PAID_ONLINE: 'Commande confirmée',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
};

const paymentLabels: Record<AdminOrder['paymentMethod'], string> = {
  STRIPE: 'En ligne',
  CASH: 'Cash',
};

const formatCents = (value: number) => `${(value / 100).toFixed(2)} €`;

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({ navigateTo }) => {
  const [pin, setPin] = useState('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpointBase = useMemo(() => resolveWorkerBaseUrl(), []);

  const fetchOrders = useCallback(async () => {
    if (!pin) {
      setError('Merci de saisir votre PIN admin.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`${endpointBase}/api/admin/orders?limit=30`, {
        headers: { 'X-ADMIN-PIN': pin },
      });
      if (!response.ok) {
        const message = response.status === 401 ? 'PIN incorrect.' : 'Impossible de charger les commandes.';
        throw new Error(message);
      }
      const data = (await response.json()) as { orders: AdminOrder[] };
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setIsLoading(false);
    }
  }, [endpointBase, pin]);

  const updateStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      if (!pin) {
        setError('Merci de saisir votre PIN admin.');
        return;
      }
      setError(null);
      try {
        const response = await fetch(`${endpointBase}/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ADMIN-PIN': pin,
          },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const message = response.status === 401 ? 'PIN incorrect.' : 'Mise à jour impossible.';
          throw new Error(message);
        }
        const payload = (await response.json()) as { status: OrderStatus };
        setOrders((prev) =>
          prev.map((order) => (order.orderId === orderId ? { ...order, status: payload.status } : order))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
      }
    },
    [endpointBase, pin]
  );

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-display font-bold text-snack-black">Espace manager</h1>
          <p className="text-sm text-gray-600">Vérifiez et mettez à jour chaque commande en un seul tap.</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700" htmlFor="admin-pin">
              PIN admin
            </label>
            <input
              id="admin-pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
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
        </section>

        <section className="space-y-4">
          {orders.length === 0 && !isLoading ? (
            <p className="text-sm text-gray-500">Aucune commande récente.</p>
          ) : (
            orders.map((order) => (
              <div key={order.orderId} className="border border-gray-200 rounded-2xl bg-white p-4 space-y-3 shadow-sm">
                <div className="flex flex-col gap-1 text-sm text-gray-700">
                  <span className="font-bold text-snack-black">Commande #{order.orderId}</span>
                  <span className="text-xs text-gray-500">Créée le {new Date(order.createdAt).toLocaleString()}</span>
                  <span className="text-xs text-gray-500">
                    {paymentLabels[order.paymentMethod]} • {formatCents(order.total)}
                  </span>
                  <span className="text-xs font-semibold text-gray-700">Statut : {statusLabels[order.status]}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-bold uppercase">
                  <button
                    onClick={() => updateStatus(order.orderId, 'IN_PREPARATION')}
                    className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold hover:text-snack-black transition-colors"
                  >
                    En préparation
                  </button>
                  <button
                    onClick={() => updateStatus(order.orderId, 'OUT_FOR_DELIVERY')}
                    className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold hover:text-snack-black transition-colors"
                  >
                    En livraison
                  </button>
                  <button
                    onClick={() => updateStatus(order.orderId, 'DELIVERED')}
                    className="rounded-lg border border-green-500 bg-green-50 px-2 py-3 text-green-700 hover:bg-green-500 hover:text-white transition-colors"
                  >
                    Livrée
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <button
          onClick={() => navigateTo('home')}
          className="w-full px-4 py-3 rounded-lg bg-snack-black text-white font-bold uppercase tracking-wide hover:bg-snack-gold hover:text-snack-black transition-colors"
        >
          Retour au site
        </button>
      </div>
    </div>
  );
};
