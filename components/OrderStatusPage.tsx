import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { OrderTimeline } from './OrderTimeline';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderResponse = {
  id: string;
  createdAt: string;
  statusUpdatedAt?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  paymentMethod: 'STRIPE' | 'CASH';
  status: 'RECEIVED' | 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
};

const formatCents = (value: number) => `${(value / 100).toFixed(2)} €`;

const paymentLabels: Record<OrderResponse['paymentMethod'], string> = {
  STRIPE: 'En ligne (Stripe)',
  CASH: 'À la livraison',
};

const statusCopy: Record<OrderResponse['status'], { title: string; subtitle: string }> = {
  RECEIVED: {
    title: 'Commande reçue',
    subtitle: 'Merci. Votre commande est prise en charge par notre équipe.',
  },
  PENDING_PAYMENT: {
    title: 'Paiement en cours de confirmation',
    subtitle: 'Nous validons votre paiement. Vous serez informé(e) ici dès confirmation.',
  },
  PAID_ONLINE: {
    title: 'Commande confirmée',
    subtitle: 'Merci. Votre paiement en ligne est validé.',
  },
  IN_PREPARATION: {
    title: 'Commande prise en charge — en préparation',
    subtitle: 'Votre commande est en cours de préparation.',
  },
  OUT_FOR_DELIVERY: {
    title: 'En cours de livraison',
    subtitle: 'Votre commande est en route. Merci de rester joignable.',
  },
  DELIVERED: {
    title: 'Commande livrée',
    subtitle: 'Votre commande a été livrée. Merci et à bientôt !',
  },
};

const paymentStatusTitle: Record<OrderResponse['paymentMethod'], string> = {
  STRIPE: 'Commande confirmée — paiement en ligne validé',
  CASH: 'Commande enregistrée — paiement à la livraison',
};

const statusTone: Record<OrderResponse['status'], string> = {
  RECEIVED: 'bg-snack-black text-snack-gold border-snack-gold/40',
  PENDING_PAYMENT: 'bg-snack-black text-snack-gold border-snack-gold/40',
  PAID_ONLINE: 'bg-snack-gold/20 text-snack-black border-snack-gold/40',
  IN_PREPARATION: 'bg-snack-gold/15 text-snack-black border-snack-gold/40',
  OUT_FOR_DELIVERY: 'bg-snack-gold/15 text-snack-black border-snack-gold/40',
  DELIVERED: 'bg-snack-gold/25 text-snack-black border-snack-gold/50',
};

interface OrderStatusPageProps {
  orderId: string;
  navigateTo: (page: Page) => void;
}

