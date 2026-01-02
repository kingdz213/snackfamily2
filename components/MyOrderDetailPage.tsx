import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, firebaseInitError } from '@/src/firebase';
import { Page } from '../types';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { OrderTimeline } from './OrderTimeline';
import { useAuth } from '@/src/auth/AuthProvider';

interface MyOrderDetailPageProps {
  navigateTo: (page: Page) => void;
  orderId: string;
}

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderDetail = {
  status: 'RECEIVED' | 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  createdAt: string;
  deliveryAddress: string;
  paymentMethod: 'STRIPE' | 'CASH';
  total: number;
  subtotal: number;
  deliveryFee: number;
  items: OrderItem[];
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
  userId?: string;
};

const formatCents = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;

export const MyOrderDetailPage: React.FC<MyOrderDetailPageProps> = ({ navigateTo, orderId }) => {
  const { user, loading } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const desiredLabel = useMemo(() => {
    if (!order) return null;
    if (order.desiredDeliverySlotLabel) return order.desiredDeliverySlotLabel;
    if (order.desiredDeliveryAt) {
      return new Date(order.desiredDeliveryAt).toLocaleString('fr-BE', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return null;
  }, [order]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setOrder(null);
      return;
    }
    if (!db) {
      setOrder(null);
      setError(firebaseInitError ?? 'Vérifiez vos variables VITE_FIREBASE_*.');
      setIsLoading(false);
      return;
    }

    setError(null);
    const ref = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          setOrder(null);
          setError('Commande introuvable.');
          setIsLoading(false);
          return;
        }
        const data = snapshot.data() as OrderDetail;
        if (data.userId && data.userId !== user.uid) {
          setOrder(null);
          setError('Accès refusé.');
          setIsLoading(false);
          return;
        }
        setOrder(data);
        setError(null);
        setIsLoading(false);
      },
      (err) => {
        setError(err.message || 'Impossible de charger la commande.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId, user]);

  if (!loading && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <h1 className="text-2xl font-display font-bold text-snack-black">Mes commandes</h1>
          <p className="text-sm text-gray-600">Connectez-vous pour accéder à votre commande.</p>
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
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle size={22} />
          </div>
          <h1 className="text-2xl font-display font-bold text-snack-black">Commande</h1>
          <p className="text-sm text-gray-600">{error ?? 'Commande introuvable.'}</p>
          <button
            onClick={() => navigateTo('myOrders')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Retour aux commandes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-snack-black">Commande #{orderId}</h1>
            <p className="text-sm text-gray-600">Suivi en temps réel.</p>
          </div>
          <button
            onClick={() => navigateTo('myOrders')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
          >
            Retour
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <OrderTimeline status={order.status} />
          <div className="text-sm text-gray-600">
            Statut actuel : <span className="font-semibold text-snack-black">{order.status.replace(/_/g, ' ')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2 shadow-sm text-sm text-gray-700">
          <div>
            <span className="font-semibold">Adresse :</span> {order.deliveryAddress}
          </div>
          {desiredLabel && (
            <div>
              <span className="font-semibold">Heure souhaitée :</span> {desiredLabel}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-snack-black">Récapitulatif</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {order.items.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex justify-between">
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
        </div>
      </div>
    </div>
  );
};
