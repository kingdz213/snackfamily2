import React, { useEffect, useMemo, useState } from 'react';
import { getOrder, type OrderRecord } from '../lib/orderApi';

interface OrderStatusPageProps {
  orderId: string;
}

const statusLabels: Record<OrderRecord['status'], string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID_ONLINE: 'Payé en ligne (confirmé)',
  CASH_ON_DELIVERY: 'Paiement à la livraison',
};

const paymentLabels: Record<OrderRecord['paymentMethod'], string> = {
  STRIPE: 'Carte (Stripe)',
  CASH: 'Cash',
};

function formatCurrency(value: number) {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export const OrderStatusPage: React.FC<OrderStatusPageProps> = ({ orderId }) => {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pin = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    return params.get('pin') || undefined;
  }, []);

  useEffect(() => {
    let active = true;
    if (!orderId) {
      setError('Commande introuvable.');
      return;
    }

    getOrder({ orderId, pin })
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
      });

    return () => {
      active = false;
    };
  }, [orderId, pin]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-20 bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg text-center">
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase mb-3">Commande</h1>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-20 bg-gray-50">
        <div className="text-sm text-gray-500">Chargement de la commande…</div>
      </div>
    );
  }

  const addressLine = `${order.customer.address}`;
  const cityLine = `${order.customer.postalCode} ${order.customer.city}`.trim();

  return (
    <div className="min-h-[60vh] px-4 py-16 bg-gray-50">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase">Commande #{order.id}</h1>
          <p className="text-sm text-gray-500 mt-2">
            Statut : <span className="font-semibold text-snack-black">{statusLabels[order.status]}</span>
          </p>
          <p className="text-sm text-gray-500">
            Paiement : <span className="font-semibold text-snack-black">{paymentLabels[order.paymentMethod]}</span>
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-bold text-snack-black uppercase">Adresse de livraison</h2>
          <p className="text-sm text-gray-700">{addressLine || '-'}</p>
          <p className="text-sm text-gray-700">{cityLine || '-'}</p>
          <p className="text-sm text-gray-700">Nom : {order.customer.name || '-'}</p>
          <p className="text-sm text-gray-700">Téléphone : {order.customer.phone || '-'}</p>
          {order.note && <p className="text-sm text-gray-700">Note : {order.note}</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-snack-black uppercase">Articles</h2>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-sm text-gray-700">
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-1 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Sous-total</span>
              <span className="font-semibold">{formatCurrency(order.total - order.deliveryFee)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Livraison</span>
              <span className="font-semibold">{formatCurrency(order.deliveryFee)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-snack-black pt-2">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