export const OrderStatusPage: React.FC<OrderStatusPageProps> = ({ orderId }) => {
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshState, setAutoRefreshState] = useState<'active' | 'paused'>('active');
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const failureCountRef = useRef(0);
  const statusRef = useRef<OrderResponse['status'] | null>(null);

  const fetchOrder = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!opts?.silent) setIsRefreshing(true);

      try {
        const endpoint = `${resolveWorkerBaseUrl()}/api/orders/${encodeURIComponent(orderId)}`;
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error('Commande introuvable.');
        }
        const data = (await response.json()) as OrderResponse;
        setOrder(data);
        setError(null);
        failureCountRef.current = 0;
        statusRef.current = data.status;
        if (data.status === 'DELIVERED') {
          setAutoRefreshState('paused');
          if (timerRef.current) window.clearTimeout(timerRef.current);
        }
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
        failureCountRef.current = Math.min(failureCountRef.current + 1, 2);
        return null;
      } finally {
        inFlightRef.current = false;
        setIsRefreshing(false);
      }
    },
    [orderId]
  );

  const scheduleNext = useCallback((delayMs: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (document.hidden) {
        setAutoRefreshState('paused');
        return;
      }
      fetchOrder({ silent: true }).then((data) => {
        if (data?.status === 'DELIVERED') {
          setAutoRefreshState('paused');
          return;
        }
        const delays = [12_000, 20_000, 35_000];
        const delay = delays[failureCountRef.current] ?? 35_000;
        scheduleNext(delay);
      });
    }, delayMs);
  }, [fetchOrder]);

  useEffect(() => {
    fetchOrder({ silent: true }).then((data) => {
      if (data?.status === 'DELIVERED') {
        setAutoRefreshState('paused');
        return;
      }
      scheduleNext(12_000);
    });

    const handleVisibility = () => {
      if (document.hidden) {
        setAutoRefreshState('paused');
        if (timerRef.current) window.clearTimeout(timerRef.current);
        return;
      }
      if (statusRef.current === 'DELIVERED') {
        setAutoRefreshState('paused');
        return;
      }
      setAutoRefreshState('active');
      scheduleNext(2_000);
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [fetchOrder, scheduleNext]);

  const manualRefresh = async () => {
    await fetchOrder();
  };

  const lastUpdated = useMemo(() => {
    if (!order) return null;
    const timestamp = order.statusUpdatedAt || order.createdAt;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }, [order]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 py-16 bg-gray-50">
        <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-lg max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-3">Commande</h1>
          <p className="text-red-600 font-semibold mb-2">{error}</p>
          <p className="text-sm text-gray-500 mb-4">Vous pouvez réessayer dans un instant.</p>
          <button
            onClick={manualRefresh}
            className="inline-flex items-center justify-center rounded-lg bg-snack-black px-4 py-2 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Actualiser
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 py-16 bg-gray-50">
        <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-3">Commande</h1>
        <LoadingSpinner label="Chargement de la commande…" size={28} />
        <div className="mt-6 w-full max-w-sm space-y-3">
          <div className="h-3 rounded-full skeleton-shimmer"></div>
          <div className="h-3 rounded-full skeleton-shimmer w-4/5 mx-auto"></div>
          <div className="h-3 rounded-full skeleton-shimmer w-3/5 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center px-4 py-16 bg-gray-50">
      <div className="w-full max-w-3xl bg-white shadow-lg rounded-xl p-6 space-y-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase">Commande #{order.id}</h1>
          <OrderTimeline status={order.status} />
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide glow-soft shine-sweep ${statusTone[order.status]}`}
            >
              <span className="h-2 w-2 rounded-full bg-snack-gold"></span>
              Statut
            </span>
            <p className="text-sm text-gray-500">
              {order.status === 'RECEIVED' || order.status === 'PAID_ONLINE'
                ? paymentStatusTitle[order.paymentMethod]
                : statusCopy[order.status].title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {order.paymentMethod && (
              <span className="inline-flex items-center rounded-full border border-snack-gold/40 bg-snack-gold/10 px-2 py-1 font-semibold text-snack-black">
                {paymentLabels[order.paymentMethod]}
              </span>
            )}
            {lastUpdated && <span>Dernière mise à jour : {lastUpdated}</span>}
            <span>Auto-actualisation : {autoRefreshState === 'active' ? 'active' : 'en pause'}</span>
          </div>
          <div>
            <button
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-snack-black shadow-sm hover:border-snack-gold hover:text-snack-black transition-colors"
            >
              {isRefreshing ? <LoadingSpinner label="Actualisation..." size={18} /> : 'Actualiser'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-snack-gold/30 bg-snack-light px-4 py-4 shine-sweep">
          <p className="text-lg font-semibold text-snack-black">{statusCopy[order.status].title}</p>
          <p className="text-sm text-gray-600">{statusCopy[order.status].subtitle}</p>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="font-semibold">Mode de paiement : </span>
            {paymentLabels[order.paymentMethod]}
          </div>
          <div>
            <span className="font-semibold">Adresse : </span>
            {order.deliveryAddress}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Récapitulatif</h2>
          <ul className="space-y-2 text-sm">
            {order.items.length > 0 ? (
              order.items.map((item, idx) => (
                <li key={`${item.name}-${idx}`} className="flex justify-between">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span>{formatCents(item.price * item.quantity)}</span>
                </li>
              ))
            ) : (
              <li>- (aucun article)</li>
            )}
          </ul>
          <div className="mt-4 text-sm space-y-1 text-gray-600">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span>{formatCents(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Livraison</span>
              <span>{formatCents(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-800">
              <span>Total</span>
              <span>{formatCents(order.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
