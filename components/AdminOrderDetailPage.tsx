import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { OrderTimeline } from './OrderTimeline';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { Page } from '../types';

interface AdminOrderDetailPageProps {
  navigateTo: (page: Page) => void;
}

type OrderStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

type PaymentMethod = 'stripe' | 'cash';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderDetail = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  statusUpdatedAt?: string;
  customerName?: string;
  phone?: string;
  notes?: string;
  adminHubUrl?: string;
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

const normalizePhone = (value: string) => value.replace(/\D/g, '');

export const AdminOrderDetailPage: React.FC<AdminOrderDetailPageProps> = ({ navigateTo }) => {
  const orderId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const segments = window.location.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  }, []);

  const [token, setToken] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const endpointBase = useMemo(() => resolveWorkerBaseUrl(), []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) {
      setToken(stored);
    }
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!token || !orderId) return;
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Impossible de charger la commande.';
        throw new Error(message);
      }
      const data = (await response.json()) as { order: OrderDetail };
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
    } finally {
      setIsLoading(false);
    }
  }, [endpointBase, orderId, token]);

  useEffect(() => {
    if (token) {
      void fetchOrder();
    }
  }, [fetchOrder, token]);

  const updateStatus = async (status: OrderStatus) => {
    if (!token || !order) return;
    setError(null);
    setIsUpdating(true);
    try {
      const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(order.id)}/status`, {
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
      const data = (await response.json()) as { summary: { status: OrderStatus; updatedAt: string } };
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: data.summary.status,
              statusUpdatedAt: data.summary.updatedAt ?? new Date().toISOString(),
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <h1 className="text-2xl font-display font-bold text-snack-black">Accès requis</h1>
          <p className="text-sm text-gray-600">Merci de vous connecter depuis l’espace gérant.</p>
          <button
            onClick={() => navigateTo('admin')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Revenir au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <LoadingSpinner label="Chargement..." size={28} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-3">
          <h1 className="text-2xl font-display font-bold text-snack-black">Commande introuvable</h1>
          <p className="text-sm text-gray-600">{error ?? 'La commande demandée n’existe pas.'}</p>
          <button
            onClick={() => navigateTo('admin')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  const phoneDigits = order.phone ? normalizePhone(order.phone) : '';

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-snack-black">Commande #{order.id}</h1>
            <p className="text-sm text-gray-600">
              Statut : <span className="font-semibold text-snack-black">{statusLabels[order.status]}</span>
            </p>
          </div>
          <button
            onClick={() => navigateTo('admin')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
          >
            Retour au tableau
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-snack-black">Adresse</h2>
          <p className="text-gray-700">{order.deliveryAddress}</p>
          {order.customerName && <p className="text-sm text-gray-600">Client : {order.customerName}</p>}
          {order.phone ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Téléphone : {order.phone}</span>
              {phoneDigits && (
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-snack-gold font-semibold hover:underline"
                >
                  Contacter
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Téléphone non renseigné.</p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-snack-black">Suivi</h2>
          <OrderTimeline status={order.status} />
          <p className="text-xs text-gray-500">
            Dernière mise à jour :{' '}
            {new Date(order.statusUpdatedAt || order.updatedAt || order.createdAt).toLocaleString('fr-BE')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold uppercase">
            <button
              onClick={() => updateStatus('IN_PREPARATION')}
              disabled={isUpdating}
              className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors disabled:opacity-60"
            >
              En préparation
            </button>
            <button
              onClick={() => updateStatus('OUT_FOR_DELIVERY')}
              disabled={isUpdating}
              className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors disabled:opacity-60"
            >
              En livraison
            </button>
            <button
              onClick={() => updateStatus('DELIVERED')}
              disabled={isUpdating}
              className="rounded-lg border border-green-500 bg-green-50 px-2 py-3 text-green-700 hover:bg-green-500 hover:text-white transition-colors disabled:opacity-60"
            >
              Livrée
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-snack-black">Récapitulatif</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex justify-between">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span>{formatCents(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 pt-3 text-sm text-gray-600 space-y-1">
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
          <div className="text-sm text-gray-600">
            Paiement : {order.paymentMethod === 'stripe' ? 'Payée en ligne' : 'À encaisser (espèces)'}
          </div>
          {order.notes && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Note : {order.notes}
            </div>
          )}
          {order.adminHubUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(order.adminHubUrl)}
              className="inline-flex items-center justify-center rounded-lg border border-snack-gold/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
            >
              Copier le lien admin
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
