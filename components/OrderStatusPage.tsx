import React, { useEffect, useState } from 'react';
import { Page } from '../types';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderResponse = {
  id: string;
  createdAt: string;
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
    title: 'Commande enregistrée — paiement à la livraison',
    subtitle: 'Votre commande est prise en compte. Préparation en cours.',
  },
  PENDING_PAYMENT: {
    title: 'Paiement en cours de confirmation',
    subtitle: 'Nous validons votre paiement. Vous serez informé dès confirmation.',
  },
  PAID_ONLINE: {
    title: 'Commande confirmée — préparation en cours',
    subtitle: 'Votre paiement est confirmé. Nous préparons votre commande.',
  },
  IN_PREPARATION: {
    title: 'Commande en préparation',
    subtitle: 'Votre commande est en cours de préparation.',
  },
  OUT_FOR_DELIVERY: {
    title: 'En livraison',
    subtitle: 'Votre commande est en route. Merci de rester joignable.',
  },
  DELIVERED: {
    title: 'Commande livrée',
    subtitle: 'Votre commande a été livrée. Merci et à bientôt !',
  },
};

interface OrderStatusPageProps {
  orderId: string;
  navigateTo: (page: Page) => void;
}

export const OrderStatusPage: React.FC<OrderStatusPageProps> = ({ orderId }) => {
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const endpoint = `${resolveWorkerBaseUrl()}/api/orders/${encodeURIComponent(orderId)}`;
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error('Commande introuvable.');
        }
        const data = (await response.json()) as OrderResponse;
        if (!cancelled) setOrder(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
      }
    };
    fetchOrder();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 py-16 bg-gray-50">
        <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-3">Commande</h1>
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 py-16 bg-gray-50">
        <h1 className="text-3xl font-display font-bold text-snack-black uppercase mb-3">Commande</h1>
        <LoadingSpinner label="Chargement de la commande…" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center px-4 py-16 bg-gray-50">
      <div className="w-full max-w-3xl bg-white shadow-lg rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase">Commande #{order.id}</h1>
          <p className="text-sm text-gray-500">Statut : {statusCopy[order.status].title}</p>
        </div>

        <div className="rounded-lg border border-snack-gold/30 bg-snack-light px-4 py-3">
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
