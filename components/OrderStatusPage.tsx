import React, { useEffect, useMemo, useState } from 'react';
import { getOrder, type Order } from '../lib/orders';

interface OrderStatusPageProps {
  orderId: string | null;
}

const statusLabels: Record<Order['status'], string> = {
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Payé en ligne (confirmé)',
  CASH_ON_DELIVERY: 'Paiement à la livraison',
};

const paymentLabels: Record<Order['paymentMethod'], string> = {
  STRIPE: 'En ligne',
  CASH: 'Cash',
};

export const OrderStatusPage: React.FC<OrderStatusPageProps> = ({ orderId }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const requiredPin = (import.meta.env.VITE_ORDER_STATUS_PIN as string | undefined)?.trim();
  const searchPin = useMemo(() => new URLSearchParams(window.location.search).get('pin'), []);
  const hasAccess = !requiredPin || requiredPin === searchPin;

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    if (!orderId) {
      setError('Commande introuvable.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    getOrder(orderId)
      .then((data) => {
        if (!isMounted) return;
        setOrder(data);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Commande introuvable.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasAccess, orderId]);

  if (!hasAccess) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-16 text-center bg-gray-50">
        <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-4">Accès protégé</h1>
        <p className="text-gray-600 max-w-lg">
          Cette page est protégée. Merci d’ajouter le code PIN dans l’URL (ex: ?pin=XXXX).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-16 text-center bg-gray-50">
        <p className="text-gray-600">Chargement de la commande…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-16 text-center bg-gray-50">
        <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-4">Commande introuvable</h1>
        <p className="text-gray-600 max-w-lg">{error ?? 'Impossible de charger la commande.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-gray-50 px-4 py-14">
      <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-gray-500">Commande</span>
          <h1 className="text-3xl font-display font-bold text-snack-black">#{order.id}</h1>
          <p className="text-sm text-gray-500">Créée le {new Date(order.createdAt).toLocaleString('fr-FR')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Statut</p>
            <p className="text-lg font-semibold text-snack-black">{statusLabels[order.status]}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Paiement</p>
            <p className="text-lg font-semibold text-snack-black">{paymentLabels[order.paymentMethod]}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-gray-500">Livraison</p>
          <p className="text-base text-snack-black font-medium">{order.customer.address || '-'}</p>
          <p className="text-sm text-gray-500">
            {order.customer.name || 'Client'} · {order.customer.phone || 'Téléphone non renseigné'}
          </p>
          {order.note && <p className="text-sm text-gray-600 italic">Note : {order.note}</p>}
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-gray-500">Articles</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
            {order.items.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-snack-black">{item.name}</p>
                  <p className="text-sm text-gray-500">Quantité : {item.quantity}</p>
                </div>
                <div className="text-sm font-semibold text-snack-black">
                  {(item.price * item.quantity).toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between">
            <span>Sous-total</span>
            <span>{Math.max(0, order.total - order.deliveryFee).toFixed(2)} €</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Livraison</span>
            <span>{order.deliveryFee.toFixed(2)} €</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold text-snack-black">
            <span>Total</span>
            <span>{order.total.toFixed(2)} €</span>
          </div>
        </div>
      </div>
    </div>
  );
};
