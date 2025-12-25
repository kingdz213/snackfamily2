import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { OrderTimeline } from './OrderTimeline';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';

type OrderStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

type PaymentMethod = 'stripe' | 'cash';

type AdminOrderSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  customerName?: string;
  phone?: string;
  address: string;
  deliveryType?: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  amountDueCents: number;
  itemsCount: number;
  adminHubUrl?: string;
};

type AdminOrdersResponse = {
  orders: AdminOrderSummary[];
  cursor?: string;
};

const TOKEN_STORAGE_KEY = 'sf2_admin_token';

const statusLabels: Record<OrderStatus, string> = {
  RECEIVED: 'Commande reçue',
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Commande confirmée',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
};

const formatCents = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;

const formatDate = (value: string) => new Date(value).toLocaleString('fr-BE');

const normalizePhone = (value: string) => value.replace(/\D/g, '');

export const AdminDashboardPage: React.FC = () => {
  const [pin, setPin] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const endpointBase = useMemo(() => resolveWorkerBaseUrl(), []);

  const persistToken = (value: string | null) => {
    setToken(value);
    if (typeof window === 'undefined') return;
    if (value) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  };

  const fetchOrders = useCallback(
    async (reset = false, tokenOverride?: string) => {
      const activeToken = tokenOverride ?? token;
      if (!activeToken) return;
      setError(null);
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (!reset && cursor) params.set('cursor', cursor);
        const response = await fetch(`${endpointBase}/admin/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || 'Impossible de charger les commandes.';
          throw new Error(message);
        }
        const data = (await response.json()) as AdminOrdersResponse;
        setOrders((prev) => (reset ? data.orders : [...prev, ...data.orders]));
        setCursor(data.cursor || undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
      } finally {
        setIsLoading(false);
      }
    },
    [cursor, endpointBase, token]
  );

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) {
      setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (token && orders.length === 0) {
      void fetchOrders(true);
    }
  }, [fetchOrders, orders.length, token]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pin) {
      setError('Merci de saisir le code gérant.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${endpointBase}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Connexion refusée.';
        throw new Error(message);
      }
      const data = (await response.json()) as { token: string };
      persistToken(data.token);
      setOrders([]);
      setCursor(undefined);
      await fetchOrders(true, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion refusée.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      if (!token) return;
      setError(null);
      try {
        const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || 'Mise à jour impossible.';
          throw new Error(message);
        }
        const data = (await response.json()) as { summary: AdminOrderSummary };
        setOrders((prev) => prev.map((order) => (order.id === orderId ? data.summary : order)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
      }
    },
    [endpointBase, token]
  );

  const copyAdminLink = async (order: AdminOrderSummary) => {
    if (!order.adminHubUrl) return;
    try {
      await navigator.clipboard.writeText(order.adminHubUrl);
      setCopiedOrderId(order.id);
      window.setTimeout(() => setCopiedOrderId(null), 1500);
    } catch {
      setError("Impossible de copier le lien.");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-display font-bold text-snack-black">Espace gérant</h1>
            <p className="text-sm text-gray-600">Connectez-vous pour gérer toutes les commandes.</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <label className="text-sm font-semibold text-gray-700" htmlFor="admin-pin">
              Code gérant
            </label>
            <input
              id="admin-pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
              placeholder="Saisir le code"
            />
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-snack-gold hover:text-snack-black disabled:opacity-60"
            >
              {isSubmitting ? <LoadingSpinner label="Connexion..." size={20} /> : 'Accéder au tableau'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-snack-black">Tableau de bord gérant</h1>
            <p className="text-sm text-gray-600">Toutes les commandes, au même endroit.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => fetchOrders(true)}
              className="rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-gold transition-colors"
            >
              Actualiser
            </button>
            <button
              onClick={() => persistToken(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
            >
              Se déconnecter
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="space-y-4">
          {orders.length === 0 && !isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
              Aucune commande à afficher pour le moment.
            </div>
          ) : (
            orders.map((order) => {
              const isStripePaid = order.paymentMethod === 'stripe' && order.amountDueCents === 0;
              const isCashDue = order.paymentMethod === 'cash' && order.amountDueCents > 0;
              const whatsappTarget = order.phone ? normalizePhone(order.phone) : '';

              return (
                <div key={order.id} className="border border-gray-200 rounded-2xl bg-white p-5 shadow-sm space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                          Commande #{order.id}
                        </div>
                        <h2 className="text-xl font-semibold text-snack-black">{order.address}</h2>
                        <p className="text-xs text-gray-500">
                          Dernière mise à jour : {formatDate(order.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <span className="inline-flex items-center rounded-full bg-snack-gold/15 px-3 py-1 text-xs font-semibold text-snack-black">
                          {statusLabels[order.status]}
                        </span>
                        {isStripePaid && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            Payée en ligne
                          </span>
                        )}
                        {isCashDue && (
                          <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                            À encaisser (espèces)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <OrderTimeline status={order.status} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600">
                      <div>
                        <div className="text-xs uppercase text-gray-400 font-semibold">Paiement</div>
                        <div>
                          {order.paymentMethod === 'stripe'
                            ? 'Carte (Stripe)'
                            : 'Espèces'}{' '}
                          • {formatCents(order.totalCents)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-gray-400 font-semibold">Contact</div>
                        {order.phone ? (
                          <div className="flex items-center gap-2">
                            <span>{order.phone}</span>
                            {whatsappTarget && (
                              <a
                                href={`https://wa.me/${whatsappTarget}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-snack-gold font-semibold hover:underline"
                              >
                                Contacter
                              </a>
                            )}
                          </div>
                        ) : (
                          <div>Numéro indisponible</div>
                        )}
                        {order.customerName && <div className="text-xs text-gray-500">Client : {order.customerName}</div>}
                      </div>
                      <div>
                        <div className="text-xs uppercase text-gray-400 font-semibold">Articles</div>
                        <div>{order.itemsCount} article(s)</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold uppercase">
                    <button
                      onClick={() => updateStatus(order.id, 'IN_PREPARATION')}
                      className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors"
                    >
                      En préparation
                    </button>
                    <button
                      onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
                      className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors"
                    >
                      En livraison
                    </button>
                    <button
                      onClick={() => updateStatus(order.id, 'DELIVERED')}
                      className="rounded-lg border border-green-500 bg-green-50 px-2 py-3 text-green-700 hover:bg-green-500 hover:text-white transition-colors"
                    >
                      Livrée
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <a
                      href={`/admin/orders/${order.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
                    >
                      Voir détails
                    </a>
                    {order.adminHubUrl && (
                      <button
                        onClick={() => copyAdminLink(order)}
                        className="inline-flex items-center justify-center rounded-lg border border-snack-gold/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
                      >
                        {copiedOrderId === order.id ? 'Lien copié ✅' : 'Copier lien admin'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner label="Chargement..." size={24} />
          </div>
        )}

        {cursor && (
          <button
            onClick={() => fetchOrders(false)}
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors disabled:opacity-60"
          >
            Charger plus
          </button>
        )}
      </div>
    </div>
  );
};
